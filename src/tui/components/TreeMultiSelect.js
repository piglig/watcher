import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { SYM } from '../theme.js';

/**
 * Hierarchical multi-select with expandable nodes.
 *
 * @param {object[]} nodes  recursive tree:
 *   { id, label, files: string[] (all descendant leaves), children?: Node[] }
 * Leaves have `files: [self]` and no `children`.
 *
 * Keys:
 *   ↑↓     move cursor
 *   →      expand (Enter also expands a collapsed parent)
 *   ←      collapse
 *   Space  toggle selection (cascades to all descendant leaves)
 *   a      select all / clear all
 *   Enter  confirm when no expand action applies (leaf or already-expanded parent)
 *   c      confirm regardless of cursor position
 */
export default function TreeMultiSelect({
  nodes,
  onConfirm,
  initialSelected,        // Set<fileKey>; defaults to empty
  initialExpanded,        // Set<nodeId>;  defaults to empty
  unitLabel = '项',        // shown as "已选 N / M <unitLabel>"
}) {
  const [cursor,   setCursor]   = useState(0);
  const [expanded, setExpanded] = useState(() => new Set(initialExpanded ?? []));
  const [selected, setSelected] = useState(() => new Set(initialSelected ?? []));

  // Flatten visible nodes (depth + node)
  const visible = useMemo(() => flatten(nodes, expanded, 0), [nodes, expanded]);

  const current = visible[cursor];
  const totalFiles = useMemo(() => collectAllFiles(nodes), [nodes]);

  const selectionFor = (node) => {
    const inSel = node.files.filter(f => selected.has(f)).length;
    if (inSel === 0) return 'none';
    if (inSel === node.files.length) return 'all';
    return 'partial';
  };

  useInput((input, key) => {
    if (key.upArrow)   setCursor(c => Math.max(0, c - 1));
    if (key.downArrow) setCursor(c => Math.min(visible.length - 1, c + 1));

    if (!current) return;

    // Right arrow expands. Enter expands a collapsed parent, but falls through
    // to "confirm" once the parent is already expanded.
    const canExpand = current.children?.length && !expanded.has(current.id);
    if (key.rightArrow || (key.return && canExpand)) {
      setExpanded(prev => {
        const next = new Set(prev);
        if (current.children?.length) next.add(current.id);
        return next;
      });
      return;
    }
    if (key.leftArrow) {
      setExpanded(prev => {
        const next = new Set(prev);
        next.delete(current.id);
        return next;
      });
      return;
    }

    if (input === ' ') {
      setSelected(prev => {
        const next = new Set(prev);
        const state = selectionFor(current);
        if (state === 'all') for (const f of current.files) next.delete(f);
        else                  for (const f of current.files) next.add(f);
        return next;
      });
      return;
    }

    if (input === 'a' || input === 'A') {
      setSelected(prev => {
        const next = new Set(prev);
        if (prev.size === totalFiles.length) next.clear();
        else for (const f of totalFiles) next.add(f);
        return next;
      });
      return;
    }

    if ((input === 'c' || input === 'C') && selected.size > 0) {
      onConfirm([...selected]);
      return;
    }
    if (key.return && selected.size > 0) {
      // Reached here only when canExpand was false (leaf or already-expanded parent).
      onConfirm([...selected]);
    }
  });

  return (
    <Box flexDirection="column">
      {visible.length === 0 ? (
        <Text color="gray" dimColor>暂无可选项</Text>
      ) : (
        visible.map((node, i) => {
          const isCursor  = i === cursor;
          const state     = selectionFor(node);
          const mark      = state === 'all' ? '◉' : state === 'partial' ? '◐' : '○';
          const markColor = state === 'none' ? 'gray' : 'cyan';
          const arrow     = node.children?.length
            ? (expanded.has(node.id) ? '▾' : '▸')
            : ' ';
          const indent    = '  '.repeat(node.depth);
          const subInfo   = node.children?.length
            ? ` (${node.files.length} ${unitLabel} / ${node.children.length} 子项)`
            : '';
          return (
            <Box key={node.id}>
              <Text color={isCursor ? 'cyan' : 'gray'}>
                {isCursor ? SYM.cursor : ' '}
              </Text>
              <Text>{' ' + indent + arrow + ' '}</Text>
              <Text color={markColor}>{mark}</Text>
              <Text color={isCursor ? 'white' : 'gray'}>
                {' ' + node.label}
                {subInfo && <Text color="gray" dimColor>{subInfo}</Text>}
              </Text>
            </Box>
          );
        })
      )}
      <Box marginTop={1} flexDirection="column">
        <Text color="gray" dimColor>
          ↑↓ 移动   → 展开 / ← 收起   Space 选/反选   a 全选/清空   Enter 确认
        </Text>
        <Text color="cyan" dimColor>
          已选 {selected.size} / {totalFiles.length} {unitLabel}
        </Text>
      </Box>
    </Box>
  );
}

function flatten(nodes, expanded, depth) {
  const out = [];
  for (const n of nodes) {
    out.push({ ...n, depth });
    if (n.children?.length && expanded.has(n.id)) {
      out.push(...flatten(n.children, expanded, depth + 1));
    }
  }
  return out;
}

function collectAllFiles(nodes) {
  const out = new Set();
  const walk = (ns) => {
    for (const n of ns) {
      for (const f of (n.files ?? [])) out.add(f);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return [...out];
}
