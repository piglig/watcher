/**
 * scroll.js — P1
 * Scroll loop for a single Tab.
 * Supports: rate-limit backoff, stale nudge, network-idle wait,
 *           incremental save, P0 session-expiry bail-out, P2 early-stop.
 */

import { extractFromDOM } from './extract.js';
import { writeFileSync }  from 'fs';

/**
 * Scroll a single Twitter tab and collect tweets into tweetMap.
 *
 * @param {object} page          - Playwright page (interceptor already attached)
 * @param {string} tabUrl        - URL to navigate to
 * @param {string} label         - Display label, e.g. "Tweets" or "Tweets & Replies"
 * @param {Map}    tweetMap      - Shared tweet store (id → tweet)
 * @param {object} state         - Shared interceptor state { rateLimitUntil, sessionExpired }
 * @param {object} opts
 * @param {number}   opts.maxTweets    - Stop when tweetMap reaches this size
 * @param {string}   [opts.progressFile] - Path to write incremental progress JSON
 * @param {Function} [opts.shouldStop]   - Early-stop predicate from filter.js
 * @param {boolean}  [opts.debug]
 */
export async function scrollTab(page, tabUrl, label, tweetMap, state, opts = {}) {
  const { maxTweets = 200, progressFile = null, shouldStop = () => false, debug = false } = opts;
  const dbg = (...m) => debug && console.log('[DBG]', ...m);

  console.log(`\n[${label}] → ${tabUrl}`);
  await page.goto(tabUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(2000);

  // Wait for first article
  try {
    await page.waitForSelector('article[data-testid="tweet"]', { timeout: 20_000 });
  } catch {
    console.warn(`[${label}] No tweet articles after 20s — skipping.`);
    return;
  }

  let staleRounds = 0;
  let prevCount   = tweetMap.size;
  let round       = 0;

  while (tweetMap.size < maxTweets && staleRounds < 5) {
    round++;

    // P0: bail if session expired mid-scrape
    if (state.sessionExpired) {
      console.error('\n[ERROR] Session expired during scrape. Re-run with --headed to re-login.');
      break;
    }

    // P1: respect rate-limit pause
    const pause = (state.rateLimitUntil ?? 0) - Date.now();
    if (pause > 0) {
      console.warn(`[WARN] Rate limit — waiting ${Math.ceil(pause / 1000)}s...`);
      await page.waitForTimeout(pause);
    }

    // DOM fallback sweep
    const domTweets = await extractFromDOM(page);
    dbg(`[${label}] DOM articles: ${domTweets.length}`);
    for (const t of domTweets) {
      if (!tweetMap.has(t.id)) tweetMap.set(t.id, t);
    }

    console.log(`[${label}] ${tweetMap.size} tweets (scroll #${round})`);

    // P2: early stop — all visible tweets are older than --since
    if (shouldStop(domTweets)) {
      console.log(`\n  [${label}] All tweets older than --since cutoff. Stopping early.`);
      break;
    }

    // Incremental save (P1 resume support)
    if (progressFile && tweetMap.size > prevCount) {
      const snapshot = Array.from(tweetMap.values())
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      writeFileSync(progressFile, JSON.stringify(snapshot, null, 2), 'utf-8');
      dbg(`Progress saved (${tweetMap.size})`);
    }

    // Scroll
    await page.evaluate(() =>
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
    );

    // Dynamic wait: network idle up to 6s
    await Promise.race([
      page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {}),
      page.waitForTimeout(6000),
    ]);

    // Stale detection
    if (tweetMap.size === prevCount) {
      staleRounds++;
      if (staleRounds === 2) {
        // Nudge: scroll up a bit then back down to trigger lazy loading
        dbg(`[${label}] Nudging scroll...`);
        await page.evaluate(() => window.scrollBy(0, -400));
        await page.waitForTimeout(500);
        await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight }));
        await page.waitForTimeout(1000);
      }
    } else {
      staleRounds = 0;
      prevCount   = tweetMap.size;
    }

    const endOfLine = await page.evaluate(() =>
      document.body.innerText.includes("You've reached the end")
    );
    if (endOfLine) {
      console.log(`\n  [${label}] Reached end of timeline.`);
      break;
    }
  }

}
