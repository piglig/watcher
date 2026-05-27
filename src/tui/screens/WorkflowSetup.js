import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import StepBar from '../components/StepBar.js';
import KeyBar from '../components/KeyBar.js';
import CsvFilePicker from '../components/CsvFilePicker.js';
import { Indicator, Item } from '../components/SelectChrome.js';
import { SYM } from '../theme.js';
import { basename } from 'path';
import { getConfig } from '../../shared/config-store.js';
import { parseCSV } from '../../osint/output.js';

const MODE_ITEMS = [
  { label: '单条手输（KOL 名称 + Seed URL）',     value: 'single' },
  { label: 'CSV 文件导入（两列：name,seed_url）', value: 'csv'    },
];

const STEPS = ['模式', '输入'];

export default function WorkflowSetup({ onNav }) {
  const saved = getConfig();
  const [stepIdx, setStepIdx] = useState(0);
  const [mode, setMode]       = useState(null);
  const [name, setName]       = useState('');
  const [seedUrl, setSeed]    = useState('');
  const [field, setField]     = useState('name');
  const [targets, setTargets] = useState([]);
  const [csvPath, setCsvPath] = useState(null);
  const [csvErr, setCsvErr]   = useState('');

  useInput((_, key) => {
    if (key.escape) {
      if (stepIdx === 1 && mode === 'csv' && csvPath) {
        setCsvPath(null);
        setTargets([]);
        setCsvErr('');
        return;
      }
      if (stepIdx === 0) onNav('menu');
      else setStepIdx(i => i - 1);
      return;
    }
    if (stepIdx === 1 && mode === 'single') {
      if (key.tab || key.downArrow) setField(f => (f === 'name' ? 'seedUrl' : 'name'));
      if (key.upArrow)               setField(f => (f === 'seedUrl' ? 'name' : 'seedUrl'));
    }
  });

  const pickMode = (m) => { setMode(m); setStepIdx(1); };

  const submitSingle = () => {
    if (!name.trim() || !seedUrl.trim()) return;
    onNav('workflow-run', {
      workflowConfig: {
        action:     'start',
        kols:       [{ name: name.trim(), seedUrl: seedUrl.trim() }],
        outBaseDir: saved.outDir || './out/',
      },
    });
  };

  const pickCsv = (fullPath) => {
    try {
      const list = parseCSV(fullPath);
      if (!list.length) { setCsvErr('文件为空或缺少有效行（需 name,seed_url 两列）'); return; }
      setCsvPath(fullPath);
      setTargets(list);
      setCsvErr('');
    } catch (e) {
      setCsvErr(`解析失败：${e.message ?? e}`);
    }
  };

  const submitCsv = () => {
    if (!targets.length) return;
    onNav('workflow-run', {
      workflowConfig: {
        action:     'start',
        kols:       targets,
        outBaseDir: saved.outDir || './out/',
      },
    });
  };

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
      <Text bold color="cyan">调查 KOL — 新建任务</Text>
      <StepBar steps={STEPS} current={stepIdx} />

      {/* Step 1: mode */}
      {stepIdx === 0 && (
        <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={0} gap={1} marginTop={1}>
          <Text bold color="cyan">选择输入方式</Text>
          <SelectInput
            items={MODE_ITEMS}
            onSelect={({ value }) => pickMode(value)}
            indicatorComponent={Indicator}
            itemComponent={Item}
          />
        </Box>
      )}

      {/* Step 2a: single */}
      {stepIdx === 1 && mode === 'single' && (
        <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={0} gap={1} marginTop={1}>
          <Text bold color="cyan">输入 KOL 信息</Text>
          <Text color="gray" dimColor>Tab / ↑↓ 切换字段；Enter 在 Seed URL 提交</Text>

          <Box gap={1}>
            <Text color={field === 'name' ? 'cyan' : 'gray'}>
              {field === 'name' ? SYM.cursor : ' '} KOL 名称
            </Text>
          </Box>
          <Box gap={1}>
            <Text color="gray">{'  '}</Text>
            <TextInput
              value={name}
              onChange={setName}
              focus={field === 'name'}
              onSubmit={() => setField('seedUrl')}
              placeholder="例：wusol(아스피스)"
            />
          </Box>

          <Box gap={1}>
            <Text color={field === 'seedUrl' ? 'cyan' : 'gray'}>
              {field === 'seedUrl' ? SYM.cursor : ' '} Seed URL
            </Text>
          </Box>
          <Box gap={1}>
            <Text color="gray">{'  '}</Text>
            <TextInput
              value={seedUrl}
              onChange={setSeed}
              focus={field === 'seedUrl'}
              onSubmit={submitSingle}
              placeholder="例：https://x.com/aktmvltm"
            />
          </Box>

          {!name.trim() || !seedUrl.trim()
            ? <Text color="gray" dimColor>{SYM.warn} 两个字段都必填</Text>
            : <Text color="green">{SYM.check} 准备就绪，按 Enter 提交</Text>}
        </Box>
      )}

      {/* Step 2b: CSV */}
      {stepIdx === 1 && mode === 'csv' && (
        <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={0} gap={1} marginTop={1}>
          <Text bold color="cyan">选择 CSV 文件</Text>

          {!csvPath ? (
            <CsvFilePicker onPick={pickCsv} error={csvErr} />
          ) : (
            <Box flexDirection="column" gap={0}>
              <Text color="green">{SYM.check} 已加载 {targets.length} 个 KOL（{basename(csvPath)}）</Text>
              <Text color="gray" dimColor>{csvPath}</Text>
              <Text color="gray" dimColor>将创建 {targets.length} 个 workflow，共享 1 个 OSINT batch</Text>
              <Box marginTop={1}>
                <Text color="cyan" bold>按 Enter 提交，按 ESC 重选</Text>
              </Box>
            </Box>
          )}
        </Box>
      )}

      <KeyBar hints={
        stepIdx === 1 && mode === 'csv' && csvPath
          ? [{ key: 'Enter', label: '提交' }, { key: 'ESC', label: '上一步' }]
          : [{ key: 'Enter', label: '确认' }, { key: 'ESC', label: stepIdx === 0 ? '返回菜单' : '上一步' }]
      } />

      {/* Hidden enter-binding for CSV confirm */}
      {stepIdx === 1 && mode === 'csv' && csvPath && (
        <CsvConfirm onSubmit={submitCsv} />
      )}
    </Box>
  );
}

function CsvConfirm({ onSubmit }) {
  useInput((_, key) => { if (key.return) onSubmit(); });
  return null;
}
