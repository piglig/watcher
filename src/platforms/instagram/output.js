/**
 * instagram-output.js — Terminal table, stats, JSON and CSV for Instagram posts
 */

import Papa from 'papaparse';
import { formatNumber } from '../../shared/format.js';
import { normalizeToPosts } from '../../shared/post.js';

// ── Terminal table ────────────────────────────────────────────────────────────

export function printInstagramTable(posts) {
  if (!posts.length) { console.log('No posts found.'); return; }

  const cols = {
    '#':       4,
    'Date':    12,
    'Text':    50,
    'Likes':   8,
    'Comments':9,
    'Type':    9,
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
      formatNumber(p.metrics.comments).padEnd(cols.Comments),
      (p.type ?? '').padEnd(cols.Type),
    ].join(' │ ');
    console.log(row);
  });

  console.log('─'.repeat(hr.length));
  console.log(`Total: ${posts.length} posts\n`);
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export function printInstagramStats(profile, posts) {
  if (!posts.length) return;

  const photos    = posts.filter(p => p.type === 'photo');
  const videos    = posts.filter(p => p.type === 'video');
  const reels     = posts.filter(p => p.type === 'reel');
  const carousels = posts.filter(p => p.type === 'carousel');

  const totLikes    = posts.reduce((s, p) => s + (p.metrics.likes    ?? 0), 0);
  const totComments = posts.reduce((s, p) => s + (p.metrics.comments ?? 0), 0);
  const totViews    = posts.reduce((s, p) => s + (p.metrics.views    ?? 0), 0);
  const top = [...posts].sort((a, b) => b.metrics.likes - a.metrics.likes)[0];

  if (profile) {
    console.log(`\n  @${profile.username} — ${profile.name ?? ''}`);
    if (profile.followers) console.log(`  Followers: ${formatNumber(profile.followers)}`);
  }

  console.log('Aggregate stats');
  console.log('─'.repeat(44));
  console.log(`  Total posts    : ${posts.length} (photo: ${photos.length}, reel: ${reels.length}, video: ${videos.length}, carousel: ${carousels.length})`);
  console.log(`  Total likes    : ${formatNumber(totLikes)}`);
  console.log(`  Total comments : ${formatNumber(totComments)}`);
  if (totViews) console.log(`  Total views    : ${formatNumber(totViews)}`);
  console.log(`  Avg likes      : ${formatNumber(Math.round(totLikes / posts.length))}`);
  if (top) {
    console.log(`\n  Top post (${formatNumber(top.metrics.likes)} likes):`);
    console.log(`  ${top.url}`);
    if (top.text) console.log(`  "${top.text.slice(0, 120)}"`);
  }
  console.log('');
}

// ── Serialization ─────────────────────────────────────────────────────────────

export function toInstagramJSON(profile, posts) {
  return JSON.stringify({ profile, posts: normalizeToPosts(posts) }, null, 2);
}

const CSV_HEADERS = [
  'id', 'url', 'type', 'text', 'created_at',
  'author_id', 'author_username', 'author_name', 'author_followers', 'author_verified',
  'likes', 'comments', 'views',
  'media_count', 'media_urls',
];

export function toInstagramCSV(posts) {
  const data = posts.map(p => [
    p.id,
    p.url,
    p.type ?? '',
    p.text.replace(/\n/g, ' '),
    p.created_at,
    p.author?.id        ?? '',
    p.author?.username  ?? '',
    p.author?.name      ?? '',
    p.author?.followers ?? 0,
    p.author?.verified  ?? false,
    p.metrics?.likes    ?? 0,
    p.metrics?.comments ?? 0,
    p.metrics?.views    ?? 0,
    p.media?.length     ?? 0,
    (p.media ?? []).map(m => m.url).join(' | '),
  ]);
  return Papa.unparse({ fields: CSV_HEADERS, data }, { newline: '\n' });
}
