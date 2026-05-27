/**
 * twitch-output.js — Terminal table, stats, JSON and CSV for Twitch VODs/Clips
 */

import Papa from 'papaparse';
import { formatNumber } from '../../shared/format.js';
import { normalizeToPosts } from '../../shared/post.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDuration(secs) {
  if (!secs) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h) return `${h}h${String(m).padStart(2,'0')}m`;
  if (m) return `${m}m${String(s).padStart(2,'0')}s`;
  return `${s}s`;
}

// ── Terminal table ────────────────────────────────────────────────────────────

export function printTwitchTable(items) {
  if (!items.length) { console.log('No items found.'); return; }

  const cols = {
    '#':       4,
    'Date':    12,
    'Title':   48,
    'Views':   8,
    'Duration':9,
    'Type':    9,
  };

  const hr   = Object.values(cols).map(w => '─'.repeat(w)).join('─┼─');
  const head = Object.entries(cols).map(([k, w]) => k.padEnd(w)).join(' │ ');

  console.log('\n' + '─'.repeat(hr.length));
  console.log(head);
  console.log(hr);

  items.forEach((item, i) => {
    const date = item.created_at
      ? new Date(item.created_at).toISOString().slice(0, 10)
      : '—';
    const dur  = item.type === 'clip'
      ? `${item.duration ?? 0}s`
      : fmtDuration(item.duration ?? 0);
    const row = [
      String(i + 1).padEnd(cols['#']),
      date.padEnd(cols.Date),
      (item.title ?? '').replace(/\n/g, ' ').slice(0, cols.Title - 1).padEnd(cols.Title),
      formatNumber(item.view_count ?? 0).padEnd(cols.Views),
      dur.padEnd(cols.Duration),
      (item.type ?? '').padEnd(cols.Type),
    ].join(' │ ');
    console.log(row);
  });

  console.log('─'.repeat(hr.length));
  console.log(`Total: ${items.length} items\n`);
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export function printTwitchStats(profile, videos, clips) {
  if (profile) {
    console.log(`\n  ${profile.display_name} (${profile.login})`);
    if (profile.followers) console.log(`  Followers : ${formatNumber(profile.followers)}`);
    if (profile.view_count) console.log(`  Total views: ${formatNumber(profile.view_count)}`);
  }

  if (videos.length) {
    const archives   = videos.filter(v => v.type === 'archive');
    const highlights = videos.filter(v => v.type === 'highlight');
    const uploads    = videos.filter(v => v.type === 'upload');
    const totViews   = videos.reduce((s, v) => s + (v.view_count ?? 0), 0);
    const totSecs    = videos.reduce((s, v) => s + (v.duration ?? 0), 0);
    const top        = [...videos].sort((a, b) => b.view_count - a.view_count)[0];

    console.log('\nVOD stats');
    console.log('─'.repeat(44));
    console.log(`  Total VODs   : ${videos.length} (archive: ${archives.length}, highlight: ${highlights.length}, upload: ${uploads.length})`);
    console.log(`  Total views  : ${formatNumber(totViews)}`);
    console.log(`  Total hours  : ${(totSecs / 3600).toFixed(1)}h`);
    if (top) {
      console.log(`\n  Top VOD (${formatNumber(top.view_count)} views): ${top.title?.slice(0, 60)}`);
    }
  }

  if (clips.length) {
    const totViews = clips.reduce((s, c) => s + (c.view_count ?? 0), 0);
    const top      = [...clips].sort((a, b) => b.view_count - a.view_count)[0];

    console.log('\nClip stats');
    console.log('─'.repeat(44));
    console.log(`  Total clips  : ${clips.length}`);
    console.log(`  Total views  : ${formatNumber(totViews)}`);
    if (top) {
      console.log(`\n  Top Clip (${formatNumber(top.view_count)} views): ${top.title?.slice(0, 60)}`);
    }
  }
  console.log('');
}

// ── Serialization ─────────────────────────────────────────────────────────────

export function toTwitchJSON(profile, videos, clips) {
  return JSON.stringify({
    profile,
    posts: normalizeToPosts([...(videos ?? []), ...(clips ?? [])]),
  }, null, 2);
}

const VOD_HEADERS = [
  'id', 'url', 'type', 'title', 'description', 'created_at',
  'duration_seconds', 'duration_str',
  'author_id', 'author_username', 'author_name',
  'view_count', 'language',
];

const CLIP_HEADERS = [
  'id', 'url', 'title', 'created_at',
  'duration_seconds',
  'broadcaster_id', 'broadcaster_username', 'broadcaster_name',
  'creator_id', 'creator_username',
  'view_count', 'game_id', 'game_name', 'language',
];

export function toTwitchVodsCSV(videos) {
  const data = videos.map(v => [
    v.id,
    v.url,
    v.type ?? 'archive',
    v.title ?? '',
    (v.description ?? '').replace(/\n/g, ' '),
    v.created_at,
    v.duration ?? 0,
    v.duration_str ?? '',
    v.author?.id       ?? '',
    v.author?.username ?? '',
    v.author?.name     ?? '',
    v.view_count ?? 0,
    v.language   ?? '',
  ]);
  return Papa.unparse({ fields: VOD_HEADERS, data }, { newline: '\n' });
}

export function toTwitchClipsCSV(clips) {
  const data = clips.map(c => [
    c.id,
    c.url,
    c.title ?? '',
    c.created_at,
    c.duration ?? 0,
    c.author?.id       ?? '',
    c.author?.username ?? '',
    c.author?.name     ?? '',
    c.creator?.id       ?? '',
    c.creator?.username ?? '',
    c.view_count ?? 0,
    c.game_id   ?? '',
    c.game_name ?? '',
    c.language  ?? '',
  ]);
  return Papa.unparse({ fields: CLIP_HEADERS, data }, { newline: '\n' });
}
