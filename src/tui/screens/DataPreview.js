import React, { useState, useMemo, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import KeyBar from '../components/KeyBar.js';
import { SYM } from '../theme.js';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { resolve, join, relative, basename } from 'path';
import { getConfig } from '../../shared/config-store.js';

const PAGE_SIZE = 10;

// ── Data extraction ────────────────────────────────────────────────────────────

/**
 * Extract the records array from any platform JSON format:
 *  - Twitter/TikTok/YouTube: { profile, tweets/videos }
 *  - Naver: { memberCount, posts }
 *  - Reddit/Threads/Pixiv: direct array
 */
function extractRecords(data) {
  if (Array.isArray(data)) return data;
  // named array fields in order of likelihood
  const arr = data.tweets ?? data.videos ?? data.posts ?? data.items ?? data.results ?? data.artworks;
  if (Array.isArray(arr)) return arr;
  return [data];
}

// ── Column detection ───────────────────────────────────────────────────────────

/**
 * Flatten one level of nested objects into dotted paths so we can surface
 * author.username, metrics.like_count, etc. alongside top-level fields.
 */
function flattenRecord(rec) {
  const flat = {};
  for (const [k, v] of Object.entries(rec)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v)) {
        if (typeof v2 !== 'object') flat[`${k}.${k2}`] = v2;
      }
    } else {
      flat[k] = v;
    }
  }
  return flat;
}

const FIELD_PRIORITY = [
  ['author.username', 'username', 'user', 'screen_name', 'name', 'author.name'],
  ['text', 'content', 'body', 'title', 'full_text', 'selftext'],
  ['created_at', 'date', 'time', 'timestamp', 'created', 'publishedAt'],
  ['platform', 'source', 'type', 'lang'],
  ['metrics.like_count', 'likes', 'retweet_count', 'score', 'hearts', 'digg_count',
   'metrics.retweet_count', 'metrics.reply_count'],
];

function detectColumns(records) {
  if (!records.length) return [];
  const flat = flattenRecord(records[0]);
  const keys = Object.keys(flat);
  const cols = [];
  for (const group of FIELD_PRIORITY) {
    const found = group.find(g => keys.find(k => k.toLowerCase() === g.toLowerCase()));
    if (found) {
      const actual = keys.find(k => k.toLowerCase() === found.toLowerCase());
      if (actual && !cols.includes(actual)) cols.push(actual);
    }
  }
  // Append remaining scalar fields up to 6 total
  for (const k of keys) {
    if (cols.length >= 6) break;
    if (!cols.includes(k)) {
      const sample = flat[k];
      if (sample != null && typeof sample !== 'object') cols.push(k);
    }
  }
  return cols;
}

function cellValue(rec, col) {
  // Support dotted paths like "author.username"
  const parts = col.split('.');
  let val = rec;
  for (const p of parts) {
    if (val == null || typeof val !== 'object') { val = undefined; break; }
    val = val[p];
  }
  if (val == null) return '';
  if (typeof val === 'object') return JSON.stringify(val).slice(0, 40);
  return String(val);
}

function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '…';
}

// ── File list view ─────────────────────────────────────────────────────────────

function Indicator({ isSelected }) {
  return (
    <Box marginRight={1}>
      {isSelected ? <Text color="cyan" bold>{SYM.cursor}</Text> : <Text> </Text>}
    </Box>
  );
}
function Item({ label, isSelected }) {
  return <Text color={isSelected ? 'white' : 'gray'}>{label}</Text>;
}

/** Recursively scan for JSON files, skip classified/ subdir */
function scanJsonFilesRecursive(dir) {
  const results = [];
  try {
    const abs = resolve(dir);
    if (!existsSync(abs)) return [];

    function walk(d) {
      let entries;
      try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (e.isDirectory()) {
          if (e.name !== 'classified') walk(join(d, e.name));
        } else if (e.name.endsWith('.json')) {
          const full = join(d, e.name);
          results.push({ label: relative(abs, full), value: full });
        }
      }
    }
    walk(abs);
  } catch {}
  return results.sort((a, b) => b.label.localeCompare(a.label));
}

// ── Table view ─────────────────────────────────────────────────────────────────

