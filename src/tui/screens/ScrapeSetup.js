import React, { useState, useMemo } from 'react';
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
import { resolve } from 'path';
import { homedir } from 'os';

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

  // 若设置中已配置默认目录，跳过此步骤
  if (!getConfig().outDir) {
    steps.push({ key: 'outDir', short: '目录', label: '输出目录', type: 'text', hint: '默认 ./out/' });
  }

  return steps;
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

export default function ScrapeSetup({ onNav }) {
  const [selectedPlatforms, setSelectedPlatforms] = useState([]);
  const [config, setConfig]   = useState({});
  const [stepIdx, setStepIdx] = useState(0);
  const [draft,   setDraft]   = useState('');

  const steps      = useMemo(() => buildSteps(selectedPlatforms), [selectedPlatforms]);
  const step       = steps[stepIdx];
  const stepLabels = steps.map(s => s.short);

  useInput((_, key) => {
    if (!key.escape) return;
    if (stepIdx === 0) { onNav('menu'); return; }
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
      const savedOutDir = getConfig().outDir;
      const shared = {
        max:          next.max          || '200',
        since:        next.since        || '',
        until:        next.until        || '',
        headed:       next.headed === 'true',
        outDir:       next.outDir       || savedOutDir || './out/',
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

  if (!step) return null;

  const doneSteps = steps.slice(0, stepIdx);

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
      <Text bold color="cyan">采集设置</Text>

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
