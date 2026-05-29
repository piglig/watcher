/**
 * registry.js — Single source of truth for platform dispatch + metadata.
 *
 * Replaces the runner's per-platform if/else chain and the CLI's per-platform
 * action duplication. Each entry describes how to scrape a platform and how to
 * turn its (heterogeneous) result shape into the uniform on-disk shape.
 *
 * Per-platform contract:
 *   value, label                     — identity + display
 *   needsBrowser, needsApiKey        — capability flags (wizard + parallelism)
 *   targetsLabel, targetsHint        — ScrapeSetup wizard metadata
 *   onProgress  : bool               — runner injects throttled heartbeat as opts.onProgress
 *   cacheMedia  : bool               — run media cache after each save (false: youtube/twitch)
 *   persistEmptyProfile? : bool      — save a profile-only snapshot when items empty (youtube)
 *   parseTarget? : (raw) => string   — mapped over each target before scrape
 *   scrape       : (targets, opts) => Promise<Record<key, value>>
 *   buildOpts    : (config, env) => object   — platform-specific opts merged into base
 *   extract      : (key, value) => { handle, label, profile, items }
 *
 * Imports come straight from the scraper modules (not the index barrels) so the
 * registry never references display-only output symbols.
 */

import { scrape as scrapeTwitter }              from './twitter/scrape.js';
import { generateReport }                       from './twitter/report.js';
import { scrapeTikTok, parseTikTokUser }        from './tiktok/scraper.js';
import { scrapeReddit }                         from './reddit/scraper.js';
import { scrapeArctic }                         from './reddit/arctic.js';
import { scrapeThreads }                        from './threads/scraper.js';
import { scrapePixiv }                          from './pixiv/scraper.js';
import { scrapeNaver }                          from './naver/scraper.js';
import { scrapeYouTube }                        from './youtube/scraper.js';
import { scrapeInstagram, parseInstagramUsername } from './instagram/scraper.js';
import { scrapeTwitch, parseTwitchLogin }       from './twitch/scraper.js';
import { scrapeBluesky, parseBlueskyHandle }    from './bluesky/scraper.js';
import { scrapeFacebook, parseFacebookUsername } from './facebook/scraper.js';
import { pathSafe } from '../shared/paths.js';

