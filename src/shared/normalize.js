/**
 * normalize.js — Cross-platform post normalization
 *
 * Converts any platform's scraped post into a canonical shape so the
 * classifier and aggregation logic work without per-platform conditionals.
 *
 * Canonical post schema:
 * {
 *   id:         string
 *   platform:   'twitter'|'tiktok'|'reddit'|'threads'|'pixiv'|'naver_cafe'|'youtube'
 *   url:        string
 *   text:       string          — full text ready for classification
 *   created_at: string|null     — ISO 8601
 *   author:     { id, username, name }
 *   media:      [{ type: 'photo'|'video', url: string }]
 *   type:       string          — post type within platform
 *   rt_from:    { tweet_id, username }|null
 *   tags:       string[]
 *   is_r18:     boolean
 *   // all original platform-specific fields are spread/preserved
 * }
 */

// ── Per-platform normalizers ──────────────────────────────────────────────────

const NORMALIZERS = {
  twitter(p) {
    return {
      ...p,
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
      text:   p.description ?? p.text ?? '',
      author: {
        id:       p.author?.id       ?? null,
        username: p.author?.username ?? null,
        name:     p.author?.nickname ?? p.author?.name ?? null,
      },
      media:   p.thumbnail ? [{ type: 'photo', url: p.thumbnail }] : [],
      type:    p.type ?? 'video',
      rt_from: null,
      tags:    p.hashtags ?? [],
      is_r18:  false,
    };
  },

  reddit(p) {
    return {
      ...p,
      text:   [p.title, p.text].filter(Boolean).join('\n'),
      author: {
        id:       null,
        username: p.author?.username ?? null,
        name:     p.author?.username ?? null,
      },
      media:   [],
      type:    p.type ?? 'post',
      rt_from: null,
      tags:    [],
      is_r18:  p.is_nsfw ?? false,
    };
  },

  threads(p) {
    return {
      ...p,
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
      text:   [p.title, p.caption, (p.tags ?? []).join(' ')].filter(Boolean).join('\n'),
      author: {
        id:       p.author?.id      ?? null,
        username: p.author?.account ?? p.author?.name ?? null,
        name:     p.author?.name    ?? null,
      },
      // Pixiv full-res images require auth; use empty media for classification
      media:   [],
      rt_from: null,
      tags:    p.tags    ?? [],
      is_r18:  p.is_r18 ?? false,
    };
  },

  naver_cafe(p) {
    return {
      ...p,
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

  youtube(p) {
    return {
      ...p,
      text:   [p.title, p.description, p.transcript].filter(Boolean).join('\n'),
      author: {
        id:       p.author?.id       ?? null,
        username: p.author?.username ?? null,
        name:     p.author?.username ?? null,
      },
      media:   p.thumbnail ? [{ type: 'photo', url: p.thumbnail }] : [],
      type:    'video',
      rt_from: null,
      tags:    p.tags ?? [],
      is_r18:  false,
    };
  },
};

/**
 * Normalize a single post to the canonical schema.
 * Unknown platforms are returned as-is.
 */
export function normalizePost(post) {
  const fn = NORMALIZERS[post?.platform];
  return fn ? fn(post) : post;
}

// ── Format extraction ─────────────────────────────────────────────────────────

/**
 * Extract a flat post array from any platform's saved JSON format:
 *   - Twitter:  { profile, tweets }
 *   - TikTok:   { profile, videos }
 *   - YouTube:  { profile, videos }
 *   - Naver:    { memberCount, posts }
 *   - Reddit:   [...posts]   (direct array)
 *   - Threads:  [...threads] (direct array)
 *   - Pixiv:    [...artworks](direct array)
 */
export function extractPosts(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];

  if (Array.isArray(data.tweets))   return data.tweets;
  if (Array.isArray(data.videos))   return data.videos;
  if (Array.isArray(data.posts))    return data.posts;
  if (Array.isArray(data.artworks)) return data.artworks;
  if (Array.isArray(data.items))    return data.items;

  return [];
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Extract and normalize all posts from a platform's JSON output.
 *
 * @param {any}    data                      — parsed JSON from a scraper output file
 * @param {object} [opts]
 * @param {boolean}[opts.includeComments]    — also flatten TikTok/YouTube comment threads
 * @returns {object[]} normalized post array
 */
export function normalizePosts(data, { includeComments = false } = {}) {
  const posts = extractPosts(data).map(normalizePost);

  if (!includeComments) return posts;

  const items = [];
  for (const post of posts) {
    items.push(post);
    for (const c of (post.comments ?? [])) {
      items.push(normalizePost({
        id:          `${post.id}__cmt__${c.id}`,
        platform:    post.platform,
        url:         post.url,
        text:        c.text ?? '',
        author:      c.author,
        created_at:  c.created_at,
        type:        'comment',
        _is_comment: true,
        _parent_id:  post.id,
      }));
    }
  }
  return items;
}

/**
 * Load and normalize posts from one or more already-parsed JSON objects.
 * Useful when merging output from multiple files.
 */
export function mergeAndNormalize(dataArray, opts = {}) {
  return dataArray.flatMap(d => normalizePosts(d, opts));
}
