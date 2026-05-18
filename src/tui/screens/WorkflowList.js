import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import KeyBar from '../components/KeyBar.js';
import { SYM } from '../theme.js';
import { listWorkflows, deleteWorkflow, STATE_LABELS } from '../../workflow/index.js';

function fmtAge(iso) {
  const h = Math.round((Date.now() - new Date(iso)) / 3_600_000);
  if (h < 1)  return '刚刚';
  if (h < 24) return `${h} 小时前`;
  return `${Math.round(h / 24)} 天前`;
}

const STATE_COLOR = {
  osint_pending:    'yellow',
  osint_done:       'cyan',
  scraping:         'cyan',
  scrape_done:      'cyan',
  classify_pending: 'yellow',
  classify_done:    'cyan',
  report_done:      'green',
  error:            'red',
};

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

export default function WorkflowList({ onNav }) {
  const [version, setVersion] = useState(0);
  const workflows = listWorkflows();

  const [highlightedId, setHighlightedId] = useState(null);
  const [confirmDel, setConfirmDel]       = useState(null);
  const [feedback, setFeedback]           = useState('');

  useInput((input, key) => {
    if (confirmDel) {
      if (input === 'y' || input === 'Y') {
        deleteWorkflow(confirmDel);
        setFeedback(`${SYM.check} 已删除本地记录 ${confirmDel}`);
        setConfirmDel(null);
        setVersion(v => v + 1);
        return;
      }
      if (input === 'n' || input === 'N' || key.escape) { setConfirmDel(null); return; }
      return;
    }

    if (key.escape) { onNav('menu'); return; }
    if ((input === 'd' || input === 'D') && highlightedId) setConfirmDel(highlightedId);
  });

  if (!workflows.length) {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
        <Text bold color="cyan">调查任务列表</Text>
        <Box borderStyle="round" borderColor="gray" borderDimColor paddingX={2} paddingY={1}>
          <Text color="gray" dimColor>暂无任务。从主菜单的「调查 KOL」开始。</Text>
        </Box>
        <KeyBar hints={[{ key: 'ESC', label: '返回菜单' }]} />
      </Box>
    );
  }

  const handleSelect = ({ value }) => {
    onNav('workflow-run', { workflowConfig: { action: 'resume', workflowId: value } });
  };

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
      <Text bold color="cyan">调查任务列表（Enter 继续 · d 删除本地记录）</Text>

      <Box flexDirection="column" borderStyle="round" borderColor="gray" borderDimColor paddingX={2} paddingY={0}>
        <Box gap={3}>
          <Text color="gray" dimColor>{'状态'.padEnd(18)}</Text>
          <Text color="gray" dimColor>{'KOL'.padEnd(20)}</Text>
          <Text color="gray" dimColor>{'ID'.padEnd(20)}</Text>
          <Text color="gray" dimColor>时间</Text>
        </Box>
        <Text color="gray" dimColor>{'─'.repeat(72)}</Text>
        {workflows.map(w => (
          <Box key={w.id} gap={3}>
            <Text color={STATE_COLOR[w.state] ?? 'gray'}>{(STATE_LABELS[w.state] ?? w.state).padEnd(16)}</Text>
            <Text color="gray" dimColor wrap="truncate">{(w.kol?.name ?? '—').padEnd(20)}</Text>
            <Text color="gray" dimColor>{w.id.padEnd(20)}</Text>
            <Text color="gray" dimColor>{fmtAge(w.updated_at)}</Text>
          </Box>
        ))}
      </Box>

      <Box flexDirection="column" gap={0}>
        <Text bold color="cyan">选择任务</Text>
        <SelectInput
          key={version}
          items={workflows.map(w => ({
            label: `${w.kol?.name ?? '—'}  [${STATE_LABELS[w.state] ?? w.state}]  ${w.id}`,
            value: w.id,
          }))}
          onSelect={handleSelect}
          onHighlight={(item) => setHighlightedId(item?.value ?? null)}
          indicatorComponent={Indicator}
          itemComponent={Item}
        />
      </Box>

      {confirmDel && (
        <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={2}>
          <Text bold color="yellow">{SYM.warn} 确认删除本地 workflow 记录 {confirmDel}？</Text>
          <Text color="gray" dimColor>y = 删除（不影响远程 batch）；n / ESC = 放弃</Text>
        </Box>
      )}

      {feedback && !confirmDel && <Text color="gray">{feedback}</Text>}

      <KeyBar hints={
        confirmDel
          ? [{ key: 'y', label: '删除' }, { key: 'n/ESC', label: '放弃' }]
          : [{ key: 'Enter', label: '继续' }, { key: 'd', label: '删除' }, { key: 'ESC', label: '返回' }]
      } />
    </Box>
  );
}
