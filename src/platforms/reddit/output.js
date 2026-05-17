/**
 * reddit-output.js — Terminal table, stats, JSON and CSV for Reddit items
 */

import { formatNumber } from '../../shared/format.js';

// ── Terminal table ────────────────────────────────────────────────────────────

export function printRedditTable(items) {
  if (!items.length) { console.log('No items found.'); return; }

  const hasPosts    = items.some(i => i.type === 'post');
  const hasComments = items.some(i => i.type === 'comment');

  if (hasPosts && !hasComments) return printPostTable(items);
  if (!hasPosts && hasComments) return printCommentTable(items);
  printMixedTable(items);
}

function printPostTable(posts) {
  const cols = { '#': 4, 'Date': 12, 'Sub': 16, 'Title': 48, 'Score': 7, 'Cmts': 7 };
  printTable(cols, posts, p => [
    String(posts.indexOf(p) + 1).padEnd(cols['#']),
    (p.created_at ? new Date(p.created_at).toISOString().slice(0, 10) : '—').padEnd(cols.Date),
    p.subreddit.slice(0, cols.Sub - 1).padEnd(cols.Sub),
    p.title.replace(/\n/g, ' ').slice(0, cols.Title - 1).padEnd(cols.Title),
    formatNumber(p.metrics.score).padEnd(cols.Score),
    formatNumber(p.metrics.comments).padEnd(cols.Cmts),
  ]);
  console.log(`Total: ${posts.length} posts\n`);
}

function printCommentTable(comments) {
  const cols = { '#': 4, 'Date': 12, 'Sub': 16, 'Text': 54, 'Score': 7 };
  printTable(cols, comments, c => [
    String(comments.indexOf(c) + 1).padEnd(cols['#']),
    (c.created_at ? new Date(c.created_at).toISOString().slice(0, 10) : '—').padEnd(cols.Date),
    c.subreddit.slice(0, cols.Sub - 1).padEnd(cols.Sub),
    c.text.replace(/\n/g, ' ').slice(0, cols.Text - 1).padEnd(cols.Text),
    formatNumber(c.metrics.score).padEnd(cols.Score),
  ]);
  console.log(`Total: ${comments.length} comments\n`);
}

function printMixedTable(items) {
  const cols = { '#': 4, 'Date': 12, 'Sub': 14, 'Type': 8, 'Text': 48, 'Score': 7 };
  printTable(cols, items, item => [
    String(items.indexOf(item) + 1).padEnd(cols['#']),
    (item.created_at ? new Date(item.created_at).toISOString().slice(0, 10) : '—').padEnd(cols.Date),
    item.subreddit.slice(0, cols.Sub - 1).padEnd(cols.Sub),
    item.type.padEnd(cols.Type),
    (item.title || item.text).replace(/\n/g, ' ').slice(0, cols.Text - 1).padEnd(cols.Text),
    formatNumber(item.metrics.score).padEnd(cols.Score),
  ]);
  console.log(`Total: ${items.length} items\n`);
}

function printTable(cols, rows, rowFn) {
  const hr   = Object.values(cols).map(w => '─'.repeat(w)).join('─┼─');
  const head = Object.entries(cols).map(([k, w]) => k.padEnd(w)).join(' │ ');
  console.log('\n' + '─'.repeat(hr.length));
  console.log(head);
  console.log(hr);
  for (const row of rows) console.log(rowFn(row).join(' │ '));
  console.log('─'.repeat(hr.length));
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export function printRedditStats(items) {
  if (!items.length) return;

  const posts    = items.filter(i => i.type === 'post');
  const comments = items.filter(i => i.type === 'comment');
  const totScore = items.reduce((s, i) => s + (i.metrics.score ?? 0), 0);
  const totCmts  = posts.reduce((s, p) => s + (p.metrics.comments ?? 0), 0);
  const top      = [...items].sort((a, b) => (b.metrics.score ?? 0) - (a.metrics.score ?? 0))[0];

  console.log('Aggregate stats');
  console.log('─'.repeat(44));
  console.log(`  Total items   : ${items.length} (${posts.length} posts, ${comments.length} comments)`);
  console.log(`  Total score   : ${formatNumber(totScore)}`);
  if (posts.length) console.log(`  Total cmts rx : ${formatNumber(totCmts)}`);
  console.log(`  Avg score     : ${formatNumber(Math.round(totScore / items.length))}`);
  if (top) {
    console.log(`\n  Top item (score ${formatNumber(top.metrics.score)}):`);
    console.log(`  ${top.url}`);
    console.log(`  "${(top.title || top.text).slice(0, 120)}"`);
  }
  console.log('');
}

// ── Serialization ─────────────────────────────────────────────────────────────

export function toRedditJSON(items) {
  return JSON.stringify(items, null, 2);
}

const CSV_HEADERS = [
  'id', 'type', 'url', 'title', 'text', 'link_url', 'link_title',
  'subreddit', 'author',
  'score', 'upvote_ratio', 'num_comments', 'awards',
  'flair', 'is_nsfw', 'created_at',
];

export function toRedditCSV(items) {
  const esc = v => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const rows = items.map(i => [
    i.id,
    i.type,
    i.url,
    i.title                ?? '',
    (i.text ?? '').replace(/\n/g, ' '),
    i.link_url             ?? '',
    i.link_title           ?? '',
    i.subreddit,
    i.author?.username     ?? '',
    i.metrics.score        ?? 0,
    i.metrics.ratio        ?? '',
    i.metrics.comments     ?? 0,
    i.metrics.awards       ?? 0,
    i.flair                ?? '',
    i.is_nsfw              ?? false,
    i.created_at,
  ].map(esc).join(','));

  return [CSV_HEADERS.join(','), ...rows].join('\n');
}
