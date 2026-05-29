/**
 * scrape-output.js — The single serializer for every platform's scrape file.
 *
 * Every platform writes the same on-disk shape, consumed by the classifier and
 * workflow report layers:
 *
 *   { profile?, posts: Post[] }
 *
 * The `profile` key is omitted when falsy (reddit has no profile; threads/pixiv
 * only carry one when the first item had an author). Downstream readers take
 * `data.posts` and guard `data.profile` with optional access, so present-or-
 * absent is safe.
 */

import { normalizeToPosts } from '../shared/post.js';

/**
 * @param {object|null} profile  platform profile snapshot, or null/undefined
 * @param {object[]}     items    platform-native items (normalizeToPost infers platform per item)
 * @returns {string} pretty-printed JSON
 */
export function scrapeToJSON(profile, items) {
  return JSON.stringify(
    { ...(profile ? { profile } : {}), posts: normalizeToPosts(items ?? []) },
    null,
    2,
  );
}
