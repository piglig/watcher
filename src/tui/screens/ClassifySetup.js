import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import StepBar from '../components/StepBar.js';
import KeyBar from '../components/KeyBar.js';
import { SYM } from '../theme.js';
import { readdirSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { getConfig } from '../../shared/config-store.js';

const MODEL_ITEMS = [
  { label: 'gpt-4.1-mini  快速省钱（推荐）', value: 'gpt-4.1-mini' },
  { label: 'gpt-4.1       高精度',           value: 'gpt-4.1'      },
  { label: 'gpt-4o-mini   备用',             value: 'gpt-4o-mini'  },
];

function scanJsonFiles(dir) {
  try {
    const abs = resolve(dir);
    if (!existsSync(abs)) return [];
    return readdirSync(abs)
      .filter(f => f.endsWith('.json'))
      .map(f => ({ label: f, value: join(abs, f) }));
  } catch { return []; }
}

/** 根据已保存配置动态生成步骤，跳过已有默认值的目录步骤 */
function buildSteps() {
  const saved = getConfig();
  const steps = [
    { key: 'inputDir',  short: '输入', label: '输入目录', type: 'text', hint: `默认 ${saved.outDir || './out/'}` },
    { key: 'inputFile', short: '文件', label: '选择文件', type: 'files' },
    { key: 'model',     short: '模型', label: '模型',     type: 'select', items: MODEL_ITEMS },
  ];
  // 未配置默认目录时才询问输出目录
  if (!saved.outDir) {
    steps.push({ key: 'outDir', short: '输出', label: '输出目录', type: 'text', hint: '默认 ./out/' });
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

export default function ClassifySetup({ onNav }) {
  const steps = useMemo(buildSteps, []);

  const [config, setConfig]   = useState({ inputDir: '' });
  const [stepIdx, setStepIdx] = useState(0);
  const [draft, setDraft]     = useState('');

  const step       = steps[stepIdx];
  const stepLabels = steps.map(s => s.short);

  const fileItems = useMemo(() => {
    const saved = getConfig();
    const dir   = config.inputDir || saved.outDir || './out/';
    const files = scanJsonFiles(dir);
    return [{ label: '（全选目录中所有文件）', value: '' }, ...files];
  }, [config.inputDir]);

  useInput((_, key) => {
    if (key.escape) {
      if (stepIdx === 0) onNav('menu');
      else { setStepIdx(i => i - 1); setDraft(''); }
    }
  });

  const advance = (value) => {
    const val  = (value ?? draft).trim();
    const next = { ...config, [step.key]: val };
    setConfig(next);

    if (stepIdx + 1 >= steps.length) {
      const saved     = getConfig();
      const inputDir  = next.inputDir || saved.outDir || './out/';
      const outDir    = next.outDir   || saved.outDir || './out/';
      const model     = next.model    || saved.model  || 'gpt-4.1-mini';
      let inputFiles;
      if (next.inputFile) {
        inputFiles = [next.inputFile];
      } else {
        const dir = resolve(inputDir);
        inputFiles = existsSync(dir)
          ? readdirSync(dir).filter(f => f.endsWith('.json')).map(f => join(dir, f))
          : [];
      }
      onNav('classify-run', { classifyConfig: { inputFiles, model, outDir, wait: false } });
    } else {
      setStepIdx(i => i + 1);
      setDraft('');
    }
  };

  if (!step) return null;

  const doneSteps = steps.slice(0, stepIdx);

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
              <Text color="white">{config[s.key] || '（默认）'}</Text>
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
        {step.hint && <Text color="gray" dimColor>{step.hint}</Text>}

        {step.type === 'select' || step.type === 'files' ? (
          <SelectInput
            items={step.type === 'files' ? fileItems : step.items}
            onSelect={({ value }) => advance(value)}
            indicatorComponent={Indicator}
            itemComponent={Item}
          />
        ) : (
          <Box gap={1}>
            <Text color="cyan">{SYM.cursor}</Text>
            <TextInput
              value={draft}
              onChange={setDraft}
              onSubmit={() => advance()}
              placeholder={step.hint ?? ''}
            />
          </Box>
        )}
      </Box>

      <KeyBar hints={[
        { key: 'Enter', label: '确认' },
        { key: 'ESC',   label: stepIdx === 0 ? '返回菜单' : '上一步' },
      ]} />
    </Box>
  );
}
