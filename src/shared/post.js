/**
 * post.js — Canonical Post schema and write-time normalization.
 *
 * Every platform's output.js MUST emit { profile, posts: Post[] } where each
 * Post conforms to this schema. Downstream consumers (classifier, reports,
 * preview) read `data.posts` directly — no per-platform conditionals.
 *
 * @typedef {Object} Post
 * @property {string}      id
 * @property {string}      platform     'twitter'|'tiktok'|'reddit'|'threads'|'pixiv'|
 *                                       'naver_cafe'|'youtube'|'facebook'|'bluesky'|
 *                                       'instagram'|'twitch'
 * @property {string}      url
 * @property {string}      text             Combined title + body, ready for classification.
 * @property {string|null} created_at       ISO 8601.
 * @property {string}      type             Platform sub-type (tweet|retweet|clip|video|...).
 * @property {boolean}     is_authored_text True when `text` is author-composed;
 *                                          false when it's inherited metadata
 *                                          (stream title, video title, artwork name).
 * @property {{id: ?string, username: ?string, name: ?string}} author
 * @property {{type: string, url: string}[]} media
 * @property {{tweet_id?: string, username: string}|null} rt_from
 * @property {string[]}    tags
 * @property {boolean}     is_r18
 *
 * @typedef {Object} ScrapeFile
 * @property {object} profile
 * @property {Post[]} posts
 */

// Post types whose `text` is platform-supplied metadata (stream/video/work
// title) rather than author-authored content.
const TITLE_LIKE_TYPES_BY_PLATFORM = {
  twitch:  new Set(['clip', 'archive', 'highlight', 'upload']),
  youtube: new Set(['video']),
  pixiv:   new Set(['illust', 'manga', 'ugoira']),
};

export function isAuthoredText(platform, type) {
  return !TITLE_LIKE_TYPES_BY_PLATFORM[platform]?.has(type);
}

// ── Per-platform normalizers ──────────────────────────────────────────────────
// Each takes a platform-native raw object and returns the canonical Post
// (minus `is_authored_text`, which is filled by normalizeToPost).

