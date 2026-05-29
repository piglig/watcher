/**
 * youtube.js — YouTube channel scraper
 * Channel info + video list via YouTube Data API v3.
 * Transcripts via yt-dlp (optional, --transcript flag).
 */

import { execFile }  from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { resolve, join } from 'path';
import { google }    from 'googleapis';
import { createLogger } from '../../shared/logger.js';

const execFileAsync = promisify(execFile);
const API_KEY_ENV   = 'YOUTUBE_API_KEY';

// ── Input parsing ─────────────────────────────────────────────────────────────

export function parseYouTubeChannel(raw) {
  if (typeof raw !== 'string') return null;
  raw = raw.trim();

  const urlPatterns = [
    [/youtube\.com\/@([A-Za-z0-9._-]+)/,      'handle'],
    [/youtube\.com\/channel\/(UC[\w-]{20,})/, 'channelId'],
    [/youtube\.com\/c\/([A-Za-z0-9._-]+)/,    'handle'],
    [/youtube\.com\/user\/([A-Za-z0-9._-]+)/, 'handle'],
  ];
  for (const [re, key] of urlPatterns) {
    const m = raw.match(re);
    if (m) return { [key]: m[1] };
  }

  if (/^UC[\w-]{20,}$/.test(raw)) return { channelId: raw };

  const m = raw.match(/^@?([A-Za-z0-9._-]+)$/);
  if (m) return { handle: m[1] };

  return null;
}

// ── YouTube API helpers ───────────────────────────────────────────────────────

function makeClient(apiKey) {
  return google.youtube({ version: 'v3', auth: apiKey });
}

async function resolveChannelByHandle(yt, handle, log = createLogger()) {
  // Strategy 1: forHandle (supported since YouTube introduced @handles in 2023)
  const r1 = await yt.channels.list({
    part:      ['snippet', 'statistics', 'contentDetails'],
    forHandle: `@${handle.replace(/^@/, '')}`,
  });
  if (r1.data.items?.[0]) return r1.data.items[0];

  // Strategy 2: search.list — works for legacy custom URLs (/c/<name>, /user/<name>)
  // that don't yet map to a handle, costs 100 quota units vs 1 for channels.list.
  log.log(`  forHandle returned nothing; falling back to search for "${handle}"...`);
  const r2 = await yt.search.list({
    part:       ['snippet'],
    q:          handle.replace(/^@/, ''),
    type:       ['channel'],
    maxResults: 5,
  });
  const target = handle.replace(/^@/, '').toLowerCase();
  const exact  = (r2.data.items ?? []).find(it => {
    const t = (it.snippet?.channelTitle ?? '').toLowerCase();
    const d = (it.snippet?.title ?? '').toLowerCase();
    return t === target || d === target;
  }) ?? r2.data.items?.[0];
  if (!exact?.id?.channelId) return null;

  const r3 = await yt.channels.list({
    part: ['snippet', 'statistics', 'contentDetails'],
    id:   [exact.id.channelId],
  });
  return r3.data.items?.[0] ?? null;
}

async function fetchChannel(yt, target, log = createLogger()) {
  let ch = null;
  if (target.channelId) {
    const res = await yt.channels.list({
      part: ['snippet', 'statistics', 'contentDetails'],
      id:   [target.channelId],
    });
    ch = res.data.items?.[0] ?? null;
  } else {
    ch = await resolveChannelByHandle(yt, target.handle, log);
  }
  if (!ch) throw new Error(`Channel not found: ${JSON.stringify(target)}`);

  const sn = ch.snippet    ?? {};
  const st = ch.statistics ?? {};
  const cd = ch.contentDetails?.relatedPlaylists ?? {};

  // YouTube convention: a channel's uploads playlist ID is its channelId with
  // the leading "UC" replaced by "UU". The API occasionally omits the field
  // (e.g. for channels with hidden video counts) — derive it ourselves so we
  // don't bail out prematurely.
  const uploads = cd.uploads ?? (ch.id?.startsWith('UC') ? 'UU' + ch.id.slice(2) : '');

  return {
    id:               ch.id,
    handle:           sn.customUrl ?? '',
    title:            sn.title       ?? '',
    description:      sn.description ?? '',
    country:          sn.country     ?? '',
    created_at:       sn.publishedAt ?? null,
    subscribers:      Number(st.subscriberCount ?? 0),
    video_count:      Number(st.videoCount      ?? 0),
    view_count:       Number(st.viewCount        ?? 0),
    uploads_playlist: uploads,
    platform:         'youtube',
  };
}