function TableView({ records, filePath, onBack }) {
  const [rowIdx, setRowIdx] = useState(0);
  const [page,   setPage]   = useState(0);

  const columns    = useMemo(() => detectColumns(records), [records]);
  const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
  const pageRows   = records.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalRows  = records.length;

  useEffect(() => {
    setRowIdx(0);
  }, [page]);

  useInput((_, key) => {
    if (key.escape) { onBack(); return; }

    if (key.upArrow)   setRowIdx(i => Math.max(0, i - 1));
    if (key.downArrow) setRowIdx(i => Math.min(pageRows.length - 1, i + 1));
    if (key.leftArrow  && page > 0)              { setPage(p => p - 1); }
    if (key.rightArrow && page < totalPages - 1) { setPage(p => p + 1); }
  });

  const selectedRecord = pageRows[rowIdx];
  const COL_WIDTH = 22;

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
      <Box gap={2}>
        <Text bold color="cyan">数据预览</Text>
        <Text color="gray" dimColor>{basename(filePath)}</Text>
        <Text color="gray" dimColor>共 {totalRows} 条</Text>
      </Box>

      {/* Column headers */}
      <Box gap={1}>
        <Text color="gray" dimColor>{'  #'.padEnd(5)}</Text>
        {columns.map(col => (
          <Text key={col} color="gray" dimColor>
            {truncate(col, COL_WIDTH).padEnd(COL_WIDTH)}
          </Text>
        ))}
      </Box>

      {/* Rows */}
      <Box flexDirection="column">
        {pageRows.map((rec, i) => {
          const globalN = page * PAGE_SIZE + i + 1;
          const isCursor = i === rowIdx;
          return (
            <Box key={i} gap={1}>
              <Text color={isCursor ? 'cyan' : 'gray'}>
                {isCursor ? SYM.cursor : ' '}
                {String(globalN).padEnd(3)}
              </Text>
              {columns.map(col => (
                <Text
                  key={col}
                  color={isCursor ? 'white' : 'gray'}
                  dimColor={!isCursor}
                  wrap="truncate"
                >
                  {truncate(cellValue(rec, col), COL_WIDTH).padEnd(COL_WIDTH)}
                </Text>
              ))}
            </Box>
          );
        })}
      </Box>

      {/* Detail panel for selected row */}
      {selectedRecord && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="cyan"
          paddingX={2}
          paddingY={0}
          marginTop={1}
        >
          <Text bold color="cyan">详情  行 {page * PAGE_SIZE + rowIdx + 1}</Text>
          {columns.map(col => (
            <Box key={col} gap={2}>
              <Text color="gray" dimColor>{col.padEnd(20)}</Text>
              <Text color="white" wrap="truncate">
                {truncate(cellValue(selectedRecord, col), 80)}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Page indicator */}
      <Box gap={2}>
        <Text color="gray" dimColor>
          第 {page + 1} / {totalPages} 页
        </Text>
      </Box>

      <KeyBar hints={[
        { key: '↑↓',   label: '选择行' },
        { key: '←→',   label: '翻页' },
        { key: 'ESC',  label: '返回' },
      ]} />
    </Box>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function DataPreview({ initialFile, onNav }) {
  const [selectedFile, setSelectedFile] = useState(initialFile ?? null);
  const [records,      setRecords]      = useState(null);
  const [loadError,    setLoadError]    = useState('');

  const saved     = getConfig();
  const scanDir   = saved.outDir || './out/';
  const fileItems = useMemo(() => scanJsonFilesRecursive(scanDir), [scanDir]);

  useInput((_, key) => {
    if (key.escape && !selectedFile) onNav('menu');
  });

  // Load file when selected
  useEffect(() => {
    if (!selectedFile) return;
    try {
      const raw  = readFileSync(selectedFile, 'utf-8');
      const data = JSON.parse(raw);
      const arr  = extractRecords(data);
      setRecords(arr);
      setLoadError('');
    } catch (e) {
      setLoadError(e.message);
      setRecords(null);
    }
  }, [selectedFile]);

  // If we have records, show table view
  if (selectedFile && records) {
    return (
      <TableView
        records={records}
        filePath={selectedFile}
        onBack={() => { setSelectedFile(null); setRecords(null); }}
      />
    );
  }

  // File selector
  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
      <Text bold color="cyan">预览采集数据</Text>

      {loadError && (
        <Text color="red">{SYM.cross} 加载失败：{loadError}</Text>
      )}

      {fileItems.length === 0 ? (
        <Box borderStyle="round" borderColor="gray" borderDimColor paddingX={2}>
          <Text color="gray" dimColor>
            {scanDir} 中暂无 .json 文件
          </Text>
        </Box>
      ) : (
        <Box flexDirection="column" gap={1}>
          <Text color="gray" dimColor>选择要预览的文件（共 {fileItems.length} 个）</Text>
          <SelectInput
            items={fileItems}
            onSelect={({ value }) => setSelectedFile(value)}
            indicatorComponent={Indicator}
            itemComponent={Item}
          />
        </Box>
      )}

      <KeyBar hints={[
        { key: 'Enter', label: '预览' },
        { key: 'ESC',   label: '返回菜单' },
      ]} />
    </Box>
  );
}
