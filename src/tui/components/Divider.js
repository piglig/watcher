import React from 'react';
import { Box, Text } from 'ink';

export default function Divider({ label = '', width = 50 }) {
  if (!label) {
    return (
      <Box>
        <Text color="gray" dimColor>{'─'.repeat(width)}</Text>
      </Box>
    );
  }
  const side = Math.max(2, Math.floor((width - label.length - 2) / 2));
  return (
    <Box gap={1}>
      <Text color="gray" dimColor>{'─'.repeat(side)}</Text>
      <Text color="gray">{label}</Text>
      <Text color="gray" dimColor>{'─'.repeat(side)}</Text>
    </Box>
  );
}
