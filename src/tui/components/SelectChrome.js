/**
 * SelectChrome — default `indicatorComponent` and `itemComponent` for
 * ink-select-input. Six setup/list screens previously inlined identical
 * copies; pass these instead.
 *
 *   <SelectInput items={...} indicatorComponent={Indicator} itemComponent={Item} />
 */

import React from 'react';
import { Box, Text } from 'ink';
import { SYM } from '../theme.js';

export function Indicator({ isSelected }) {
  return (
    <Box marginRight={1}>
      {isSelected ? <Text color="cyan" bold>{SYM.cursor}</Text> : <Text> </Text>}
    </Box>
  );
}

export function Item({ label, isSelected }) {
  return <Text color={isSelected ? 'white' : 'gray'}>{label}</Text>;
}
