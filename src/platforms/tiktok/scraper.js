/**
 * tiktok.js — TikTok scraper
 * Profile info from SSR, videos via response interception + scroll,
 * comments via per-video page navigation.
 */

import { resolve }           from 'path';
import { createInterface }   from 'readline';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { launchPersistentContext } from 'cloakbrowser';

export const DEFAULT_SESSION_DIR = resolve('.session-tiktok');

const NAV_DELAY          = 3000;
const SCROLL_ROUNDS      = 8;    // wheel events per scroll burst
const SCROLL_DELAY       = 600;  // ms between bursts
const COMMENT_LIMIT      = 50;   // comments per video (one page)
const COMMENT_CONCURRENCY = 3;   // parallel comment pages

const delay = ms => new Promise(r => setTimeout(r, ms));

// ── Input parsing ─────────────────────────────────────────────────────────────

export function parseTikTokUser(raw) {
  if (typeof raw !== 'string') return null;
  raw = raw.trim();
  const urlMatch = raw.match(/tiktok\.com\/@?([A-Za-z0-9._]+)/);
  if (urlMatch) return { username: urlMatch[1] };
  const handleMatch = raw.match(/^@?([A-Za-z0-9._]+)$/);
  if (handleMatch) return { username: handleMatch[1] };
  return null;
}

// ── Browser helpers ───────────────────────────────────────────────────────────

function sessionExists(dir) {
  return existsSync(resolve(dir, 'Default'));
}

async function createBrowser(sessionDir, headless) {
  mkdirSync(sessionDir, { recursive: true });
  return launchPersistentContext({ userDataDir: sessionDir, headless, humanize: true });
}

// Scraping page: block images/media but keep scripts for TikTok's JS engine
async function setupPage(context) {
  const page = await context.newPage();
  await page.route('**/*', route => {
    const t = route.request().resourceType();
    if (t === 'image' || t === 'media' || t === 'font') return route.abort();
    return route.continue();
  });
  return page;
}

// Comment page: allow more resources so the video player/comments initialise
async function setupCommentPage(context) {
  const page = await context.newPage();
  await page.route('**/*', route => {
    const t = route.request().resourceType();
    if (t === 'font') return route.abort();
    return route.continue();
  });
  return page;
}

// ── Login ─────────────────────────────────────────────────────────────────────

export async function isLoggedInTikTok(page) {
  try {
    const cookies = await page.context().cookies();
    return cookies.some(c => c.name === 'sessionid' && c.value);
  } catch { return false; }
}

async function waitForLogin(page) {
  console.log('\nNot logged in. Please log in to TikTok in the browser window.');
  console.log('─'.repeat(50));
  console.log('  After login completes → press Enter here to confirm');
  console.log('─'.repeat(50));

  return Promise.race([
    (async () => {
      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline) {
        await delay(2000);
        if (await isLoggedInTikTok(page)) return true;
      }
      return false;
    })(),
    new Promise(res => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      rl.question('', async () => {
        rl.close();
        res(await isLoggedInTikTok(page));
      });
    }),
  ]);
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function extractUserFromSSR(ssrData) {
  try {
    const scope = ssrData?.['__DEFAULT_SCOPE__'];
    const info  =
      scope?.['webapp.user-detail']?.userInfo ??
      scope?.['seo.abtest']?.userInfo ??
      null;
    if (!info?.user) return null;

    const u = info.user;
    const s = info.stats ?? {};
    return {
      id:          u.id         ?? '',
      username:    u.uniqueId   ?? '',
      nickname:    u.nickname   ?? '',
      bio:         u.signature  ?? '',
      verified:    u.verified   ?? false,
      private:     u.privateAccount ?? false,
      followers:   s.followerCount  ?? 0,
      following:   s.followingCount ?? 0,
      total_likes: s.heart          ?? s.heartCount ?? 0,
      video_count: s.videoCount     ?? 0,
      platform:    'tiktok',
    };
  } catch { return null; }
}

