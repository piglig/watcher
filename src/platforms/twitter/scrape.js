/**
 * scrape.js — Core programmatic API
 * Extracted from CLI; no dependency on process.argv or global state.
 */

import { resolve } from 'path';
import { existsSync, readFileSync, rmSync } from 'fs';

import {
  createBrowser, setupPage, isLoggedIn,
  waitForLogin, clearSession, sessionExists,
} from '../../shared/browser.js';
import { attachInterceptor }         from './interceptor.js';
import { scrollTab }                 from './scroll.js';
import { buildFilter, buildEarlyStop } from './filter.js';

export function parseUsername(raw) {
  const urlMatch = raw.match(/(?:twitter\.com|x\.com)\/@?([A-Za-z0-9_]+)/);
  if (urlMatch) return urlMatch[1];
  return raw.replace(/^@/, '').trim() || null;
}

function loadProgress(progressFile) {
  if (!progressFile || !existsSync(progressFile)) return new Map();
  try {
    const saved = JSON.parse(readFileSync(progressFile, 'utf-8'));
    const map   = new Map();
    for (const t of saved) map.set(t.id, t);
    console.log(`Resuming from ${map.size} previously saved tweets.`);
    return map;
  } catch {
    return new Map();
  }
}

/**
 * Scrape tweets for a single user using an existing browser context.
 *
 * @param {string} username
 * @param {object} context  - Playwright persistent context
 * @param {object} opts
 * @param {number}  [opts.max=200]
 * @param {boolean} [opts.debug=false]
 * @param {boolean} [opts.noRetweets=false]
 * @param {boolean} [opts.noReplies=false]
 * @param {string}  [opts.since]        - YYYY-MM-DD
 * @param {string}  [opts.until]        - YYYY-MM-DD
 * @param {string}  [opts.keyword]
 * @param {string}  [opts.progressFile] - path for incremental save
 * @returns {Promise<object[]>} tweets sorted newest-first
 */
export async function scrapeUser(username, context, opts = {}) {
  const {
    max = 200,
    debug = false,
    noRetweets = false,
    noReplies = false,
    since = null,
    until = null,
    keyword = null,
    progressFile = null,
  } = opts;

  const profileUrl = `https://x.com/${username}`;

  console.log(`\n${'═'.repeat(52)}`);
  console.log(`  @${username}`);
  console.log(`${'═'.repeat(52)}`);

  const tweetMap = loadProgress(progressFile);

  const state = {
    rateLimitUntil:     0,
    emptyResponseCount: 0,
    sessionExpired:     false,
    schemaWarned:       false,
    dumpedOnce:         false,
  };

  const filterFn   = buildFilter({ since, until, noRetweets, noReplies, keyword });
  const shouldStop = buildEarlyStop({ since });

  const [page1, page2] = await Promise.all([
    setupPage(context),
    setupPage(context),
  ]);

  attachInterceptor(page1, tweetMap, state, { debug });
  attachInterceptor(page2, tweetMap, state, { debug });

  try {
    await page1.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page1.waitForTimeout(3000);

    const bodyText = await page1.evaluate(() => document.body.innerText);
    if (bodyText.includes("This account doesn't exist") || bodyText.includes('Account suspended')) {
      console.error(`[ERROR] @${username} not found or suspended.`);
      return [];
    }

    const scrollOpts = { maxTweets: max, progressFile, shouldStop, debug };
    await Promise.all([
      scrollTab(page1, profileUrl,                   'Tweets',           tweetMap, state, scrollOpts),
      scrollTab(page2, `${profileUrl}/with_replies`, 'Tweets & Replies', tweetMap, state, scrollOpts),
    ]);
  } finally {
    await Promise.all([page1.close(), page2.close()]);
  }

  if (progressFile && existsSync(progressFile)) rmSync(progressFile);

  // Backfill author from the known target username:
  // - Tweets with missing user_results: always backfill
  // - Retweets: the API returns the ORIGINAL author in core.user_results;
  //   override to the target user who performed the retweet action
  for (const tweet of tweetMap.values()) {
    if (!tweet.author?.username || tweet.type === 'retweet') {
      tweet.author = { ...tweet.author, username };
    }
  }

  return Array.from(tweetMap.values())
    .filter(filterFn)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, max);
}

/**
 * Scrape tweets for one or more users.
 * Handles browser lifecycle and session management.
 *
 * @param {string|string[]} usernames
 * @param {object} opts
 * @param {number}  [opts.max=200]
 * @param {boolean} [opts.headed=false]     - show browser (required for first login)
 * @param {boolean} [opts.debug=false]
 * @param {boolean} [opts.noRetweets=false]
 * @param {boolean} [opts.noReplies=false]
 * @param {string}  [opts.since]            - YYYY-MM-DD lower bound
 * @param {string}  [opts.until]            - YYYY-MM-DD upper bound
 * @param {string}  [opts.keyword]
 * @param {string}  [opts.sessionDir]       - default: '.session' relative to cwd
 * @param {boolean} [opts.resetSession]     - clear saved session before starting
 * @returns {Promise<Object.<string, object[]>>} map of username → tweets
 */
export async function scrape(usernames, opts = {}) {
  const names = (Array.isArray(usernames) ? usernames : [usernames])
    .map(parseUsername)
    .filter(Boolean);

  if (!names.length) throw new Error('No valid username provided.');

  const {
    headed       = false,
    debug        = false,
    resetSession = false,
    sessionDir   = resolve('.session-twitter'),
    ...userOpts
  } = opts;

  if (resetSession) clearSession(sessionDir);

  if (!sessionExists(sessionDir) && !headed) {
    throw new Error('No saved session. Call scrape() with headed: true to log in first.');
  }

  const context = await createBrowser(sessionDir, { headless: !headed, debug });

  try {
    const checkPage = await setupPage(context);
    await checkPage.goto('https://x.com', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await checkPage.waitForTimeout(3000);

    const loggedIn = await isLoggedIn(checkPage);
    if (!loggedIn) {
      if (headed) {
        const ok = await waitForLogin(checkPage, names[0]);
        if (!ok) throw new Error('Login timed out.');
        // Re-verify: auto-detect may fire before login actually completes
        const verified = await isLoggedIn(checkPage);
        if (!verified) throw new Error('Login could not be verified. Please complete login and try again.');
        console.log('\nLogin confirmed. Starting scrape...');
      } else {
        throw new Error('Session expired. Run with --headed to re-login.');
      }
    } else {
      console.log('Session active.');
    }
    await checkPage.close();

    const results = {};
    for (const username of names) {
      results[username] = await scrapeUser(username, context, userOpts);
    }
    return results;
  } finally {
    await context.close();
  }
}
