/**
 * JobsList — unified view of long-running jobs.
 *
 * Shows two kinds:
 *   1. CLASSIFY SESSIONS (sessions.json) — chunked, may span N batches.
 *      Pending: navigates to ClassifyRun for live view.
 *   2. OSINT BATCHES (batch-store, kind='osint') — single-batch.
 *      Pending: navigates to OsintRun for retrieval.
 *
 * Cancel/delete actions act on whichever the user highlights.
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import KeyBar from '../components/KeyBar.js';
import PagedListPicker from '../components/PagedListPicker.js';
import { SYM } from '../theme.js';
import { listBatches, updateBatch, deleteBatch, BATCH_STATUS } from '../../shared/batch-store.js';
import {
  listSessions, updateSession, deleteSession, SESSION_STATE,
} from '../../shared/sessions-store.js';
import { useSessions } from '../hooks/useSession.js';
import { cancelBatch as cancelXaiBatch } from '../../osint/xai-client.js';
import { fetchBatchResults } from '../../osint/index.js';
import { regenerateReports, requestSessionCancel } from '../../classifier/session.js';
import { getConfig } from '../../shared/config-store.js';
import { OpenAI } from 'openai';
import { GoogleGenAI } from '@google/genai';
import { AI_PROVIDERS, apiKeyForProvider, envNameForProvider, inferProvider } from '../../classifier/classifier.js';

function fmtAge(iso) {
  if (!iso) return '—';
  const h = Math.round((Date.now() - new Date(iso)) / 3_600_000);
  if (h < 1)  return '刚刚';
  if (h < 24) return `${h} 小时前`;
  return `${Math.round(h / 24)} 天前`;
}

const STATE_COLORS = {
  submitting: 'cyan',
  pending:    'yellow',
  completed:  'green',
  error:      'red',
  cancelled:  'gray',
};
const STATE_LABEL = {
  submitting: '提交中',
  pending:    '等待中',
  completed:  '已完成',
  error:      '出错',
  cancelled:  '已取消',
};

async function cancelClassifySession(session) {
  const provider = inferProvider(session.model, session.provider);
  if (provider === AI_PROVIDERS.DEEPSEEK) {
    // DeepSeek has no remote batch — `submit` IS the work. requestSessionCancel
    // sets state cancelled and aborts the in-process AbortController so the
    // in-flight chat.completions calls stop and the worker loop bails out.
    requestSessionCancel(session.id);
    return;
  }
  const apiKey = apiKeyForProvider(provider);
  const envName = envNameForProvider(provider);
  if (!apiKey) throw new Error(`${envName} 未设置`);
  const client = provider === 'gemini' ? new GoogleGenAI({ apiKey }) : new OpenAI({ apiKey });
  for (const bid of session.batch_ids) {
    try {
      if (provider === 'gemini') await client.batches.cancel({ name: bid });
      else await client.batches.cancel(bid);
    } catch { /* may already be terminal */ }
  }
  updateSession(session.id, {
    state: SESSION_STATE.CANCELLED,
    error: '用户取消',
  });
}

async function cancelOsintBatch(batch) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error('XAI_API_KEY 未设置');
  await cancelXaiBatch({ apiKey, batchId: batch.id });
  updateBatch(batch.id, { status: 'cancelled', cancelled_at: new Date().toISOString() });
}

