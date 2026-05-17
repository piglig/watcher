/**
 * naver-output.js — Stats, JSON and CSV output for Naver Café posts
 */

import { formatNumber } from '../../shared/format.js';

export function printNaverStats(posts, memberCount = null) {
  if (!posts.length) return;

  const totViews    = posts.reduce((s, p) => s + p.metrics.views,    0);
  const totComments = posts.reduce((s, p) => s + p.metrics.comments, 0);
  const totLikes    = posts.reduce((s, p) => s + p.metrics.likes,    0);
  const totScraps   = posts.reduce((s, p) => s + p.metrics.scraps,   0);
  const top = [...posts].sort((a, b) => b.metrics.views - a.metrics.views)[0];
  const boards = [...new Set(posts.map(p => p.board.name).filter(Boolean))];

  console.log('Aggregate stats');
  console.log('─'.repeat(50));
  if (memberCount !== null)
    console.log(`  Members        : ${formatNumber(memberCount)}`);
  console.log(`  Total posts    : ${posts.length}`);
  if (boards.length)
    console.log(`  Boards         : ${boards.slice(0, 5).join(', ')}${boards.length > 5 ? ` +${boards.length - 5} more` : ''}`);
  console.log(`  Total views    : ${formatNumber(totViews)}`);
  console.log(`  Total comments : ${formatNumber(totComments)}`);
  console.log(`  Total likes    : ${formatNumber(totLikes)}`);
  console.log(`  Total scraps   : ${formatNumber(totScraps)}`);
  console.log(`  Avg views/post : ${formatNumber(Math.round(totViews / posts.length))}`);
  if (top) {
    console.log(`\n  Top post (${formatNumber(top.metrics.views)} views):`);
    console.log(`  ${top.url}`);
    console.log(`  "${top.title}"`);
  }
  console.log('');
}

export function toNaverJSON(posts, memberCount = null) {
  return JSON.stringify({ memberCount, posts }, null, 2);
}

const CSV_HEADERS = [
  'id', 'url', 'title', 'text', 'head', 'created_at',
  'author_id', 'author_nickname',
  'board_id', 'board_name',
  'views', 'comments', 'likes', 'scraps', 'reposts',
  'has_image',
];

export function toNaverCSV(posts) {
  const esc = v => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const rows = posts.map(p => [
    p.id,
    p.url,
    p.title,
    (p.text ?? '').replace(/\n/g, ' '),
    p.head ?? '',
    p.created_at ?? '',
    p.author.id,
    p.author.nickname,
    p.board.id,
    p.board.name,
    p.metrics.views,
    p.metrics.comments,
    p.metrics.likes,
    p.metrics.scraps,
    p.metrics.reposts,
    p.has_image,
  ].map(esc).join(','));

  return [CSV_HEADERS.join(','), ...rows].join('\n');
}
