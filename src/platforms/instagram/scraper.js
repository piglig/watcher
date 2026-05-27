/**
 * instagram.js — Instagram scraper
 * Uses CloakBrowser to intercept Instagram's internal GraphQL API responses.
 *
 * First run: headed mode for login (Instagram credentials).
 * Subsequent runs: headless with saved session.
 *
 * Shares the same sessionid cookie domain as Threads — a Threads session
 * also works here, but we keep separate session directories for clarity.
 */

import { resolve }                          from 'path';
import { writeFileSync }                    from 'fs';
import { waitForLoginSignal }               from '../../shared/login-signal.js';
import {
  createBrowser,
  clearSession, sessionExists,
}                                           from '../../shared/browser.js';

const DESKTOP_VIEWPORT = { width: 1280, height: 900 };

// 登录阶段：放行所有资源，确保验证码 / 设备验证图片正常加载
async function setupLoginPage(context) {
  const page = await context.newPage();
  await page.setViewportSize(DESKTOP_VIEWPORT);
  return page;
}

// 抓取阶段：拦截图片 / 媒体资源以节省带宽
async function setupDesktopPage(context) {
  const page = await context.newPage();
  await page.route('**/*', route => {
    const type = route.request().resourceType();
    if (type === 'image' || type === 'media') return route.abort();
    return route.continue();
  });
  await page.setViewportSize(DESKTOP_VIEWPORT);
  return page;
}

export const DEFAULT_SESSION_DIR = resolve('sessions/instagram');

// ── Username parsing ──────────────────────────────────────────────────────────

export function parseInstagramUsername(raw) {
  const urlMatch = raw.match(/instagram\.com\/([A-Za-z0-9_.]+)/);
  if (urlMatch) return urlMatch[1];
  return raw.replace(/^@/, '').trim() || null;
}

// ── Login helpers ─────────────────────────────────────────────────────────────

export async function isLoggedInInstagram(page) {
  try {
    const cookies = await page.context().cookies();
    return cookies.some(c => c.name === 'sessionid');
  } catch {
    return false;
  }
}

async function waitForInstagramLogin(page) {
  console.log('\nNot logged in. Please log in to Instagram in the browser window.');
  console.log('─'.repeat(50));
  console.log('  After login completes → press Enter here to confirm');
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
      if (await isLoggedInInstagram(page)) finish(true);
    }, 1500);

    waitForLoginSignal().then(async () => {
      if (!done && await isLoggedInInstagram(page)) finish(true);
    });

    const timer = setTimeout(() => finish(false), 180_000);
  });
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function extractMedia(node) {
  const media = [];

  // Carousel/sidecar posts
  const sidecar = node.edge_sidecar_to_children?.edges ?? [];
  if (sidecar.length) {
    for (const edge of sidecar) {
      const child = edge.node ?? {};
      if (child.is_video && child.video_url) {
        media.push({ type: 'video', url: child.video_url });
      } else if (child.display_url) {
        media.push({ type: 'image', url: child.display_url });
      }
    }
    return media;
  }

  // Video
  if (node.is_video && node.video_url) {
    media.push({ type: 'video', url: node.video_url });
  }

  // Image thumbnail (display_url is always present)
  const img = node.display_url ?? node.thumbnail_src;
  if (img) media.push({ type: 'image', url: img });

  // Newer API: image_versions2 (same shape as Threads)
  const imgV2 = node.image_versions2?.candidates?.[0];
  if (!media.length && imgV2) media.push({ type: 'image', url: imgV2.url });

  // Newer API: video_versions
  if (!node.is_video && node.video_versions?.length) {
    media.push({ type: 'video', url: node.video_versions[0].url });
  }

  return media;
}

/**
 * Parse an Instagram post node.
 * Handles two formats:
 *   1. GraphQL edge-based  (shortcode + taken_at_timestamp)
 *   2. API v1 format       (pk/id + taken_at, same shape as Threads)
 */
