/**
 * youtube-output.js — Stats, JSON and CSV for YouTube data
 */

import { formatNumber } from '../../shared/format.js';

export function printYouTubeStats(profile, videos) {
  console.log('Aggregate stats');
  console.log('─'.repeat(50));

  if (profile) {
    console.log(`  Channel        : ${profile.title}`);
    console.log(`  Handle         : ${profile.handle}`);
    if (profile.country) console.log(`  Country        : ${profile.country}`);
    console.log(`  Subscribers    : ${formatNumber(profile.subscribers)}`);
    console.log(`  Total views    : ${formatNumber(profile.view_count)}`);
    console.log(`  Video count    : ${formatNumber(profile.video_count)}`);
  }

  if (!videos.length) { console.log(''); return; }

  const totViews    = videos.reduce((s, v) => s + v.metrics.views,    0);
  const totLikes    = videos.reduce((s, v) => s + v.metrics.likes,    0);
  const totComments = videos.reduce((s, v) => s + v.metrics.comments, 0);
  const withTranscript = videos.filter(v => v.transcript).length;
  const top = [...videos].sort((a, b) => b.metrics.views - a.metrics.views)[0];

  console.log(`  Scraped videos : ${videos.length}`);
  console.log(`  Total views    : ${formatNumber(totViews)}`);
  console.log(`  Total likes    : ${formatNumber(totLikes)}`);
  console.log(`  Total comments : ${formatNumber(totComments)}`);
  console.log(`  Avg views/video: ${formatNumber(Math.round(totViews / videos.length))}`);
  if (withTranscript > 0)
    console.log(`  With transcript: ${withTranscript}`);
  if (top) {
    console.log(`\n  Top video (${formatNumber(top.metrics.views)} views):`);
    console.log(`  ${top.url}`);
    console.log(`  "${top.title.slice(0, 80)}"`);
  }
  console.log('');
}

export function toYouTubeJSON(profile, videos) {
  return JSON.stringify({ profile, videos }, null, 2);
}

const VIDEO_HEADERS = [
  'id', 'url', 'thumbnail', 'download_url',
  'title', 'description', 'created_at', 'duration',
  'author_id', 'author_username',
  'views', 'likes', 'comments',
  'tags', 'transcript',
];

export function toYouTubeCSV(videos) {
  const esc = v => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const rows = videos.map(v => [
    v.id,
    v.url,
    v.thumbnail,
    v.download_url,
    v.title,
    v.description,
    v.created_at ?? '',
    v.duration,
    v.author.id,
    v.author.username,
    v.metrics.views,
    v.metrics.likes,
    v.metrics.comments,
    v.tags.join(' '),
    v.transcript,
  ].map(esc).join(','));

  return [VIDEO_HEADERS.join(','), ...rows].join('\n');
}
