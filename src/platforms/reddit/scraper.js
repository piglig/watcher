/**
 * reddit.js — Reddit JSON API client
 *
 * Uses Reddit's public listing API — no credentials required for public data.
 * Rate limit: ~60 requests/min without auth (we stay well under with DELAY_MS).
 *
 * Supports:
 *   - Subreddit posts  (r/subreddit)
 *   - User posts + comments  (u/username)
 */

import pRetry from 'p-retry';

const BASE       = 'https://www.reddit.com';
const USER_AGENT = 'nodejs:twitter-scraper:1.0 (open-source scraper)';
const DELAY_MS   = 750;   // ~80 req/min — safely below the 60/min public limit

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── HTTP ─────────────────────────────────────────────────────────────────────

async function redditFetch(path, params = {}) {
  const url = new URL(BASE + path);
  url.searchParams.set('raw_json', '1');
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }

  return pRetry(async () => {
    const res = await fetch(url.toString(), { headers: { 'User-Agent': USER_AGENT } });

    if (res.status === 429) {
      const wait = parseInt(res.headers.get('retry-after') ?? '60', 10) * 1000;
      console.warn(`[reddit] 429 — waiting ${Math.ceil(wait / 1000)}s...`);
      await sleep(wait);
      throw new Error('reddit: 429 rate-limited');                       // → retry
    }

    if (res.status === 404) return null;                                  // terminal success

    if (!res.ok) throw new Error(`Reddit API ${res.status} ${res.statusText}: ${path}`);

    return res.json();
  }, { retries: 5, factor: 2, minTimeout: 2000, maxTimeout: 60_000 });
}

// ── Parsers ───────────────────────────────────────────────────────────────────

