/**
 * runner.js — Platform-agnostic scraper dispatcher for the TUI.
 * Calls the right scraper, serializes output, writes files.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

import { scrapeDir, profileFile, profilesDir, ensureDir, pathSafe } from '../shared/paths.js';
import { cacheMediaInScrapeFile } from '../shared/media-cache.js';

import { scrapeTwitter }              from '../platforms/twitter/index.js';
import { toJSON as toTwitterJSON }    from '../platforms/twitter/index.js';
import { scrapeTikTok, parseTikTokUser } from '../platforms/tiktok/index.js';
import { toTikTokJSON }               from '../platforms/tiktok/index.js';
import { scrapeReddit, scrapeArctic } from '../platforms/reddit/index.js';
import { toRedditJSON }               from '../platforms/reddit/index.js';
import { scrapeThreads }              from '../platforms/threads/index.js';
import { toThreadsJSON }              from '../platforms/threads/index.js';
import { scrapePixiv }                from '../platforms/pixiv/index.js';
import { toPixivJSON }                from '../platforms/pixiv/index.js';
import { scrapeNaver }                from '../platforms/naver/index.js';
import { toNaverJSON }                from '../platforms/naver/index.js';
import { scrapeYouTube }              from '../platforms/youtube/index.js';
import { toYouTubeJSON }              from '../platforms/youtube/index.js';
import { scrapeInstagram, parseInstagramUsername } from '../platforms/instagram/index.js';
import { toInstagramJSON }            from '../platforms/instagram/index.js';
import { scrapeTwitch, parseTwitchLogin } from '../platforms/twitch/index.js';
import { toTwitchJSON }               from '../platforms/twitch/index.js';
import { scrapeBluesky, parseBlueskyHandle } from '../platforms/bluesky/index.js';
import { toBlueskyJSON }              from '../platforms/bluesky/index.js';
import { scrapeFacebook, parseFacebookUsername } from '../platforms/facebook/index.js';
import { toFacebookJSON }             from '../platforms/facebook/index.js';

// ── Platform metadata (used by ScrapeSetup wizard) ────────────────────────────

export const PLATFORMS = [
  {
    value: 'twitter',  label: 'Twitter / X',
    needsBrowser: true,
    targetsLabel: '用户名', targetsHint: 'username，多个用逗号分隔',
  },
  {
    value: 'tiktok',   label: 'TikTok',
    needsBrowser: true,
    targetsLabel: '用户名', targetsHint: '@username，多个用逗号分隔',
  },
  {
    value: 'reddit',   label: 'Reddit',
    needsBrowser: false,
    targetsLabel: '目标',  targetsHint: 'r/subreddit 或 u/username，多个用逗号分隔',
  },
  {
    value: 'threads',  label: 'Threads',
    needsBrowser: true,
    targetsLabel: '用户名', targetsHint: '@username，多个用逗号分隔',
  },
  {
    value: 'pixiv',    label: 'Pixiv',
    needsBrowser: true,
    targetsLabel: '用户 ID', targetsHint: '数字 ID 或主页 URL，多个用逗号分隔',
  },
  {
    value: 'naver',    label: 'Naver Café',
    needsBrowser: true,
    targetsLabel: 'Café URL', targetsHint: '完整 URL，多个用逗号分隔',
  },
  {
    value: 'youtube',  label: 'YouTube',
    needsBrowser: false, needsApiKey: true,
    targetsLabel: '频道', targetsHint: '@handle 或频道 URL，多个用逗号分隔',
  },
  {
    value: 'instagram', label: 'Instagram',
    needsBrowser: true,
    targetsLabel: '用户名', targetsHint: '@username，多个用逗号分隔',
  },
  {
    value: 'twitch', label: 'Twitch',
    needsBrowser: false, needsApiKey: true,
    targetsLabel: '频道名', targetsHint: '@login 或 twitch.tv/xxx，多个用逗号分隔',
  },
  {
    value: 'bluesky', label: 'Bluesky',
    needsBrowser: false, needsApiKey: true,
    targetsLabel: '账号', targetsHint: 'handle（如 user.bsky.social），多个用逗号分隔',
  },
  {
    value: 'facebook', label: 'Facebook',
    needsBrowser: true,
    targetsLabel: '账号', targetsHint: '主页 handle、profile.php?id=... 或完整 URL，多个用逗号分隔',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseTargets(raw) {
  return raw.split(',').map(t => t.trim()).filter(Boolean);
}

function sessionStamp() {
  const d = new Date();
  const date = d.toISOString().slice(0, 10);
  const time = d.toTimeString().slice(0, 8).replace(/:/g, '');
  return `${date}_${time}`;
}

// ── Main scrape runner ────────────────────────────────────────────────────────

/**
 * @param {object|object[]} config
 *   单个平台配置 或 多个平台配置数组（顺序执行，结果合并）
 *   每个配置：{ platform, targets, max, since, until, headed, apiKey, redditSource, outDir }
 * @returns {Promise<{ savedFiles: Array<{file,count,label}>, totalCount: number }>}
 */
