import React, { useState, useMemo, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import MultiSelect from '../components/MultiSelect.js';
import StepBar from '../components/StepBar.js';
import KeyBar from '../components/KeyBar.js';
import { SYM } from '../theme.js';
import { PLATFORMS } from '../runner.js';
import { getConfig } from '../../shared/config-store.js';
import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { homedir } from 'os';
import { loadOsintDir, extractScrapeTargets, listOsintResultDirs } from '../../osint/index.js';

const PLATFORM_ITEMS = PLATFORMS.map(p => ({ label: p.label, value: p.value }));

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
    } catch {}
  }
  return t;
}

/**
 * 根据已选平台动态生成步骤列表。
 * 顺序：平台选择 → 各平台目标 → 共享选项 → 平台专属选项 → 输出目录
 */
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

  steps.push({ key: 'max',   short: '上限', label: '采集上限',  type: 'text',   hint: '默认 200 条/目标' });
  steps.push({ key: 'since', short: '开始', label: '开始日期',  type: 'text',   hint: 'YYYY-MM-DD，留空跳过' });
  steps.push({ key: 'until', short: '结束', label: '结束日期',  type: 'text',   hint: 'YYYY-MM-DD，留空跳过' });

  const needsBrowser = platforms.some(pv => PLATFORMS.find(p => p.value === pv)?.needsBrowser);
  if (needsBrowser) {
    steps.push({
      key: 'headed', short: '浏览器', label: '浏览器模式', type: 'select',
      items: [
        { label: '无界面（推荐）', value: 'false' },
        { label: '显示窗口',       value: 'true'  },
      ],
    });
  }

  if (platforms.includes('youtube') && !process.env.YOUTUBE_API_KEY) {
    steps.push({
      key: 'youtubeKey', short: 'YT Key', label: 'YouTube API Key', type: 'text',
      hint: '或提前在设置中配置',
    });
  }

  if (platforms.includes('reddit')) {
    steps.push({
      key: 'redditSource', short: '数据源', label: 'Reddit 数据源', type: 'select',
      items: [
        { label: 'Arctic Shift（快）', value: 'arctic' },
        { label: 'Reddit 官方',        value: 'reddit' },
      ],
    });
  }

  return steps;
}

function buildImportNote(prefill) {
  const platformCount = Object.keys(prefill?.targets ?? {}).length;
  const handleCount   = Object.values(prefill?.targets ?? {}).reduce((s, a) => s + a.length, 0);
  const ignored       = prefill?.ignoredCount ?? 0;
  let note = `从 OSINT 导入：${platformCount} 个平台 / ${handleCount} 个账号`;
  if (ignored > 0) note += ` · 忽略 ${ignored} 个账号（未支持平台）`;
  if (prefill?.sourceDir) note += ` · 来源：${prefill.sourceDir}`;
  return note;
}

function Indicator({ isSelected }) {
  return (
    <Box marginRight={1}>
      {isSelected ? <Text color="cyan" bold>{SYM.cursor}</Text> : <Text> </Text>}
    </Box>
  );
}
function Item({ label, isSelected }) {
  return <Text color={isSelected ? 'white' : 'gray'}>{label}</Text>;
}

// Source-mode picker shown before the regular flow when no prefill provided.
const SOURCE_ITEMS = [
  { label: '手动输入目标',         value: 'manual' },
  { label: '从 OSINT 结果导入',     value: 'osint'  },
];