function parseVideo(item) {
  if (!item?.id) return null;
  const s = item.stats ?? item.statsV2 ?? {};
  const a = item.author ?? {};
  const m = item.music  ?? {};

  const hashtags = (item.textExtra ?? [])
    .filter(t => t.hashtagName)
    .map(t => t.hashtagName);

  const v = item.video ?? {};
  return {
    id:           item.id,
    url:          `https://www.tiktok.com/@${a.uniqueId}/video/${item.id}`,
    thumbnail:    v.originCover ?? v.cover ?? '',
    download_url: v.playAddr ?? v.downloadAddr ?? '',
    description: item.desc ?? '',
    created_at:  item.createTime
      ? new Date(item.createTime * 1000).toISOString()
      : null,
    author: {
      id:       a.id       ?? '',
      username: a.uniqueId ?? '',
      nickname: a.nickname ?? '',
      verified: a.verified ?? false,
    },
    metrics: {
      views:     Number(s.playCount    ?? 0),
      likes:     Number(s.diggCount    ?? 0),
      comments:  Number(s.commentCount ?? 0),
      shares:    Number(s.shareCount   ?? 0),
      bookmarks: Number(s.collectCount ?? 0),
    },
    music: {
      id:     m.id         ?? '',
      title:  m.title      ?? '',
      author: m.authorName ?? '',
    },
    hashtags,
    platform: 'tiktok',
  };
}

function parseComment(c, videoId) {
  if (!c?.cid) return null;
  const u = c.user ?? {};
  return {
    id:           c.cid,
    video_id:     videoId,
    text:         c.text ?? '',
    created_at:   c.create_time
      ? new Date(c.create_time * 1000).toISOString()
      : null,
    author: {
      id:       u.uid       ?? '',
      username: u.unique_id ?? '',
      nickname: u.nickname  ?? '',
    },
    metrics: {
      likes:   c.digg_count          ?? 0,
      replies: c.reply_comment_total ?? 0,
    },
    author_reply: null,   // filled in by fetchAuthorReplies if replies exist
    platform: 'tiktok',
  };
}

function parseReply(r) {
  if (!r?.cid) return null;
  const u = r.user ?? {};
  return {
    id:         r.cid,
    text:       r.text ?? '',
    created_at: r.create_time
      ? new Date(r.create_time * 1000).toISOString()
      : null,
    author: {
      id:       u.uid       ?? '',
      username: u.unique_id ?? '',
      nickname: u.nickname  ?? '',
    },
  };
}

function buildFilter(opts = {}) {
  const since   = opts.since   ? new Date(opts.since)   : null;
  const until   = opts.until   ? new Date(opts.until)   : null;
  const keyword = opts.keyword ? opts.keyword.toLowerCase() : null;
  return p => {
    if (since || until) {
      const d = new Date(p.created_at);
      if (since && d < since) return false;
      if (until && d > until) return false;
    }
    if (keyword && !(p.description ?? p.text ?? '').toLowerCase().includes(keyword)) return false;
    return true;
  };
}

// ── Video scrolling ───────────────────────────────────────────────────────────

async function scrollForVideos(page, videoMap, { max, debug, state }) {
  const dbg = (...m) => debug && console.log('[DBG]', ...m);
  let stale = 0;

  while (videoMap.size < max && stale < 4) {
    const prev = videoMap.size;
    for (let i = 0; i < SCROLL_ROUNDS; i++) {
      await page.mouse.wheel(0, 700);
      await delay(200);
    }
    await delay(SCROLL_DELAY);
    if (videoMap.size === prev) {
      stale++;
      // API confirmed no more videos — no point continuing
      if (!state.hasMore) break;
    } else {
      stale = 0;
    }
    console.log(`Videos collected: ${videoMap.size}`);
    dbg(`scroll — videos: ${videoMap.size}, stale: ${stale}, hasMore: ${state.hasMore}`);
  }

  // If API says there may be more, give one extra wait for in-flight responses
  if (state.hasMore && videoMap.size < max) await delay(2000);
}

// ── Comment fetching ──────────────────────────────────────────────────────────

