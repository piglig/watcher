/**
 * threads.js 鈥?Threads scraper
 * Uses CloakBrowser to intercept Threads' internal GraphQL API responses.
 *
 * First run: headed mode for login (Instagram/Threads credentials).
 * Subsequent runs: headless with saved session.
 */

import { resolve }                          from 'path';
import { writeFileSync }                    from 'fs';
import { createInterface }                  from 'readline';
import {
  createBrowser,
  clearSession, sessionExists,
}                                           from '../../shared/browser.js';

const DESKTOP_VIEWPORT = { width: 1280, height: 900 };

async function setupDesktopPage(context) {
  // Do NOT use shared setupPage 鈥?it blocks stylesheets/fonts which breaks Threads rendering.
  const page = await context.newPage();
  await page.route('**/*', route => {
    const type = route.request().resourceType();
    if (type === 'image' || type === 'media') return route.abort();
    return route.continue();
  });
  await page.setViewportSize(DESKTOP_VIEWPORT);
  return page;
}

export const DEFAULT_SESSION_DIR = resolve('.session-threads');

// 鈹€鈹€ Username parsing 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

export function parseThreadsUsername(raw) {
  const urlMatch = raw.match(/threads\.(?:net|com)\/@?([A-Za-z0-9_.]+)/);
  if (urlMatch) return urlMatch[1];
  return raw.replace(/^@/, '').trim() || null;
}

// 鈹€鈹€ Login helpers 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

export async function isLoggedInThreads(page) {
  try {
    // sessionid is set by Instagram/Meta auth 鈥?present iff the user is logged in.
    const cookies = await page.context().cookies();
    return cookies.some(c => c.name === 'sessionid');
  } catch {
    return false;
  }
}

async function waitForThreadsLogin(page) {
  console.log('\nNot logged in. Please log in to Threads in the browser window.');
  console.log('鈹€'.repeat(50));
  console.log('  After login completes 鈫?press Enter here to confirm');
  console.log('鈹€'.repeat(50));

  return new Promise(resolve => {
    let done = false;

    const finish = result => {
      if (done) return;
      done = true;
      clearInterval(poll);
      clearTimeout(timer);
      resolve(result);
    };

    // Auto-detect: poll every 1.5s
    const poll = setInterval(async () => {
      if (done) return;
      if (await isLoggedInThreads(page)) finish(true);
    }, 1500);

    // Manual confirm: user presses Enter 鈥?then verify login actually happened
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question('', async () => {
      rl.close();
      if (done) return;
      const ok = await isLoggedInThreads(page);
      if (!ok) {
        console.log('\n  Not logged in yet 鈥?still waiting (press Enter again after login)...');
        const rl2 = createInterface({ input: process.stdin, output: process.stdout });
        rl2.question('', async () => {
          rl2.close();
          finish(await isLoggedInThreads(page));
        });
        return;
      }
      finish(true);
    });

    // Hard timeout at 3 minutes
    const timer = setTimeout(() => finish(false), 180_000);
  });
}

// 鈹€鈹€ Parsers 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

function extractMedia(post) {
  const media = [];
  const img = post.image_versions2?.candidates?.[0];
  if (img) media.push({ type: 'image', url: img.url });
  if (post.video_versions?.length) {
    media.push({ type: 'video', url: post.video_versions[0].url });
  }
  for (const item of post.carousel_media ?? []) {
    const ci = item.image_versions2?.candidates?.[0];
    if (ci) media.push({ type: 'image', url: ci.url });
  }
  return media;
}

function parsePost(post) {
  if (!post) return null;

  const pk = post.pk ?? post.id;
  if (!pk) return null;

  const user     = post.user ?? {};
  const username = user.username ?? '';
  const takenAt  = post.taken_at ?? post.device_timestamp;
  if (!takenAt) return null;

  const textInfo  = post.text_post_app_info ?? {};
  const isReply   = !!(textInfo.is_reply  ?? post.is_reply  ?? false);
  const isRepost  = !!(textInfo.is_repost ?? post.is_repost ?? false);
  const code      = post.code ?? null;

  return {
    id:         String(pk),
    url:        code
                  ? `https://www.threads.com/@${username}/post/${code}`
                  : `https://www.threads.com/@${username}`,
    text:       post.caption?.text ?? post.text ?? '',
    created_at: new Date(takenAt * 1000).toISOString(),
    author: {
      username,
      name:      user.full_name     ?? '',
      followers: user.follower_count ?? 0,
      verified:  user.is_verified   ?? false,
    },
    metrics: {
      likes:   post.like_count   ?? 0,
      replies: post.reply_count  ?? 0,
      reposts: post.repost_count ?? 0,
      views:   post.view_count   ?? 0,
    },
    media:      extractMedia(post),
    is_reply:   isReply,
    is_repost:  isRepost,
    type:       'thread',
    platform:   'threads',
  };
}