const NORMALIZERS = {
  twitter(p) {
    return {
      ...p,
      platform: 'twitter',
      author: {
        id:       p.author?.id       ?? null,
        username: p.author?.username ?? null,
        name:     p.author?.name     ?? null,
      },
      media: (p.media ?? []).map(m => ({
        type: m.type === 'photo' ? 'photo' : 'video',
        url:  m.url ?? m.preview ?? '',
      })).filter(m => m.url),
      rt_from: p.rt_from ?? null,
      tags:    [],
      is_r18:  false,
    };
  },

  tiktok(p) {
    return {
      ...p,
      platform: 'tiktok',
      text:   p.description ?? p.text ?? '',
      author: {
        id:       p.author?.id       ?? null,
        username: p.author?.username ?? null,
        name:     p.author?.nickname ?? p.author?.name ?? null,
      },
      media:   [],
      type:    p.type ?? 'video',
      rt_from: null,
      tags:    p.hashtags ?? [],
      is_r18:  false,
    };
  },

  reddit(p) {
    return {
      ...p,
      platform: 'reddit',
      text:   [p.title, p.text].filter(Boolean).join('\n'),
      author: {
        id:       null,
        username: p.author?.username ?? null,
        name:     p.author?.username ?? null,
      },
      media:   (p.media ?? []).map(m => ({ type: m.type ?? 'photo', url: m.url })).filter(m => m.url),
      type:    p.type ?? 'post',
      rt_from: null,
      tags:    [],
      is_r18:  p.is_nsfw ?? false,
    };
  },

  threads(p) {
    return {
      ...p,
      platform: 'threads',
      author: {
        id:       null,
        username: p.author?.username ?? null,
        name:     p.author?.name     ?? null,
      },
      media:   (p.media ?? []).map(m => ({ type: m.type, url: m.url })),
      rt_from: null,
      tags:    [],
      is_r18:  false,
    };
  },

  pixiv(p) {
    return {
      ...p,
      platform: 'pixiv',
      text:   [p.title, p.caption, (p.tags ?? []).join(' ')].filter(Boolean).join('\n'),
      author: {
        id:       p.author?.id      ?? null,
        username: p.author?.account ?? p.author?.name ?? null,
        name:     p.author?.name    ?? null,
      },
      media:   [],
      rt_from: null,
      tags:    p.tags    ?? [],
      is_r18:  p.is_r18 ?? false,
    };
  },

  naver_cafe(p) {
    return {
      ...p,
      platform: 'naver_cafe',
      text:   [p.title, p.text].filter(Boolean).join('\n'),
      author: {
        id:       p.author?.id       ?? null,
        username: p.author?.nickname ?? null,
        name:     p.author?.nickname ?? null,
      },
      media:   [],
      rt_from: null,
      tags:    [],
      is_r18:  false,
    };
  },

  twitch(p) {
    return {
      ...p,
      platform: 'twitch',
      text:   [p.title, p.description].filter(Boolean).join('\n'),
      author: {
        id:       p.author?.id       ?? null,
        username: p.author?.username ?? null,
        name:     p.author?.name     ?? null,
      },
      media:   [],
      rt_from: null,
      tags:    [],
      is_r18:  false,
    };
  },

  instagram(p) {
    return {
      ...p,
      platform: 'instagram',
      author: {
        id:       p.author?.id       ?? null,
        username: p.author?.username ?? null,
        name:     p.author?.name     ?? null,
      },
      media:   (p.media ?? []).map(m => ({ type: m.type, url: m.url })),
      rt_from: null,
      tags:    [],
      is_r18:  false,
    };
  },

  facebook(p) {
    return {
      ...p,
      platform: 'facebook',
      author: {
        id:       p.author?.id       ?? null,
        username: p.author?.username ?? null,
        name:     p.author?.name     ?? null,
      },
      media:   (p.media ?? []).map(m => ({
        type: m.type === 'image' ? 'photo' : m.type,
        url:  m.url ?? '',
      })).filter(m => m.url),
      rt_from: null,
      tags:    [],
      is_r18:  false,
    };
  },

  bluesky(p) {
    return {
      ...p,
      platform: 'bluesky',
      author: {
        id:       p.author?.id       ?? null,
        username: p.author?.username ?? null,
        name:     p.author?.name     ?? null,
      },
      media:   (p.media ?? []).map(m => ({
        type: m.type === 'image' ? 'photo' : m.type,
        url:  m.url ?? '',
      })).filter(m => m.url),
      rt_from: p.type === 'repost' && p.repost_by
        ? { username: p.repost_by.username }
        : null,
      tags:    p.tags   ?? [],
      is_r18:  p.is_r18 ?? false,
    };
  },

  youtube(p) {
    return {
      ...p,
      platform: 'youtube',
      text:   [p.title, p.description, p.transcript].filter(Boolean).join('\n'),
      author: {
        id:       p.author?.id       ?? null,
        username: p.author?.username ?? null,
        name:     p.author?.username ?? null,
      },
      media:   [],
      type:    p.type ?? 'video',
      rt_from: null,
      tags:    p.tags ?? [],
      is_r18:  false,
    };
  },
};

/**
 * Normalize a single raw platform object into a canonical Post.
 * @param {object} raw — platform-native shape; must carry `platform` field.
 * @returns {Post}
 */
export function normalizeToPost(raw) {
  const fn = NORMALIZERS[raw?.platform];
  if (!fn) throw new Error(`Unknown platform: ${raw?.platform}`);
  const post = fn(raw);
  post.is_authored_text = isAuthoredText(post.platform, post.type);
  return post;
}

/**
 * Convenience: normalize an array. Throws if any item is missing `platform`.
 * @param {object[]} raws
 * @returns {Post[]}
 */
export function normalizeToPosts(raws) {
  return raws.map(normalizeToPost);
}
