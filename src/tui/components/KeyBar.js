import React from 'react';
import { Box, Text } from 'ink';

/**
 * Displays keyboard shortcut hints, Claude Code-style.
 * hints: Array of { key: string, label: string }
 */
export default function KeyBar({ hints }) {
  return (
    <Box gap={3} marginTop={1} paddingX={1}>
      {hints.map(({ key, label }) => (
        <Box key={key} gap={1}>
          <Text backgroundColor="gray" color="black"> {key} </Text>
          <Text color="gray" dimColor>{label}</Text>
        </Box>
      ))}
    </Box>
  );
}
