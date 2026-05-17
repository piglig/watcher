/**
 * classifier-output.js — Stats, JSON and CSV for classifier results
 */

import { CATEGORIES } from './classifier.js';

export function printClassifierStats(userRisks, { withImages = 0, totalPosts: tp = 0 } = {}) {
  console.log('Classification Results');
  console.log('─'.repeat(50));

  const byLevel = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const u of userRisks) byLevel[u.risk_level]++;

  const total         = userRisks.length;
  const totalFlagged  = userRisks.reduce((s, u) => s + u.flagged_post_count, 0);
  const totalPosts    = tp || userRisks.reduce((s, u) => s + u.post_count, 0);

  console.log(`  Total users    : ${total}`);
  console.log(`  Critical       : ${byLevel.critical}`);
  console.log(`  High           : ${byLevel.high}`);
  console.log(`  Medium         : ${byLevel.medium}`);
  console.log(`  Low            : ${byLevel.low}`);
  console.log(`  Total posts    : ${totalPosts}`);
  if (withImages > 0)
    console.log(`  With images    : ${withImages} (text+vision)`);
  console.log(`  Flagged posts  : ${totalFlagged}`);

  const top = userRisks.slice(0, 5);
  if (top.length) {
    console.log('\n  Top Risk Users:');
    for (const u of top) {
      const level = u.risk_level.toUpperCase().padEnd(8);
      const cats  = u.top_categories.join(', ') || '—';
      console.log(`  [${level}] @${u.username} (score: ${u.risk_score}) — ${cats}`);
    }
  }
  console.log('');
}

export function toClassifierJSON(userRisks, results) {
  return JSON.stringify({ user_risks: userRisks, post_results: results }, null, 2);
}

const USER_RISK_HEADERS = [
  'author_id', 'username', 'risk_level', 'risk_score',
  'post_count', 'flagged_post_count', 'severe_post_count',
  'top_categories',
  ...CATEGORIES,
];

export function toUserRiskCSV(userRisks) {
  const esc = v => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = userRisks.map(u => [
    u.author_id,
    u.username,
    u.risk_level,
    u.risk_score,
    u.post_count,
    u.flagged_post_count,
    u.severe_post_count,
    u.top_categories.join(' '),
    ...CATEGORIES.map(c => u.category_averages[c] ?? 0),
  ].map(esc).join(','));
  return [USER_RISK_HEADERS.join(','), ...rows].join('\n');
}

const FLAGGED_HEADERS = [
  'author_id', 'username', 'post_id', 'url', 'created_at', 'type', 'rt_from', 'source',
  ...CATEGORIES,
  'text', 'reasons',
];

export function toFlaggedPostsCSV(userRisks) {
  const esc = v => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [];
  for (const u of userRisks) {
    for (const p of u.flagged_posts) {
      const reasonSummary = Object.entries(p.reasons ?? {})
        .map(([cat, r]) => `${cat}: ${r}`)
        .join(' | ');
      const rtFrom = p.rt_from
        ? `@${p.rt_from.username ?? ''}/${p.rt_from.tweet_id ?? ''}`
        : '';
      rows.push([
        u.author_id,
        u.username,
        p.id,
        p.url,
        p.created_at,
        p.type ?? 'tweet',
        rtFrom,
        p.source ?? 'llm',
        ...CATEGORIES.map(c => p.score[c] ?? 0),
        p.text ?? '',
        reasonSummary,
      ].map(esc).join(','));
    }
  }
  return [FLAGGED_HEADERS.join(','), ...rows].join('\n');
}
