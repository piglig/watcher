/**
 * pixiv-output.js — Stats, JSON and CSV output for Pixiv artworks
 */

import { formatNumber } from '../../shared/format.js';

export function printPixivStats(artworks) {
  if (!artworks.length) return;

  const safe    = artworks.filter(a => !a.is_r18);
  const r18     = artworks.filter(a =>  a.is_r18 && !a.is_r18g);
  const r18g    = artworks.filter(a =>  a.is_r18g);
  const illusts = artworks.filter(a => a.type === 'illust');
  const manga   = artworks.filter(a => a.type === 'manga');
  const ugoira  = artworks.filter(a => a.type === 'ugoira');

  const totBookmarks = artworks.reduce((s, a) => s + a.metrics.bookmarks, 0);
  const totViews     = artworks.reduce((s, a) => s + a.metrics.views,     0);
  const top = [...artworks].sort((a, b) => b.metrics.bookmarks - a.metrics.bookmarks)[0];

  console.log('Aggregate stats');
  console.log('─'.repeat(50));
  console.log(`  Total artworks : ${artworks.length} (${illusts.length} illust, ${manga.length} manga, ${ugoira.length} ugoira)`);
  console.log(`  SFW / R18 / R18-G : ${safe.length} / ${r18.length} / ${r18g.length}`);
  console.log(`  Total bookmarks: ${formatNumber(totBookmarks)}`);
  console.log(`  Total views    : ${formatNumber(totViews)}`);
  console.log(`  Avg bookmarks  : ${formatNumber(Math.round(totBookmarks / artworks.length))}`);
  if (top) {
    const rating = top.is_r18g ? ' [R18-G]' : top.is_r18 ? ' [R18]' : '';
    console.log(`\n  Top artwork (${formatNumber(top.metrics.bookmarks)} bookmarks)${rating}:`);
    console.log(`  ${top.url}`);
    console.log(`  "${top.title}"`);
  }
  console.log('');
}

export function toPixivJSON(artworks) {
  return JSON.stringify(artworks, null, 2);
}

const CSV_HEADERS = [
  'id', 'url', 'title', 'created_at', 'type',
  'author_id', 'author_name', 'author_account',
  'bookmarks', 'views', 'likes', 'comments',
  'page_count', 'is_r18', 'is_r18g', 'x_restrict',
  'tags',
];

export function toPixivCSV(artworks) {
  const esc = v => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const rows = artworks.map(a => [
    a.id,
    a.url,
    a.title,
    a.created_at ?? '',
    a.type,
    a.author.id,
    a.author.name,
    a.author.account,
    a.metrics.bookmarks,
    a.metrics.views,
    a.metrics.likes,
    a.metrics.comments,
    a.page_count,
    a.is_r18,
    a.is_r18g,
    a.x_restrict,
    a.tags.join(' | '),
  ].map(esc).join(','));

  return [CSV_HEADERS.join(','), ...rows].join('\n');
}
