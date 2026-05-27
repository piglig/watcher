import React, { useState, useMemo, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import MultiSelect from '../components/MultiSelect.js';
import TreeMultiSelect from '../components/TreeMultiSelect.js';
import StepBar from '../components/StepBar.js';
import KeyBar from '../components/KeyBar.js';
import PagedListPicker from '../components/PagedListPicker.js';
import { Indicator, Item } from '../components/SelectChrome.js';
import { SYM } from '../theme.js';
import { PLATFORMS } from '../runner.js';
import { getConfig } from '../../shared/config-store.js';
import { readFileSync, existsSync } from 'fs';
import { resolve, join, relative } from 'path';
import { homedir } from 'os';
import { loadOsintDir, extractScrapeTargets, listOsintResultDirs } from '../../osint/index.js';
import { pathSafe } from '../../shared/paths.js';

const PLATFORM_ITEMS = PLATFORMS.map(p => ({ label: p.label, value: p.value }));

function platformLabel(pv) {
  return PLATFORMS.find(p => p.value === pv)?.label ?? pv;
}

// 检测目标输入是否为文件路径，并读取其中的账号列表
function parseTargetsInput(raw) {
  const t = raw.trim();
  const looksLikePath = t.startsWith('./') || t.startsWith('../') || t.startsWith('/') ||
                        t.startsWith('~')  || /\.(txt|csv)$/i.test(t);
  if (looksLikePath) {
    try {
      const abs = resolve(t.startsWith('~') ? t.replace(/^~/, homedir()) : t);
      if (existsSync(abs)) {
        const lines = readFileSync(abs, 'utf-8')
          .split('\n')
          .map(l => l.trim())
          .filter(Boolean);
        return lines.join(',');
      }
    } catch (e) {
      console.warn('[scrape] target file unreadable:', e.message ?? e);
    }
  }
  return t;
}

// Flatten extractScrapeTargets().byPlatform into a sorted account list.
function buildAccountList(extract) {
  const out = [];
  for (const [pv, items] of Object.entries(extract?.byPlatform ?? {})) {
    for (const item of items) {
      out.push({
        platform: pv,
        platformLabel: platformLabel(pv),
        handle:   item.handle,
        url:      item.account?.url ?? '',
        kind:     item.kind,
        kol:      item.kol,
      });
    }
  }
  out.sort((a, b) =>
    a.platformLabel.localeCompare(b.platformLabel) ||
    a.handle.localeCompare(b.handle)
  );
  return out;
}

// Build the params-form field list (only the ones that aren't 'targets').
function buildParamFields(platforms) {
  const fields = [
    { key: 'subject', label: '任务名',    type: 'text',   hint: 'KOL 名 / 任务标识；留空则使用第一个账号名' },
    { key: 'max',     label: '采集上限',  type: 'text',   hint: '留空 = 全量（受平台 API 自然上限约束）' },
    { key: 'since',   label: '开始日期',  type: 'text',   hint: 'YYYY-MM-DD，留空跳过' },
    { key: 'until',   label: '结束日期',  type: 'text',   hint: 'YYYY-MM-DD，留空跳过' },
  ];

  if (platforms.some(pv => PLATFORMS.find(p => p.value === pv)?.needsBrowser)) {
    fields.push({
      key: 'headed', label: '浏览器模式', type: 'select',
      items: [
        { label: '无界面（推荐）', value: 'false' },
        { label: '显示窗口',       value: 'true'  },
      ],
    });
  }

  if (platforms.includes('reddit')) {
    fields.push({
      key: 'redditSource', label: 'Reddit 数据源', type: 'select',
      items: [
        { label: 'Arctic Shift（快）', value: 'arctic' },
        { label: 'Reddit 官方',        value: 'reddit' },
      ],
    });
  }

  if (platforms.includes('youtube') && !process.env.YOUTUBE_API_KEY) {
    fields.push({ key: 'youtubeKey', label: 'YouTube API Key', type: 'text', hint: '或提前在设置中配置' });
  }
  if (platforms.includes('twitch') && (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET)) {
    fields.push({ key: 'twitchClientId',     label: 'Twitch Client-ID',     type: 'text', hint: 'dev.twitch.tv/console' });
    fields.push({ key: 'twitchClientSecret', label: 'Twitch Client-Secret', type: 'text', hint: '与 Client-ID 配套' });
  }
  if (platforms.includes('bluesky') && (!process.env.BLUESKY_IDENTIFIER || !process.env.BLUESKY_APP_PASSWORD)) {
    fields.push({ key: 'blueskyIdentifier',  label: 'Bluesky 账号',          type: 'text', hint: '如 me.bsky.social' });
    fields.push({ key: 'blueskyAppPassword', label: 'Bluesky App Password',  type: 'text', hint: 'bsky.app → 设置 → App Passwords' });
  }

  return fields;
}

// ── Manual flow (legacy step-by-step) ─────────────────────────────────────────

function buildSteps(platforms) {
  const steps = [
    { key: 'platforms', short: '平台', label: '选择平台', type: 'multi-select' },
  ];

  for (const pv of platforms) {
    const meta = PLATFORMS.find(p => p.value === pv);
    steps.push({
      key:      `targets_${pv}`,
      short:    meta?.label ?? pv,
      label:    `${meta?.label ?? pv} 目标`,
      type:     'text',
      hint:     `${meta?.targetsHint ?? '多个用逗号分隔'}\n或输入 .txt 文件路径（每行一个目标）`,
      platform: pv,
    });
  }

  for (const f of buildParamFields(platforms)) {
    steps.push({ key: f.key, short: f.label, label: f.label, type: f.type, hint: f.hint, items: f.items });
  }
  return steps;
}

const SOURCE_ITEMS = [
  { label: '手动输入目标',         value: 'manual' },
  { label: '从 OSINT 结果导入',     value: 'osint'  },
];

// ── OSINT review screen ──────────────────────────────────────────────────────

const accountKey = (a) => `${a.kol}::${a.platform}::${a.handle}`;

function buildKolTree(accounts) {
  const groups = new Map();
  for (const a of accounts) {
    if (!groups.has(a.kol)) groups.set(a.kol, []);
    groups.get(a.kol).push(a);
  }
  return [...groups.entries()].map(([kol, accs]) => ({
    id:    `kol::${kol}`,
    label: kol,
    files: accs.map(accountKey),
    children: accs.map(a => ({
      id:    accountKey(a),
      label: `${a.platformLabel.padEnd(10)} ${a.handle}${a.url ? `   ${a.url}` : ''}`,
      files: [accountKey(a)],
    })),
  }));
}

function OsintReview({ accounts, sourceDir, onConfirm, onBack }) {
  const tree     = useMemo(() => buildKolTree(accounts), [accounts]);
  const allKeys  = useMemo(() => accounts.map(accountKey), [accounts]);
  const allRoots = useMemo(() => tree.map(n => n.id), [tree]);

  // ESC handler runs alongside TreeMultiSelect's own useInput — no conflict (Tree doesn't consume ESC).
  useInput((_, key) => { if (key.escape) onBack(); });

  const handleConfirm = (selectedKeys) => {
    const set = new Set(selectedKeys);
    const picks = accounts.filter(a => set.has(accountKey(a)));
    if (picks.length) onConfirm(picks);
  };

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
      <Text bold color="cyan">采集设置 — 确认采集账号</Text>

      <Box flexDirection="column">
        {sourceDir && <Text color="gray" dimColor>来源：{sourceDir}</Text>}
        <Text color="gray" dimColor>
          {tree.length} 个 KOL · {accounts.length} 个账号（默认全选；Space 切换勾选；← 收起 / → 展开）
        </Text>
      </Box>

      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={0}>
        {accounts.length === 0
          ? <Text color="gray" dimColor>没有可采集的账号</Text>
          : <TreeMultiSelect
              nodes={tree}
              onConfirm={handleConfirm}
              initialSelected={new Set(allKeys)}
              initialExpanded={new Set(allRoots)}
              unitLabel="账号"
            />}
      </Box>

      <KeyBar hints={[
        { key: '↑↓',    label: '移动' },
        { key: '→/←',   label: '展开/收起 KOL' },
        { key: 'Space', label: '勾选/取消' },
        { key: 'a',     label: '全选/清空' },
        { key: 'Enter', label: '下一步' },
        { key: 'ESC',   label: '上一步' },
      ]} />
    </Box>
  );
}

