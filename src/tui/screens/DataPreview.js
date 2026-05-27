import React, { useState, useMemo, useEffect } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import SelectInput from 'ink-select-input';
import KeyBar from '../components/KeyBar.js';
import { Indicator, Item } from '../components/SelectChrome.js';
import { SYM } from '../theme.js';
import { readFileSync } from 'fs';
import { basename } from 'path';
import { walkFiles, DEFAULT_IGNORE } from '../../shared/fs-walk.js';
import { getConfig } from '../../shared/config-store.js';

const PREVIEW_IGNORE = new Set([...DEFAULT_IGNORE, 'classified']);

// ── Data extraction ────────────────────────────────────────────────────────────

function extractRecords(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.posts)) return data.posts;
  return [data];
}

// ── Column detection ───────────────────────────────────────────────────────────

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

// Detail view field ordering: most important fields first
const DETAIL_PRIORITY = [
  'text', 'content', 'body', 'full_text', 'selftext', 'title',
  'author.username', 'username', 'user', 'screen_name', 'name', 'author.name',
  'author.followers', 'followers', 'author.verified', 'verified',
  'created_at', 'date', 'time', 'timestamp', 'created', 'publishedAt',
  'url', 'link', 'permalink',
  'metrics.likes', 'likes', 'metrics.like_count', 'like_count', 'hearts', 'digg_count',
  'metrics.retweets', 'retweet_count', 'metrics.retweet_count',
  'metrics.replies', 'metrics.reply_count', 'reply_count',
  'metrics.views', 'views', 'metrics.quotes', 'quotes', 'metrics.score', 'score',
  'platform', 'source', 'type', 'lang',
];

function prioritizeFields(entries) {
  const order = DETAIL_PRIORITY.map(k => k.toLowerCase());
  const result = [];
  const pool = entries.slice();
  for (const p of order) {
    const i = pool.findIndex(([k]) => k.toLowerCase() === p);
    if (i !== -1) result.push(pool.splice(i, 1)[0]);
  }
  result.push(...pool);
  return result;
}

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
  const parts = col.split('.');
  let val = rec;
  for (const p of parts) {
    if (val == null || typeof val !== 'object') { val = undefined; break; }
    val = val[p];
  }
  if (val == null) return '';
  if (typeof val === 'object') return JSON.stringify(val).slice(0, 40);
  return String(val).replace(/[\n\r\t]/g, ' ');
}

function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '…';
}

function cpWidth(cp) {
  if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) return 0;
  if (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0x303e) ||
    (cp >= 0x3040 && cp <= 0x33ff) ||
    (cp >= 0x3400 && cp <= 0x9fff) ||
    (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7af) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe10 && cp <= 0xfe19) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0x1b000 && cp <= 0x1b0ff) ||
    (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x20000 && cp <= 0x2fffd)
  ) return 2;
  return 1;
}

function truncateByWidth(str, maxCols) {
  let cols = 0, i = 0;
  for (const ch of str) {
    const w = cpWidth(ch.codePointAt(0));
    if (cols + w > maxCols - 1) return str.slice(0, i) + '…';
    cols += w;
    i += ch.length;
  }
  return str;
}

// ── File list helpers ──────────────────────────────────────────────────────────

function scanJsonFilesRecursive(dir) {
  return walkFiles(dir, { match: '.json', ignore: PREVIEW_IGNORE })
    .map(f => ({ label: f.rel, value: f.path }))
    .sort((a, b) => b.label.localeCompare(a.label));
}

// ── Record detail view ─────────────────────────────────────────────────────────
//
// Full-screen view for one record. Shows every field from flattenRecord.
// ↑↓ scrolls fields, ←→ navigates to adjacent records, ESC returns to the table.
// onBack(finalIdx) is called with the index of the record being viewed when exiting.

const KEY_W = 18; // fixed column width for field names in detail view