// Takes a pre-created page so it can be reused across multiple videos.
async function fetchCommentsOnPage(page, videoId, username, maxComments, debug) {
  const dbg      = (...m) => debug && console.log('[DBG]', ...m);
  const comments = [];
  const seen     = new Set();

  try {
    // Register listener before navigation so we don't miss the response
    const responsePromise = page.waitForResponse(
      r => r.url().includes('/api/comment/list/') && !r.url().includes('/reply/') && r.status() === 200,
      { timeout: 12_000 }
    ).catch(() => null);

    await page.goto(
      `https://www.tiktok.com/@${username}/video/${videoId}`,
      { waitUntil: 'domcontentloaded', timeout: 30_000 }
    );

    // Wait for comment icon to appear — typically ~2s after navigation
    const icon = page.locator('[data-e2e="comment-icon"]');
    await page.waitForSelector('[data-e2e="comment-icon"]', { timeout: 5_000 }).catch(() => null);

    if (await icon.count() > 0) {
      await icon.first().click({ force: true }).catch(() => {});
    } else {
      dbg(`comment icon not found for ${videoId}, scrolling instead`);
      for (let i = 0; i < 3; i++) {
        await page.mouse.wheel(0, 400);
        await delay(300);
      }
    }

    const resp = await responsePromise;
    if (!resp) dbg(`comment API timed out for ${videoId}`);
    if (resp) {
      try {
        const j = await resp.json();
        for (const c of (j.comments ?? [])) {
          if (!seen.has(c.cid)) {
            seen.add(c.cid);
            const parsed = parseComment(c, videoId);
            if (parsed) {
              // TikTok sometimes embeds replies inline for low-comment videos
              // instead of requiring a separate /reply/ API call
              const inlineReplies = c.reply_list ?? [];
              if (inlineReplies.length && !parsed.author_reply) {
                const r = inlineReplies.find(r => r.user?.unique_id === username);
                if (r) parsed.author_reply = parseReply(r);
              }
              comments.push(parsed);
            }
          }
        }
      } catch {}
    }

    // Fetch author replies for comments that have replies but no inline reply yet
    const withReplies = comments.filter(c => c.metrics.replies > 0 && !c.author_reply);
    if (withReplies.length > 0) {
      await fetchAuthorReplies(page, username, comments, withReplies, dbg);
    }
  } catch (e) {
    dbg(`comment page error for ${videoId}: ${e.message}`);
  }

  dbg(`video ${videoId}: ${comments.length} comments`);
  return comments.slice(0, maxComments);
}