// ── OSINT params form ────────────────────────────────────────────────────────

function OsintParams({ platforms, accounts, initialValues, onSubmit, onBack }) {
  const fields = useMemo(() => buildParamFields(platforms), [platforms]);
  const items  = useMemo(() => [...fields, { key: '__submit', label: '开始采集', type: 'submit' }], [fields]);

  const [values,   setValues]   = useState(initialValues ?? {});
  const [cursor,   setCursor]   = useState(0);
  const [editing,  setEditing]  = useState(false);
  const [draft,    setDraft]    = useState('');

  const field = items[cursor];

  useInput((input, key) => {
    if (editing) {
      // Inside edit mode the inner TextInput / SelectInput owns the keys.
      // We only handle ESC to bail out.
      if (key.escape) { setEditing(false); setDraft(''); }
      return;
    }
    if (key.escape) { onBack(); return; }
    if (key.upArrow)   { setCursor(c => Math.max(0, c - 1)); return; }
    if (key.downArrow) { setCursor(c => Math.min(items.length - 1, c + 1)); return; }
    if (key.return) {
      if (field.type === 'submit') { onSubmit(values); return; }
      if (field.type === 'text')   { setDraft(values[field.key] ?? ''); setEditing(true); return; }
      if (field.type === 'select') { setEditing(true); return; }
    }
  });

  const commitText = () => {
    setValues(v => ({ ...v, [field.key]: draft.trim() }));
    setDraft('');
    setEditing(false);
    if (cursor < items.length - 1) setCursor(c => c + 1);
  };

  const commitSelect = (value) => {
    setValues(v => ({ ...v, [field.key]: value }));
    setEditing(false);
    if (cursor < items.length - 1) setCursor(c => c + 1);
  };

  const displayValue = (f) => {
    const v = values[f.key];
    if (!v) return f.type === 'select' ? '(默认)' : '(留空)';
    if (f.type === 'select') {
      return f.items?.find(i => i.value === v)?.label ?? v;
    }
    return v;
  };

  const labelW = Math.max(...items.map(it => it.label.length));

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
      <Text bold color="cyan">采集设置 — 采集参数</Text>

      <Text color="gray" dimColor>
        已选 {accounts.length} 个账号 / {platforms.length} 个平台（{platforms.map(platformLabel).join(', ')}）
      </Text>

      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={0} gap={0}>
        {items.map((f, i) => {
          const isCursor = i === cursor;
          if (f.type === 'submit') {
            return (
              <Box key={f.key} marginTop={1} gap={1}>
                <Text color={isCursor ? 'cyan' : 'gray'} bold={isCursor}>
                  {isCursor ? SYM.cursor : ' '} ▶ {f.label}
                </Text>
                {isCursor && <Text color="gray" dimColor>Enter 提交</Text>}
              </Box>
            );
          }

          return (
            <Box key={f.key} flexDirection="column">
              <Box gap={1}>
                <Text color={isCursor ? 'cyan' : 'gray'}>{isCursor ? SYM.cursor : ' '}</Text>
                <Text color={isCursor ? 'white' : 'gray'} bold={isCursor}>
                  {f.label.padEnd(labelW)}
                </Text>

                {/* Inline value — hidden only when this field is actively editing */}
                {!(isCursor && editing) && (
                  <Text color={values[f.key] ? 'green' : 'gray'} dimColor={!values[f.key]}>
                    {displayValue(f)}
                  </Text>
                )}
              </Box>

              {isCursor && f.hint && !(editing && f.type === 'text') && (
                <Text color="gray" dimColor>    {f.hint}</Text>
              )}

              {/* Inline text editor */}
              {isCursor && editing && f.type === 'text' && (
                <Box marginLeft={4} gap={1}>
                  <Text color="cyan">{SYM.arrow}</Text>
                  <TextInput
                    value={draft}
                    onChange={setDraft}
                    onSubmit={commitText}
                    placeholder={f.hint ?? ''}
                  />
                </Box>
              )}

              {/* Inline select — only when actively editing this field */}
              {isCursor && editing && f.type === 'select' && (
                <Box marginLeft={4}>
                  <SelectInput
                    items={f.items}
                    onSelect={({ value }) => commitSelect(value)}
                    indicatorComponent={Indicator}
                    itemComponent={Item}
                    initialIndex={Math.max(0, f.items.findIndex(it => it.value === values[f.key]))}
                  />
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      <KeyBar hints={
        editing
          ? [{ key: 'Enter', label: '保存' }, { key: 'ESC', label: '取消' }]
          : [{ key: '↑↓', label: '选择' }, { key: 'Enter', label: '编辑/确认' }, { key: 'ESC', label: '上一步' }]
      } />
    </Box>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function ScrapeSetup({ onNav, prefill, pipelineMode }) {
  // Phase: 'source' → choose manual vs OSINT-import (only when no prefill)
  //        'osint-pick'    → pick OSINT result dir
  //        'osint-review'  → confirm accounts (per-account select)
  //        'osint-params'  → fill in shared scrape params
  //        'flow'          → manual step-by-step
  const initialPhase = prefill ? 'osint-review' : 'source';

  const [phase,       setPhase]       = useState(initialPhase);
  const [accounts,    setAccounts]    = useState(() => prefill ? buildAccountList(prefill) : []);
  const [chosen,      setChosen]      = useState([]);                            // accounts kept after review
  const [sourceDir,   setSourceDir]   = useState(prefill?.sourceDir ?? '');
  const [pickerNote,  setPickerNote]  = useState('');

  // Manual flow state
  const [selectedPlatforms, setSelectedPlatforms] = useState([]);
  const [config,  setConfig]  = useState({});
  const [stepIdx, setStepIdx] = useState(0);
  const [draft,   setDraft]   = useState('');

  const manualSteps     = useMemo(() => buildSteps(selectedPlatforms), [selectedPlatforms]);
  const manualStep      = manualSteps[stepIdx];
  const manualStepNames = manualSteps.map(s => s.short);

  useEffect(() => {
    if (phase !== 'flow') return;
    if (manualStep?.type === 'text' && config[manualStep.key]) setDraft(config[manualStep.key]);
  }, [stepIdx, phase]); // eslint-disable-line

  useInput((_, key) => {
    if (!key.escape) return;
    // osint-pick / osint-review / osint-params own their own key handling.
    if (phase === 'osint-pick' || phase === 'osint-review' || phase === 'osint-params') return;
    if (phase === 'source')     { onNav('menu'); return; }
    // 'flow' (manual step-by-step)
    if (stepIdx === 0) { onNav('menu'); return; }
    setStepIdx(i => i - 1);
    setDraft('');
  });

  // ── Submit (called from osint-params or manual flow) ─────────────────────
  //
  // Output is an array of platformConfigs keyed by (kolId, platform). Each
  // config carries the canonical kolId for the runner to write outputs under
  // <outDir>/<kolId>/scrape/<platform>/... A single user invocation can fan
  // out to many KOLs (when accounts come from an OSINT multi-pick); each KOL
  // gets its own runner config per platform so file paths never collide.
  const submit = ({ values, platforms, targetsByPv, accountsByKol }) => {
    const outDir = getConfig().outDir || './out/';

    const shared = {
      max:                values.max          || '1000000',
      since:              values.since        || '',
      until:              values.until        || '',
      headed:             values.headed === 'true',
      outDir,
      redditSource:       values.redditSource || 'arctic',
      apiKey:             values.youtubeKey   || process.env.YOUTUBE_API_KEY,
      twitchClientId:     values.twitchClientId     || process.env.TWITCH_CLIENT_ID,
      twitchClientSecret: values.twitchClientSecret || process.env.TWITCH_CLIENT_SECRET,
      blueskyIdentifier:  values.blueskyIdentifier  || process.env.BLUESKY_IDENTIFIER,
      blueskyAppPassword: values.blueskyAppPassword || process.env.BLUESKY_APP_PASSWORD,
    };

    let platformConfigs;
    if (accountsByKol) {
      // OSINT-driven flow: one config per (kolId, platform), narrowing each
      // config's `targets` to handles for that specific KOL.
      platformConfigs = [];
      for (const [kolId, byPv] of Object.entries(accountsByKol)) {
        for (const [pv, handles] of Object.entries(byPv)) {
          if (!handles.length) continue;
          platformConfigs.push({
            platform: pv,
            targets:  handles.join(','),
            kolId,
            ...shared,
          });
        }
      }
    } else {
      // Manual flow: no OSINT identity yet. Bootstrap a kolId from the user's
      // typed task-name (or first handle as fallback). Identity.json may not
      // exist for this kolId — the report will degrade gracefully.
      const firstHandle = platforms
        .map(pv => (targetsByPv[pv] ?? '').split(',')[0]?.trim())
        .find(Boolean);
      const kolId = pathSafe((values.subject || '').trim() || firstHandle || 'unnamed');
      platformConfigs = platforms.map(pv => ({
        platform: pv,
        targets:  targetsByPv[pv] ?? '',
        kolId,
        ...shared,
      }));
    }

    onNav(pipelineMode ? 'pipeline-run' : 'scrape-run', { scrapeConfig: platformConfigs });
  };

  // ── Phase: source picker ────────────────────────────────────────────────
  if (phase === 'source') {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
        <Text bold color="cyan">采集设置</Text>
        <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={0} gap={1} marginTop={1}>
          <Text bold color="cyan">选择数据源</Text>
          <SelectInput
            items={SOURCE_ITEMS}
            onSelect={({ value }) => {
              if (value === 'manual') { setPhase('flow'); setStepIdx(0); }
              else                     setPhase('osint-pick');
            }}
            indicatorComponent={Indicator}
            itemComponent={Item}
          />
        </Box>
        <KeyBar hints={[{ key: 'Enter', label: '确认' }, { key: 'ESC', label: '返回菜单' }]} />
      </Box>
    );
  }

  // ── Phase: OSINT picker ─────────────────────────────────────────────────
  if (phase === 'osint-pick') {
    const baseDir = getConfig().outDir || './out/';
    const dirs    = listOsintResultDirs(baseDir);

    const handleConfirm = (picks) => {
      if (!picks.length) return;
      const kols    = picks.flatMap(p => loadOsintDir(p.path));
      const extract = extractScrapeTargets(kols);
      const list    = buildAccountList(extract);
      if (list.length === 0) {
        setPickerNote(`${SYM.warn} 所选 KOL 均无可映射到采集平台的账号（忽略 ${extract.ignoredCount} 个）`);
        return;
      }
      setAccounts(list);
      // sourceDir: when one KOL is picked use its dir; for many KOLs use the shared root.
      setSourceDir(picks.length === 1 ? picks[0].path : baseDir);
      setPickerNote('');
      setPhase('osint-review');
    };

    return (
      <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
        <Text bold color="cyan">采集设置 — 选择 OSINT 结果</Text>
        <Text color="gray" dimColor>
          扫描目录：{baseDir}（共 {dirs.length} 个） · Tab 多选 · Enter 确认 · / 搜索
        </Text>
        <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={0} gap={1} marginTop={1}>
          <PagedListPicker
            multi
            items={dirs}
            getKey={(d) => d.path}
            getSearchText={(d) => `${d.name} ${d.path}`}
            renderItem={(d, { selected, picked }) => (
              <Box>
                <Text color={selected ? 'cyan' : 'gray'} bold={selected}>{selected ? SYM.cursor : ' '} </Text>
                <Text color={picked ? 'cyan' : 'gray'}>{picked ? '◉ ' : '○ '}</Text>
                <Text color={selected ? 'white' : picked ? 'cyan' : 'gray'}>{d.name}</Text>
              </Box>
            )}
            onConfirm={handleConfirm}
            onCancel={() => setPhase('source')}
            emptyText="未找到带 _summary.json 的 OSINT 结果目录"
            reservedLines={pickerNote ? 9 : 8}
          />
          {pickerNote && <Text color="yellow">{pickerNote}</Text>}
        </Box>
        <KeyBar hints={[
          { key: 'Tab',       label: '勾选' },
          { key: 'Enter',     label: '确认' },
          { key: '/',         label: '搜索' },
          { key: 'PgUp/PgDn', label: '翻页' },
          { key: 'ESC',       label: '上一步' },
        ]} />
      </Box>
    );
  }

  // ── Phase: OSINT review ─────────────────────────────────────────────────
  if (phase === 'osint-review') {
    return (
      <OsintReview
        accounts={accounts}
        sourceDir={sourceDir}
        onBack={() => prefill ? onNav('menu') : setPhase('osint-pick')}
        onConfirm={(kept) => {
          setChosen(kept);
          setPhase('osint-params');
        }}
      />
    );
  }

  // ── Phase: OSINT params ─────────────────────────────────────────────────
  if (phase === 'osint-params') {
    // Group chosen accounts by KOL → platform → handles[]. Preserves the
    // OSINT-supplied identity binding so each scrape output lands under the
    // correct kolId directory.
    const accountsByKol = {};
    const targetsByPv   = {};
    for (const acc of chosen) {
      const kolId = acc.kol;       // OSINT slug = canonical kol_id
      ((accountsByKol[kolId] ??= {})[acc.platform] ??= []).push(acc.handle);
      (targetsByPv[acc.platform] ??= []).push(acc.handle);
    }
    const platforms = Object.keys(targetsByPv);

    return (
      <OsintParams
        platforms={platforms}
        accounts={chosen}
        onBack={() => setPhase('osint-review')}
        onSubmit={(values) => submit({ values, platforms, accountsByKol })}
      />
    );
  }

  // ── Phase: manual flow (step-by-step) ───────────────────────────────────
  if (!manualStep) return null;

  const handlePlatformConfirm = (platforms) => {
    setSelectedPlatforms(platforms);
    setConfig({});
    setStepIdx(1);
    setDraft('');
  };

  const advance = (value) => {
    let val = value !== undefined ? String(value) : draft;
    if (manualStep.platform) val = parseTargetsInput(val);
    else                      val = val.trim();

    const next = { ...config, [manualStep.key]: val };
    setConfig(next);

    const allSteps = buildSteps(selectedPlatforms);
    if (stepIdx + 1 >= allSteps.length) {
      const targetsByPv = Object.fromEntries(
        selectedPlatforms.map(pv => [pv, next[`targets_${pv}`] ?? ''])
      );
      submit({ values: next, platforms: selectedPlatforms, targetsByPv });
    } else {
      setStepIdx(i => i + 1);
      setDraft('');
    }
  };

  const doneSteps = manualSteps.slice(0, stepIdx);

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
      <Text bold color="cyan">采集设置</Text>

      <StepBar steps={manualStepNames} current={stepIdx} />

      {doneSteps.length > 0 && (
        <Box flexDirection="column" borderStyle="round" borderColor="green" borderDimColor paddingX={2}>
          {doneSteps.map(s => {
            let display;
            if (s.key === 'platforms') {
              display = selectedPlatforms.map(platformLabel).join(', ');
            } else {
              display = config[s.key] || '（跳过）';
            }
            return (
              <Box key={s.key} gap={2}>
                <Text color="green">{SYM.check}</Text>
                <Text color="gray" dimColor>{s.label.padEnd(12)}</Text>
                <Text color="white" wrap="truncate">{display}</Text>
              </Box>
            );
          })}
        </Box>
      )}

      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={0} marginTop={1} gap={1}>
        <Text bold color="cyan">{manualStep.label}</Text>

        {manualStep.hint && manualStep.hint.split('\n').map((h, i) => (
          <Text key={i} color="gray" dimColor>{h}</Text>
        ))}

        {manualStep.type === 'multi-select' && (
          <MultiSelect items={PLATFORM_ITEMS} onConfirm={handlePlatformConfirm} />
        )}

        {manualStep.type === 'select' && (
          <SelectInput
            items={manualStep.items}
            onSelect={({ value }) => advance(value)}
            indicatorComponent={Indicator}
            itemComponent={Item}
          />
        )}

        {manualStep.type === 'text' && (
          <Box gap={1}>
            <Text color="cyan">{SYM.cursor}</Text>
            <TextInput
              value={draft}
              onChange={setDraft}
              onSubmit={() => advance()}
              placeholder={manualStep.hint?.split('\n')[0] ?? ''}
            />
          </Box>
        )}
      </Box>

      <KeyBar hints={[
        ...(manualStep.type === 'multi-select' ? [{ key: 'Space', label: '切换选择' }] : [{ key: 'Enter', label: '确认' }]),
        { key: 'ESC', label: stepIdx === 0 ? '返回菜单' : '上一步' },
      ]} />
    </Box>
  );
}