function RecordDetail({ records, initialIdx, onBack }) {
  const { stdout } = useStdout();
  const termRows = stdout?.rows ?? 30;
  const termCols = stdout?.columns ?? 80;

  const [idx, setIdx]             = useState(initialIdx);
  const [scrollTop, setScrollTop] = useState(0);

  const record = records[idx];

  // All key-value pairs, sanitized and priority-sorted
  const fields = useMemo(() => {
    const flat = flattenRecord(record);
    const entries = Object.entries(flat).map(([k, v]) => [
      k,
      v == null
        ? ''
        : typeof v === 'object'
          ? JSON.stringify(v)
          : String(v).replace(/[\n\r\t]/g, ' '),
    ]);
    return prioritizeFields(entries);
  }, [record]);

  // Layout overhead:
  // paddingY(2) + header(1) + urlbar(1) + [fields] + scrollInfo(1) + KeyBar-marginTop(1) + KeyBar(1)
  // + gaps between 5 children = 4
  // total fixed = 11
  const visibleCount = Math.max(3, termRows - 11);
  const maxScroll    = Math.max(0, fields.length - visibleCount);

  useEffect(() => { setScrollTop(0); }, [idx]);

  useInput((_, key) => {
    if (key.escape)    { onBack(idx); return; }
    if (key.upArrow)   setScrollTop(t => Math.max(0, t - 1));
    if (key.downArrow) setScrollTop(t => Math.min(maxScroll, t + 1));
    if (key.leftArrow  && idx > 0)                  setIdx(i => i - 1);
    if (key.rightArrow && idx < records.length - 1) setIdx(i => i + 1);
  });

  const valCols     = Math.max(10, termCols - KEY_W - 4);
  const visible     = fields.slice(scrollTop, scrollTop + visibleCount);
  const needsScroll = fields.length > visibleCount;

  const flat    = useMemo(() => flattenRecord(record), [record]);
  const nameVal = flat['author.username'] ?? flat['username'] ?? flat['name'] ?? '';
  const urlVal  = flat['url'] ?? flat['link'] ?? flat['permalink'] ?? '';

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>

      {/* Header: nav + author name */}
      <Box gap={2}>
        <Text bold color="cyan">详情</Text>
        <Text color="gray" dimColor>第 {idx + 1} / {records.length} 条</Text>
        {nameVal ? <Text color="white">@{nameVal}</Text> : null}
        <Text color="gray" dimColor>←→切换  ESC返回</Text>
      </Box>

      {/* Pinned URL bar */}
      <Box gap={1}>
        <Text color="gray" dimColor>{'url'.padEnd(KEY_W)}</Text>
        <Text color="cyan">{urlVal ? truncateByWidth(urlVal, valCols) : '—'}</Text>
      </Box>

      {/* Priority-sorted field list */}
      <Box flexDirection="column">
        {visible.map(([k, v]) => (
          <Box key={k} gap={1}>
            <Text color="gray" dimColor>{truncate(k, KEY_W).padEnd(KEY_W)}</Text>
            <Text color="white" wrap="truncate">{truncateByWidth(v, valCols)}</Text>
          </Box>
        ))}
      </Box>

      {/* Scroll indicator */}
      <Text color="gray" dimColor>
        {needsScroll
          ? `${scrollTop + 1}–${Math.min(scrollTop + visibleCount, fields.length)} / ${fields.length} 个字段   ↑↓ 滚动`
          : `共 ${fields.length} 个字段`}
      </Text>

      <KeyBar hints={[
        { key: '↑↓', label: '滚动字段' },
        { key: '←→', label: '切换记录' },
        { key: 'ESC', label: '返回列表' },
      ]} />
    </Box>
  );
}

// ── Table view ─────────────────────────────────────────────────────────────────

const COL_WIDTH = 22;

