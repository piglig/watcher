/**
 * LogPanel — fixed-window bordered log container.
 *
 * The bounded last-N viewport for every run screen (ScrapeRun / WorkflowRun /
 * PipelineRun) and for SessionView's disk-sourced session.logs. We render in
 * the alternate screen (no scrollback), so streaming logs CANNOT use <Static>
 * (which would re-blit its whole history every fullscreen frame); they pass
 * their append-only entries here and only the last `limit` lines are shown.
 *
 * Accepts either raw strings (parsed inline) or pre-parsed entry records.
 * React.memo'd so it skips re-render when its parent ticks but `logs` is
 * unchanged.
 *
 * Props:
 *   logs       — string[] | entry[] of recent log lines
 *   limit      — soft cap; only the last `limit` entries are shown (default 14)
 *   title      — panel title (default "日志")
 *   emptyText  — placeholder when no logs yet (default "等待事件…")
 *   subtitle   — optional extra text next to title (default "· 最近 N 行")
 */

import React from 'react';
import { Box, Text } from 'ink';
import LogLine from './LogLine.js';
import { parseLogLine } from '../parseLogLine.js';

function LogPanel({
  logs,
  limit     = 14,
  title     = '日志',
  emptyText = '等待事件…',
  subtitle,
}) {
  const visible = (logs ?? []).slice(-limit);
  const sub = subtitle ?? `· 最近 ${limit} 行`;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      borderDimColor
      paddingX={2}
      paddingY={0}
      minHeight={limit + 2}
    >
      <Box gap={1}>
        <Text bold color="cyan">{title}</Text>
        <Text color="gray" dimColor>{sub}</Text>
      </Box>
      {visible.length === 0 ? (
        <Text color="gray" dimColor>  {emptyText}</Text>
      ) : (
        visible.map((l, i) => (
          <LogLine key={i} entry={typeof l === 'string' ? parseLogLine(l) : l} />
        ))
      )}
    </Box>
  );
}

export default React.memo(LogPanel);
