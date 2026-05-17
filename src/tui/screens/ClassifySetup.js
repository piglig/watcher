import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import MultiSelect from '../components/MultiSelect.js';
import StepBar from '../components/StepBar.js';
import KeyBar from '../components/KeyBar.js';
import { SYM } from '../theme.js';
import { readdirSync, existsSync } from 'fs';
import { resolve, join, relative } from 'path';
import { getConfig } from '../../shared/config-store.js';

const MODEL_ITEMS = [
  { label: 'gpt-4.1-mini  快速省钱（推荐）', value: 'gpt-4.1-mini' },
  { label: 'gpt-4.1       高精度',           value: 'gpt-4.1'      },
  { label: 'gpt-4o-mini   备用',             value: 'gpt-4o-mini'  },
];

const STEPS = [
  { key: 'inputFile', short: '文件', label: '选择文件', type: 'multi-files' },
  { key: 'model',     short: '模型', label: '模型',     type: 'select', items: MODEL_ITEMS },
];

/** Recursively scan for JSON files, skipping the classified/ subdir */
function scanJsonFilesRecursive(dir) {
  const results = [];
  try {
    const abs = resolve(dir);
    if (!existsSync(abs)) return [];

    function walk(d) {
      let entries;
      try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (e.isDirectory()) {
          if (e.name !== 'classified') walk(join(d, e.name));
        } else if (e.name.endsWith('.json')) {
          const full = join(d, e.name);
          results.push({ label: relative(abs, full), value: full });
        }
      }
    }
    walk(abs);
  } catch {}
  return results.sort((a, b) => b.label.localeCompare(a.label));
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

export default function ClassifySetup({ onNav }) {
  const [config, setConfig]   = useState({});
  const [stepIdx, setStepIdx] = useState(0);
  const [draft, setDraft]     = useState('');

  const step       = STEPS[stepIdx];
  const stepLabels = STEPS.map(s => s.short);

  const saved    = getConfig();
  const scanDir  = saved.outDir || './out/';

  const fileItems = useMemo(() => scanJsonFilesRecursive(scanDir), [scanDir]);

  useInput((_, key) => {
    if (key.escape) {
      if (stepIdx === 0) onNav('menu');
      else { setStepIdx(i => i - 1); setDraft(''); }
    }
  });

  const advance = (value) => {
    const isMulti = step.type === 'multi-files';
    const val  = isMulti ? value : (value ?? draft).trim();
    const next = { ...config, [step.key]: val };
    setConfig(next);

    if (stepIdx + 1 >= STEPS.length) {
      const model = next.model || saved.model || 'gpt-4.1-mini';
      const outDir = scanDir;

      let inputFiles;
      const selected = next.inputFile;
      if (Array.isArray(selected) && selected.length > 0) {
        inputFiles = selected;
      } else {
        inputFiles = fileItems.map(f => f.value);
      }
      onNav('classify-run', { classifyConfig: { inputFiles, model, outDir, wait: false } });
    } else {
      setStepIdx(i => i + 1);
      setDraft('');
    }
  };

  if (!step) return null;

  const doneSteps = STEPS.slice(0, stepIdx);

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
      <Text bold color="cyan">AI 分类设置</Text>

      <StepBar steps={stepLabels} current={stepIdx} />

      {doneSteps.length > 0 && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="green"
          borderDimColor
          paddingX={2}
          marginTop={1}
        >
          {doneSteps.map(s => (
            <Box key={s.key} gap={2}>
              <Text color="green">{SYM.check}</Text>
              <Text color="gray" dimColor>{s.label.padEnd(6)}</Text>
              <Text color="white">
                {s.key === 'inputFile'
                  ? (Array.isArray(config[s.key]) && config[s.key].length > 0
                      ? `已选 ${config[s.key].length} 个文件`
                      : '全部文件')
                  : config[s.key] || '（默认）'}
              </Text>
            </Box>
          ))}
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
        <Text color="gray" dimColor>目录：{scanDir}</Text>

        {step.type === 'multi-files' ? (
          fileItems.length === 0 ? (
            <Text color="gray" dimColor>目录中暂无 .json 文件</Text>
          ) : (
            <>
              <Text color="gray" dimColor>不选任何文件 = 全选目录中所有文件（共 {fileItems.length} 个）</Text>
              <MultiSelect items={fileItems} onConfirm={(vals) => advance(vals)} />
            </>
          )
        ) : (
          <SelectInput
            items={step.items}
            onSelect={({ value }) => advance(value)}
            indicatorComponent={Indicator}
            itemComponent={Item}
          />
        )}
      </Box>

      <KeyBar hints={[
        { key: 'Enter', label: '确认' },
        { key: 'ESC',   label: stepIdx === 0 ? '返回菜单' : '上一步' },
      ]} />
    </Box>
  );
}