function parsePost(node) {
  if (!node || typeof node !== 'object') return null;

  // Format 1: edge/GraphQL
  if (node.shortcode && (node.taken_at_timestamp != null)) {
    const owner     = node.owner ?? {};
    const username  = owner.username ?? '';
    const captionEdges = node.edge_media_to_caption?.edges ?? [];
    const text      = captionEdges[0]?.node?.text ?? node.accessibility_caption ?? '';
    const likeCount = node.like_count ?? node.edge_media_preview_like?.count ?? 0;
    const commentCount = node.edge_media_to_comment?.count
                      ?? node.edge_media_preview_comment?.count
                      ?? 0;
    const type = node.is_video
      ? (node.product_type === 'clips' ? 'reel' : 'video')
      : (node.edge_sidecar_to_children ? 'carousel' : 'photo');

    return {
      id:         String(node.id ?? node.shortcode),
      url:        `https://www.instagram.com/p/${node.shortcode}/`,
      text,
      created_at: new Date(node.taken_at_timestamp * 1000).toISOString(),
      author: {
        id:        String(owner.id  ?? ''),
        username,
        name:      owner.full_name ?? '',
        followers: owner.edge_followed_by?.count ?? 0,
        verified:  owner.is_verified ?? false,
      },
      metrics: {
        likes:    likeCount,
        comments: commentCount,
        views:    node.video_view_count ?? node.view_count ?? 0,
      },
      media:    extractMedia(node),
      type,
      platform: 'instagram',
    };
  }

  // Format 2: API v1 (pk + taken_at, similar to Threads / Meta internal)
  const pk = node.pk ?? node.id;
  if (pk && (node.taken_at != null)) {
    const user     = node.user ?? {};
    const username = user.username ?? '';
    const code     = node.code ?? node.shortcode ?? null;
    const likeCount    = node.like_count ?? 0;
    const commentCount = node.comment_count ?? 0;
    const type = node.media_type === 2
      ? (node.product_type === 'clips' ? 'reel' : 'video')
      : node.media_type === 8 ? 'carousel'
      : 'photo';

    return {
      id:         String(pk),
      url:        code
                    ? `https://www.instagram.com/p/${code}/`
                    : `https://www.instagram.com/${username}/`,
      text:       node.caption?.text ?? '',
      created_at: new Date(node.taken_at * 1000).toISOString(),
      author: {
        id:        String(user.pk ?? user.id ?? ''),
        username,
        name:      user.full_name ?? '',
        followers: user.follower_count ?? 0,
        verified:  user.is_verified ?? false,
      },
      metrics: {
        likes:    likeCount,
        comments: commentCount,
        views:    node.view_count ?? node.play_count ?? 0,
      },
      media:    extractMedia(node),
      type,
      platform: 'instagram',
    };
  }

  return null;
}

// ── Deep-search for posts in a raw JSON tree ──────────────────────────────────

function findPostsInObj(obj, results, depth = 0, signals = null) {
  if (depth > 30 || !obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (const item of obj) findPostsInObj(item, results, depth + 1, signals);
    return;
  }

  // Pagination signals — only accept when tied to the target user, otherwise
  // a recommended/sidebar user's `page_info` or post `count` could trick us
  // into stopping early. signals.targetUsername must be set (lowercase).
  if (signals?.targetUsername) {
    const isTargetUser =
      obj.username &&
      String(obj.username).toLowerCase() === signals.targetUsername;

    if (isTargetUser) {
      // Capture the target's numeric ID — used by the final author filter to
      // catch posts that arrive without author.username populated.
      if (obj.id)       signals.targetId = String(obj.id);
      else if (obj.pk)  signals.targetId = String(obj.pk);

      // edge_owner_to_timeline_media: GraphQL-shaped user.timeline
      const tl = obj.edge_owner_to_timeline_media;
      if (tl) {
        if (typeof tl.count === 'number')               signals.expectedTotal = tl.count;
        if (tl.page_info?.has_next_page === false)      signals.feedExhausted = true;
      }
      // Newer SSR exposes total as user.media_count
      if (typeof obj.media_count === 'number') {
        signals.expectedTotal = obj.media_count;
      }

      // Profile metadata — accept only positive follower counts (feed/clips
      // API responses include user blobs with follower_count=0 placeholders;
      // the authoritative count comes from web_profile_info SSR).
      const fc = obj.edge_followed_by?.count ?? obj.follower_count;
      if (typeof fc === 'number' && fc > 0) signals.followers = fc;

      if (typeof obj.full_name === 'string' && obj.full_name && !signals.profileName) {
        signals.profileName = obj.full_name;
      }
      if (typeof obj.is_verified === 'boolean') {
        signals.verified = obj.is_verified || signals.verified;
      }
      if (typeof obj.biography === 'string' && !signals.biography) {
        signals.biography = obj.biography;
      }
    }

    // API v1 feed responses: `user` sibling + `more_available` boolean
    if (obj.user?.username &&
        String(obj.user.username).toLowerCase() === signals.targetUsername &&
        obj.more_available === false) {
      signals.feedExhausted = true;
    }
  }

  // Edge-based GraphQL nodes
  if (obj.shortcode && obj.taken_at_timestamp != null) {
    const p = parsePost(obj);
    if (p) { results.push(p); return; }
  }

  // API v1 nodes
  if ((obj.pk || obj.id) && obj.taken_at != null && obj.media_type != null) {
    const p = parsePost(obj);
    if (p) { results.push(p); return; }
  }

  for (const val of Object.values(obj)) findPostsInObj(val, results, depth + 1, signals);
}

