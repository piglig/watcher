/**
 * output.js — Twitter JSON, CSV, and terminal output
 */

import { formatNumber } from '../../shared/format.js';

// ── Terminal table ──────────────────────────────────────────────────────────

export function printTable(tweets) {
  if (!tweets.length) { console.log('No tweets found.'); return; }

  const cols = {
    '#':       4,
    'Date':    12,
    'Text':    58,
    'Likes':   7,
    'RTs':     7,
    'Replies': 9,
    'Views':   9,
    'Type':    7,
  };

  const hr   = Object.values(cols).map(w => '─'.repeat(w)).join('─┼─');
  const head = Object.entries(cols).map(([k, w]) => k.padEnd(w)).join(' │ ');

  console.log('\n' + '─'.repeat(hr.length));
  console.log(head);
  console.log(hr);

  tweets.forEach((t, i) => {
    const date    = t.created_at ? new Date(t.created_at).toISOString().slice(0, 10) : '—';
    const snippet = t.text.replace(/\n/g, ' ').slice(0, cols['Text'] - 1);
    const type    = t.is_retweet ? 'RT' : t.is_reply ? 'Reply' : 'Tweet';
    const row = [
      String(i + 1).padEnd(cols['#']),
      date.padEnd(cols['Date']),
      snippet.padEnd(cols['Text']),
      formatNumber(t.metrics.likes).padEnd(cols['Likes']),
      formatNumber(t.metrics.retweets).padEnd(cols['RTs']),
      formatNumber(t.metrics.replies).padEnd(cols['Replies']),
      formatNumber(t.metrics.views).padEnd(cols['Views']),
      type.padEnd(cols['Type']),
    ].join(' │ ');
    console.log(row);
  });

  console.log('─'.repeat(hr.length));
  console.log(`Total: ${tweets.length} tweets\n`);
}

export function printStats(tweets) {
  if (!tweets.length) return;

  const originals = tweets.filter(t => !t.is_retweet && !t.is_reply);
  const retweets  = tweets.filter(t => t.is_retweet);
  const replies   = tweets.filter(t => t.is_reply);

  const totLikes = tweets.reduce((s, t) => s + t.metrics.likes, 0);
  const totRTs   = tweets.reduce((s, t) => s + t.metrics.retweets, 0);
  const totViews = tweets.reduce((s, t) => s + t.metrics.views, 0);
  const top      = [...tweets].sort((a, b) => b.metrics.likes - a.metrics.likes)[0];

  console.log('Aggregate stats');
  console.log('─'.repeat(44));
  console.log(`  Total tweets   : ${tweets.length} (${originals.length} original, ${retweets.length} RT, ${replies.length} reply)`);
  console.log(`  Total likes    : ${formatNumber(totLikes)}`);
  console.log(`  Total retweets : ${formatNumber(totRTs)}`);
  console.log(`  Total views    : ${formatNumber(totViews)}`);
  console.log(`  Avg likes/tweet: ${formatNumber(Math.round(totLikes / tweets.length))}`);
  if (top) {
    console.log(`\n  Top tweet (${formatNumber(top.metrics.likes)} likes):`);
    console.log(`  ${top.url}`);
    console.log(`  "${top.text.slice(0, 120)}"`);
  }
  console.log('');
}

// ── JSON ────────────────────────────────────────────────────────────────────

export function toJSON(profile, tweets) {
  return JSON.stringify({ profile, tweets }, null, 2);
}

// ── CSV ─────────────────────────────────────────────────────────────────────

export function toCSV(tweets) {
  const HEADERS = [
    'id', 'url', 'created_at', 'text', 'type', 'lang',
    'likes', 'retweets', 'replies', 'quotes', 'views',
    'media_count', 'media_urls',
  ];

  const escape = v => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const rows = tweets.map(t => [
    t.id,
    t.url,
    t.created_at ?? '',
    t.text.replace(/\n/g, ' '),
    t.type,
    t.lang ?? '',
    t.metrics.likes,
    t.metrics.retweets,
    t.metrics.replies,
    t.metrics.quotes,
    t.metrics.views,
    t.media?.length ?? 0,
    (t.media ?? []).map(m => m.url).join(' | '),
  ].map(escape).join(','));

  return [HEADERS.join(','), ...rows].join('\n');
}
