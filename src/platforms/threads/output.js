/**
 * threads-output.js — Terminal table, stats, JSON and CSV for Threads posts
 */

import Papa from 'papaparse';
import { formatNumber } from '../../shared/format.js';
import { normalizeToPosts } from '../../shared/post.js';

// ── Terminal table ────────────────────────────────────────────────────────────

export function printThreadsTable(threads) {
  if (!threads.length) { console.log('No threads found.'); return; }

  const cols = {
    '#':       4,
    'Date':    12,
    'Text':    56,
    'Likes':   7,
    'Replies': 8,
    'Type':    8,
  };

  const hr   = Object.values(cols).map(w => '─'.repeat(w)).join('─┼─');
  const head = Object.entries(cols).map(([k, w]) => k.padEnd(w)).join(' │ ');

  console.log('\n' + '─'.repeat(hr.length));
  console.log(head);
  console.log(hr);

  threads.forEach((t, i) => {
    const date    = t.created_at ? new Date(t.created_at).toISOString().slice(0, 10) : '—';
    const snippet = t.text.replace(/\n/g, ' ').slice(0, cols.Text - 1);
    const type    = t.is_repost ? 'Repost' : t.is_reply ? 'Reply' : 'Thread';
    const row     = [
      String(i + 1).padEnd(cols['#']),
      date.padEnd(cols.Date),
      snippet.padEnd(cols.Text),
      formatNumber(t.metrics.likes).padEnd(cols.Likes),
      formatNumber(t.metrics.replies).padEnd(cols.Replies),
      type.padEnd(cols.Type),
    ].join(' │ ');
    console.log(row);
  });

  console.log('─'.repeat(hr.length));
  console.log(`Total: ${threads.length} threads\n`);
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export function printThreadsStats(threads) {
  if (!threads.length) return;

  const originals = threads.filter(t => !t.is_repost && !t.is_reply);
  const reposts   = threads.filter(t => t.is_repost);
  const replies   = threads.filter(t => t.is_reply);

  const totLikes   = threads.reduce((s, t) => s + t.metrics.likes,   0);
  const totReplies = threads.reduce((s, t) => s + t.metrics.replies, 0);
  const totReposts = threads.reduce((s, t) => s + t.metrics.reposts, 0);
  const top        = [...threads].sort((a, b) => b.metrics.likes - a.metrics.likes)[0];

  console.log('Aggregate stats');
  console.log('─'.repeat(44));
  console.log(`  Total threads  : ${threads.length} (${originals.length} original, ${reposts.length} repost, ${replies.length} reply)`);
  console.log(`  Total likes    : ${formatNumber(totLikes)}`);
  console.log(`  Total replies  : ${formatNumber(totReplies)}`);
  console.log(`  Total reposts  : ${formatNumber(totReposts)}`);
  console.log(`  Avg likes      : ${formatNumber(Math.round(totLikes / threads.length))}`);
  if (top) {
    console.log(`\n  Top thread (${formatNumber(top.metrics.likes)} likes):`);
    console.log(`  ${top.url}`);
    console.log(`  "${top.text.slice(0, 120)}"`);
  }
  console.log('');
}

// ── Serialization ─────────────────────────────────────────────────────────────

export function toThreadsJSON(threads) {
  return JSON.stringify({ posts: normalizeToPosts(threads) }, null, 2);
}

const CSV_HEADERS = [
  'id', 'url', 'text', 'created_at',
  'author_username', 'author_name', 'author_followers', 'author_verified',
  'likes', 'replies', 'reposts', 'views',
  'is_reply', 'is_repost',
  'media_count', 'media_urls',
];

export function toThreadsCSV(threads) {
  const data = threads.map(t => [
    t.id,
    t.url,
    t.text.replace(/\n/g, ' '),
    t.created_at,
    t.author?.username  ?? '',
    t.author?.name      ?? '',
    t.author?.followers ?? 0,
    t.author?.verified  ?? false,
    t.metrics.likes,
    t.metrics.replies,
    t.metrics.reposts,
    t.metrics.views,
    t.is_reply,
    t.is_repost,
    t.media?.length ?? 0,
    (t.media ?? []).map(m => m.url).join(' | '),
  ]);
  return Papa.unparse({ fields: CSV_HEADERS, data }, { newline: '\n' });
}
