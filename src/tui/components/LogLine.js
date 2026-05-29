/**
 * LogLine — unified, memoized log entry renderer used by every run screen.
 *
 * Accepts a pre-parsed `entry` ({ ts, icon, color, display }) produced by
 * parseLogLine() at append time. A raw `line` string is still accepted as a
 * migration-safe fallback (parsed inline) so callers can switch over piecemeal.
 *
 * Wrapped in React.memo: when a parent re-renders, lines whose `entry` object
 * identity is unchanged skip rendering entirely. Combined with parse-at-append,
 * this removes the per-line-per-render regex storm that drove the jank.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { parseLogLine } from '../parseLogLine.js';

function LogLine({ entry, line }) {
  const { ts, icon, color, display } = entry ?? parseLogLine(line);

  return (
    <Box gap={1}>
      <Text color="gray" dimColor>{ts ? ts.padEnd(8) : '        '}</Text>
      <Text color={color}>{icon}</Text>
      <Text color={color} wrap="truncate">{display}</Text>
    </Box>
  );
}

export default React.memo(LogLine);
