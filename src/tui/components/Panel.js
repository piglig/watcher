import React from 'react';
import { Box, Text } from 'ink';

/**
 * A round-bordered panel with optional title.
 * color: 'gray'(default) | 'cyan'(active) | 'green'(done) | 'red'(error)
 */
export default function Panel({ title, color = 'gray', dimBorder = true, children, paddingX = 2, paddingY = 0 }) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={color}
      borderDimColor={dimBorder}
      paddingX={paddingX}
      paddingY={paddingY}
    >
      {title && (
        <Box marginBottom={paddingY > 0 ? 0 : 1}>
          <Text bold color={color === 'gray' ? 'cyan' : color}>{title}</Text>
        </Box>
      )}
      {children}
    </Box>
  );
}
