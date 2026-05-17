import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { readdirSync, mkdirSync, statSync } from 'fs';
import { join, resolve, dirname, sep } from 'path';
import { SYM } from '../theme.js';

const VISIBLE = 8; // 最多显示的条目数

function listDirs(path) {
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter(d => {
        try { return d.isDirectory(); } catch { return false; }
      })
      .map(d => d.name)
      .sort((a, b) => a.localeCompare(b, 'zh'));
  } catch { return []; }
}

function isRoot(p) {
  return dirname(p) === p;
}

/**
 * 目录浏览器
 * ↑↓ 移动光标  ← 上级目录  →/Enter 进入子目录  N 新建文件夹
 * 选中"✓ 选择此目录"并按 Enter 调用 onConfirm(absolutePath)
 */
export default function DirPicker({ initial = '.', onConfirm }) {
  const [currentPath, setCurrentPath] = useState(() => resolve(initial || '.'));
  const [cursor,      setCursor]      = useState(0);
  const [creating,    setCreating]    = useState(false);
  const [newName,     setNewName]     = useState('');

  const subdirs = listDirs(currentPath);
  const atRoot  = isRoot(currentPath);

  // 条目列表：确认 + 可选上级 + 所有子目录
  const items = [
    { id: '__confirm', label: `${SYM.check}  选择此目录`, type: 'confirm' },
    ...(!atRoot ? [{ id: '__parent', label: `..${sep}  上级目录`, type: 'parent' }] : []),
    ...subdirs.map(name => ({ id: name, label: `${name}${sep}`, type: 'dir', name })),
  ];

  // 切换目录后重置光标
  useEffect(() => { setCursor(0); }, [currentPath]);

  useInput((input, key) => {
    if (creating) return; // TextInput 接管输入

    if (key.upArrow)   setCursor(c => Math.max(0, c - 1));
    if (key.downArrow) setCursor(c => Math.min(items.length - 1, c + 1));

    if (key.leftArrow && !atRoot) {
      setCurrentPath(dirname(currentPath));
    }

    if (key.rightArrow || key.return) {
      const item = items[cursor];
      if (!item) return;
      if (item.type === 'confirm') {
        mkdirSync(currentPath, { recursive: true }); // 确保目录存在
        onConfirm(currentPath);
      } else if (item.type === 'parent') {
        setCurrentPath(dirname(currentPath));
      } else if (item.type === 'dir') {
        setCurrentPath(join(currentPath, item.name));
      }
    }

    if ((input === 'n' || input === 'N') && !creating) {
      setCreating(true);
      setNewName('');
    }
  });

  const handleCreate = () => {
    const name = newName.trim();
    if (name) {
      try {
        const newDir = join(currentPath, name);
        mkdirSync(newDir, { recursive: true });
        setCurrentPath(newDir); // 创建后自动进入新目录
      } catch {}
    }
    setCreating(false);
    setNewName('');
  };

  // 滚动逻辑：保持光标在可视区中央
  const scrollStart = items.length <= VISIBLE
    ? 0
    : Math.max(0, Math.min(cursor - Math.floor(VISIBLE / 2), items.length - VISIBLE));
  const visibleItems = items.slice(scrollStart, scrollStart + VISIBLE);

  return (
    <Box flexDirection="column" gap={0}>
      {/* 当前路径 */}
      <Text color="cyan" wrap="truncate">{currentPath}</Text>

      {/* 目录列表 */}
      <Box flexDirection="column" marginTop={1}>
        {scrollStart > 0 && (
          <Text color="gray" dimColor>  ↑ {scrollStart} 条在上方</Text>
        )}
        {visibleItems.map((item, localIdx) => {
          const globalIdx = scrollStart + localIdx;
          const isCursor  = globalIdx === cursor;
          const color     = item.type === 'confirm' ? 'green'
                          : item.type === 'parent'  ? 'gray'
                          : 'white';
          return (
            <Box key={item.id} gap={1}>
              <Text color={isCursor ? 'cyan' : 'gray'}>
                {isCursor ? SYM.cursor : ' '}
              </Text>
              <Text
                color={isCursor ? color : 'gray'}
                bold={isCursor && item.type === 'confirm'}
                dimColor={item.type === 'parent' && !isCursor}
              >
                {item.label}
              </Text>
            </Box>
          );
        })}
        {scrollStart + VISIBLE < items.length && (
          <Text color="gray" dimColor>  ↓ {items.length - scrollStart - VISIBLE} 条在下方</Text>
        )}
      </Box>

      {/* 新建文件夹输入框 */}
      {creating && (
        <Box gap={1} marginTop={1}>
          <Text color="yellow">{SYM.cursor}</Text>
          <Text color="yellow">新建文件夹：</Text>
          <TextInput
            value={newName}
            onChange={setNewName}
            onSubmit={handleCreate}
            placeholder="输入名称，Enter 确认"
          />
        </Box>
      )}

      {/* 操作提示 */}
      <Box marginTop={1} gap={2}>
        <Text color="gray" dimColor>↑↓ 移动</Text>
        <Text color="gray" dimColor>← 上级</Text>
        <Text color="gray" dimColor>→/Enter 进入·确认</Text>
        <Text color="gray" dimColor>N 新建文件夹</Text>
      </Box>
    </Box>
  );
}
