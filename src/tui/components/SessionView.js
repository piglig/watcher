/**
 * SessionView — pure render of a classify session.
 *
 * Watches a session record (passed in via the parent's useSession hook) and
 * renders status / progress / logs / completion summary. No I/O, no polling.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { SYM, RISK_COLORS, RISK_LABELS } from '../theme.js';
import LogPanel from './LogPanel.js';
import PagedListPicker from './PagedListPicker.js';
import { SESSION_STATE } from '../../shared/sessions-store.js';

const LOG_LIMIT = 14;

// Wrap a path in OSC 8 hyperlink escape so modern terminals (Windows Terminal,
// iTerm2, VS Code) render it as clickable. Falls back to plain text elsewhere.
function fileUrl(path) {
  const normalized = String(path).replace(/\\/g, '/');
  return /^[a-zA-Z]:/.test(normalized) ? `file:///${normalized}` : `file://${normalized}`;
}
function hyperlink(path, text) {
  const ESC = '';
  const BEL = '';
  return `${ESC}]8;;${fileUrl(path)}${BEL}${text}${ESC}]8;;${BEL}`;
}

const STATE_META = {
  [SESSION_STATE.SUBMITTING]: { color: 'cyan',   icon: SYM.run,   label: '准备中' },
  [SESSION_STATE.PENDING]:    { color: 'cyan',   icon: SYM.run,   label: 'AI 分析中' },
  [SESSION_STATE.COMPLETED]:  { color: 'green',  icon: SYM.check, label: '分析完成' },
  [SESSION_STATE.ERROR]:      { color: 'red',    icon: SYM.cross, label: '出错' },
  [SESSION_STATE.CANCELLED]:  { color: 'yellow', icon: SYM.warn,  label: '已取消' },
};

function stateMeta(state) {
  return STATE_META[state] ?? { color: 'gray', icon: '·', label: state ?? '?' };
}

export default function SessionView({ session, scrapeResult, emptyText = '加载中…' }) {
  if (!session) {
    return (
      <Box borderStyle="round" borderColor="gray" borderDimColor paddingX={2}>
        <Text color="gray" dimColor>{emptyText}</Text>
      </Box>
    );
  }

  const meta = stateMeta(session.state);
  const inflight = Number.isFinite(session.inflight_total) && session.inflight_total > 0
    ? `提交中 ${session.inflight_done ?? 0}/${session.inflight_total}`
    : null;
  const progress = inflight
    ?? (session.chunks_total > 0
        ? `${session.completed}/${session.chunks_total} 批已完成 · 已提交 ${session.batch_ids.length}/${session.chunks_total}`
        : '等待 daemon…');
  const currentBatch = session.batch_ids.at(-1);

  return (
    <Box flexDirection="column" gap={1}>
      {/* Status panel */}
      <Box flexDirection="column" borderStyle="round" borderColor={meta.color} paddingX={2} paddingY={0}>
        <Box gap={3}>
          <Text bold color={meta.color}>{meta.icon} {meta.label}</Text>
          <Text color="gray" dimColor>{progress}</Text>
          {currentBatch && session.state !== SESSION_STATE.COMPLETED && (
            <Text color="gray" dimColor>当前 · {currentBatch.slice(0, 16)}…</Text>
          )}
        </Box>
        <Box gap={3}>
          <Text color="gray" dimColor>session {session.id}</Text>
          <Text color="gray" dimColor>model {session.model}</Text>
          {scrapeResult && (
            <Text color="gray" dimColor>采集 {scrapeResult.totalCount} 条 · {scrapeResult.savedFiles?.length ?? 0} 文件</Text>
          )}
        </Box>
      </Box>

      {/* Logs panel (recent activity from session.logs) */}
      {session.state !== SESSION_STATE.COMPLETED && (
        <LogPanel
          logs={session.logs}
          limit={LOG_LIMIT}
          subtitle="· daemon 推进"
          emptyText="等待 daemon 首次推进（最长 30s）…"
        />
      )}

      {/* Error box */}
      {session.state === SESSION_STATE.ERROR && session.error && (
        <Box borderStyle="round" borderColor="red" paddingX={2}>
          <Text color="red">{SYM.cross} {session.error}</Text>
        </Box>
      )}

      {/* Completion summary — sorted, paginated KOL list */}
      {session.state === SESSION_STATE.COMPLETED && (
        <CompletionSummary session={session} />
      )}
    </Box>
  );
}