const MIME_EXT = { 'image/jpg': 'jpg', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif' };

function extractPostMedia(d) {
  const out = [];

  // Gallery posts: reconstruct unsigned i.redd.it URLs from metadata.
  // (media_metadata.s.u is a signed preview.redd.it link that expires in ~1-2h.)
  if (d.is_gallery && d.media_metadata) {
    for (const m of Object.values(d.media_metadata)) {
      const ext = MIME_EXT[m?.m];
      if (m?.id && ext) out.push({ type: 'photo', url: `https://i.redd.it/${m.id}.${ext}` });
    }
    return out;
  }

  // Direct image post: d.url points at i.redd.it / i.imgur.com
  if (d.post_hint === 'image' && d.url) {
    out.push({ type: 'photo', url: d.url });
  }

  // preview.redd.it URLs are HMAC-signed and expire in 1-2h — skipping; by the
  // time the classify batch runs, OpenAI can't fetch them, so they'd just burn
  // ~85 tokens per dead image without contributing signal.
  return out;
}

function parsePost(child) {
  if (child.kind !== 't3') return null;
  const d = child.data;
  return {
    id:         d.id,
    url:        `https://reddit.com${d.permalink}`,
    title:      d.title ?? '',
    text:       d.selftext ?? '',
    link_url:   d.is_self ? null : d.url,
    media:      extractPostMedia(d),
    created_at: new Date(d.created_utc * 1000).toISOString(),
    author:     { username: d.author },
    subreddit:  d.subreddit,
    metrics: {
      score:    d.score          ?? 0,
      ratio:    d.upvote_ratio   ?? null,
      comments: d.num_comments   ?? 0,
      awards:   d.total_awards_received ?? 0,
    },
    flair:    d.link_flair_text ?? null,
    is_nsfw:  d.over_18         ?? false,
    type:     'post',
    platform: 'reddit',
  };
}

function parseComment(child) {
  if (child.kind !== 't1') return null;
  const d = child.data;
  return {
    id:         d.id,
    url:        `https://reddit.com${d.permalink}`,
    title:      '',
    text:       d.body       ?? '',
    link_url:   d.link_url   ?? null,
    link_title: d.link_title ?? '',
    created_at: new Date(d.created_utc * 1000).toISOString(),
    author:     { username: d.author },
    subreddit:  d.subreddit,
    metrics: {
      score:    d.score ?? 0,
      ratio:    null,
      comments: 0,
      awards:   d.total_awards_received ?? 0,
    },
    flair:    null,
    is_nsfw:  false,
    type:     'comment',
    platform: 'reddit',
  };
}

// ── Pagination engine ─────────────────────────────────────────────────────────

async function fetchListing(path, opts = {}) {
  const {
    max       = 200,
    params    = {},
    parse     = parsePost,
    filter    = () => true,
    earlyStop = () => false,
    debug     = false,
    label     = path,
  } = opts;

  const items = [];
  let   after = null;
  let   page  = 0;

  while (items.length < max) {
    page++;
    const qp = { limit: Math.min(100, max - items.length + 20), ...params };
    if (after) qp.after = after;

    if (debug) process.stdout.write(`\n[DBG] ${path} page=${page} after=${after ?? 'start'}`);

    const json = await redditFetch(path, qp);
    if (!json) break;

    const children = json?.data?.children ?? [];
    if (!children.length) break;

    const batch = [];
    for (const child of children) {
      if (child.kind === 'more') continue;
      const item = parse(child);
      if (!item) continue;
      batch.push(item);
      if (filter(item)) items.push(item);
    }

    console.log(`[${label}] ${items.length} items (page ${page})`);

    if (earlyStop(batch)) {
      console.log(`\n  [${label}] Date cutoff reached — stopping early.`);
      break;
    }

    after = json?.data?.after;
    if (!after) break;
    if (items.length >= max) break;

    await sleep(DELAY_MS);
  }

  return items.slice(0, max);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch posts from a subreddit.
 *
 * @param {string} subreddit
 * @param {object} opts
 * @param {string}  [opts.sort='hot']      - hot | new | top | rising | best | controversial
 * @param {string}  [opts.timeframe='all'] - hour | day | week | month | year | all
 * @param {number}  [opts.max=200]
 * @param {string}  [opts.since]           - YYYY-MM-DD lower bound
 * @param {string}  [opts.until]           - YYYY-MM-DD upper bound
 * @param {string}  [opts.keyword]         - case-insensitive keyword filter
 * @param {boolean} [opts.debug=false]
 * @returns {Promise<object[]>}
 */
export async function fetchSubreddit(subreddit, opts = {}) {
  const {
    sort      = 'hot',
    timeframe = 'all',
    max       = 200,
    since     = null,
    until     = null,
    keyword   = null,
    debug     = false,
  } = opts;

  console.log(`\n${'═'.repeat(52)}`);
  console.log(`  r/${subreddit}  [sort: ${sort}${['top','controversial'].includes(sort) ? ` / ${timeframe}` : ''}]`);
  console.log(`${'═'.repeat(52)}`);

  const sinceDate = since   ? new Date(since)           : null;
  const untilDate = until   ? new Date(until)           : null;
  const kw        = keyword ? keyword.toLowerCase()     : null;
  const params    = ['top', 'controversial'].includes(sort) ? { t: timeframe } : {};

  return fetchListing(`/r/${subreddit}/${sort}.json`, {
    max, debug, params, parse: parsePost, label: `r/${subreddit}`,
    filter(item) {
      const d = new Date(item.created_at);
      if (sinceDate && d < sinceDate) return false;
      if (untilDate && d > untilDate) return false;
      if (kw && !(item.title + ' ' + item.text).toLowerCase().includes(kw)) return false;
      return true;
    },
    earlyStop(batch) {
      if (!sinceDate) return false;
      return batch.length > 0 && batch.every(t => new Date(t.created_at) < sinceDate);
    },
  });
}

/**
 * Fetch a user's posts and/or comments.
 *
 * @param {string} username
 * @param {object} opts
 * @param {boolean} [opts.noPosts=false]
 * @param {boolean} [opts.noComments=false]
 * @param {string}  [opts.sort='new']      - new | hot | top | controversial
 * @param {string}  [opts.timeframe='all']
 * @param {number}  [opts.max=200]         - max total items (split between posts and comments)
 * @param {string}  [opts.since]
 * @param {string}  [opts.until]
 * @param {string}  [opts.keyword]
 * @param {boolean} [opts.debug=false]
 * @returns {Promise<object[]>} posts and comments merged, sorted newest-first
 */
export async function fetchUser(username, opts = {}) {
  const {
    noPosts    = false,
    noComments = false,
    sort       = 'new',
    timeframe  = 'all',
    max        = 200,
    since      = null,
    until      = null,
    keyword    = null,
    debug      = false,
  } = opts;

  console.log(`\n${'═'.repeat(52)}`);
  console.log(`  u/${username}`);
  console.log(`${'═'.repeat(52)}`);

  const sinceDate = since   ? new Date(since)       : null;
  const untilDate = until   ? new Date(until)       : null;
  const kw        = keyword ? keyword.toLowerCase() : null;
  const params    = { sort, t: timeframe };

  function makeFilter() {
    return function filter(item) {
      const d = new Date(item.created_at);
      if (sinceDate && d < sinceDate) return false;
      if (untilDate && d > untilDate) return false;
      if (kw && !(item.title + ' ' + item.text).toLowerCase().includes(kw)) return false;
      return true;
    };
  }

  function earlyStop(batch) {
    if (!sinceDate) return false;
    return batch.length > 0 && batch.every(t => new Date(t.created_at) < sinceDate);
  }

  const allItems = [];

  if (!noPosts) {
    console.log('  → Posts...');
    const posts = await fetchListing(`/user/${username}/submitted.json`, {
      max, debug, params, parse: parsePost, label: 'posts',
      filter: makeFilter(), earlyStop,
    });
    allItems.push(...posts);
  }

  if (!noComments) {
    if (!noPosts) await sleep(DELAY_MS);
    console.log('  → Comments...');
    const comments = await fetchListing(`/user/${username}/comments.json`, {
      max, debug, params, parse: parseComment, label: 'comments',
      filter: makeFilter(), earlyStop,
    });
    allItems.push(...comments);
  }

  return allItems.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

/**
 * High-level API — scrape one or more Reddit targets.
 *
 * @param {string|string[]} targets  - e.g. 'r/programming', 'u/spez'
 * @param {object} opts              - options passed to fetchSubreddit / fetchUser
 * @returns {Promise<Object.<string, object[]>>}  target → items
 *
 * @example
 * import { scrapeReddit } from 'twitter-scraper';
 * const { 'r/programming': posts } = await scrapeReddit('r/programming', { sort: 'top', timeframe: 'week', max: 50 });
 */
export async function scrapeReddit(targets, opts = {}) {
  const list    = Array.isArray(targets) ? targets : [targets];
  const results = {};

  for (const target of list) {
    const rMatch = target.match(/^r\/(.+)/i);
    const uMatch = target.match(/^(?:u|user)\/(.+)/i);

    if (rMatch) {
      results[target] = await fetchSubreddit(rMatch[1], opts);
    } else if (uMatch) {
      results[target] = await fetchUser(uMatch[1], opts);
    } else {
      console.warn(`[WARN] Unrecognised target "${target}" — expected r/subreddit or u/username`);
    }

    // Polite delay between multiple targets
    if (list.indexOf(target) < list.length - 1) await sleep(DELAY_MS);
  }

  return results;
}