// API-only platforms safe to run in parallel (no browser, no shared session)
const API_PLATFORMS = new Set(['reddit', 'youtube', 'twitch', 'bluesky']);

// Throttled per-platform heartbeat. Scrapers may call it freely; this drops
// emits that arrive within `intervalMs` of the previous one.
function makeHeartbeat(platform, onLog, intervalMs = 15000) {
  let lastEmit = 0;
  return (info) => {
    const now = Date.now();
    if (now - lastEmit < intervalMs) return;
    lastEmit = now;
    onLog(`[${platform}] ${info}`);
  };
}

async function runOnePlatform(c, onLog) {
  const tgts = parseTargets(c.targets);
  const sample = tgts.slice(0, 3).join(', ') + (tgts.length > 3 ? '...' : '');
  onLog(`[${c.platform}] 开始采集（${tgts.length} 个账号：${sample}）`);
  const t0 = Date.now();
  try {
    const res = await runScrape(c, onLog);
    const secs = Math.round((Date.now() - t0) / 1000);
    onLog(`[${c.platform}] 完成：${res.totalCount} 条（${secs}s）`);
    return res;
  } catch (e) {
    const secs = Math.round((Date.now() - t0) / 1000);
    const msg  = (e?.message ?? String(e)).slice(0, 200);
    onLog(`[${c.platform}] 失败（${secs}s）：${msg}`);
    // Keep workflow going for other platforms.
    return { savedFiles: [], totalCount: 0 };
  }
}