// ── Completion summary ──────────────────────────────────────────────────────
// Sorted (by risk level, then score), paginated KOL list. Each row's name is
// an OSC-8 hyperlink to that KOL's 风险审查报告. session.result_files is
// already sorted upstream; we re-sort defensively in case the schema drifts.

const RISK_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

// Pick the comprehensive 风险审查报告 from k.files (the primary clickable
// target); fall back to whatever's first if labels change.
function primaryReportFile(k) {
  const files = k.files ?? [];
  return files.find(f => f.label === '风险审查报告')?.file
      ?? files[0]?.file
      ?? null;
}

function CompletionSummary({ session }) {
  const sorted = [...(session.result_files ?? [])].sort((a, b) =>
    (RISK_ORDER[a.risk_level] ?? 9) - (RISK_ORDER[b.risk_level] ?? 9)
    || (b.risk_score ?? 0) - (a.risk_score ?? 0)
  );
  const total = sorted.length;
  const flaggedTotal = session.summary?.flagged_total ?? 0;
  const totalPosts   = session.summary?.total_posts ?? 0;

  // Counts by level — quick at-a-glance risk distribution.
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const k of sorted) counts[k.risk_level] = (counts[k.risk_level] ?? 0) + 1;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={2} paddingY={0} gap={0}>
      <Box gap={3}>
        <Text bold color="green">{SYM.check} 分析完成</Text>
        <Text color="gray" dimColor>
          {total} KOL · {totalPosts} 帖子 · {flaggedTotal} 标记
        </Text>
        <Box gap={2}>
          {counts.critical > 0 && <Text color={RISK_COLORS.critical}>{RISK_LABELS.critical} {counts.critical}</Text>}
          {counts.high     > 0 && <Text color={RISK_COLORS.high}>{RISK_LABELS.high} {counts.high}</Text>}
          {counts.medium   > 0 && <Text color={RISK_COLORS.medium}>{RISK_LABELS.medium} {counts.medium}</Text>}
          {counts.low      > 0 && <Text color={RISK_COLORS.low}>{RISK_LABELS.low} {counts.low}</Text>}
        </Box>
      </Box>

      {total > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray" dimColor>
            风险等级排序 · ↑↓ 移动 · PgUp/PgDn 翻页 · / 搜索 · 点击账号名打开报告
          </Text>
          <PagedListPicker
            items={sorted}
            getKey={(it) => it.slug}
            getSearchText={(it) => `${it.name ?? ''} ${it.slug ?? ''}`}
            renderItem={(it, { selected }) => {
              const reportFile = primaryReportFile(it);
              const namePart = reportFile ? hyperlink(reportFile, it.name) : it.name;
              return (
                <Box gap={2}>
                  <Text color={RISK_COLORS[it.risk_level] ?? 'gray'}>
                    {selected ? SYM.cursor : SYM.dot}
                  </Text>
                  <Text color={RISK_COLORS[it.risk_level] ?? 'gray'} bold>
                    {(RISK_LABELS[it.risk_level] ?? '—').padEnd(4, ' ')}
                  </Text>
                  <Text color="white" bold={selected} wrap="truncate-end">
                    {namePart}
                  </Text>
                  <Text color="gray" dimColor>
                    {it.risk_score ?? 0} 分 · {it.flagged_count ?? 0} 标记 · {it.account_count ?? 0} 账号
                  </Text>
                </Box>
              );
            }}
            onSelect={(it) => {
              // Re-emit the hyperlink to nudge terminals that don't capture
              // mouse clicks but do honor OSC 8 on echoed text. Best-effort —
              // primary UX is direct click on the row's hyperlinked name.
              const f = primaryReportFile(it);
              if (f) process.stdout.write(`\n${hyperlink(f, '→ ' + it.name)}\n`);
            }}
            // ESC handler is required by the picker but we don't want to lose
            // the completion view on a stray ESC — make it a no-op.
            onCancel={() => {}}
            emptyText="无 KOL 报告"
            reservedLines={12}
          />
        </Box>
      ) : (
        <Text color="gray" dimColor>无 KOL 报告</Text>
      )}
    </Box>
  );
}
