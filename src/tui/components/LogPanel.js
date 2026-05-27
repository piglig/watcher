/**
 * LogPanel — unified bordered log container used by every run screen.
 *
 * Composes:
 *   - bordered gray box with title row "日志 · 最近 N 行"
 *   - LogLine per entry (auto-colored / iconified by content)
 *   - empty-state placeholder + fixed minHeight to prevent UI jitter
 *
 * Props:
 *   logs       — string[] of recent log lines
 *   limit      — soft cap; only the last `limit` entries are shown (default 14)
 *   title      — panel title (default "日志")
 *   emptyText  — placeholder when no logs yet (default "等待事件…")
 *   subtitle   — optional extra text next to title (default "· 最近 N 行")
 */

import React from 'react';
import { Box, Text } from 'ink';
import LogLine from './LogLine.js';

export default function LogPanel({
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
        visible.map((l, i) => <LogLine key={i} line={l} />)
      )}
    </Box>
  );
}
