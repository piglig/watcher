import React, { useState, useMemo, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { SYM } from '../theme.js';

/**
 * PagedListPicker — windowed list with two modes (single- or multi-select).
 *
 *   nav    : ↑↓ / PgUp / PgDn move cursor; Enter selects (multi: confirms picks);
 *            Tab toggles current pick in multi mode; ESC → onCancel;
 *            "/" enters search; unknown keys forwarded to `onKey`.
 *   search : TextInput focused at the top; typing filters live; Tab still toggles
 *            (the textbox doesn't capture Tab); Enter selects/confirms;
 *            ESC clears the query and returns to nav mode.
 *
 *   Props:
 *     items           array of arbitrary objects
 *     getKey(item)    stable React key (default: item.id)
 *     getSearchText   (item) => string used for substring filter (default: item.label ?? '')
 *     renderItem      (item, { selected, picked }) => element; falls back to plain label
 *     onSelect        (item) => void              — single mode only, fired on Enter
 *     onConfirm       (items[]) => void           — multi mode, fired on Enter
 *     onCancel        () => void                  — ESC in nav mode
 *     onKey           (input, key, { item }) => void — nav mode, after built-in keys
 *     onModeChange    (mode) => void              — parent can rewrite its KeyBar
 *     multi           boolean — enable multi-select (default false)
 *     emptyText       shown when items is empty
 *     reservedLines   lines used outside the list (default 8)
 *     isActive        gate for useInput / TextInput focus (default true)
 */
export default function PagedListPicker({
  items,
  getKey        = (it) => it.id,
  getSearchText,
  renderItem,
  onSelect,
  onConfirm,
  onCancel,
  onKey,
  onModeChange,
  multi         = false,
  emptyText     = '无数据',
  reservedLines = 8,
  isActive      = true,
}) {
  const { rows } = useWindowSize();

  const [mode,   setMode]   = useState('nav');     // 'nav' | 'search'
  const [query,  setQuery]  = useState('');
  const [cursor, setCursor] = useState(0);
  const [offset, setOffset] = useState(0);
  const [picked, setPicked] = useState(() => new Set()); // keys; multi mode only

  const togglePick = (item) => {
    if (!item) return;
    const k = getKey(item);
    setPicked(prev => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  };

  const confirmMulti = () => {
    const ordered = items.filter(it => picked.has(getKey(it)));
    const current = filtered[cursor];
    // If user pressed Enter without explicit picks, treat the highlighted row as a quick single-pick.
    if (ordered.length === 0 && current) onConfirm?.([current]);
    else                                  onConfirm?.(ordered);
  };

  const filtered = useMemo(() => {
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter(it => {
      const text = getSearchText ? getSearchText(it) : (it.label ?? '');
      return String(text).toLowerCase().includes(q);
    });
  }, [items, query, getSearchText]);

  const limit = Math.max(3, rows - reservedLines);

  useEffect(() => {
    setCursor(c => Math.min(c, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  useEffect(() => {
    if (cursor < offset)             setOffset(cursor);
    else if (cursor >= offset + limit) setOffset(cursor - limit + 1);
  }, [cursor, limit, offset]);

  const switchMode = (m) => { setMode(m); onModeChange?.(m); };

  useInput((input, key) => {
    if (mode === 'search') {
      if (key.escape) { setQuery(''); setCursor(0); switchMode('nav'); return; }
      // Tab toggles current pick without leaving search.
      if (multi && key.tab) { togglePick(filtered[cursor]); return; }
      // Cursor nav is allowed while typing so user can pick across multiple matches.
      if (key.upArrow)   { setCursor(c => Math.max(0, c - 1)); return; }
      if (key.downArrow) { setCursor(c => Math.min(filtered.length - 1, c + 1)); return; }
      return;
    }
    if (key.escape) { onCancel?.(); return; }
    if (input === '/') { switchMode('search'); return; }

    if (multi && key.tab) { togglePick(filtered[cursor]); return; }

    if (key.return) {
      if (multi)               { confirmMulti(); return; }
      if (filtered[cursor])    { onSelect?.(filtered[cursor]); }
      return;
    }

    if (key.upArrow)   { setCursor(c => Math.max(0, c - 1)); return; }
    if (key.downArrow) { setCursor(c => Math.min(filtered.length - 1, c + 1)); return; }
    if (key.pageUp)    { setCursor(c => Math.max(0, c - limit)); return; }
    if (key.pageDown)  { setCursor(c => Math.min(filtered.length - 1, c + limit)); return; }

    onKey?.(input, key, { item: filtered[cursor] });
  }, { isActive });

  const visible = filtered.slice(offset, offset + limit);
  const showCounter = filtered.length > limit || mode === 'search';

  return (
    <Box flexDirection="column">
      {mode === 'search' && (
        <Box>
          <Text color="cyan">/ </Text>
          <TextInput
            value={query}
            onChange={(v) => { setQuery(v); setCursor(0); }}
            onSubmit={() => { if (filtered[cursor]) onSelect?.(filtered[cursor]); }}
            focus={isActive}
            placeholder="输入关键词过滤…"
          />
        </Box>
      )}

      {filtered.length === 0 ? (
        <Text color="gray" dimColor>{query ? '无匹配项' : emptyText}</Text>
      ) : (
        <Box flexDirection="column">
          {visible.map((it, i) => {
            const absIdx  = offset + i;
            const selected = absIdx === cursor;
            const isPicked = multi && picked.has(getKey(it));
            if (renderItem) {
              return <Box key={getKey(it)}>{renderItem(it, { selected, picked: isPicked })}</Box>;
            }
            return (
              <Box key={getKey(it)}>
                <Text color={selected ? 'cyan' : 'gray'} bold={selected}>
                  {selected ? SYM.cursor : ' '} {multi ? (isPicked ? '◉ ' : '○ ') : ''}{it.label}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}

      {showCounter && filtered.length > 0 && (
        <Text color="gray" dimColor>
          {cursor + 1}/{filtered.length}  ·  显示 {offset + 1}–{Math.min(offset + limit, filtered.length)}
          {mode === 'search' && items.length !== filtered.length
            ? `  ·  已过滤 ${items.length - filtered.length} 项`
            : ''}
          {multi ? `  ·  已选 ${picked.size}` : ''}
        </Text>
      )}
    </Box>
  );
}
