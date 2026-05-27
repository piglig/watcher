/**
 * tiktok-output.js — Stats, JSON and CSV for TikTok data
 */

import Papa from 'papaparse';
import { formatNumber } from '../../shared/format.js';
import { normalizeToPosts } from '../../shared/post.js';

export function printTikTokStats(profile, videos) {
  console.log('Aggregate stats');
  console.log('─'.repeat(50));

  if (profile) {
    console.log(`  Username       : @${profile.username}`);
    console.log(`  Nickname       : ${profile.nickname}`);
    if (profile.verified) console.log(`  Verified       : yes`);
    console.log(`  Followers      : ${formatNumber(profile.followers)}`);
    console.log(`  Following      : ${formatNumber(profile.following)}`);
    console.log(`  Total likes    : ${formatNumber(profile.total_likes)}`);
    console.log(`  Videos         : ${formatNumber(profile.video_count)}`);
  }

  if (!videos.length) { console.log(''); return; }

  const totViews    = videos.reduce((s, v) => s + v.metrics.views,     0);
  const totLikes    = videos.reduce((s, v) => s + v.metrics.likes,     0);
  const totComments = videos.reduce((s, v) => s + v.metrics.comments,  0);
  const totShares   = videos.reduce((s, v) => s + v.metrics.shares,    0);
  const totBookmarks= videos.reduce((s, v) => s + v.metrics.bookmarks, 0);
  const totCmtFetched = videos.reduce((s, v) => s + (v.comments?.length ?? 0), 0);
  const top = [...videos].sort((a, b) => b.metrics.views - a.metrics.views)[0];

  console.log(`  Scraped videos : ${videos.length}`);
  console.log(`  Total views    : ${formatNumber(totViews)}`);
  console.log(`  Total likes    : ${formatNumber(totLikes)}`);
  console.log(`  Total comments : ${formatNumber(totComments)}`);
  console.log(`  Total shares   : ${formatNumber(totShares)}`);
  console.log(`  Total bookmarks: ${formatNumber(totBookmarks)}`);
  console.log(`  Avg views/video: ${formatNumber(Math.round(totViews / videos.length))}`);
  if (totCmtFetched > 0)
    console.log(`  Comments fetched: ${formatNumber(totCmtFetched)}`);
  if (top) {
    console.log(`\n  Top video (${formatNumber(top.metrics.views)} views):`);
    console.log(`  ${top.url}`);
    console.log(`  "${top.description.slice(0, 80)}"`);
  }
  console.log('');
}

export function toTikTokJSON(profile, videos) {
  return JSON.stringify({ profile, posts: normalizeToPosts(videos) }, null, 2);
}

const VIDEO_HEADERS = [
  'id', 'url', 'thumbnail', 'download_url', 'description', 'created_at',
  'author_id', 'author_username', 'author_nickname',
  'views', 'likes', 'comments', 'shares', 'bookmarks',
  'music_title', 'music_author',
  'hashtags',
];

export function toTikTokCSV(videos) {
  const data = videos.map(v => [
    v.id,
    v.url,
    v.thumbnail ?? '',
    v.download_url ?? '',
    v.description,
    v.created_at ?? '',
    v.author.id,
    v.author.username,
    v.author.nickname,
    v.metrics.views,
    v.metrics.likes,
    v.metrics.comments,
    v.metrics.shares,
    v.metrics.bookmarks,
    v.music.title,
    v.music.author,
    v.hashtags.join(' '),
  ]);
  return Papa.unparse({ fields: VIDEO_HEADERS, data }, { newline: '\n' });
}

const COMMENT_HEADERS = [
  'id', 'video_id', 'text', 'created_at',
  'author_id', 'author_username', 'author_nickname',
  'likes', 'replies',
  'author_reply_text', 'author_reply_created_at',
];

export function toTikTokCommentsCSV(videos) {
  const data = [];
  for (const v of videos) {
    for (const c of (v.comments ?? [])) {
      data.push([
        c.id,
        c.video_id,
        c.text,
        c.created_at ?? '',
        c.author.id,
        c.author.username,
        c.author.nickname,
        c.metrics.likes,
        c.metrics.replies,
        c.author_reply?.text ?? '',
        c.author_reply?.created_at ?? '',
      ]);
    }
  }
  return Papa.unparse({ fields: COMMENT_HEADERS, data }, { newline: '\n' });
}
