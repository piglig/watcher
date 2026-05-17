import React from 'react';
import { Box, Text } from 'ink';
import { SYM } from '../theme.js';

export default function Header({ subtitle = '' }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box gap={2} paddingX={1}>
        <Box gap={1}>
          <Text color="cyan" bold>{SYM.logo}</Text>
          <Text bold>SNS Audit</Text>
          <Text color="gray" dimColor>v2.0.0</Text>
        </Box>
        {subtitle ? (
          <Text color="gray" dimColor>{SYM.dash} {subtitle}</Text>
        ) : (
          <Text color="gray" dimColor>{SYM.dash} 多平台内容风险审查</Text>
        )}
      </Box>
      <Box paddingX={1}>
        <Text color="gray" dimColor>{'─'.repeat(56)}</Text>
      </Box>
    </Box>
  );
}