async function fetchAuthorReplies(page, authorUsername, comments, withReplies, dbg) {
  const commentMap = new Map(comments.map(c => [c.id, c]));
  const replyMap   = new Map();

  const onReply = async (res) => {
    const url = res.url();
    if (!url.includes('/comment/list') || res.status() !== 200) return;
    dbg(`[reply handler] ${url.replace('https://www.tiktok.com', '').split('?')[0]} status=${res.status()}`);
    if (!url.includes('/reply/')) return;
    try {
      const u     = new URL(url);
      const cid   = u.searchParams.get('comment_id');
      const j     = await res.json();
      dbg(`[reply data] cid=${cid} count=${j.comments?.length ?? 0}`);
      const reply = (j.comments ?? []).find(r => r.user?.unique_id === authorUsername);
      if (reply && cid && !replyMap.has(cid)) replyMap.set(cid, parseReply(reply));
    } catch {}
  };
  page.on('response', onReply);

  try {
    // Wait for comment items to appear in DOM before scanning
    await page.waitForSelector('[data-e2e="comment-level-1"]', { timeout: 5_000 }).catch(() => null);

    // Scroll comment panel back to top — critical for page reuse:
    // the previous video may have left the panel scrolled mid-way,
    // causing top comments to be virtualised (removed from DOM) before we even start.
    await page.evaluate(() => {
      const el = document.querySelector('[data-e2e="comment-level-1"]');
      if (!el) return;
      let p = el.parentElement;
      while (p && p !== document.body) {
        const s = window.getComputedStyle(p);
        if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && p.scrollHeight > p.clientHeight) {
          p.scrollTop = 0;
          return;
        }
        p = p.parentElement;
      }
    });
    await delay(400); // let virtualisation re-render after scroll to top

    // TikTok virtualises the comment list — reply buttons only render for visible items.
    // Scroll incrementally and click expanders as they come into view.
    // Selector: DivViewRepliesContainer is a <div> (not always a <button>); filter to
    // only unexpanded items ("查看" text) so we never re-click the "隐藏" (collapse) state.
    const expandSel = '[class*="DivViewRepliesContainer"]';
    let stale = 0;
    let iter  = 0;
    let totalClicks = 0;
    const MAX_SCROLL = 80;

    while (stale < 3 && iter++ < MAX_SCROLL) {
      // Collapsed state always contains a digit (e.g. "查看 2 条回复" / "View 2 replies").
      // Expanded state shows "隐藏" / "Hide" — no digit. Language-independent filter.
      const btns  = page.locator(expandSel).filter({ hasText: /\d/ });
      const count = await btns.count();
      let newClicks = 0;
      for (let i = 0; i < count; i++) {
        const btn = btns.nth(i);
        const box = await btn.boundingBox().catch(() => null);
        if (!box) continue;   // virtualized out of viewport
        newClicks++;
        totalClicks++;
        await btn.click({ force: true, timeout: 1500 }).catch(() => {});
        await delay(100);
      }

      // Scroll panel down to reveal more comments
      const atBottom = await page.evaluate(() => {
        const el = document.querySelector('[data-e2e="comment-level-1"]');
        if (!el) return true;
        let p = el.parentElement;
        while (p && p !== document.body) {
          const s = window.getComputedStyle(p);
          if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && p.scrollHeight > p.clientHeight) {
            const wasAtBottom = p.scrollTop + p.clientHeight >= p.scrollHeight - 20;
            p.scrollTop += 350;
            return wasAtBottom;
          }
          p = p.parentElement;
        }
        return true;
      });
      await delay(400);

      if (atBottom && newClicks === 0) stale++;
      else if (newClicks > 0) stale = 0;
    }

    dbg(`reply-expander clicks: ${totalClicks}`);
    // Wait for all in-flight reply API responses to settle
    await delay(2000);
  } finally {
    page.off('response', onReply);
  }

  for (const [cid, reply] of replyMap) {
    const c = commentMap.get(cid);
    if (c) c.author_reply = reply;
  }
  for (const c of withReplies) {
    const status = c.author_reply ? '✓' : '✗ not found';
    dbg(`  reply cid=${c.id} replies=${c.metrics.replies} author_reply=${status}`);
  }
  dbg(`author replies found: ${replyMap.size}/${withReplies.length}`);
}

async function fetchCommentsParallel(context, videos, maxComments, debug) {
  const n = Math.min(COMMENT_CONCURRENCY, videos.length);
  // Pre-create pages once and reuse them across all videos to avoid
  // repeated page creation/destruction overhead
  const pages = await Promise.all(Array.from({ length: n }, () => setupCommentPage(context)));

  const results = new Array(videos.length).fill(null);
  let next = 0;
  let done = 0;

  const worker = async (page) => {
    while (next < videos.length) {
      const i = next++;
      const v = videos[i];
      results[i] = await fetchCommentsOnPage(page, v.id, v.author.username, maxComments, debug);
      done++;
      console.log(`Comments: ${done}/${videos.length}`);
    }
    await page.close().catch(() => {});
  };

  await Promise.all(pages.map(worker));
  return results;
}

// ── Per-user scrape ───────────────────────────────────────────────────────────

