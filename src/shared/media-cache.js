/**
 * media-cache.js — Download every image referenced by a scrape file to local
 * disk so it can be base64-embedded into the classifier's batch requests.
 *
 * Why: image CDN URLs (Instagram `scontent-*`, TikTok, Facebook) are signed
 * with short-lived tokens. By the time OpenAI's Batch API processes a request
 * — which may be hours after submission — the URL is dead and the request
 * silently fails into the batch's error_file. Caching locally at scrape time
 * (when the URL is still fresh) decouples classification from the upstream
 * CDN entirely.
 *
 * Idempotent: existing local files are reused; only missing media is fetched.
 *
 * Layout:   <scrape-file-dir>/media/<post-id>_<idx>.jpg
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'fs';
import { dirname, join, resolve, isAbsolute } from 'path';
import sharp from 'sharp';
import pLimit from 'p-limit';

// Only cache things we'd send to a vision model. Videos and audio are out of
// scope — the classifier never inlines them.
const IMAGE_TYPES = new Set(['photo', 'image']);

/**
 * @param {string} filePath  scrape JSON path
 * @param {object} [opts]
 * @param {number} [opts.maxEdge=768]      resize longest edge (px)
 * @param {number} [opts.quality=75]       JPEG quality
 * @param {number} [opts.concurrency=6]    parallel fetches
 * @param {number} [opts.maxPerPost=2]     cap images per post (matches what the
 *                                          classifier eventually sends)
 * @param {number} [opts.timeoutMs=15000]  per-fetch timeout
 * @param {(line:string)=>void} [opts.onLog]
 * @returns {Promise<{downloaded:number, skipped:number, failed:number}>}
 */
export async function cacheMediaInScrapeFile(filePath, opts = {}) {
  const {
    maxEdge     = 768,
    quality     = 75,
    concurrency = 6,
    maxPerPost  = 2,
    timeoutMs   = 15000,
    onLog       = () => {},
  } = opts;

  const raw  = readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data.posts) || !data.posts.length) {
    return { downloaded: 0, skipped: 0, failed: 0 };
  }

  // Identify work upfront. If nothing to do, leave the file untouched so we
  // don't churn timestamps or risk rewriting on read failures elsewhere.
  const work = [];
  // Absolute path so the classifier can locate cached files regardless of the
  // process cwd (workflow daemons and the TUI run from different roots).
  const mediaDir = resolve(join(dirname(filePath), 'media'));

  for (const post of data.posts) {
    if (!Array.isArray(post.media)) continue;
    const safeId = String(post.id ?? '').replace(/[^\w.-]/g, '_');
    if (!safeId) continue;
    for (let i = 0; i < post.media.length && i < maxPerPost; i++) {
      const m = post.media[i];
      if (!m?.url) continue;
      if (m.type && !IMAGE_TYPES.has(m.type)) continue;
      work.push({ post, idx: i, m, safeId });
    }
  }
  if (!work.length) return { downloaded: 0, skipped: 0, failed: 0 };

  mkdirSync(mediaDir, { recursive: true });
  const limit = pLimit(concurrency);

  let downloaded = 0, skipped = 0, failed = 0;
  let normalized = 0;   // entries whose stored local_path was rewritten to absolute

  await Promise.all(work.map(({ m, idx, safeId }) => limit(async () => {
    const local = join(mediaDir, `${safeId}_${idx}.jpg`);

    // Re-use prior caches: either local_path already populated and present, or
    // a sibling file on disk that we can adopt. Always normalize to absolute
    // so downstream readers don't depend on cwd.
    if (m.local_path && existsSync(m.local_path) && statSync(m.local_path).size > 0) {
      if (!isAbsolute(m.local_path)) { m.local_path = resolve(m.local_path); normalized++; }
      skipped++;
      return;
    }
    if (existsSync(local) && statSync(local).size > 0) {
      m.local_path = local;
      skipped++;
      return;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(m.url, {
        redirect: 'follow',
        signal:   ctrl.signal,
        // Some CDNs (Instagram, FB) drop requests with no UA / suspicious UA.
        headers:  { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const out = await sharp(buf)
        .rotate()                           // honor EXIF orientation
        .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();
      writeFileSync(local, out);
      m.local_path = local;
      downloaded++;
    } catch (e) {
      failed++;
      onLog(`[media-cache] ${safeId}#${idx}: ${e.message ?? e}`);
    } finally {
      clearTimeout(timer);
    }
  })));

  // Rewrite the file when we either fetched something new or normalized a
  // previously-stored relative path to absolute. "All skipped and already
  // absolute" is a true no-op.
  if (downloaded > 0 || normalized > 0) {
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }
  return { downloaded, skipped, failed };
}