async function extractSSRPosts(page, state = null) {
  const scriptTexts = await page.evaluate(() =>
    Array.from(document.querySelectorAll('script[type="application/json"]'))
      .map(s => s.textContent)
  );
  const results = [];
  for (const text of scriptTexts) {
    try { findPostsInObj(JSON.parse(text), results, 0, state); } catch { /* skip malformed */ }
  }
  return results;
}

// ── Interceptor ───────────────────────────────────────────────────────────────

export function attachInstagramInterceptor(page, postMap, state, opts = {}) {
  const { debug = false } = opts;
  const dbg = (...m) => debug && console.log('[DBG]', ...m);

  page.on('response', async response => {
    const url    = response.url();
    const status = response.status();

    if (status === 429) {
      state.rateLimitUntil = Date.now() + 60_000;
      console.warn('[WARN] Rate limit 429 — pausing 60s...');
      return;
    }

    if (debug && url.includes('instagram.com')) {
      const ct = response.headers()['content-type'] ?? '';
      dbg(`[NET] ${status} ${ct.split(';')[0].padEnd(25)} ${url.slice(0, 120)}`);
    }

    if (!url.includes('instagram.com') || status !== 200) return;

    const ct = response.headers()['content-type'] ?? '';
    if (!ct.includes('json')) return;

    try {
      const text = await response.text();
      const json = JSON.parse(text);

      if (debug && !state.dumpedOnce) {
        state.dumpedOnce = true;
        writeFileSync(resolve('debug_instagram_response.json'), JSON.stringify(json, null, 2), 'utf-8');
        dbg(`Raw response dumped → debug_instagram_response.json  (url: ${url.slice(0, 80)})`);
      }

      const found = [];
      findPostsInObj(json, found, 0, state);
      dbg(`XHR parsed → ${found.length} posts  (url: ${url.slice(0, 80)})`);
      for (const p of found) {
        if (!postMap.has(p.id)) postMap.set(p.id, p);
      }
    } catch (e) {
      dbg('XHR parse error:', e.message);
    }
  });
}

// ── Scroll loop ───────────────────────────────────────────────────────────────