async function fetchVideoIds(yt, uploadsPlaylistId, max, log = createLogger()) {
  const ids = [];
  let pageToken;

  while (ids.length < max) {
    let res;
    try {
      res = await yt.playlistItems.list({
        part:       ['contentDetails'],
        playlistId: uploadsPlaylistId,
        maxResults: Math.min(50, max - ids.length),
        pageToken,
      });
    } catch (e) {
      // playlistNotFound: the channel hides its uploads playlist (e.g. some
      // YouTube Music topic channels, Shorts-only creators in certain regions).
      const reason = e?.errors?.[0]?.reason ?? e?.code;
      if (reason === 'playlistNotFound' || e?.response?.status === 404) {
        log.warn(`[WARN] Uploads playlist ${uploadsPlaylistId} not accessible (${reason ?? '404'}).`);
        return ids;
      }
      throw e;
    }
    for (const item of (res.data.items ?? [])) {
      const vid = item.contentDetails?.videoId;
      if (vid) ids.push(vid);
    }
    pageToken = res.data.nextPageToken;
    if (!pageToken) break;
  }

  return ids;
}

// search.list fallback — used when the uploads playlist is empty or hidden.
// 100 quota units per call (vs 1 for playlistItems), so only invoked when
// the cheaper path produced nothing.
async function fetchVideoIdsBySearch(yt, channelId, max) {
  const ids = [];
  let pageToken;

  while (ids.length < max) {
    const res = await yt.search.list({
      part:       ['id'],
      channelId,
      type:       ['video'],
      order:      'date',
      maxResults: Math.min(50, max - ids.length),
      pageToken,
    });
    for (const item of (res.data.items ?? [])) {
      const vid = item.id?.videoId;
      if (vid) ids.push(vid);
    }
    pageToken = res.data.nextPageToken;
    if (!pageToken) break;
  }
  return ids;
}

async function fetchVideoDetails(yt, videoIds) {
  const videos = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const res   = await yt.videos.list({
      part: ['snippet', 'statistics', 'contentDetails'],
      id:   batch,
    });
    for (const item of (res.data.items ?? [])) {
      const v = parseYouTubeVideo(item);
      if (v) videos.push(v);
    }
  }
  return videos;
}