export async function scrapeTikTokUser(target, context, opts = {}) {
  const {
    max         = 1000,
    maxComments = 0,     // 0 = skip comments; >0 = fetch up to N per video
    debug       = false,
    ...filterOpts
  } = opts;
  const dbg      = (...m) => debug && console.log('[DBG]', ...m);
  const filterFn = buildFilter(filterOpts);
  const { username } = target;

  const page = await setupPage(context);

  let profile    = null;
  const videoMap = new Map();          // id → parsed video
  const state    = { hasMore: true };  // updated by item_list responses

  const onResponse = async (res) => {
    if (res.status() !== 200) return;
    const ct = res.headers()['content-type'] ?? '';
    if (!ct.includes('json')) return;
    if (!res.url().includes('/api/post/item_list')) return;
    try {
      const j = await res.json();
      state.hasMore = j.hasMore ?? true;
      for (const item of (j.itemList ?? [])) {
        if (!videoMap.has(item.id)) {
          const v = parseVideo(item);
          if (v) videoMap.set(item.id, v);
        }
      }
      dbg(`item_list: +${j.itemList?.length ?? 0} (total: ${videoMap.size}, hasMore: ${state.hasMore})`);
    } catch {}
  };
  page.on('response', onResponse);

  try {
    await page.goto(`https://www.tiktok.com/@${username}`, {
      waitUntil: 'domcontentloaded', timeout: 60_000,
    });
    await delay(NAV_DELAY);

    // Extract profile from SSR
    const ssr = await page.evaluate(() => {
      try {
        const el = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
        return el ? JSON.parse(el.textContent) : null;
      } catch { return null; }
    });
    profile = extractUserFromSSR(ssr);
    if (profile) dbg(`profile: ${profile.nickname} — ${profile.followers} followers`);

    // Scroll to collect videos
    await scrollForVideos(page, videoMap, { max, debug, state });
  } finally {
    page.off('response', onResponse);
    await page.close().catch(() => {});
  }

  // Filter and cap videos
  let videos = [...videoMap.values()]
    .filter(filterFn)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, max);

  // Fetch comments if requested
  if (maxComments > 0 && videos.length > 0) {
    console.log(`  Fetching comments for ${videos.length} videos (${COMMENT_CONCURRENCY} parallel)...`);
    const commentResults = await fetchCommentsParallel(context, videos, maxComments, debug);
    for (let i = 0; i < videos.length; i++) {
      videos[i].comments = commentResults[i] ?? [];
    }
  } else {
    for (const v of videos) v.comments = [];
  }

  return { profile, videos };
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function scrapeTikTok(targets, opts = {}) {
  const parsed = (Array.isArray(targets) ? targets : [targets])
    .map(t => typeof t === 'string' ? parseTikTokUser(t) : t)
    .filter(Boolean);
  if (!parsed.length) throw new Error('No valid TikTok username provided.');

  const {
    headed       = false,
    debug        = false,
    resetSession = false,
    sessionDir   = DEFAULT_SESSION_DIR,
    ...userOpts
  } = opts;

  if (resetSession && existsSync(sessionDir))
    rmSync(sessionDir, { recursive: true, force: true });

  if (!sessionExists(sessionDir) && !headed)
    throw new Error('No saved session. Run with --headed to log in first.');

  const context = await createBrowser(sessionDir, !headed);

  try {
    // Login check
    const loginPage = await context.newPage();
    await loginPage.goto('https://www.tiktok.com', {
      waitUntil: 'domcontentloaded', timeout: 60_000,
    });
    await delay(2000);

    if (!(await isLoggedInTikTok(loginPage))) {
      if (!headed) {
        await context.close();
        throw new Error('Session expired. Run with --headed to re-login.');
      }
      const ok = await waitForLogin(loginPage);
      if (!ok) throw new Error('Login timed out.');
      console.log('\nLogin confirmed. Starting scrape...');
    } else {
      console.log('Session active.');
    }
    await loginPage.close();

    const results = {};
    for (const target of parsed) {
      console.log(`\n${'═'.repeat(52)}`);
      console.log(`  @${target.username}  [TikTok]`);
      console.log(`${'═'.repeat(52)}`);
      results[target.username] = await scrapeTikTokUser(target, context, { debug, ...userOpts });
    }
    return results;
  } finally {
    await context.close();
  }
}
