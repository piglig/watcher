/**
 * normalize.js — Read-side helpers for scrape JSON files.
 *
 * Per-platform normalization happens at write time (see shared/post.js). On
 * read we only need to extract the posts array and optionally flatten
 * comment threads (TikTok/YouTube) into top-level entries.
 */

/**
 * Extract the posts array from a scrape JSON file.
 * @param {ScrapeFile} data
 * @returns {Post[]}
 */
export function extractPosts(data) {
  return Array.isArray(data?.posts) ? data.posts : [];
}

/**
 * Extract posts, optionally also flattening comment threads as standalone
 * post entries (used by classifier when comment moderation is enabled).
 *
 * @param {ScrapeFile} data
 * @param {object}  [opts]
 * @param {boolean} [opts.includeComments]
 * @returns {Post[]}
 */
export function normalizePosts(data, { includeComments = false } = {}) {
  const posts = extractPosts(data);
  if (!includeComments) return posts;

  const items = [];
  for (const post of posts) {
    items.push(post);
    for (const c of (post.comments ?? [])) {
      items.push({
        id:               `${post.id}__cmt__${c.id}`,
        platform:         post.platform,
        url:              post.url,
        text:             c.text ?? '',
        author:           c.author,
        created_at:       c.created_at,
        type:             'comment',
        is_authored_text: true,
        media:            [],
        rt_from:          null,
        tags:             [],
        is_r18:           false,
        _is_comment:      true,
        _parent_id:       post.id,
      });
    }
  }
  return items;
}

/**
 * Flat-map normalizePosts across multiple parsed JSON files.
 */
export function mergeAndNormalize(dataArray, opts = {}) {
  return dataArray.flatMap(d => normalizePosts(d, opts));
}