async function scrollPage(page, postMap, state, opts = {}) {
  const { max = 200, debug = false, onProgress = null } = opts;
  const dbg = (...m) => debug && console.log('[DBG]', ...m);

  let staleRounds = 0;
  let prevCount   = postMap.size;
  let round       = 0;

  await page.mouse.move(640, 450);

  while (postMap.size < max && staleRounds < 6) {
    round++;

    // Early stop: Instagram signaled feed exhaustion or we reached the user's total post count
    if (state.feedExhausted) {
      console.log(`Instagram: feed exhausted (has_next_page=false). Stopping at ${postMap.size}.`);
      break;
    }
    if (state.expectedTotal && postMap.size >= state.expectedTotal) {
      console.log(`Instagram: reached profile total (${state.expectedTotal}). Stopping.`);
      break;
    }

    const pause = (state.rateLimitUntil ?? 0) - Date.now();
    if (pause > 0) {
      console.warn(`[WARN] Rate limit — waiting ${Math.ceil(pause / 1000)}s...`);
      await page.waitForTimeout(pause);
    }

    const totalHint = state.expectedTotal ? ` / ~${state.expectedTotal}` : '';
    console.log(`Instagram: ${postMap.size}${totalHint} collected (scroll #${round})`);
    if (onProgress) onProgress(postMap.size, state.expectedTotal);

    for (let i = 0; i < 15; i++) {
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(100);
    }

    await page.waitForTimeout(4500);

    if (postMap.size === prevCount) {
      staleRounds++;
      dbg(`Stale round ${staleRounds}`);
      if (staleRounds === 3) {
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
      prevCount   = postMap.size;
    }
  }
}

// ── Per-user scrape ───────────────────────────────────────────────────────────

function buildFilter(opts = {}) {
  const since   = opts.since   ? new Date(opts.since)   : null;
  const until   = opts.until   ? new Date(opts.until)   : null;
  const keyword = opts.keyword ? opts.keyword.toLowerCase() : null;
  const types   = opts.types   ? new Set(opts.types)    : null;

  return function filter(p) {
    if (since || until) {
      const d = new Date(p.created_at);
      if (since && d < since) return false;
      if (until && d > until) return false;
    }
    if (keyword && !p.text.toLowerCase().includes(keyword)) return false;
    if (types && !types.has(p.type)) return false;
    return true;
  };
}

/**
 * Scrape posts for a single user using an existing browser context.
 */
export async function scrapeInstagramUser(username, context, opts = {}) {
  const {
    max         = 1000,
    debug       = false,
    reels       = true,   // also scrape /reels/ tab
    onProgress  = null,
    ...filterOpts
  } = opts;
  const userProgress = onProgress
    ? (count, total) => onProgress(`@${username}: ${count}${total ? ` / ${total}` : ''} 条`)
    : null;

  console.log(`\n${'═'.repeat(52)}`);
  console.log(`  @${username}  [Instagram]`);
  console.log(`${'═'.repeat(52)}`);

  const postMap = new Map();
  const state   = {
    rateLimitUntil: 0,
    dumpedOnce:     false,
    feedExhausted:  false,
    expectedTotal:  null,
    targetUsername: String(username).toLowerCase(),  // consumed by findPostsInObj
    targetId:       null,
    followers:      null,
    profileName:    null,
    verified:       false,
    biography:      null,
  };
  const filterFn = buildFilter(filterOpts);
  const page    = await setupDesktopPage(context);

  attachInstagramInterceptor(page, postMap, state, { debug });

  try {
    await page.goto(`https://www.instagram.com/${username}/`, {
      waitUntil: 'domcontentloaded', timeout: 60_000,
    });
    await page.waitForTimeout(3000);

    const bodyText = await page.evaluate(() => document.body.innerText ?? '');
    if (
      bodyText.toLowerCase().includes("sorry, this page isn't available") ||
      bodyText.toLowerCase().includes('page not found')
    ) {
      console.error(`[ERROR] @${username} not found or private.`);
      return { profile: null, posts: [] };
    }

    // Extract initial batch from SSR-embedded script blocks
    const ssrPosts = await extractSSRPosts(page, state);
    for (const p of ssrPosts) {
      if (!postMap.has(p.id)) postMap.set(p.id, p);
    }
    const totalHint = state.expectedTotal ? ` (profile has ${state.expectedTotal} total)` : '';
    console.log(`Instagram: ${postMap.size} posts from SSR${totalHint}`);

    await scrollPage(page, postMap, state, { max, debug, onProgress: userProgress });

    // Reels feed has its own pagination — reset exhaustion flag before scraping it
    if (reels && postMap.size < max && (!state.expectedTotal || postMap.size < state.expectedTotal)) {
      state.feedExhausted = false;
      await page.goto(`https://www.instagram.com/${username}/reels/`, {
        waitUntil: 'domcontentloaded', timeout: 60_000,
      });
      await page.waitForTimeout(3000);

      const reelSSR = await extractSSRPosts(page, state);
      for (const p of reelSSR) {
        if (!postMap.has(p.id)) postMap.set(p.id, p);
      }

      await scrollPage(page, postMap, state, { max, debug, onProgress: userProgress });
    }
  } finally {
    await page.close();
  }

  // Filter to the target user: SSR + XHR responses can include
  // recommendation/explore posts from unrelated accounts. Two signals:
  //   1) state.targetId — captured from SSR's user object (authoritative).
  //   2) majority-vote on author.id among posts where author.username matches —
  //      backup when SSR didn't expose the user id for some reason.
  const targetUsername = String(username).toLowerCase();
  let targetId = state.targetId ?? null;
  if (!targetId) {
    const counts = new Map();
    for (const p of postMap.values()) {
      if (p.author?.username?.toLowerCase() === targetUsername) {
        const id = p.author?.id;
        if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    targetId = counts.size
      ? [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
      : null;
  }

  const ownedByTarget = (p) =>
    p.author?.username?.toLowerCase() === targetUsername ||
    (targetId && String(p.author?.id) === String(targetId));

  const posts = Array.from(postMap.values())
    .filter(ownedByTarget)
    .filter(filterFn)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, max);

  // If SSR/XHR never surfaced a real follower count, fetch web_profile_info
  // explicitly. This endpoint is hit by Instagram's own desktop UI and returns
  // edge_followed_by.count even when the feed/clips API responses omit it.
  if (!state.followers) {
    try {
      const info = await page.evaluate(async (uname) => {
        const r = await fetch(
          `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(uname)}`,
          { headers: { 'x-ig-app-id': '936619743392459' }, credentials: 'include' },
        );
        if (!r.ok) return null;
        return r.json();
      }, username);
      const u = info?.data?.user;
      if (u) {
        if (typeof u.edge_followed_by?.count === 'number' && u.edge_followed_by.count > 0) {
          state.followers = u.edge_followed_by.count;
        }
        if (!state.profileName && u.full_name) state.profileName = u.full_name;
        if (typeof u.is_verified === 'boolean')  state.verified    = u.is_verified || state.verified;
        if (!state.targetId && (u.id || u.pk)) state.targetId    = String(u.id ?? u.pk);
        if (!state.biography && u.biography)   state.biography   = u.biography;
      }
    } catch { /* best-effort */ }
  }

  const first   = posts[0];
  const profile = (first || state.followers || state.profileName)
    ? {
        username,
        name:      state.profileName     ?? first?.author?.name      ?? '',
        id:        state.targetId        ?? first?.author?.id        ?? '',
        followers: state.followers       ?? first?.author?.followers ?? 0,
        verified:  state.verified        ?? first?.author?.verified  ?? false,
        biography: state.biography       ?? '',
        platform:  'instagram',
      }
    : null;

  return { profile, posts };
}

/**
 * Scrape Instagram posts for one or more users.
 * Handles browser lifecycle and session management.
 *
 * @example
 * import { scrapeInstagram } from 'sns-audit';
 * const results = await scrapeInstagram('natgeo', { headed: true });
 * const { profile, posts } = results['natgeo'];
 */
export async function scrapeInstagram(usernames, opts = {}) {
  const names = (Array.isArray(usernames) ? usernames : [usernames])
    .map(parseInstagramUsername)
    .filter(Boolean);

  if (!names.length) throw new Error('No valid Instagram username provided.');

  const {
    headed       = false,
    debug        = false,
    resetSession = false,
    sessionDir   = DEFAULT_SESSION_DIR,
    ...userOpts
  } = opts;

  if (resetSession) clearSession(sessionDir);

  if (!sessionExists(sessionDir) && !headed) {
    throw new Error('No saved session. Call scrapeInstagram() with headed: true to log in first.');
  }

  const context = await createBrowser(sessionDir, {
    headless: !headed,
    viewport: DESKTOP_VIEWPORT,
  });

  try {
    // 登录检查必须用无拦截页面，否则验证码 / 设备验证图片无法加载
    const checkPage = await setupLoginPage(context);
    await checkPage.goto('https://www.instagram.com', {
      waitUntil: 'domcontentloaded', timeout: 60_000,
    });
    await checkPage.waitForTimeout(3000);

    const loggedIn = await isLoggedInInstagram(checkPage);
    if (!loggedIn) {
      if (headed) {
        const ok = await waitForInstagramLogin(checkPage);
        if (!ok) throw new Error('Login timed out.');
        console.log('\nLogin confirmed. Starting scrape...');
      } else {
        await context.close();
        throw new Error('Session expired. Call scrapeInstagram() with headed: true to re-login.');
      }
    } else {
      console.log('Session active.');
    }
    await checkPage.close();

    const results = {};
    for (const username of names) {
      results[username] = await scrapeInstagramUser(username, context, userOpts);
    }
    return results;
  } finally {
    await context.close();
  }
}
