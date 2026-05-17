import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import DirPicker from '../components/DirPicker.js';
import StepBar from '../components/StepBar.js';
import KeyBar from '../components/KeyBar.js';
import { SYM } from '../theme.js';
import { getConfig, setConfig } from '../../shared/config-store.js';

const MODEL_ITEMS = [
  { label: 'gpt-4.1-mini  快速省钱（推荐）', value: 'gpt-4.1-mini' },
  { label: 'gpt-4.1       高精度',           value: 'gpt-4.1'      },
  { label: 'gpt-4o-mini   备用',             value: 'gpt-4o-mini'  },
];

const STEPS = [
  { key: 'openaiKey',  label: 'OpenAI API Key',  hint: '以 sk- 开头；留空保持现有值不变', mask: true,  type: 'text'   },
  { key: 'youtubeKey', label: 'YouTube API Key', hint: '仅采集 YouTube 时需要；留空跳过', mask: true,  type: 'text'   },
  { key: 'outDir',     label: '默认输出目录',                                               mask: false, type: 'dir'    },
  { key: 'model',      label: '默认 AI 模型',                                               mask: false, type: 'select', items: MODEL_ITEMS },
];

const STEP_LABELS = ['OpenAI', 'YouTube', '目录', '模型'];

function maskValue(val) {
  if (!val || val.length <= 8) return '••••••••';
  return val.slice(0, 4) + '•'.repeat(Math.min(val.length - 8, 16)) + val.slice(-4);
}

export default function Settings({ onNav }) {
  const saved = getConfig();

  const [stepIdx, setStepIdx] = useState(0);
  const [draft,   setDraft]   = useState('');
  const [values,  setValues]  = useState({
    openaiKey:  saved.openaiKey  ?? '',
    youtubeKey: saved.youtubeKey ?? '',
    outDir:     saved.outDir     ?? '',
    model:      saved.model      ?? '',
  });

  const step = STEPS[stepIdx];

  useInput((_, key) => {
    if (key.escape) {
      if (stepIdx === 0) onNav('menu');
      else { setStepIdx(i => i - 1); setDraft(''); }
      return;
    }

    // ← 返回上一步（text/select 步骤均支持）；→ 仅 text 步骤等效 Enter
    if (step?.type !== 'dir') {
      if (key.leftArrow && stepIdx > 0) {
        setStepIdx(i => i - 1);
        setDraft('');
      }
      if (key.rightArrow && step?.type === 'text') {
        advance();
      }
    }
  });

  // overrideVal 用于 DirPicker 直接传入选择的路径
  const advance = (overrideVal) => {
    const val  = overrideVal !== undefined ? String(overrideVal) : draft.trim();
    const next = { ...values, [step.key]: val || values[step.key] };
    setValues(next);
    setDraft('');

    if (stepIdx + 1 >= STEPS.length) {
      const toSave = {};
      if (next.openaiKey)  toSave.openaiKey  = next.openaiKey;
      if (next.youtubeKey) toSave.youtubeKey = next.youtubeKey;
      if (next.outDir)     toSave.outDir     = next.outDir;
      if (next.model)      toSave.model      = next.model;

      const cfg = setConfig(toSave);
      if (cfg.openaiKey)  process.env.OPENAI_API_KEY  = cfg.openaiKey;
      if (cfg.youtubeKey) process.env.YOUTUBE_API_KEY = cfg.youtubeKey;

      onNav('menu');
    } else {
      setStepIdx(i => i + 1);
    }
  };

  const doneSteps = STEPS.slice(0, stepIdx);

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
      <Text bold color="cyan">设置</Text>

      <StepBar steps={STEP_LABELS} current={stepIdx} />

      {doneSteps.length > 0 && (
        <Box flexDirection="column" borderStyle="round" borderColor="green" borderDimColor paddingX={2}>
          {doneSteps.map(s => (
            <Box key={s.key} gap={2}>
              <Text color="green">{SYM.check}</Text>
              <Text color="gray" dimColor>{s.label.padEnd(18)}</Text>
              <Text color="white" wrap="truncate">
                {values[s.key]
                  ? (s.mask ? maskValue(values[s.key]) : values[s.key])
                  : '（跳过）'}
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
        {step.hint && <Text color="gray" dimColor>{step.hint}</Text>}

        {step.type === 'dir' ? (
          <DirPicker
            initial={values[step.key] || '.'}
            onConfirm={(path) => advance(path)}
          />
        ) : step.type === 'select' ? (
          <>
            {values[step.key] && (
              <Text color="gray" dimColor>
                当前值：{MODEL_ITEMS.find(m => m.value === values[step.key])?.label ?? values[step.key]}
              </Text>
            )}
            <SelectInput
              items={step.items}
              onSelect={({ value }) => advance(value)}
              indicatorComponent={({ isSelected }) => (
                <Box marginRight={1}>
                  {isSelected ? <Text color="cyan" bold>{SYM.cursor}</Text> : <Text> </Text>}
                </Box>
              )}
              itemComponent={({ label, isSelected }) => (
                <Text color={isSelected ? 'white' : 'gray'}>{label}</Text>
              )}
            />
          </>
        ) : (
          <>
            {values[step.key] && (
              <Text color="gray" dimColor>
                当前值：{step.mask ? maskValue(values[step.key]) : values[step.key]}
              </Text>
            )}
            <Box gap={1}>
              <Text color="cyan">{SYM.cursor}</Text>
              <TextInput
                value={draft}
                onChange={setDraft}
                onSubmit={() => advance()}
                placeholder={step.hint ?? ''}
              />
            </Box>
          </>
        )}
      </Box>

      <KeyBar hints={
        step.type === 'dir'
          ? [{ key: 'ESC', label: stepIdx === 0 ? '返回菜单' : '上一步' }]
          : step.type === 'select'
          ? [{ key: '←', label: '上一项' }, { key: 'Enter', label: '选择' }, { key: 'ESC', label: stepIdx === 0 ? '返回菜单' : '上一步' }]
          : [{ key: '←→', label: '切换配置项' }, { key: 'Enter', label: '确认' }, { key: 'ESC', label: stepIdx === 0 ? '返回菜单' : '上一步' }]
      } />
    </Box>
  );
}
