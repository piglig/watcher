import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { readdirSync, mkdirSync } from 'fs';
import { join, resolve, dirname, sep } from 'path';
import { SYM } from '../theme.js';

const VISIBLE = 8;

function listDirs(path) {
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter(d => { try { return d.isDirectory(); } catch { return false; } })
      .map(d => d.name)
      .sort((a, b) => a.localeCompare(b, 'zh'));
  } catch { return []; }
}

function isRoot(p) {
  return dirname(p) === p;
}

/**
 * 目录浏览器
 * ↑↓ 移动光标   ← 上级目录   →/Enter 进入子目录 / 执行选中项
 * 在菜单中选"✓ 选择此目录"确认，选"[+] 新建文件夹"后输入名称回车创建
 */
export default function DirPicker({ initial = '.', onConfirm }) {
  const [currentPath, setCurrentPath] = useState(() => resolve(initial || '.'));
  const [cursor,      setCursor]      = useState(0);
  const [creating,    setCreating]    = useState(false);
  const [newName,     setNewName]     = useState('');
  // 用于在创建文件夹后触发目录列表刷新（不改变路径）
  const [revision,    setRevision]    = useState(0);

  const subdirs = listDirs(currentPath); // eslint-disable-line react-hooks/exhaustive-deps
  const atRoot  = isRoot(currentPath);

  // 固定条目在前：确认 → 新建文件夹 → 上级（可选）→ 子目录
  const items = [
    { id: '__confirm', label: `${SYM.check}  选择此目录`,  type: 'confirm'    },
    { id: '__new',     label: `[+] 新建文件夹`,            type: 'new-folder' },
    ...(!atRoot ? [{ id: '__parent', label: `..${sep}  上级目录`, type: 'parent' }] : []),
    ...subdirs.map(name => ({ id: name, label: `${name}${sep}`, type: 'dir', name })),
  ];

  useEffect(() => { setCursor(0); }, [currentPath]);

  useInput((input, key) => {
    if (creating) return; // 新建模式下由 TextInput 接管

    if (key.upArrow)   setCursor(c => Math.max(0, c - 1));
    if (key.downArrow) setCursor(c => Math.min(items.length - 1, c + 1));

    // ← 返回上级（快捷键，效果与选中".."相同）
    if (key.leftArrow && !atRoot) {
      setCurrentPath(dirname(currentPath));
      return;
    }

    if (key.return || key.rightArrow) {
      const item = items[cursor];
      if (!item) return;

      if (item.type === 'confirm') {
        // Drive roots (D:\) already exist and reject mkdir with EPERM on Windows.
        if (!isRoot(currentPath)) {
          try { mkdirSync(currentPath, { recursive: true }); } catch {}
        }
        onConfirm(currentPath);
      } else if (item.type === 'new-folder') {
        setCreating(true);
        setNewName('');
      } else if (item.type === 'parent') {
        setCurrentPath(dirname(currentPath));
      } else if (item.type === 'dir') {
        setCurrentPath(join(currentPath, item.name));
      }
    }
  });

  const handleCreate = () => {
    const name = newName.trim();
    if (name) {
      try {
        mkdirSync(join(currentPath, name), { recursive: true });
        // 留在当前目录，刷新列表使新文件夹出现
        setRevision(r => r + 1);
      } catch {}
    }
    setCreating(false);
    setNewName('');
  };

  // 滚动：保持光标在可视窗口中央
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
          const color     = item.type === 'confirm'    ? 'green'
                          : item.type === 'new-folder' ? 'yellow'
                          : item.type === 'parent'     ? 'gray'
                          : 'white';
          return (
            <Box key={item.id} gap={1}>
              <Text color={isCursor ? 'cyan' : 'gray'}>
                {isCursor ? SYM.cursor : ' '}
              </Text>
              <Text
                color={isCursor ? color : 'gray'}
                bold={isCursor && item.type !== 'parent'}
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

      {/* 新建文件夹输入 */}
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
        <Text color="gray" dimColor>← 上级目录</Text>
        <Text color="gray" dimColor>→/Enter 进入·确认</Text>
      </Box>
    </Box>
  );
}
