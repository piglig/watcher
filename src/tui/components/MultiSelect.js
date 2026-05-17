import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { SYM } from '../theme.js';

/**
 * Multi-select list.
 * - ↑↓ 移动光标
 * - Space 切换选中
 * - Enter 确认（至少选一项）
 */
export default function MultiSelect({ items, onConfirm }) {
  const [cursor,   setCursor]   = useState(0);
  const [selected, setSelected] = useState(new Set());

  useInput((input, key) => {
    if (key.upArrow)   setCursor(c => Math.max(0, c - 1));
    if (key.downArrow) setCursor(c => Math.min(items.length - 1, c + 1));

    if (input === ' ') {
      const val = items[cursor].value;
      setSelected(prev => {
        const next = new Set(prev);
        next.has(val) ? next.delete(val) : next.add(val);
        return next;
      });
    }

    if (key.return && selected.size > 0) {
      // 保持 items 原始顺序
      onConfirm(items.map(i => i.value).filter(v => selected.has(v)));
    }
  });

  return (
    <Box flexDirection="column">
      {items.map((item, i) => {
        const isCursor   = i === cursor;
        const isSelected = selected.has(item.value);
        return (
          <Box key={item.value} gap={1}>
            <Text color={isCursor ? 'cyan' : 'gray'}>
              {isCursor ? SYM.cursor : ' '}
            </Text>
            <Text color={isSelected ? 'cyan' : 'gray'}>
              {isSelected ? '◉' : '○'}
            </Text>
            <Text
              color={isCursor ? 'white' : isSelected ? 'cyan' : 'gray'}
              bold={isCursor}
            >
              {item.label}
            </Text>
          </Box>
        );
      })}
      <Box marginTop={1}>
        <Text color="gray" dimColor>Space 切换选择   Enter 确认（至少选一项）</Text>
      </Box>
    </Box>
  );
}
