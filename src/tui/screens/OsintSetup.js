import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import StepBar from '../components/StepBar.js';
import KeyBar from '../components/KeyBar.js';
import CsvFilePicker from '../components/CsvFilePicker.js';
import { Indicator, Item } from '../components/SelectChrome.js';
import { SYM } from '../theme.js';
import { getConfig } from '../../shared/config-store.js';
import { parseCSV } from '../../osint/output.js';

const MODE_ITEMS = [
  { label: '单条手输（KOL 名称 + Seed URL）', value: 'single' },
  { label: 'CSV 文件导入（两列：name,seed_url）',  value: 'csv'    },
];

const STEPS = ['模式', '输入'];

export default function OsintSetup({ onNav }) {
  const saved  = getConfig();
  const outDir = saved.outDir || './out/';

  const [stepIdx, setStepIdx] = useState(0);
  const [mode,    setMode]    = useState(null);          // 'single' | 'csv'
  const [name,    setName]    = useState('');
  const [seedUrl, setSeedUrl] = useState('');
  const [field,   setField]   = useState('name');        // for single mode
  const [csvErr,  setCsvErr]  = useState('');

  useInput((_, key) => {
    if (key.escape) {
      if (stepIdx === 0) onNav('menu');
      else setStepIdx(i => i - 1);
      return;
    }
    if (stepIdx === 1 && mode === 'single') {
      if (key.tab || key.downArrow) setField(f => (f === 'name' ? 'seedUrl' : 'name'));
      if (key.upArrow)               setField(f => (f === 'seedUrl' ? 'name' : 'seedUrl'));
    }
  });

  const finishStep1 = (m) => { setMode(m); setStepIdx(1); };

  const submit = (targets) => {
    onNav('osint-run', {
      osintConfig: { targets, outDir, model: 'grok-4.3' },
    });
  };

  const finishStep2Single = () => {
    if (!name.trim() || !seedUrl.trim()) return;
    submit([{ name: name.trim(), seedUrl: seedUrl.trim() }]);
  };

  const pickCsv = (fullPath) => {
    try {
      const list = parseCSV(fullPath);
      if (!list.length) { setCsvErr('文件为空或缺少有效行（需 name,seed_url 两列）'); return; }
      setCsvErr('');
      submit(list);
    } catch (e) {
      setCsvErr(`解析失败：${e.message ?? e}`);
    }
  };

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
      <Text bold color="cyan">OSINT 社媒追踪</Text>

      <StepBar steps={STEPS} current={stepIdx} />

      {/* ── Step 1: mode ── */}
      {stepIdx === 0 && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="cyan"
          paddingX={2}
          paddingY={0}
          gap={1}
          marginTop={1}
        >
          <Text bold color="cyan">选择输入方式</Text>
          <SelectInput
            items={MODE_ITEMS}
            onSelect={({ value }) => finishStep1(value)}
            indicatorComponent={Indicator}
            itemComponent={Item}
          />
        </Box>
      )}

      {/* ── Step 2a: single input ── */}
      {stepIdx === 1 && mode === 'single' && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="cyan"
          paddingX={2}
          paddingY={0}
          gap={1}
          marginTop={1}
        >
          <Text bold color="cyan">输入 KOL 信息</Text>
          <Text color="gray" dimColor>Tab / ↑↓ 切换字段；在 Seed URL 字段按 Enter 进入下一步</Text>

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
              onChange={setSeedUrl}
              focus={field === 'seedUrl'}
              onSubmit={finishStep2Single}
              placeholder="例：https://x.com/aktmvltm"
            />
          </Box>

          {!name.trim() || !seedUrl.trim()
            ? <Text color="gray" dimColor>{SYM.warn} 两个字段都必填</Text>
            : <Text color="green">{SYM.check} 准备就绪，按 Enter 提交</Text>}
        </Box>
      )}

      {/* ── Step 2b: csv pick ── */}
      {stepIdx === 1 && mode === 'csv' && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="cyan"
          paddingX={2}
          paddingY={0}
          gap={1}
          marginTop={1}
        >
          <Text bold color="cyan">选择 CSV 文件</Text>
          <CsvFilePicker onPick={pickCsv} error={csvErr} />
        </Box>
      )}

      <KeyBar hints={[
        { key: 'Enter', label: '确认' },
        { key: 'ESC',   label: stepIdx === 0 ? '返回菜单' : '上一步' },
      ]} />
    </Box>
  );
}
