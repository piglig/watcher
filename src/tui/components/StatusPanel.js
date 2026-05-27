import React from 'react';
import { Box, Text } from 'ink';
import { SYM } from '../theme.js';
import { fmtElapsed } from '../hooks/useElapsed.js';

/**
 * Colored status block used across *Run screens.
 *
 * Renders a rounded border in `color`, a bold {icon} {label} header, an
 * optional elapsed timer to the right, and an optional error/info line below.
 *
 * @param {object} p
 * @param {string} p.color       Ink color name (cyan/green/red/yellow/...).
 * @param {string} [p.icon]      Glyph; defaults based on color (run/check/cross/dot).
 * @param {string} p.label       Header text.
 * @param {number} [p.elapsed]   Seconds; renders dim mm:ss when provided.
 * @param {string} [p.error]     Red error line below.
 * @param {React.ReactNode} [p.children]  Extra rows inside the same panel.
 */
export default function StatusPanel({ color, icon, label, elapsed, error, children }) {
  const glyph = icon ?? defaultIcon(color);
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={2} paddingY={0}>
      <Box gap={2}>
        <Text bold color={color}>{glyph} {label}</Text>
        {Number.isFinite(elapsed) && (
          <Text color="gray" dimColor>{fmtElapsed(elapsed)}</Text>
        )}
      </Box>
      {error && <Text color="red" wrap="truncate">  {error}</Text>}
      {children}
    </Box>
  );
}

function defaultIcon(color) {
  switch (color) {
    case 'green':  return SYM.check;
    case 'red':    return SYM.cross;
    case 'yellow': return SYM.dot;
    default:       return SYM.run;
  }
}