// 鈹€鈹€ SSR + GraphQL extraction 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

function findPostsInObj(obj, results, depth = 0) {
  if (depth > 25 || !obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (const item of obj) findPostsInObj(item, results, depth + 1);
    return;
  }
  // Heuristic: Instagram/Threads post objects always have pk/id + taken_at
  if ((obj.pk || obj.id) && (obj.taken_at || obj.device_timestamp)) {
    const post = parsePost(obj);
    if (post) results.push(post);
    return;
  }
  for (const val of Object.values(obj)) findPostsInObj(val, results, depth + 1);
}

async function extractSSRPosts(page) {
  const scriptTexts = await page.evaluate(() =>
    Array.from(document.querySelectorAll('script[type="application/json"]'))
      .map(s => s.textContent)
  );
  const results = [];
  for (const text of scriptTexts) {
    try { findPostsInObj(JSON.parse(text), results); } catch { /* skip malformed */ }
  }
  return results;
}

// 鈹€鈹€ Interceptor 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

export function attachThreadsInterceptor(page, threadMap, state, opts = {}) {
  const { debug = false } = opts;
  const dbg = (...m) => debug && console.log('[DBG]', ...m);

  page.on('response', async response => {
    const url    = response.url();
    const status = response.status();

    if (status === 429) {
      state.rateLimitUntil = Date.now() + 60_000;
      process.stdout.write('\n[RATE LIMIT] Pausing 60s...\n');
      return;
    }

    if (debug && (url.includes('threads.com') || url.includes('threads.net') || url.includes('instagram.com'))) {
      const ct = response.headers()['content-type'] ?? '';
      dbg(`[NET] ${status} ${ct.split(';')[0].padEnd(25)} ${url.slice(0, 120)}`);
    }

    // threads.net redirects to threads.com; API calls go to threads.com/graphql/query
    const isCandidate =
      url.includes('threads.com') ||
      url.includes('threads.net') ||
      url.includes('instagram.com');
    if (!isCandidate || status !== 200) return;

    const ct = response.headers()['content-type'] ?? '';
    if (!ct.includes('json')) return;

    try {
      const text = await response.text();
      const json = JSON.parse(text);

      if (debug && !state.dumpedOnce) {
        state.dumpedOnce = true;
        writeFileSync(resolve('debug_threads_response.json'), JSON.stringify(json, null, 2), 'utf-8');
        dbg(`Raw response dumped 鈫?debug_threads_response.json  (url: ${url.slice(0, 80)})`);
      }

      const found = [];
      findPostsInObj(json, found);
      dbg(`XHR parsed 鈫?${found.length} threads  (url: ${url.slice(0, 80)})`);
      for (const t of found) {
        if (!threadMap.has(t.id)) threadMap.set(t.id, t);
      }
    } catch (e) {
      dbg('XHR parse error:', e.message);
    }
  });
}

// 鈹€鈹€ Scroll loop 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

async function scrollPage(page, threadMap, state, opts = {}) {
  const { max = 200, debug = false } = opts;
  const dbg = (...m) => debug && console.log('[DBG]', ...m);

  let staleRounds = 0;
  let prevCount   = threadMap.size;
  let round       = 0;

  // Position mouse over the feed area so WheelEvents land on the right element
  await page.mouse.move(640, 450);

  while (threadMap.size < max && staleRounds < 6) {
    round++;

    const pause = (state.rateLimitUntil ?? 0) - Date.now();
    if (pause > 0) {
      process.stdout.write(`\n  Rate limit 鈥?waiting ${Math.ceil(pause / 1000)}s...\n`);
      await page.waitForTimeout(pause);
    }

    process.stdout.write(`\r  ${threadMap.size} threads (scroll #${round})...`);

    // Simulate real mouse wheel 鈥?fires WheelEvent which React/IntersectionObserver
    // listens to. window.scrollTo() bypasses this and doesn't trigger infinite scroll.
    for (let i = 0; i < 15; i++) {
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(100);
    }

    // Wait for GraphQL response + React re-render
    await page.waitForTimeout(4500);

    if (threadMap.size === prevCount) {
      staleRounds++;
      dbg(`Stale round ${staleRounds}`);
      if (staleRounds === 3) {
        // Scroll back up to re-enter the IntersectionObserver trigger zone, then down
        for (let i = 0; i < 6; i++) {
          await page.mouse.wheel(0, -500);
          await page.waitForTimeout(100);
        }
        await page.waitForTimeout(800);
        for (let i = 0; i < 15; i++) {
          await page.mouse.wheel(0, 600);
          await page.waitForTimeout(100);
        }
        await page.waitForTimeout(4500);
      }
    } else {
      staleRounds = 0;
      prevCount   = threadMap.size;
    }
  }

  process.stdout.write('\n');
}