export const REGISTRY = {
  twitter: {
    value: 'twitter', label: 'Twitter / X',
    needsBrowser: true, onProgress: true, cacheMedia: true,
    targetsLabel: '用户名', targetsHint: 'username，多个用逗号分隔',
    scrape: scrapeTwitter,
    buildOpts: () => ({}),
    extract: (key, tweets) => ({
      handle: key, label: `@${key}`,
      profile: tweets[0]?.author ? { ...tweets[0].author, platform: 'twitter' } : null,
      items: tweets,
    }),
  },

  tiktok: {
    value: 'tiktok', label: 'TikTok',
    needsBrowser: true, cacheMedia: true,
    targetsLabel: '用户名', targetsHint: '@username，多个用逗号分隔',
    parseTarget: parseTikTokUser,
    scrape: scrapeTikTok,
    buildOpts: () => ({}),
    extract: (key, { profile, videos }) => ({
      handle: key, label: `@${key}`, profile, items: videos,
    }),
  },

  reddit: {
    value: 'reddit', label: 'Reddit',
    needsBrowser: false, cacheMedia: true,
    targetsLabel: '目标', targetsHint: 'r/subreddit 或 u/username，多个用逗号分隔',
    // Source selection lives here so neither runner nor CLI branches on it.
    scrape: (targets, opts) =>
      (opts.redditSource === 'reddit' ? scrapeReddit : scrapeArctic)(targets, opts),
    buildOpts: (c) => ({ redditSource: c.redditSource ?? 'arctic' }),
    extract: (key, items) => ({
      handle: key.replace(/\//g, '_'), label: key, profile: null, items,
    }),
  },

  threads: {
    value: 'threads', label: 'Threads',
    needsBrowser: true, cacheMedia: true,
    targetsLabel: '用户名', targetsHint: '@username，多个用逗号分隔',
    scrape: scrapeThreads,
    buildOpts: () => ({}),
    extract: (key, threads) => ({
      handle: key, label: `@${key}`,
      profile: threads[0]?.author ? { ...threads[0].author, platform: 'threads' } : null,
      items: threads,
    }),
  },

  pixiv: {
    value: 'pixiv', label: 'Pixiv',
    needsBrowser: true, cacheMedia: true,
    targetsLabel: '用户 ID', targetsHint: '数字 ID 或主页 URL，多个用逗号分隔',
    scrape: scrapePixiv,
    buildOpts: () => ({}),
    extract: (key, { artworks }) => ({
      handle: key, label: `Pixiv:${key}`,
      profile: artworks[0]?.author ? { ...artworks[0].author, platform: 'pixiv' } : null,
      items: artworks,
    }),
  },

  naver: {
    value: 'naver', label: 'Naver Café',
    needsBrowser: true, cacheMedia: true,
    targetsLabel: 'Café URL', targetsHint: '完整 URL，多个用逗号分隔',
    scrape: scrapeNaver,
    buildOpts: () => ({}),
    // Write the full cafe object as profile (richer than the old {memberCount};
    // downstream only reads posts, report.js guards profile reads).
    extract: (key, { cafe, posts }) => ({
      handle: pathSafe(cafe?.name ?? key),
      label:  pathSafe(cafe?.name ?? key),
      profile: cafe ?? null, items: posts,
    }),
  },

  youtube: {
    value: 'youtube', label: 'YouTube',
    needsBrowser: false, needsApiKey: true, cacheMedia: false, persistEmptyProfile: true,
    targetsLabel: '频道', targetsHint: '@handle 或频道 URL，多个用逗号分隔',
    scrape: scrapeYouTube,
    buildOpts: (c, env) => ({ apiKey: c.apiKey || env.YOUTUBE_API_KEY }),
    extract: (key, { profile, videos }) => ({
      handle: String(profile?.handle ?? key).replace(/[@/]/g, ''),
      label:  profile?.title ?? key, profile, items: videos,
    }),
  },

  instagram: {
    value: 'instagram', label: 'Instagram',
    needsBrowser: true, onProgress: true, cacheMedia: true,
    targetsLabel: '用户名', targetsHint: '@username，多个用逗号分隔',
    parseTarget: parseInstagramUsername,
    scrape: scrapeInstagram,
    buildOpts: () => ({}),
    extract: (key, { profile, posts }) => ({
      handle: key, label: `@${key}`, profile, items: posts,
    }),
  },

  twitch: {
    value: 'twitch', label: 'Twitch',
    needsBrowser: false, needsApiKey: true, cacheMedia: false,
    targetsLabel: '频道名', targetsHint: '@login 或 twitch.tv/xxx，多个用逗号分隔',
    parseTarget: parseTwitchLogin,
    scrape: scrapeTwitch,
    buildOpts: (c, env) => ({
      clientId:     c.twitchClientId     ?? env.TWITCH_CLIENT_ID,
      clientSecret: c.twitchClientSecret ?? env.TWITCH_CLIENT_SECRET,
    }),
    // items = videos ++ clips (matches the old combined JSON + count).
    extract: (key, { profile, videos, clips }) => ({
      handle: key, label: key, profile,
      items: [...(videos ?? []), ...(clips ?? [])],
    }),
  },

  bluesky: {
    value: 'bluesky', label: 'Bluesky',
    needsBrowser: false, needsApiKey: true, cacheMedia: true,
    targetsLabel: '账号', targetsHint: 'handle（如 user.bsky.social），多个用逗号分隔',
    parseTarget: parseBlueskyHandle,
    scrape: scrapeBluesky,
    buildOpts: (c, env) => ({
      identifier:  c.blueskyIdentifier  ?? env.BLUESKY_IDENTIFIER,
      appPassword: c.blueskyAppPassword ?? env.BLUESKY_APP_PASSWORD,
    }),
    extract: (key, { profile, posts }) => ({
      handle: key, label: `@${key}`, profile, items: posts,
    }),
  },

  facebook: {
    value: 'facebook', label: 'Facebook',
    needsBrowser: true, onProgress: true, cacheMedia: true,
    targetsLabel: '账号', targetsHint: '主页 handle、profile.php?id=... 或完整 URL，多个用逗号分隔',
    parseTarget: parseFacebookUsername,
    scrape: scrapeFacebook,
    buildOpts: () => ({}),
    extract: (key, { profile, posts }) => ({
      handle: key.replace(/[\/?=&]/g, '_'), label: key, profile, items: posts,
    }),
  },
};

/** Stable display/iteration order. */
export const PLATFORM_ORDER = [
  'twitter', 'tiktok', 'reddit', 'threads', 'pixiv', 'naver',
  'youtube', 'instagram', 'twitch', 'bluesky', 'facebook',
];

/** Wizard metadata array (ScrapeSetup consumes label/value/needsBrowser). */
export const PLATFORMS = PLATFORM_ORDER.map(id => REGISTRY[id]);

/** Non-browser platforms — safe to run in parallel (reddit/youtube/twitch/bluesky). */
export const API_PLATFORMS = new Set(
  PLATFORM_ORDER.filter(id => !REGISTRY[id].needsBrowser),
);

export { generateReport };
