import React from 'react';
import { Box, Text } from 'ink';
import { SYM } from '../theme.js';

/**
 * Horizontal step progress bar.
 * steps: string[]  — short labels (keep ≤4 chars for 80-col terminals)
 * current: number  — 0-based active step index
 */
export default function StepBar({ steps, current }) {
  return (
    <Box gap={1} flexWrap="wrap">
      {steps.map((label, i) => {
        const done   = i < current;
        const active = i === current;

        return (
          <Box key={i} gap={1}>
            {/* step icon */}
            {done   && <Text color="green">{SYM.check}</Text>}
            {active && <Text color="cyan"  bold>{SYM.cursor}</Text>}
            {!done && !active && <Text color="gray" dimColor>{i + 1}</Text>}

            {/* step label */}
            <Text
              color={active ? 'cyan' : done ? 'green' : 'gray'}
              bold={active}
              dimColor={!active && !done}
            >
              {label}
            </Text>

            {/* separator */}
            {i < steps.length - 1 && (
              <Text color="gray" dimColor>{SYM.arrow}</Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