export default function JobsList({ onNav }) {
  const sessions = useSessions();
  const allBatches = listBatches();
  const osintBatches = allBatches.filter(b => b.kind === 'osint');

  // Unified row model
  const rows = [
    ...sessions.map(s => ({
      kind:    'session',
      id:      s.id,
      state:   s.state,
      label:   `classify · ${s.id.slice(-12)}`,
      meta:    `${s.completed}/${s.chunks_total || '?'} 批 · ${s.input_files.length} 文件`,
      created: s.created_at,
      raw:     s,
    })),
    ...osintBatches.map(b => ({
      kind:    'osint',
      id:      b.id,
      state:   b.status,
      label:   `osint · ${b.id.slice(-12)}`,
      meta:    `${b.post_count ?? b.target_count ?? 0} 目标`,
      created: b.created_at,
      raw:     b,
    })),
  ].sort((a, b) => new Date(b.created) - new Date(a.created));

  const [confirming, setConfirming] = useState(null);
  const [busy,       setBusy]       = useState(false);
  const [feedback,   setFeedback]   = useState('');
  const [pickerMode, setPickerMode] = useState('nav');

  // Confirmation-modal-only key handler (active while `confirming` is set).
  useInput(async (input, key) => {
    if (!confirming || busy) return;
    if (input === 'y' || input === 'Y') {
      setBusy(true);
      try {
        if (confirming.kind === 'session') await cancelClassifySession(confirming.raw);
        else                                await cancelOsintBatch(confirming.raw);
        setFeedback(`${SYM.check} 已取消 ${confirming.id.slice(-12)}`);
      } catch (e) {
        setFeedback(`${SYM.warn} 取消失败：${e.message ?? e}`);
      } finally {
        setConfirming(null);
        setBusy(false);
      }
      return;
    }
    if (input === 'n' || input === 'N' || key.escape) { setConfirming(null); return; }
    if (input === 'd' || input === 'D') {
      if (confirming.kind === 'session') deleteSession(confirming.id);
      else                                deleteBatch(confirming.id);
      setFeedback(`${SYM.check} 已删除本地记录 ${confirming.id.slice(-12)}`);
      setConfirming(null);
    }
  }, { isActive: !!confirming });

  const handleSelect = (row) => {
    if (!row) return;
    if (row.kind === 'session') {
      onNav('classify-run', { classifyConfig: { sessionId: row.id } });
      return;
    }
    if (row.kind === 'osint' && (row.state === BATCH_STATUS.PENDING || row.state === BATCH_STATUS.COMPLETED)) {
      const saved = getConfig();
      onNav('osint-run', {
        osintConfig: {
          batchId: row.id,
          model:   row.raw.model ?? 'grok-4.3',
          // Prefer the user-facing root captured at submit time; fall back to current
          // global outDir setting so legacy batches (without subject_out_dir) still
          // promote to a sensible location instead of the internal staging path.
          outDir:  row.raw.subject_out_dir ?? saved.outDir ?? './out/',
        },
      });
    }
  };

  const refreshOsintBatch = async (row) => {
    if (busy) return;
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) { setFeedback(`${SYM.warn} XAI_API_KEY 未设置`); return; }
    if (!row.raw.out_dir) { setFeedback(`${SYM.warn} 该批次未记录 staging 目录`); return; }

    setBusy(true);
    setFeedback(`${SYM.run} 正在从 xAI 拉取 ${row.id.slice(-12)} ...`);
    try {
      const res = await fetchBatchResults(row.id, {
        apiKey,
        outDir: row.raw.out_dir,
        wait:   false,
      });
      setFeedback(
        res.status === BATCH_STATUS.COMPLETED
          ? `${SYM.check} ${row.id.slice(-12)} 已完成，Enter 进入查看`
          : `${SYM.dot} ${row.id.slice(-12)} 仍在 ${res.status}：${res.progress ?? ''}`
      );
    } catch (e) {
      setFeedback(`${SYM.warn} 拉取失败：${e.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  const regenerateClassifyReports = async (row) => {
    if (busy) return;
    setBusy(true);
    setFeedback(`${SYM.run} 正在重建 ${row.id.slice(-12)} 的报告 ...`);
    try {
      const { result_files } = await regenerateReports(row.id);
      const fileCount = result_files.reduce((s, k) => s + (k.files?.length ?? 0), 0);
      setFeedback(`${SYM.check} ${row.id.slice(-12)} 重建完成，${result_files.length} 个 KOL · ${fileCount} 个文件，Enter 查看`);
    } catch (e) {
      setFeedback(`${SYM.warn} 重建失败：${e.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  const handlePickerKey = (input, _key, { item }) => {
    if (!item) return;
    if (input === 'c' || input === 'C') {
      if (item.state === SESSION_STATE.PENDING || item.state === SESSION_STATE.SUBMITTING) setConfirming(item);
    }
    if (input === 'r' || input === 'R') {
      if (item.kind === 'osint') refreshOsintBatch(item);
    }
    if (input === 'g' || input === 'G') {
      if (item.kind === 'session' && item.state === SESSION_STATE.COMPLETED) regenerateClassifyReports(item);
    }
  };

  const renderRow = (r, { selected }) => (
    <Box>
      <Text color={selected ? 'cyan' : 'gray'} bold={selected}>{selected ? SYM.cursor : ' '} </Text>
      <Text color={STATE_COLORS[r.state] ?? 'gray'}>
        {(STATE_LABEL[r.state] ?? r.state).padEnd(5)}
      </Text>
      <Text color={r.kind === 'session' ? 'cyan' : 'magenta'}>{'  '}{r.label.padEnd(26)}</Text>
      <Text color="gray" dimColor>{r.meta.padEnd(20)}</Text>
      <Text color="gray" dimColor>{'  '}{fmtAge(r.created)}</Text>
    </Box>
  );

  // Reserve: title (1) + counter (1) + KeyBar (1) + outer paddingY*2 (2) + confirming/feedback slack (3)
  const reserved = 8 + (confirming ? 3 : 0) + (feedback && !confirming ? 1 : 0);

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
      <Box>
        <Text bold color="cyan">分类任务列表 </Text>
        <Text color="gray" dimColor>
          ({rows.length} 条 · {pickerMode === 'search' ? '搜索中' : 'Enter 查看 · / 搜索 · c 取消等待中任务'})
        </Text>
      </Box>

      <PagedListPicker
        items={rows}
        getKey={(r) => r.id}
        getSearchText={(r) => `${r.label} ${r.meta} ${r.state} ${STATE_LABEL[r.state] ?? ''} ${r.id}`}
        renderItem={renderRow}
        onSelect={handleSelect}
        onCancel={() => onNav('menu')}
        onKey={handlePickerKey}
        onModeChange={setPickerMode}
        emptyText="暂无任务。先采集内容或新建 KOL 调查。"
        reservedLines={reserved}
        isActive={!confirming}
      />

      {confirming && (
        <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={2}>
          <Text bold color="yellow">{SYM.warn} 取消 {confirming.label}？</Text>
          <Text color="gray" dimColor>y = 远程 + 本地取消；d = 仅删本地记录；n / ESC = 放弃</Text>
        </Box>
      )}
      {feedback && !confirming && <Text color="gray">{feedback}</Text>}

      <KeyBar hints={
        confirming
          ? [{ key: 'y', label: '取消' }, { key: 'd', label: '仅删本地' }, { key: 'n/ESC', label: '放弃' }]
          : pickerMode === 'search'
            ? [{ key: 'Enter', label: '选中' }, { key: 'ESC', label: '退出搜索' }]
            : [
                { key: 'Enter',     label: '查看' },
                { key: '/',         label: '搜索' },
                { key: 'PgUp/PgDn', label: '翻页' },
                { key: 'r',         label: '主动下载 (OSINT)' },
                { key: 'g',         label: '重建报告 (Classify)' },
                { key: 'c',         label: '取消' },
                { key: 'ESC',       label: '返回' },
              ]
      } />
    </Box>
  );
}
