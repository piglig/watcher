import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import { BatchBadge } from '../components/StatusBadge.js';
import KeyBar from '../components/KeyBar.js';
import { SYM } from '../theme.js';
import { listBatches, updateBatch, deleteBatch } from '../../shared/batch-store.js';
import { cancelBatch as cancelXaiBatch } from '../../osint/xai-client.js';
import { OpenAI } from 'openai';

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

async function cancelRemoteBatch(batch) {
  const kind = batch.kind ?? 'classify';
  if (kind === 'osint') {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) throw new Error('XAI_API_KEY 未设置');
    await cancelXaiBatch({ apiKey, batchId: batch.id });
  } else {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY 未设置');
    const client = new OpenAI({ apiKey });
    await client.batches.cancel(batch.id);
  }
}

export default function JobsList({ onNav }) {
  const [version, setVersion] = useState(0);   // forces re-render after mutations
  const batches = listBatches();

  const [highlightedId, setHighlightedId] = useState(null);
  const [confirming,    setConfirming]    = useState(null);   // batch object pending confirm
  const [busy,          setBusy]          = useState(false);
  const [feedback,      setFeedback]      = useState('');     // status line

  const pendingBatches = batches.filter(b => b.status === 'pending');

  useInput(async (input, key) => {
    if (busy) return;

    // Confirmation prompt
    if (confirming) {
      if (input === 'y' || input === 'Y') {
        setBusy(true);
        const target = confirming;
        try {
          await cancelRemoteBatch(target);
          updateBatch(target.id, { status: 'cancelled', cancelled_at: new Date().toISOString() });
          setFeedback(`${SYM.check} 已取消 ${target.id.slice(-12)}`);
        } catch (e) {
          // If remote already cancelled / expired, still mark locally so it disappears from pending.
          updateBatch(target.id, { status: 'cancelled', cancelled_at: new Date().toISOString() });
          setFeedback(`${SYM.warn} 远程取消失败（${e.message ?? e}），已本地标记为取消`);
        } finally {
          setConfirming(null);
          setBusy(false);
          setVersion(v => v + 1);
        }
        return;
      }
      if (input === 'n' || input === 'N' || key.escape) {
        setConfirming(null);
        return;
      }
      // Hard-delete the local record without contacting the API.
      if (input === 'd' || input === 'D') {
        deleteBatch(confirming.id);
        setFeedback(`${SYM.check} 已删除本地记录 ${confirming.id.slice(-12)}`);
        setConfirming(null);
        setVersion(v => v + 1);
      }
      return;
    }

    if (key.escape) { onNav('menu'); return; }

    // 'c' on highlighted pending batch → start confirmation
    if ((input === 'c' || input === 'C') && highlightedId) {
      const target = pendingBatches.find(b => b.id === highlightedId);
      if (target) setConfirming(target);
    }
  });

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
    const kind = batch.kind ?? 'classify';

    if (kind === 'osint') {
      onNav('osint-run', {
        osintConfig: {
          batchId: value,
          model:   batch.model ?? 'grok-4.3',
          outDir:  batch.out_dir ?? './out/osint/',
        },
      });
      return;
    }

    onNav('classify-run', {
      classifyConfig: {
        batchId:    value,
        model:      batch.model ?? 'gpt-4.1-mini',
        inputFiles: batch.input_files ?? [],
        outDir:     batch.out ?? './out/',
        wait:       false,
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
          <Text color="gray" dimColor>{'类型'.padEnd(8)}</Text>
          <Text color="gray" dimColor>{'ID（后 12 位）'.padEnd(14)}</Text>
          <Text color="gray" dimColor>{'数量'.padEnd(6)}</Text>
          <Text color="gray" dimColor>时间</Text>
        </Box>
        <Box>
          <Text color="gray" dimColor>{'─'.repeat(56)}</Text>
        </Box>
        {batches.map(b => {
          const kind = b.kind ?? 'classify';
          return (
            <Box key={b.id} gap={3}>
              <BatchBadge status={b.status} />
              <Text color={kind === 'osint' ? 'magenta' : 'cyan'}>{kind.padEnd(8)}</Text>
              <Text color="gray" dimColor>{b.id.slice(-12)}</Text>
              <Text color="gray" dimColor>{String(b.post_count ?? b.target_count ?? 0).padStart(5)}</Text>
              <Text color="gray" dimColor>{fmtAge(b.created_at)}</Text>
            </Box>
          );
        })}
      </Box>

      {/* Pending selector */}
      {pendingBatches.length > 0 ? (
        <Box flexDirection="column" gap={0}>
          <Text bold color="cyan">等待中的批次（Enter 检索 · c 取消）</Text>
          <SelectInput
            key={version}
            items={pendingBatches.map(b => ({
              label: `[${b.kind ?? 'classify'}] ${b.id.slice(-12)}  ${b.post_count ?? b.target_count ?? 0} 条  ${fmtAge(b.created_at)}`,
              value: b.id,
            }))}
            onSelect={handleSelect}
            onHighlight={(item) => setHighlightedId(item?.value ?? null)}
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

      {/* Cancel confirmation */}
      {confirming && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="yellow"
          paddingX={2}
        >
          <Text bold color="yellow">
            {SYM.warn} 确认取消批次 [{confirming.kind ?? 'classify'}] {confirming.id.slice(-12)}？
          </Text>
          <Text color="gray" dimColor>
            y = 远程取消 + 标记本地为 cancelled；d = 仅删除本地记录；n / ESC = 放弃
          </Text>
          {busy && <Text color="gray" dimColor>正在调用 API...</Text>}
        </Box>
      )}

      {/* Feedback line */}
      {feedback && !confirming && (
        <Box paddingX={1}>
          <Text color="gray">{feedback}</Text>
        </Box>
      )}

      <KeyBar hints={
        confirming
          ? [{ key: 'y', label: '取消批次' }, { key: 'd', label: '仅删除本地' }, { key: 'n/ESC', label: '放弃' }]
          : [{ key: 'Enter', label: '检索' }, { key: 'c', label: '取消批次' }, { key: 'ESC', label: '返回' }]
      } />
    </Box>
  );
}
