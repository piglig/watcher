/**
 * arctic.js — Arctic Shift API client
 * Full Reddit history (2005–present), no credentials required.
 *
 * API base: https://arctic-shift.photon-reddit.com/api
 * Pagination: date-based cursor (before/after Unix epoch seconds)
 * Rate limit: ~2000 req/window tracked via X-RateLimit-Remaining header
 */

import pRetry, { AbortError } from 'p-retry';

const BASE     = 'https://arctic-shift.photon-reddit.com/api';
const UA       = 'nodejs:twitter-scraper:1.0';
const DELAY_MS = 400;  // ~150 req/min — well under observed limit

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── HTTP ─────────────────────────────────────────────────────────────────────

async function arcticFetch(path, params = {}) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }

  return pRetry(async () => {
    const res = await fetch(url.toString(), { headers: { 'User-Agent': UA } });

    // Proactive slow-down when approaching rate limit
    const remaining = parseInt(res.headers.get('x-ratelimit-remaining') ?? '999', 10);
    if (remaining < 20) {
      const reset = parseInt(res.headers.get('x-ratelimit-reset') ?? '10', 10);
      console.warn(`[arctic] rate limit — ${remaining} left, waiting ${reset}s...`);
      await sleep(reset * 1000);
    }

    if (res.status === 429) {
      const wait = parseInt(res.headers.get('retry-after') ?? '60', 10) * 1000;
      console.warn(`[arctic] 429 — waiting ${Math.ceil(wait / 1000)}s...`);
      await sleep(wait);
      throw new Error('arctic: 429 rate-limited');                       // → retry
    }

    if (!res.ok) throw new Error(`Arctic Shift ${res.status} ${res.statusText}: ${path}`);

    const json = await res.json();
    if (json.error) throw new AbortError(`Arctic Shift API: ${json.error}`); // logical fail
    return json.data ?? [];
  }, { retries: 5, factor: 2, minTimeout: 1500, maxTimeout: 60_000 });
}

// ── Parsers — same normalized shape as src/reddit.js ─────────────────────────

function parsePost(raw) {
  return {
    id:         raw.id,
    url:        `https://reddit.com${raw.permalink}`,
    title:      raw.title    ?? '',
    text:       raw.selftext ?? '',
    link_url:   raw.is_self ? null : (raw.url_overridden_by_dest ?? raw.url ?? null),
    created_at: new Date(raw.created_utc * 1000).toISOString(),
    author:     { username: raw.author },
    subreddit:  raw.subreddit,
    metrics: {
      score:    raw.score                ?? 0,
      ratio:    raw.upvote_ratio         ?? null,
      comments: raw.num_comments         ?? 0,
      awards:   raw.total_awards_received ?? 0,
    },
    flair:    raw.link_flair_text ?? null,
    is_nsfw:  raw.over_18         ?? false,
    type:     'post',
    platform: 'reddit',
  };
}

function parseComment(raw) {
  return {
    id:         raw.id,
    url:        `https://reddit.com${raw.permalink}`,
    title:      '',
    text:       raw.body ?? '',
    link_url:   null,
    link_title: '',
    created_at: new Date(raw.created_utc * 1000).toISOString(),
    author:     { username: raw.author },
    subreddit:  raw.subreddit,
    metrics: {
      score:    raw.score                ?? 0,
      ratio:    null,
      comments: 0,
      awards:   raw.total_awards_received ?? 0,
    },
    flair:    null,
    is_nsfw:  false,
    type:     'comment',
    platform: 'reddit',
  };
}

// ── Pagination engine ─────────────────────────────────────────────────────────
//
// Always fetches newest-first (sort=desc).
// `apiParams.after`  = permanent lower-bound epoch (--since)
// `apiParams.before` = initial upper-bound epoch (--until); slides as cursor.

