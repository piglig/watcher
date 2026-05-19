/**
 * pixiv.js —Pixiv scraper
 * Uses CloakBrowser for login, then calls Pixiv's internal AJAX API directly
 * via page.evaluate() (browser cookies are forwarded automatically).
 *
 * First run: headed mode for login.
 * Subsequent runs: headless with saved session.
 *
 * R18 / R18-G content requires the account's content settings to allow them.
 */

import { resolve }             from 'path';
import { waitForLoginSignal }   from '../../shared/login-signal.js';
import {
  createBrowser,
  clearSession, sessionExists,
}                              from '../../shared/browser.js';

export const DEFAULT_SESSION_DIR = resolve('sessions/pixiv');

const BATCH_SIZE  = 10;  // concurrent /ajax/illust/{id} requests per round
const BATCH_DELAY = 400; // ms between rounds

const delay = ms => new Promise(r => setTimeout(r, ms));

async function setupPage(context) {
  const page = await context.newPage();
  await page.route('**/*', route => {
    const t = route.request().resourceType();
    if (t === 'image' || t === 'media') return route.abort();
    return route.continue();
  });
  return page;
}

// All API calls are made from within the browser context so cookies are included.
async function pixivGet(page, url) {
  const result = await page.evaluate(async (u) => {
    try {
      const res  = await fetch(u, { credentials: 'include' });
      const json = await res.json();
      return { ok: true, data: json };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, url);

  if (!result.ok)          throw new Error(`Fetch failed: ${result.error}`);
  if (result.data.error)   throw new Error(`Pixiv API: ${result.data.message ?? url}`);
  return result.data.body;
}

// ── Username / ID parsing ─────────────────────────────────────────────────────

export function parsePixivUser(raw) {
  // Full URL: https://www.pixiv.net/en/users/1234567
  const urlMatch = raw.match(/pixiv\.net\/(?:en\/)?users?\/(\d+)/i);
  if (urlMatch) return urlMatch[1];
  // Raw numeric ID
  if (/^\d+$/.test(raw.trim())) return raw.trim();
  return null;
}

// ── Login helpers ─────────────────────────────────────────────────────────────

export async function isLoggedInPixiv(page) {
  try {
    const ok = await page.evaluate(async () => {
      try {
        const res  = await fetch('/ajax/user/extra?lang=en', { credentials: 'include' });
        const json = await res.json();
        return !json.error && !!json.body;
      } catch { return false; }
    });
    return ok;
  } catch {
    return false;
  }
}

async function waitForPixivLogin(page) {
  console.log('\nNot logged in. Please log in to Pixiv in the browser window.');
  console.log('─'.repeat(50));
  console.log('  After login completes →press Enter here to confirm');
  console.log('─'.repeat(50));

  return new Promise(resolve => {
    let done = false;
    const finish = result => {
      if (done) return;
      done = true;
      clearInterval(poll);
      clearTimeout(timer);
      resolve(result);
    };

    const poll = setInterval(async () => {
      if (done) return;
      if (await isLoggedInPixiv(page)) finish(true);
    }, 1500);

    waitForLoginSignal().then(async () => {
      if (!done && await isLoggedInPixiv(page)) finish(true);
    });

    const timer = setTimeout(() => finish(false), 180_000);
  });
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function parseWork(work) {
  if (!work?.id) return null;

  const xRestrict = work.xRestrict ?? 0;

  // /ajax/illust/{id} returns tags as [{tag, romaji, ...}]; normalise to strings.
  const rawTags = work.tags?.tags ?? work.tags ?? [];
  const tags    = rawTags.map(t => (typeof t === 'string' ? t : t.tag)).filter(Boolean);

  // description may contain HTML spans
  const caption = (work.description ?? '').replace(/<[^>]+>/g, '');

  return {
    id:         String(work.id),
    url:        `https://www.pixiv.net/artworks/${work.id}`,
    title:      work.title      ?? '',
    caption,
    created_at: work.createDate ? new Date(work.createDate).toISOString() : null,
    author: {
      id:      String(work.userId      ?? ''),
      name:    work.userName           ?? '',
      account: work.userAccount        ?? '',
    },
    metrics: {
      bookmarks: work.bookmarkCount ?? 0,
      views:     work.viewCount     ?? 0,
      likes:     work.likeCount     ?? 0,
      comments:  work.commentCount  ?? 0,
    },
    tags,
    // illustType: 0=illust, 1=manga, 2=ugoira
    type:       ['illust', 'manga', 'ugoira'][work.illustType ?? 0] ?? 'illust',
    page_count: work.pageCount  ?? 1,
    // xRestrict: 0=safe, 1=R18, 2=R18-G
    is_r18:     xRestrict >= 1,
    is_r18g:    xRestrict >= 2,
    x_restrict: xRestrict,
    platform:   'pixiv',
  };
}

function buildFilter(opts = {}) {
  const since   = opts.since   ? new Date(opts.since)   : null;
  const until   = opts.until   ? new Date(opts.until)   : null;
  const keyword = opts.keyword ? opts.keyword.toLowerCase() : null;

  return function filter(w) {
    if (since || until) {
      const d = new Date(w.created_at);
      if (since && d < since) return false;
      if (until && d > until) return false;
    }
    if (opts.noR18   &&  w.is_r18)  return false;
    if (opts.onlyR18 && !w.is_r18)  return false;
    if (keyword) {
      const haystack = `${w.title} ${w.caption} ${w.tags.join(' ')}`.toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  };
}

// ── Per-user scrape ───────────────────────────────────────────────────────────

/**
 * Scrape artworks for a single Pixiv user.
 *
 * @param {string} userId  - numeric Pixiv user ID
 * @param {object} page    - Playwright page (already on pixiv.net)
 * @param {object} opts
 * @param {number}  [opts.max=1000]
 * @param {boolean} [opts.debug=false]
 * @param {boolean} [opts.noR18=false]
 * @param {boolean} [opts.onlyR18=false]
 * @param {string}  [opts.since]
 * @param {string}  [opts.until]
 * @param {string}  [opts.keyword]
 * @returns {Promise<object[]>}
 */
export async function scrapePixivUser(userId, page, opts = {}) {
  const { max = 1000, debug = false, ...filterOpts } = opts;
  const dbg = (...m) => debug && console.log('[DBG]', ...m);

  console.log(`\n${'═'.repeat(52)}`);
  console.log(`  User ${userId}  [Pixiv]`);
  console.log(`${'═'.repeat(52)}`);

  // Navigate to the user's profile to establish the correct API context.
  await page.goto(`https://www.pixiv.net/en/users/${userId}`, {
    waitUntil: 'domcontentloaded', timeout: 60_000,
  });
  await page.waitForTimeout(2000);

  // Fetch user info
  let userInfo;
  try {
    userInfo = await pixivGet(page, `https://www.pixiv.net/ajax/user/${userId}?lang=en`);
  } catch (e) {
    console.error(`[ERROR] User ${userId} not found or inaccessible: ${e.message}`);
    return [];
  }
  console.log(`  ${userInfo.name ?? ''} (@${userInfo.account ?? userId})`);

  // Fetch all artwork IDs from profile
  let allIds;
  try {
    const profile = await pixivGet(page, `https://www.pixiv.net/ajax/user/${userId}/profile/all?lang=en`);
    allIds = [
      ...Object.keys(profile.illusts ?? {}),
      ...Object.keys(profile.manga   ?? {}),
    ];
  } catch (e) {
    console.error(`[ERROR] Could not fetch artwork list: ${e.message}`);
    return [];
  }
  console.log(`  ${allIds.length} artworks found`);

  if (!allIds.length) return [];

  // Fetch full artwork details (stats, tags, etc.) from /ajax/illust/{id}.
  // The profile/illusts batch endpoint omits bookmarkCount/viewCount/likeCount.
  const artworks = [];
  const limit    = Math.min(allIds.length, max);

  for (let i = 0; i < limit; i += BATCH_SIZE) {
    const batch = allIds.slice(i, Math.min(i + BATCH_SIZE, limit));
    console.log(`Fetching artworks: ${Math.min(i + batch.length, limit)}/${limit}`);

    // Fetch BATCH_SIZE artworks concurrently inside the browser context
    const works = await page.evaluate(async (ids) => {
      const settled = await Promise.allSettled(
        ids.map(id =>
          fetch(`/ajax/illust/${id}?lang=en`, { credentials: 'include' })
            .then(r => r.json())
            .then(j => (!j.error && j.body) ? j.body : null)
            .catch(() => null)
        )
      );
      return settled.map(r => (r.status === 'fulfilled' ? r.value : null)).filter(Boolean);
    }, batch);

    for (const work of works) {
      const parsed = parseWork(work);
      if (parsed) artworks.push(parsed);
    }

    if (i + BATCH_SIZE < limit) await delay(BATCH_DELAY);
  }

  return artworks
    .filter(buildFilter(filterOpts))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, max);
}

/**
 * Scrape artworks for one or more Pixiv users.
 *
 * @example
 * import { scrapePixiv } from 'twitter-scraper';
 * const { '1234567': works } = await scrapePixiv('1234567', { headed: true });
 */
export async function scrapePixiv(targets, opts = {}) {
  const ids = (Array.isArray(targets) ? targets : [targets])
    .map(parsePixivUser)
    .filter(Boolean);

  if (!ids.length) throw new Error('No valid Pixiv user ID provided.');

  const {
    headed       = false,
    debug        = false,
    resetSession = false,
    sessionDir   = DEFAULT_SESSION_DIR,
    ...userOpts
  } = opts;

  if (resetSession) clearSession(sessionDir);

  if (!sessionExists(sessionDir) && !headed) {
    throw new Error('No saved session. Call scrapePixiv() with headed: true to log in first.');
  }

  const context = await createBrowser(sessionDir, { headless: !headed });

  try {
    // Login check / login flow: no resource blocking so CAPTCHA renders correctly.
    const loginPage = await context.newPage();
    await loginPage.goto('https://www.pixiv.net', {
      waitUntil: 'domcontentloaded', timeout: 60_000,
    });
    await loginPage.waitForTimeout(2000);

    const loggedIn = await isLoggedInPixiv(loginPage);
    if (!loggedIn) {
      if (headed) {
        const ok = await waitForPixivLogin(loginPage);
        if (!ok) throw new Error('Login timed out.');
        console.log('\nLogin confirmed. Starting scrape...');
      } else {
        await context.close();
        throw new Error('Session expired. Call scrapePixiv() with headed: true to re-login.');
      }
    } else {
      console.log('Session active.');
    }
    await loginPage.close();

    // Scraping page: block images/media since we only need API responses.
    const page = await setupPage(context);

    const results = {};
    for (const userId of ids) {
      results[userId] = await scrapePixivUser(userId, page, { debug, ...userOpts });
    }
    return results;
  } finally {
    await context.close();
  }
}
