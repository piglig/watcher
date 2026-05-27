import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { statSync } from 'fs';
import { basename, isAbsolute } from 'path';
import { walkFiles } from '../../shared/fs-walk.js';
import { SYM } from '../theme.js';

export const scanCsvFiles = (dir) => walkFiles(dir, { match: '.csv' });

function unquote(s) {
  return s.replace(/^\s*["']|["']\s*$/g, '').trim();
}

function detectDroppedCsv(value) {
  const v = unquote(value);
  if (!v || !/[\\/]/.test(v) || !isAbsolute(v)) return null;
  if (!v.toLowerCase().endsWith('.csv')) return null;
  try { if (statSync(v).isFile()) return v; } catch {}
  return null;
}

function filterFiles(files, query) {
  if (!query) return files.slice(0, 15);
  const q = query.toLowerCase();
  const scored = [];
  for (const f of files) {
    const base = f.base.toLowerCase();
    const rel  = f.rel.toLowerCase();
    let score = -1;
    if (base.startsWith(q))    score = 0;
    else if (base.includes(q)) score = 1;
    else if (rel.includes(q))  score = 2;
    if (score >= 0) scored.push({ f, score });
  }
  scored.sort((a, b) => a.score - b.score || a.f.rel.localeCompare(b.f.rel));
  return scored.slice(0, 15).map(s => s.f);
}

/**
 * CsvFilePicker — Claude-Code-style @ file picker for .csv files.
 *
 *   root      filesystem root to scan (default: process.cwd())
 *   onPick    (fullPath: string) => void
 *   error     optional error string to render under the picker
 */
export default function CsvFilePicker({ root, onPick, error }) {
  const scanRoot = root || process.cwd();
  const files    = useMemo(() => scanCsvFiles(scanRoot), [scanRoot]);

  const [query,    setQuery]    = useState('');
  const [cursor,   setCursor]   = useState(0);
  const [attached, setAttached] = useState(null);

  const filtered = useMemo(() => filterFiles(files, query), [files, query]);

  const submit = () => {
    if (attached) { onPick(attached); return; }
    const pick = filtered[cursor];
    if (pick) onPick(pick.path);
  };

  useInput((_, key) => {
    if (attached) {
      if (key.backspace || key.delete) setAttached(null);
      else if (key.return)             submit();
      return;
    }
    if (key.upArrow)   setCursor(c => Math.max(0, c - 1));
    if (key.downArrow) setCursor(c => Math.min(Math.max(0, filtered.length - 1), c + 1));
  });

  const onChange = (value) => {
    const dropped = detectDroppedCsv(value);
    if (dropped) { setAttached(dropped); setQuery(''); return; }
    setQuery(value);
    setCursor(0);
  };

  return (
    <Box flexDirection="column" gap={1}>
      <Text color="gray" dimColor>
        扫描根目录：{scanRoot}（共 {files.length} 个 .csv） · 直接输入搜索，或把文件拖入窗口
      </Text>

      {attached ? (
        <Box flexDirection="column">
          <Box>
            <Text color="magenta" bold>@{basename(attached)} </Text>
            <Text color="gray" dimColor>{attached}</Text>
          </Box>
          <Text color="gray" dimColor>Backspace 清除 · Enter 解析并提交</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          <Box>
            <Text color="cyan">{SYM.cursor} </Text>
            <TextInput
              value={query}
              onChange={onChange}
              onSubmit={submit}
              placeholder="输入文件名搜索，或拖入 .csv 文件…"
              focus
            />
          </Box>
          <Box flexDirection="column" marginTop={1}>
            {filtered.length === 0 ? (
              <Text color="gray" dimColor>
                {files.length === 0 ? '未找到 .csv 文件' : '无匹配项'}
              </Text>
            ) : (
              <>
                <Text color="gray" dimColor>↑↓ 选择 · Enter 确认（共 {filtered.length} 项）</Text>
                {filtered.map((f, i) => {
                  const sel = i === cursor;
                  return (
                    <Box key={f.path}>
                      <Text color={sel ? 'cyan' : 'gray'} bold={sel}>
                        {sel ? SYM.cursor : ' '} {f.base}
                      </Text>
                      <Text color="gray" dimColor>  {f.rel}</Text>
                    </Box>
                  );
                })}
              </>
            )}
          </Box>
        </Box>
      )}

      {error && <Text color="red">{SYM.cross} {error}</Text>}
    </Box>
  );
}
