import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import { BatchBadge } from '../components/StatusBadge.js';
import KeyBar from '../components/KeyBar.js';
import { SYM } from '../theme.js';
import { listBatches } from '../../shared/batch-store.js';

function fmtAge(iso) {
  const h = Math.round((Date.now() - new Date(iso)) / 3_600_000);
  if (h < 1)  return '刚刚';
  if (h < 24) return `${h} 小时前`;
  return `${Math.round(h / 24)} 天前`;
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

export default function JobsList({ onNav }) {
  const batches = listBatches();

  useInput((_, key) => {
    if (key.escape) onNav('menu');
  });

  const pendingBatches = batches.filter(b => b.status === 'pending');

  if (!batches.length) {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
        <Text bold color="cyan">分类任务列表</Text>
        <Box
          borderStyle="round"
          borderColor="gray"
          borderDimColor
          paddingX={2}
          paddingY={1}
        >
          <Text color="gray" dimColor>暂无历史任务。先采集内容，再提交 AI 分类。</Text>
        </Box>
        <KeyBar hints={[{ key: 'ESC', label: '返回菜单' }]} />
      </Box>
    );
  }

  const handleSelect = ({ value }) => {
    const batch = batches.find(b => b.id === value);
    if (!batch || batch.status !== 'pending') return;
    onNav('classify-run', {
      classifyConfig: {
        batchId:    value,
        model:      batch.model ?? 'gpt-4.1-mini',
        inputFiles: batch.input_files ?? [],
        outDir:     batch.out ?? './out/',
        wait:       false,   // retrieve only — never block on a 24h poll
      },
    });
  };

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
      <Text bold color="cyan">分类任务列表</Text>

      {/* History table */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="gray"
        borderDimColor
        paddingX={2}
        paddingY={0}
      >
        <Box gap={3} marginBottom={0}>
          <Text color="gray" dimColor>{'状态'.padEnd(6)}</Text>
          <Text color="gray" dimColor>{'ID（后 12 位）'.padEnd(14)}</Text>
          <Text color="gray" dimColor>{'数量'.padEnd(6)}</Text>
          <Text color="gray" dimColor>时间</Text>
        </Box>
        <Box>
          <Text color="gray" dimColor>{'─'.repeat(48)}</Text>
        </Box>
        {batches.map(b => (
          <Box key={b.id} gap={3}>
            <BatchBadge status={b.status} />
            <Text color="gray" dimColor>{b.id.slice(-12)}</Text>
            <Text color="gray" dimColor>{String(b.post_count).padStart(5)}</Text>
            <Text color="gray" dimColor>{fmtAge(b.created_at)}</Text>
          </Box>
        ))}
      </Box>

      {/* Pending selector */}
      {pendingBatches.length > 0 ? (
        <Box flexDirection="column" gap={0}>
          <Text bold color="cyan">检索等待中的批次</Text>
          <SelectInput
            items={pendingBatches.map(b => ({
              label: `${b.id.slice(-12)}  ${b.post_count} 条  ${fmtAge(b.created_at)}`,
              value: b.id,
            }))}
            onSelect={handleSelect}
            indicatorComponent={Indicator}
            itemComponent={Item}
          />
        </Box>
      ) : (
        <Box
          borderStyle="round"
          borderColor="gray"
          borderDimColor
          paddingX={2}
        >
          <Text color="gray" dimColor>
            {SYM.check} 没有等待中的批次。所有任务已完成或失败。
          </Text>
        </Box>
      )}

      <KeyBar hints={[{ key: 'ESC', label: '返回菜单' }]} />
    </Box>
  );
}