async function fetchListing(path, opts = {}) {
  const {
    max       = 200,
    apiParams = {},
    parse,
    filter    = () => true,
    debug     = false,
    label     = path,
  } = opts;

  const seen   = new Set();
  const items  = [];
  // cursor starts at the --until upper bound (or "now" if absent)
  let cursor   = apiParams.before ?? null;
  let page     = 0;

  // Keep `after` fixed across all pages as the lower bound
  const fixedAfter = apiParams.after ?? null;

  while (items.length < max) {
    page++;
    const qp = {
      limit: Math.min(100, max - items.length + 20),
      sort:  'desc',
    };
    if (fixedAfter) qp.after  = fixedAfter;
    if (cursor)     qp.before = cursor;

    // Spread remaining caller params (subreddit, author, etc.)
    for (const [k, v] of Object.entries(apiParams)) {
      if (k !== 'after' && k !== 'before' && v != null) qp[k] = v;
    }

    if (debug) process.stdout.write(`\n[DBG] arctic ${path} page=${page} cursor=${cursor ?? 'now'}`);

    const batch = await arcticFetch(path, qp);
    if (!batch.length) break;

    for (const raw of batch) {
      if (seen.has(raw.id)) continue;
      seen.add(raw.id);
      const item = parse(raw);
      if (item && filter(item)) items.push(item);
    }

    console.log(`[${label}] ${items.length} items (page ${page})`);

    // Slide cursor to just before the oldest item in this batch
    const lastTs = batch[batch.length - 1].created_utc ?? batch[batch.length - 1].created;
    if (!lastTs) break;
    cursor = lastTs - 1;

    // If the cursor has reached the lower bound, stop
    if (fixedAfter && cursor <= fixedAfter) break;

    await sleep(DELAY_MS);
  }

  return items.slice(0, max);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch subreddit posts from Arctic Shift (full history support).
 *
 * @param {string} subreddit
 * @param {object} opts
 * @param {number}  [opts.max=200]
 * @param {string}  [opts.since]    YYYY-MM-DD lower bound (passed as API `after`)
 * @param {string}  [opts.until]    YYYY-MM-DD upper bound (initial cursor `before`)
 * @param {string}  [opts.keyword]  client-side keyword filter (title + body)
 * @param {boolean} [opts.debug]
 * @returns {Promise<object[]>}
 */
export async function fetchSubredditArctic(subreddit, opts = {}) {
  const { max = 200, since = null, until = null, keyword = null, debug = false } = opts;

  console.log(`\n${'═'.repeat(52)}`);
  console.log(`  r/${subreddit}  [Arctic Shift — full history]`);
  if (since || until) console.log(`  ${since ?? '∞'} → ${until ?? 'now'}`);
  console.log(`${'═'.repeat(52)}`);

  const kw         = keyword ? keyword.toLowerCase() : null;
  const apiParams  = { subreddit };
  if (since) apiParams.after  = Math.floor(new Date(since).getTime() / 1000);
  if (until) apiParams.before = Math.floor(new Date(until).getTime() / 1000);

  return fetchListing('/posts/search', {
    max, debug, label: `r/${subreddit}`,
    apiParams,
    parse: parsePost,
    filter: kw ? item => (item.title + ' ' + item.text).toLowerCase().includes(kw) : () => true,
  });
}

/**
 * Fetch a user's posts and/or comments from Arctic Shift.
 *
 * @param {string} username
 * @param {object} opts
 * @param {boolean} [opts.noPosts=false]
 * @param {boolean} [opts.noComments=false]
 * @param {number}  [opts.max=200]      max total (split evenly between posts and comments)
 * @param {string}  [opts.since]
 * @param {string}  [opts.until]
 * @param {string}  [opts.keyword]
 * @param {boolean} [opts.debug]
 * @returns {Promise<object[]>}  merged and sorted newest-first
 */
export async function fetchUserArctic(username, opts = {}) {
  const {
    noPosts    = false,
    noComments = false,
    max        = 200,
    since      = null,
    until      = null,
    keyword    = null,
    debug      = false,
  } = opts;

  console.log(`\n${'═'.repeat(52)}`);
  console.log(`  u/${username}  [Arctic Shift — full history]`);
  if (since || until) console.log(`  ${since ?? '∞'} → ${until ?? 'now'}`);
  console.log(`${'═'.repeat(52)}`);

  const kw        = keyword ? keyword.toLowerCase() : null;
  const baseParams = { author: username };
  if (since) baseParams.after  = Math.floor(new Date(since).getTime() / 1000);
  if (until) baseParams.before = Math.floor(new Date(until).getTime() / 1000);

  const kwFilter = kw
    ? item => (item.title + ' ' + item.text).toLowerCase().includes(kw)
    : () => true;

  // Split max evenly if fetching both types; each fills up to max independently
  const allItems = [];

  if (!noPosts) {
    console.log('  → Posts...');
    const posts = await fetchListing('/posts/search', {
      max, debug, label: 'posts',
      apiParams: { ...baseParams },
      parse: parsePost,
      filter: kwFilter,
    });
    allItems.push(...posts);
  }

  if (!noComments) {
    if (!noPosts) await sleep(DELAY_MS);
    console.log('  → Comments...');
    const comments = await fetchListing('/comments/search', {
      max, debug, label: 'comments',
      apiParams: { ...baseParams },
      parse: parseComment,
      filter: kwFilter,
    });
    allItems.push(...comments);
  }

  return allItems.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

/**
 * High-level API — scrape one or more Reddit targets via Arctic Shift.
 * Identical signature to scrapeReddit(); swap in without changing callers.
 *
 * Note: `sort` (hot/top/rising) and `timeframe` are not supported —
 * Arctic Shift only indexes by date. Results are always newest-first.
 *
 * @param {string|string[]} targets  'r/subreddit' or 'u/username'
 * @param {object} opts
 * @returns {Promise<Object.<string, object[]>>}
 *
 * @example
 * import { scrapeArctic } from 'twitter-scraper';
 * const { 'r/programming': posts } = await scrapeArctic('r/programming', {
 *   since: '2020-01-01', until: '2023-12-31', max: 1000,
 * });
 */
export async function scrapeArctic(targets, opts = {}) {
  const list    = Array.isArray(targets) ? targets : [targets];
  const results = {};

  for (const target of list) {
    const rMatch = target.match(/^r\/(.+)/i);
    const uMatch = target.match(/^(?:u|user)\/(.+)/i);

    if (rMatch) {
      results[target] = await fetchSubredditArctic(rMatch[1], opts);
    } else if (uMatch) {
      results[target] = await fetchUserArctic(uMatch[1], opts);
    } else {
      console.warn(`[WARN] Unknown target "${target}" — expected r/subreddit or u/username`);
    }

    if (list.indexOf(target) < list.length - 1) await sleep(DELAY_MS);
  }

  return results;
}