// 鈹€鈹€ Per-user scrape 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

function buildFilter(opts = {}) {
  const since   = opts.since   ? new Date(opts.since)   : null;
  const until   = opts.until   ? new Date(opts.until)   : null;
  const keyword = opts.keyword ? opts.keyword.toLowerCase() : null;

  return function filter(t) {
    if (since || until) {
      const d = new Date(t.created_at);
      if (since && d < since) return false;
      if (until && d > until) return false;
    }
    if (opts.noReplies && t.is_reply)  return false;
    if (opts.noReposts && t.is_repost) return false;
    if (keyword && !t.text.toLowerCase().includes(keyword)) return false;
    return true;
  };
}

/**
 * Scrape threads for a single user using an existing browser context.
 */
export async function scrapeThreadsUser(username, context, opts = {}) {
  const { max = 1000, debug = false, ...filterOpts } = opts;

  console.log(`\n${'═'.repeat(52)}`);
  console.log(`  @${username}  [Threads]`);
  console.log(`${'═'.repeat(52)}`);

  const threadMap = new Map();
  const state     = { rateLimitUntil: 0, dumpedOnce: false };
  const filterFn  = buildFilter(filterOpts);
  const page      = await setupDesktopPage(context);

  attachThreadsInterceptor(page, threadMap, state, { debug });

  try {
    await page.goto(`https://www.threads.com/@${username}`, {
      waitUntil: 'domcontentloaded', timeout: 60_000,
    });
    await page.waitForTimeout(3000);

    const bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.toLowerCase().includes("this page isn't available") ||
        bodyText.toLowerCase().includes('page not found')) {
      console.error(`[ERROR] @${username} not found or private.`);
      return [];
    }

    // Extract initial batch from SSR-embedded script blocks
    const ssrPosts = await extractSSRPosts(page);
    for (const t of ssrPosts) {
      if (!threadMap.has(t.id)) threadMap.set(t.id, t);
    }

    await scrollPage(page, threadMap, state, { max, debug });

    // Scrape the Replies tab unless the caller explicitly excludes replies
    if (!filterOpts.noReplies && threadMap.size < max) {
      await page.goto(`https://www.threads.com/@${username}/replies`, {
        waitUntil: 'domcontentloaded', timeout: 60_000,
      });
      await page.waitForTimeout(3000);

      const repliesSSR = await extractSSRPosts(page);
      for (const t of repliesSSR) {
        if (!threadMap.has(t.id)) threadMap.set(t.id, t);
      }

      await scrollPage(page, threadMap, state, { max, debug });
    }
  } finally {
    await page.close();
  }

  return Array.from(threadMap.values())
    .filter(filterFn)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, max);
}

/**
 * Scrape threads for one or more users.
 * Handles browser lifecycle and session management.
 *
 * @example
 * import { scrapeThreads } from 'twitter-scraper';
 * const { zuck } = await scrapeThreads('zuck', { headed: true });
 */
export async function scrapeThreads(usernames, opts = {}) {
  const names = (Array.isArray(usernames) ? usernames : [usernames])
    .map(parseThreadsUsername)
    .filter(Boolean);

  if (!names.length) throw new Error('No valid Threads username provided.');

  const {
    headed       = false,
    debug        = false,
    resetSession = false,
    sessionDir   = DEFAULT_SESSION_DIR,
    ...userOpts
  } = opts;

  if (resetSession) clearSession(sessionDir);

  if (!sessionExists(sessionDir) && !headed) {
    throw new Error('No saved session. Call scrapeThreads() with headed: true to log in first.');
  }

  const context = await createBrowser(sessionDir, {
    headless: !headed,
    viewport: DESKTOP_VIEWPORT,
  });

  try {
    const checkPage = await setupDesktopPage(context);
    await checkPage.goto('https://www.threads.com', {
      waitUntil: 'domcontentloaded', timeout: 60_000,
    });
    await checkPage.waitForTimeout(3000);

    const loggedIn = await isLoggedInThreads(checkPage);
    if (!loggedIn) {
      if (headed) {
        const ok = await waitForThreadsLogin(checkPage);
        if (!ok) throw new Error('Login timed out.');
        console.log('\nLogin confirmed. Starting scrape...');
      } else {
        await context.close();
        throw new Error('Session expired. Call scrapeThreads() with headed: true to re-login.');
      }
    } else {
      console.log('Session active.');
    }
    await checkPage.close();

    const results = {};
    for (const username of names) {
      results[username] = await scrapeThreadsUser(username, context, userOpts);
    }
    return results;
  } finally {
    await context.close();
  }
}