export async function runScrape(config, onLog = () => {}) {
  if (Array.isArray(config)) {
    // Split: API platforms parallelize freely; browser-based run sequentially to
    // avoid spawning multiple Playwright contexts that fight for memory/cookies.
    const apiConfigs     = config.filter(c => API_PLATFORMS.has(c.platform));
    const browserConfigs = config.filter(c => !API_PLATFORMS.has(c.platform));

    const apiPromise = Promise.all(apiConfigs.map(c => runOnePlatform(c, onLog)));

    const browserPromise = (async () => {
      const out = [];
      for (const c of browserConfigs) out.push(await runOnePlatform(c, onLog));
      return out;
    })();

    const [apiResults, browserResults] = await Promise.all([apiPromise, browserPromise]);
    const all = [...apiResults, ...browserResults];

    return {
      savedFiles: all.flatMap(r => r.savedFiles),
      totalCount: all.reduce((s, r) => s + r.totalCount, 0),
    };
  }
  const {
    platform,
    targets: rawTargets,
    kolId,                                    // ★ canonical KOL identifier (OSINT slug)
    max      = '200',
    since,
    until,
    headed   = false,
    apiKey,
    redditSource        = 'arctic',
    twitchClientId      = process.env.TWITCH_CLIENT_ID,
    twitchClientSecret  = process.env.TWITCH_CLIENT_SECRET,
    blueskyIdentifier   = process.env.BLUESKY_IDENTIFIER,
    blueskyAppPassword  = process.env.BLUESKY_APP_PASSWORD,
    outDir   = './out/',
  } = config;

  if (!kolId) throw new Error('runner.runScrape: `kolId` is required (canonical OSINT slug).');

  const targets = parseTargets(rawTargets);
  const opts = {
    max:    parseInt(max, 10) || 200,
    since:  since || undefined,
    until:  until || undefined,
    headed: !!headed,
    debug:  !!process.env.SCRAPE_DEBUG,
  };

  const stamp       = sessionStamp();
  const savedFiles  = [];
  let   totalCount  = 0;

  /**
   * Write one account's scrape output under <outDir>/<kolId>/scrape/<platform>/<handle>/<stamp>.json
   * and extract profile to <outDir>/<kolId>/accounts/profiles/<platform>.json (last writer wins —
   * the per-platform profile is a snapshot, not a history).
   */
  const save = (handle, content, profile, count, label) => {
    const dir  = ensureDir(scrapeDir(outDir, kolId, platform, handle));
    const file = join(dir, `${stamp}.json`);
    writeFileSync(file, content);
    savedFiles.push({ file, count, label, handle, kol_id: kolId });
    totalCount += count;

    if (profile) {
      ensureDir(profilesDir(outDir, kolId));
      const profileWithMeta = {
        platform,
        handle,
        captured_at: new Date().toISOString(),
        ...profile,
      };
      // One profile file per (kolId, platform). If the KOL has multiple
      // handles on the same platform we keep the last write — acceptable since
      // profiles for distinct handles also live inside scrape JSONs.
      writeFileSync(profileFile(outDir, kolId, platform), JSON.stringify(profileWithMeta, null, 2));
    }
    return file;
  };

  // Cache images locally on disk so the classifier can base64-embed them.
  // Without this, OpenAI's batch processor fetches CDN URLs hours later when
  // their signed tokens have already expired and the requests fail silently
  // into the batch error_file. Called after every successful save() that may
  // produce image media. No-op (and very cheap) for platforms whose `media`
  // is empty (TikTok / YouTube / Twitch).
  const cacheAfterSave = async (file, handle) => {
    try {
      const r = await cacheMediaInScrapeFile(file, { onLog });
      if (r.downloaded || r.failed) {
        onLog(`[${platform}] ${handle}: 媒体缓存 ↓${r.downloaded} ↺${r.skipped} ✗${r.failed}`);
      }
    } catch (e) {
      onLog(`[${platform}] ${handle}: 媒体缓存异常 ${e.message ?? e}`);
    }
  };

  if (platform === 'twitter') {
    const results = await scrapeTwitter(targets, { ...opts, onProgress: makeHeartbeat('twitter', onLog) });
    for (const [username, tweets] of Object.entries(results)) {
      if (!tweets.length) continue;
      const profile = tweets[0]?.author ? { ...tweets[0].author, platform: 'twitter' } : null;
      const file = save(username, toTwitterJSON(profile, tweets), profile, tweets.length, `@${username}`);
      await cacheAfterSave(file, `@${username}`);
    }

  } else if (platform === 'tiktok') {
    const parsed  = targets.map(t => parseTikTokUser(t) ?? t);
    const results = await scrapeTikTok(parsed, opts);
    for (const [username, { profile, videos }] of Object.entries(results)) {
      if (!videos.length) continue;
      const file = save(username, toTikTokJSON(profile, videos), profile, videos.length, `@${username}`);
      await cacheAfterSave(file, `@${username}`);
    }

  } else if (platform === 'reddit') {
    const fn      = redditSource === 'reddit' ? scrapeReddit : scrapeArctic;
    const results = await fn(targets, opts);
    for (const [target, items] of Object.entries(results)) {
      if (!items.length) continue;
      const handle = target.replace(/\//g, '_');
      const file = save(handle, toRedditJSON(items), null, items.length, target);
      await cacheAfterSave(file, target);
    }

  } else if (platform === 'threads') {
    const results = await scrapeThreads(targets, opts);
    for (const [username, threads] of Object.entries(results)) {
      if (!threads.length) continue;
      const profile = threads[0]?.author ? { ...threads[0].author, platform: 'threads' } : null;
      const file = save(username, toThreadsJSON(threads), profile, threads.length, `@${username}`);
      await cacheAfterSave(file, `@${username}`);
    }

  } else if (platform === 'pixiv') {
    const results = await scrapePixiv(targets, opts);
    for (const [target, { artworks }] of Object.entries(results)) {
      if (!artworks.length) continue;
      const profile = artworks[0]?.author ? { ...artworks[0].author, platform: 'pixiv' } : null;
      const file = save(target, toPixivJSON(artworks), profile, artworks.length, `Pixiv:${target}`);
      await cacheAfterSave(file, `Pixiv:${target}`);
    }

  } else if (platform === 'naver') {
    const results = await scrapeNaver(targets, opts);
    for (const [url, { cafe, posts }] of Object.entries(results)) {
      if (!posts.length) continue;
      const name = pathSafe(cafe?.name ?? url);
      const file = save(name, toNaverJSON(posts, cafe?.memberCount), cafe ?? null, posts.length, name);
      await cacheAfterSave(file, name);
    }

  } else if (platform === 'youtube') {
    const ytKey   = apiKey || process.env.YOUTUBE_API_KEY;
    const results = await scrapeYouTube(targets, { ...opts, apiKey: ytKey });
    for (const [target, { profile, videos }] of Object.entries(results)) {
      const name = String(profile?.handle ?? target).replace(/[@/]/g, '');
      if (!videos.length) {
        onLog(`[youtube] ${profile?.title ?? target}: 0 videos (channel reports ${profile?.video_count ?? '?'})`);
        if (profile) {
          // Still persist the profile so the report has subscribers/title even
          // when no videos came back (region/age restriction, hidden playlist).
          save(name, toYouTubeJSON(profile, []), profile, 0, profile?.title ?? target);
        }
        continue;
      }
      save(name, toYouTubeJSON(profile, videos), profile, videos.length, profile?.title ?? target);
      // YouTube normalizer emits no media — skip cache to avoid a redundant read.
    }

  } else if (platform === 'instagram') {
    const parsed  = targets.map(t => parseInstagramUsername(t) ?? t);
    const results = await scrapeInstagram(parsed, { ...opts, onProgress: makeHeartbeat('instagram', onLog) });
    for (const [username, { profile, posts }] of Object.entries(results)) {
      if (!posts.length) continue;
      const file = save(username, toInstagramJSON(profile, posts), profile, posts.length, `@${username}`);
      await cacheAfterSave(file, `@${username}`);
    }

  } else if (platform === 'twitch') {
    const parsed  = targets.map(t => parseTwitchLogin(t) ?? t);
    const results = await scrapeTwitch(parsed, { ...opts, clientId: twitchClientId, clientSecret: twitchClientSecret });
    for (const [login, { profile, videos, clips }] of Object.entries(results)) {
      const total = videos.length + clips.length;
      if (!total) continue;
      save(login, toTwitchJSON(profile, videos, clips), profile, total, login);
      // Twitch normalizer emits no media — skip cache.
    }

  } else if (platform === 'facebook') {
    const parsed  = targets.map(t => parseFacebookUsername(t) ?? t);
    const results = await scrapeFacebook(parsed, { ...opts, onProgress: makeHeartbeat('facebook', onLog) });
    for (const [target, { profile, posts }] of Object.entries(results)) {
      if (!posts.length) continue;
      const file = save(target.replace(/[\/?=&]/g, '_'), toFacebookJSON(profile, posts), profile, posts.length, target);
      await cacheAfterSave(file, target);
    }

  } else if (platform === 'bluesky') {
    const parsed  = targets.map(t => parseBlueskyHandle(t) ?? t);
    const results = await scrapeBluesky(parsed, { ...opts, identifier: blueskyIdentifier, appPassword: blueskyAppPassword });
    for (const [handle, { profile, posts }] of Object.entries(results)) {
      if (!posts.length) continue;
      const file = save(handle, toBlueskyJSON(profile, posts), profile, posts.length, `@${handle}`);
      await cacheAfterSave(file, `@${handle}`);
    }
  }

  return { savedFiles, totalCount };
}
