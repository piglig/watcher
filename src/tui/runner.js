/**
 * runner.js — Platform-agnostic scraper dispatcher for the TUI.
 * Calls the right scraper, serializes output, writes files.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, resolve }            from 'path';

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
export async function runScrape(config) {
  if (Array.isArray(config)) {
    const allFiles  = [];
    let   totalCount = 0;
    for (const c of config) {
      const res = await runScrape(c);
      allFiles.push(...res.savedFiles);
      totalCount += res.totalCount;
    }
    return { savedFiles: allFiles, totalCount };
  }
  const {
    platform,
    targets: rawTargets,
    max      = '200',
    since,
    until,
    headed   = false,
    apiKey,
    redditSource = 'arctic',
    outDir   = './out/',
  } = config;

  const targets = parseTargets(rawTargets);
  const opts = {
    max:    parseInt(max, 10) || 200,
    since:  since || undefined,
    until:  until || undefined,
    headed: !!headed,
    debug:  false,
  };

  const baseDir     = resolve(outDir);
  const platformDir = join(baseDir, platform);
  mkdirSync(platformDir, { recursive: true });

  const stamp       = sessionStamp();
  const savedFiles  = [];
  let   totalCount  = 0;

  const save = (name, content, count, label) => {
    const file = join(platformDir, name);
    writeFileSync(file, content);
    savedFiles.push({ file, count, label });
    totalCount += count;
  };

  if (platform === 'twitter') {
    const results = await scrapeTwitter(targets, opts);
    for (const [username, tweets] of Object.entries(results)) {
      if (!tweets.length) continue;
      const profile = tweets[0]?.author
        ? { ...tweets[0].author, platform: 'twitter' }
        : null;
      save(`${stamp}_${username}.json`, toTwitterJSON(profile, tweets), tweets.length, `@${username}`);
    }

  } else if (platform === 'tiktok') {
    const parsed  = targets.map(t => parseTikTokUser(t) ?? t);
    const results = await scrapeTikTok(parsed, opts);
    for (const [username, { profile, videos }] of Object.entries(results)) {
      if (!videos.length) continue;
      save(`${stamp}_${username}.json`, toTikTokJSON(profile, videos), videos.length, `@${username}`);
    }

  } else if (platform === 'reddit') {
    const fn      = redditSource === 'reddit' ? scrapeReddit : scrapeArctic;
    const results = await fn(targets, opts);
    for (const [target, items] of Object.entries(results)) {
      if (!items.length) continue;
      const safeName = target.replace(/\//g, '_');
      save(`${stamp}_${safeName}.json`, toRedditJSON(items), items.length, target);
    }

  } else if (platform === 'threads') {
    const results = await scrapeThreads(targets, opts);
    for (const [username, threads] of Object.entries(results)) {
      if (!threads.length) continue;
      save(`${stamp}_${username}.json`, toThreadsJSON(threads), threads.length, `@${username}`);
    }

  } else if (platform === 'pixiv') {
    const results = await scrapePixiv(targets, opts);
    for (const [target, { artworks }] of Object.entries(results)) {
      if (!artworks.length) continue;
      save(`${stamp}_${target}.json`, toPixivJSON(artworks), artworks.length, `Pixiv:${target}`);
    }

  } else if (platform === 'naver') {
    const results = await scrapeNaver(targets, opts);
    for (const [url, { cafe, posts }] of Object.entries(results)) {
      if (!posts.length) continue;
      const name = (cafe?.name ?? url).replace(/[^a-z0-9_\-]/gi, '_');
      save(`${stamp}_${name}.json`, toNaverJSON(posts, cafe?.memberCount), posts.length, name);
    }

  } else if (platform === 'youtube') {
    const ytKey   = apiKey || process.env.YOUTUBE_API_KEY;
    const results = await scrapeYouTube(targets, { ...opts, apiKey: ytKey });
    for (const [target, { profile, videos }] of Object.entries(results)) {
      if (!videos.length) continue;
      const name = (profile?.handle ?? target).replace(/[@/]/g, '');
      save(`${stamp}_${name}.json`, toYouTubeJSON(profile, videos), videos.length, profile?.title ?? target);
    }
  }

  return { savedFiles, totalCount };
}
