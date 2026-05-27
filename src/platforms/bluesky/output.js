/**
 * bluesky-output.js — Terminal table, stats, JSON and CSV for Bluesky posts
 */

import Papa from 'papaparse';
import { formatNumber } from '../../shared/format.js';
import { normalizeToPosts } from '../../shared/post.js';

// ── Terminal table ─────────────────────────────────────────────────────────────

export function printBlueskyTable(posts) {
  if (!posts.length) { console.log('No posts found.'); return; }

  const cols = {
    '#':       4,
    'Date':    12,
    'Text':    46,
    'Likes':   7,
    'Reposts': 8,
    'Type':    7,
    'R18':     3,
  };

  const hr   = Object.values(cols).map(w => '─'.repeat(w)).join('─┼─');
  const head = Object.entries(cols).map(([k, w]) => k.padEnd(w)).join(' │ ');

  console.log('\n' + '─'.repeat(hr.length));
  console.log(head);
  console.log(hr);

  posts.forEach((p, i) => {
    const date    = p.created_at ? new Date(p.created_at).toISOString().slice(0, 10) : '—';
    const snippet = p.text.replace(/\n/g, ' ').slice(0, cols.Text - 1);
    const row     = [
      String(i + 1).padEnd(cols['#']),
      date.padEnd(cols.Date),
      snippet.padEnd(cols.Text),
      formatNumber(p.metrics.likes).padEnd(cols.Likes),
      formatNumber(p.metrics.reposts).padEnd(cols.Reposts),
      (p.type ?? '').padEnd(cols.Type),
      (p.is_r18 ? 'Y' : '').padEnd(cols.R18),
    ].join(' │ ');
    console.log(row);
  });

  console.log('─'.repeat(hr.length));
  console.log(`Total: ${posts.length} posts\n`);
}

// ── Stats ──────────────────────────────────────────────────────────────────────

export function printBlueskyStats(profile, posts) {
  if (!posts.length) return;

  const originals = posts.filter(p => p.type === 'post');
  const reposts   = posts.filter(p => p.type === 'repost');
  const replies   = posts.filter(p => p.type === 'reply');
  const r18       = posts.filter(p => p.is_r18);

  const totLikes   = posts.reduce((s, p) => s + (p.metrics.likes   ?? 0), 0);
  const totReposts = posts.reduce((s, p) => s + (p.metrics.reposts ?? 0), 0);
  const top = [...posts].sort((a, b) => b.metrics.likes - a.metrics.likes)[0];

  if (profile) {
    console.log(`\n  @${profile.handle} — ${profile.name ?? ''}`);
    if (profile.bio)       console.log(`  Bio: ${profile.bio.slice(0, 100)}`);
    if (profile.followers) console.log(`  Followers: ${formatNumber(profile.followers)}`);
  }

  console.log('Aggregate stats');
  console.log('─'.repeat(52));
  console.log(`  Total posts  : ${posts.length} (original: ${originals.length}, reply: ${replies.length}, repost: ${reposts.length})`);
  if (r18.length) console.log(`  R18 posts    : ${r18.length}`);
  console.log(`  Total likes  : ${formatNumber(totLikes)}`);
  console.log(`  Total reposts: ${formatNumber(totReposts)}`);
  console.log(`  Avg likes    : ${formatNumber(Math.round(totLikes / posts.length))}`);
  if (top) {
    console.log(`\n  Top post (${formatNumber(top.metrics.likes)} likes):`);
    console.log(`  ${top.url}`);
    if (top.text) console.log(`  "${top.text.slice(0, 120)}"`);
  }
  console.log('');
}

// ── Serialization ──────────────────────────────────────────────────────────────

export function toBlueskyJSON(profile, posts) {
  return JSON.stringify({ profile, posts: normalizeToPosts(posts) }, null, 2);
}

const CSV_HEADERS = [
  'id', 'url', 'type', 'text', 'created_at', 'language',
  'author_id', 'author_username', 'author_name', 'author_followers',
  'likes', 'reposts', 'replies', 'quotes',
  'tags', 'is_r18',
  'media_count', 'media_urls',
];

export function toBlueskyCSV(posts) {
  const data = posts.map(p => [
    p.id,
    p.url,
    p.type       ?? '',
    p.text.replace(/\n/g, ' '),
    p.created_at ?? '',
    p.language   ?? '',
    p.author?.id        ?? '',
    p.author?.username  ?? '',
    p.author?.name      ?? '',
    p.author?.followers ?? 0,
    p.metrics?.likes    ?? 0,
    p.metrics?.reposts  ?? 0,
    p.metrics?.replies  ?? 0,
    p.metrics?.quotes   ?? 0,
    (p.tags ?? []).join(' | '),
    p.is_r18 ?? false,
    p.media?.length ?? 0,
    (p.media ?? []).map(m => m.url).join(' | '),
  ]);
  return Papa.unparse({ fields: CSV_HEADERS, data }, { newline: '\n' });
}