export default function ScrapeSetup({ onNav, prefill }) {
  // Phase: 'source' → choose manual vs OSINT-import (only when no prefill)
  //        'osint-pick' → pick which OSINT result dir to import
  //        'flow'   → normal step-by-step flow
  const initialPhase = prefill ? 'flow' : 'source';

  const [phase, setPhase]                         = useState(initialPhase);
  const [selectedPlatforms, setSelectedPlatforms] = useState(
    prefill ? Object.keys(prefill.targets ?? {}) : []
  );
  const [config, setConfig] = useState(() => {
    if (!prefill?.targets) return {};
    const out = {};
    for (const [pv, handles] of Object.entries(prefill.targets)) {
      out[`targets_${pv}`] = handles.join(',');
    }
    return out;
  });
  // When prefill exists, skip the platform-selection step (index 0).
  const [stepIdx, setStepIdx] = useState(prefill ? 1 : 0);
  const [draft,   setDraft]   = useState('');
  const [importNote, setImportNote] = useState(
    prefill ? buildImportNote(prefill) : ''
  );

  const steps      = useMemo(() => buildSteps(selectedPlatforms), [selectedPlatforms]);
  const step       = steps[stepIdx];
  const stepLabels = steps.map(s => s.short);

  // Prime draft from existing config when entering a text step (used for
  // prefilled OSINT-import flow so Enter doesn't blank the targets).
  useEffect(() => {
    if (phase !== 'flow') return;
    if (step?.type === 'text' && config[step.key]) setDraft(config[step.key]);
  }, [stepIdx, phase]); // eslint-disable-line

  useInput((_, key) => {
    if (!key.escape) return;
    if (phase === 'osint-pick') { setPhase('source'); return; }
    if (phase === 'source') { onNav('menu'); return; }
    if (stepIdx === 0)      { onNav('menu'); return; }
    setStepIdx(i => i - 1);
    setDraft('');
  });

  // 平台多选确认后进入下一步
  const handlePlatformConfirm = (platforms) => {
    setSelectedPlatforms(platforms);
    setConfig({});
    setStepIdx(1);
    setDraft('');
  };

  // 普通步骤前进
  const advance = (value) => {
    let val = value !== undefined ? String(value) : draft;

    // 目标步骤：支持文件路径导入
    if (step.platform) val = parseTargetsInput(val);
    else               val = val.trim();

    const next = { ...config, [step.key]: val };
    setConfig(next);

    const currentSteps = buildSteps(selectedPlatforms);
    if (stepIdx + 1 >= currentSteps.length) {
      // 构建各平台独立配置，顺序执行
      const outDir = getConfig().outDir || './out/';
      const shared = {
        max:          next.max          || '200',
        since:        next.since        || '',
        until:        next.until        || '',
        headed:       next.headed === 'true',
        outDir,
        redditSource: next.redditSource || 'arctic',
        apiKey:       next.youtubeKey   || process.env.YOUTUBE_API_KEY,
      };

      const platformConfigs = selectedPlatforms.map(pv => ({
        platform: pv,
        targets:  next[`targets_${pv}`] ?? '',
        ...shared,
      }));

      onNav('scrape-run', { scrapeConfig: platformConfigs });
    } else {
      setStepIdx(i => i + 1);
      setDraft('');
    }
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
              if (value === 'manual') setPhase('flow');
              else                    setPhase('osint-pick');
            }}
            indicatorComponent={Indicator}
            itemComponent={Item}
          />
        </Box>
        <KeyBar hints={[{ key: 'Enter', label: '确认' }, { key: 'ESC', label: '返回菜单' }]} />
      </Box>
    );
  }

  // ── Phase: OSINT result directory picker ────────────────────────────────
  if (phase === 'osint-pick') {
    const baseDir = join(getConfig().outDir || './out/', 'osint');
    const dirs    = listOsintResultDirs(baseDir);

    return (
      <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
        <Text bold color="cyan">采集设置 — 选择 OSINT 结果</Text>
        <Text color="gray" dimColor>扫描目录：{baseDir}</Text>
        <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={0} gap={1} marginTop={1}>
          {dirs.length === 0 ? (
            <Text color="gray" dimColor>未找到带 _summary.json 的 OSINT 结果目录</Text>
          ) : (
            <SelectInput
              items={dirs.map(d => ({ label: d.name, value: d.path }))}
              onSelect={({ value }) => {
                const kols    = loadOsintDir(value);
                const extract = extractScrapeTargets(kols);
                const pvs     = Object.keys(extract.targets);
                if (pvs.length === 0) {
                  setImportNote(`${SYM.warn} 该结果没有可映射到采集平台的账号（忽略 ${extract.ignoredCount} 个）`);
                  return;
                }
                const cfg = {};
                for (const [pv, handles] of Object.entries(extract.targets)) {
                  cfg[`targets_${pv}`] = handles.join(',');
                }
                setSelectedPlatforms(pvs);
                setConfig(cfg);
                setImportNote(buildImportNote({ ...extract, sourceDir: value }));
                setStepIdx(1);            // skip platform-multi-select
                setPhase('flow');
              }}
              indicatorComponent={Indicator}
              itemComponent={Item}
            />
          )}
          {importNote && <Text color="yellow">{importNote}</Text>}
        </Box>
        <KeyBar hints={[{ key: 'Enter', label: '选择' }, { key: 'ESC', label: '上一步' }]} />
      </Box>
    );
  }

  if (!step) return null;

  const doneSteps = steps.slice(0, stepIdx);

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
      <Text bold color="cyan">采集设置</Text>

      {importNote && (
        <Box borderStyle="round" borderColor="yellow" borderDimColor paddingX={2}>
          <Text color="yellow">{SYM.info} {importNote}</Text>
        </Box>
      )}

      <StepBar steps={stepLabels} current={stepIdx} />

      {doneSteps.length > 0 && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="green"
          borderDimColor
          paddingX={2}
        >
          {doneSteps.map(s => {
            let display;
            if (s.key === 'platforms') {
              display = selectedPlatforms
                .map(pv => PLATFORMS.find(p => p.value === pv)?.label ?? pv)
                .join(', ');
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

      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="cyan"
        paddingX={2}
        paddingY={0}
        marginTop={1}
        gap={1}
      >
        <Text bold color="cyan">{step.label}</Text>

        {step.hint && step.hint.split('\n').map((h, i) => (
          <Text key={i} color="gray" dimColor>{h}</Text>
        ))}

        {step.type === 'multi-select' && (
          <MultiSelect items={PLATFORM_ITEMS} onConfirm={handlePlatformConfirm} />
        )}

        {step.type === 'select' && (
          <SelectInput
            items={step.items}
            onSelect={({ value }) => advance(value)}
            indicatorComponent={Indicator}
            itemComponent={Item}
          />
        )}

        {step.type === 'text' && (
          <Box gap={1}>
            <Text color="cyan">{SYM.cursor}</Text>
            <TextInput
              value={draft}
              onChange={setDraft}
              onSubmit={() => advance()}
              placeholder={step.hint?.split('\n')[0] ?? ''}
            />
          </Box>
        )}
      </Box>

      <KeyBar hints={[
        ...(step.type === 'multi-select' ? [{ key: 'Space', label: '切换选择' }] : [{ key: 'Enter', label: '确认' }]),
        { key: 'ESC', label: stepIdx === 0 ? '返回菜单' : '上一步' },
      ]} />
    </Box>
  );
}