function TableView({ records, filePath, onBack }) {
  const [rowIdx,     setRowIdx]     = useState(0);
  const [page,       setPage]       = useState(0);
  const [detailIdx,  setDetailIdx]  = useState(null); // null = table mode

  const { stdout } = useStdout();
  const termRows = stdout?.rows ?? 30;
  const termCols = stdout?.columns ?? 80;

  const columns = useMemo(() => detectColumns(records), [records]);

  // Layout overhead without detail panel:
  // paddingY(2) + title(1) + gap(1) + headers(1) + gap(1) + [rows] + gap(1) + page(1)
  // + gap(1) + KeyBar-marginTop(1) + KeyBar(1) = rows + 11
  const pageSize   = Math.min(10, Math.max(3, termRows - 11));
  const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
  const safePage   = Math.min(page, totalPages - 1);
  const pageRows   = records.slice(safePage * pageSize, (safePage + 1) * pageSize);

  useEffect(() => { setRowIdx(0); }, [safePage]);

  useInput((_, key) => {
    if (key.escape) { onBack(); return; }
    if (key.upArrow)   setRowIdx(i => Math.max(0, i - 1));
    if (key.downArrow) setRowIdx(i => Math.min(pageRows.length - 1, i + 1));
    if (key.leftArrow  && safePage > 0)              setPage(p => p - 1);
    if (key.rightArrow && safePage < totalPages - 1) setPage(p => p + 1);
    if (key.return) {
      const globalIdx = safePage * pageSize + rowIdx;
      setDetailIdx(globalIdx);
    }
  });

  // When returning from detail, sync table position to where user left off
  function handleDetailBack(finalIdx) {
    const targetPage   = Math.floor(finalIdx / pageSize);
    const targetRowIdx = finalIdx % pageSize;
    setPage(targetPage);
    setRowIdx(targetRowIdx);
    setDetailIdx(null);
  }

  if (detailIdx !== null) {
    return (
      <RecordDetail
        records={records}
        initialIdx={detailIdx}
        onBack={handleDetailBack}
      />
    );
  }

  // Pre-compute truncation width for table cells
  // paddingX(4) + num-col(5) + 6 cells × COL_WIDTH + 6 gaps(1) ≈ terminal width; cells truncated by COL_WIDTH anyway
  const tableValCols = Math.max(10, termCols - KEY_W - 6);

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
      {/* Title */}
      <Box gap={2}>
        <Text bold color="cyan">数据预览</Text>
        <Text color="gray" dimColor>{basename(filePath)}</Text>
        <Text color="gray" dimColor>共 {records.length} 条</Text>
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

      {/* Data rows */}
      <Box flexDirection="column">
        {pageRows.map((rec, i) => {
          const globalN  = safePage * pageSize + i + 1;
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

      {/* Page indicator */}
      <Box gap={2}>
        <Text color="gray" dimColor>
          第 {safePage + 1} / {totalPages} 页
        </Text>
      </Box>

      <KeyBar hints={[
        { key: '↑↓',   label: '选择行' },
        { key: '←→',   label: '翻页' },
        { key: 'Enter', label: '查看详情' },
        { key: 'ESC',   label: '返回' },
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

  useEffect(() => {
    if (!selectedFile) return;
    try {
      const raw  = readFileSync(selectedFile, 'utf-8');
      const data = JSON.parse(raw);
      setRecords(extractRecords(data));
      setLoadError('');
    } catch (e) {
      setLoadError(e.message);
      setRecords(null);
    }
  }, [selectedFile]);

  if (selectedFile && records) {
    return (
      <TableView
        records={records}
        filePath={selectedFile}
        onBack={() => { setSelectedFile(null); setRecords(null); }}
      />
    );
  }

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
      <Text bold color="cyan">预览采集数据</Text>

      {loadError && (
        <Text color="red">{SYM.cross} 加载失败：{loadError}</Text>
      )}

      {fileItems.length === 0 ? (
        <Box borderStyle="round" borderColor="gray" borderDimColor paddingX={2}>
          <Text color="gray" dimColor>{scanDir} 中暂无 .json 文件</Text>
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