function parseDuration(iso) {
  const m = (iso ?? '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (Number(m[1] ?? 0) * 3600) + (Number(m[2] ?? 0) * 60) + Number(m[3] ?? 0);
}

function parseYouTubeVideo(item) {
  if (!item?.id) return null;
  const sn = item.snippet        ?? {};
  const st = item.statistics     ?? {};
  const cd = item.contentDetails ?? {};

  const thumbs    = sn.thumbnails ?? {};
  const thumbnail = thumbs.maxres?.url ?? thumbs.high?.url ?? thumbs.medium?.url ?? '';

  return {
    id:           item.id,
    url:          `https://www.youtube.com/watch?v=${item.id}`,
    thumbnail,
    download_url: `https://www.youtube.com/watch?v=${item.id}`,
    title:        sn.title       ?? '',
    description:  sn.description ?? '',
    created_at:   sn.publishedAt ?? null,
    duration:     parseDuration(cd.duration),
    author: {
      id:       sn.channelId    ?? '',
      username: sn.channelTitle ?? '',
    },
    metrics: {
      views:    Number(st.viewCount    ?? 0),
      likes:    Number(st.likeCount    ?? 0),
      comments: Number(st.commentCount ?? 0),
    },
    tags:       sn.tags ?? [],
    transcript: '',
    platform:   'youtube',
  };
}

// ── Transcript via yt-dlp (optional) ─────────────────────────────────────────

async function fetchTranscript(videoId, langs = 'ja,en') {
  const tmpDir = resolve('.tmp-yt-transcripts');
  mkdirSync(tmpDir, { recursive: true });
  const outTemplate = join(tmpDir, `${videoId}`);

  try {
    // Download auto-generated subtitles only (no video)
    await execFileAsync('yt-dlp', [
      '--write-auto-sub',
      '--sub-lang',   langs,
      '--sub-format', 'vtt',
      '--skip-download',
      '--no-playlist',
      '-o', outTemplate,
      `https://www.youtube.com/watch?v=${videoId}`,
    ], { timeout: 30_000 });

    // Find the downloaded .vtt file
    for (const lang of langs.split(',')) {
      const vttPath = `${outTemplate}.${lang}.vtt`;
      if (existsSync(vttPath)) {
        const { readFileSync } = await import('fs');
        const raw = readFileSync(vttPath, 'utf-8');
        unlinkSync(vttPath);
        return cleanVtt(raw);
      }
    }
    return '';
  } catch {
    return '';
  }
}

function cleanVtt(vtt) {
  return vtt
    .split('\n')
    .filter(l => !l.startsWith('WEBVTT') && !l.match(/^\d{2}:\d{2}/) && l.trim())
    .map(l => l.replace(/<[^>]+>/g, '').trim())
    .filter((l, i, arr) => l && l !== arr[i - 1]) // deduplicate consecutive lines
    .join(' ')
    .trim();
}

// ── Filter ────────────────────────────────────────────────────────────────────

function buildFilter(opts = {}) {
  const since   = opts.since   ? new Date(opts.since)   : null;
  const until   = opts.until   ? new Date(opts.until)   : null;
  const keyword = opts.keyword ? opts.keyword.toLowerCase() : null;
  return v => {
    if (since || until) {
      const d = new Date(v.created_at);
      if (since && d < since) return false;
      if (until && d > until) return false;
    }
    if (keyword && !(v.title + ' ' + v.description).toLowerCase().includes(keyword)) return false;
    return true;
  };
}

// ── Main scrape ───────────────────────────────────────────────────────────────

export async function scrapeYouTubeChannel(target, apiKey, opts = {}) {
  const {
    max        = 1000,
    transcript = false,
    transcriptLangs = 'ja,en',
    debug      = false,
    logger     = null,
    ...filterOpts
  } = opts;

  const log      = createLogger(logger);
  const dbg      = (...m) => debug && log.log('[DBG]', ...m);
  const filterFn = buildFilter(filterOpts);
  const yt       = makeClient(apiKey);

  // 1. Channel
  const profile = await fetchChannel(yt, target, log);
  log.log(`  Channel: ${profile.title} (${profile.id}) — ${profile.subscribers} subscribers, ${profile.video_count} videos reported`);

  if (!profile.uploads_playlist) {
    log.warn(`[WARN] No uploads playlist for ${profile.title} — channel has hidden video list. Trying search fallback...`);
  }

  // 2. Video IDs
  log.log('  Fetching video list...');
  let videoIds = profile.uploads_playlist
    ? await fetchVideoIds(yt, profile.uploads_playlist, max, log)
    : [];
  if (!videoIds.length && profile.video_count > 0) {
    log.log(`  Uploads playlist empty (channel reports ${profile.video_count} videos) — using search.list fallback`);
    videoIds = await fetchVideoIdsBySearch(yt, profile.id, max);
  }
  log.log(`  ${videoIds.length} videos found`);

  if (!videoIds.length) return { profile, videos: [] };

  // 3. Video details
  log.log('  Fetching video details...');
  let videos = await fetchVideoDetails(yt, videoIds);
  log.log(`  ${videos.length} videos parsed`);

  // 4. Filter + sort
  videos = videos
    .filter(filterFn)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, max);

  // 5. Transcripts (optional)
  if (transcript && videos.length > 0) {
    log.log(`  Fetching transcripts for ${videos.length} videos...`);
    for (let i = 0; i < videos.length; i++) {
      const v = videos[i];
      v.transcript = await fetchTranscript(v.id, transcriptLangs);
      log.log(`Transcripts: ${i + 1}/${videos.length}`);
      dbg(`${v.id}: transcript ${v.transcript ? v.transcript.length + ' chars' : 'empty'}`);
    }
  }

  return { profile, videos };
}

export async function scrapeYouTube(targets, opts = {}) {
  const {
    apiKey = process.env[API_KEY_ENV],
    debug  = false,
    logger: rawLogger = null,
    ...channelOpts
  } = opts;
  const log = createLogger(rawLogger);

  if (!apiKey) {
    throw new Error(
      `YouTube API key required.\n` +
      `  Set env var: $env:${API_KEY_ENV}="YOUR_KEY"\n` +
      `  Or pass:     --api-key YOUR_KEY`
    );
  }

  const parsed = (Array.isArray(targets) ? targets : [targets])
    .map(t => typeof t === 'string' ? parseYouTubeChannel(t) : t)
    .filter(Boolean);
  if (!parsed.length) throw new Error('No valid YouTube channel provided.');

  const results = {};
  for (const target of parsed) {
    const label = target.channelId ?? `@${target.handle}`;
    log.log(`${label}  [YouTube]`);
    results[label] = await scrapeYouTubeChannel(target, apiKey, { debug, logger: rawLogger, ...channelOpts });
  }
  return results;
}
