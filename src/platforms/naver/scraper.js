/**
 * naver.js — Naver Café scraper
 * Phase 1: login + article-list interception to collect IDs and likeItCount.
 * Phase 2: parallel detail fetch via article.cafe.naver.com (no auth needed)
 *          for full content, scrapCount, repostCount, accurate author/board info.
 */

import { resolve }           from 'path';
import { waitForLoginSignal } from '../../shared/login-signal.js';
import {
  launchSessionContext, saveSessionState, hasSavedSession, clearSessionState,
} from '../../shared/browser.js';
import { createLogger }      from '../../shared/logger.js';

export const DEFAULT_SESSION_DIR = resolve('sessions/naver');

const PAGE_SIZE    = 50;
const NAV_DELAY    = 3000;
const BATCH_SIZE   = 10;   // concurrent detail requests per batch
const BATCH_DELAY  = 300;  // ms between batches

const delay = ms => new Promise(r => setTimeout(r, ms));

const DETAIL_BASE = 'https://article.cafe.naver.com/gw/v4/cafes';

// ── Browser helpers ───────────────────────────────────────────────────────────

async function setupPage(context) {
  const page = await context.newPage();
  await page.route('**/*', route => {
    const t = route.request().resourceType();
    if (t === 'image' || t === 'media') return route.abort();
    return route.continue();
  });
  return page;
}

// ── Input parsing ─────────────────────────────────────────────────────────────

export function parseNaverCafe(raw) {
  if (typeof raw !== 'string') return null;
  const urlMatch = raw.match(/cafe\.naver\.com\/([A-Za-z0-9_-]+)/);
  if (!urlMatch) return null;
  const slug      = urlMatch[1];
  const cafeUrl   = `https://cafe.naver.com/${slug}`;
  const menuMatch = raw.match(/menuid[=%](\d+)/);
  return { cafeUrl, slug, menuId: menuMatch ? menuMatch[1] : null };
}

// ── Login ─────────────────────────────────────────────────────────────────────

async function isLoggedIn(page) {
  try {
    const cookies = await page.context().cookies();
    if (cookies.some(c => (c.name === 'NID_AUT' || c.name === 'NID_SES') && c.value))
      return true;
    return await page.evaluate(async () => {
      try {
        const r = await fetch('https://nid.naver.com/user2/api/naverLoginStatus', { credentials: 'include' });
        const j = await r.json();
        return j?.isLogin === true || j?.isLogin === 'true';
      } catch { return false; }
    });
  } catch { return false; }
}

async function waitForLogin(page, log) {
  log.log('Not logged in. Please log in to Naver in the browser window.');
  log.log('  After login completes → press Enter here to confirm');

  return Promise.race([
    (async () => {
      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline) {
        await delay(2000);
        if (await isLoggedIn(page)) return true;
      }
      return false;
    })(),
    waitForLoginSignal().then(async () => {
      try {
        await page.goto('https://www.naver.com', { waitUntil: 'domcontentloaded', timeout: 15_000 });
        await delay(1500);
      } catch {}
      return isLoggedIn(page);
    }),
  ]);
}

// ── Phase 1: list-API interception helpers ────────────────────────────────────

function extractClubId(json) {
  return json?.result?.cafeInfoView?.cafeId
      ?? json?.result?.cafeId
      ?? json?.message?.result?.cafeInfo?.clubid
      ?? null;
}

function extractMemberCount(json) {
  return json?.result?.cafeInfoView?.memberCount
      ?? json?.result?.memberCount
      ?? json?.message?.result?.cafeInfo?.membercount
      ?? json?.message?.result?.cafeInfo?.memberCount
      ?? null;
}

function extractArticleIds(json) {
  const list =
    json?.result?.articleList
    ?? json?.result?.articleListInfo?.articleList
    ?? json?.message?.result?.articleList
    ?? null;
  if (!Array.isArray(list)) return null;

  return list
    .filter(item => item?.articleId)
    .map(item => ({
      id:        item.articleId,
      likeCount: item.likeItCount ?? 0,
    }));
}

function extractMenus(json) {
  const raw = json?.result?.menus ?? json?.message?.result?.menus ?? null;
  if (!Array.isArray(raw)) return null;
  const boards = [];
  const walk = items => {
    for (const m of items) {
      if (m.menuType === 'A' || m.menuType === 'L')
        boards.push({ id: String(m.menuId), name: m.menuName ?? '' });
      if (m.menus?.length) walk(m.menus);
    }
  };
  walk(raw);
  return boards;
}

async function extractClubIdFromDOM(page) {
  return page.evaluate(() => {
    if (typeof g_nClubId !== 'undefined' && g_nClubId) return String(g_nClubId);
    for (const s of document.scripts) {
      const m = s.text.match(/(?:clubId|g_nClubId)[^0-9]+(\d{6,})/);
      if (m) return m[1];
    }
    for (const a of document.querySelectorAll('a[href*="clubid="]')) {
      const m = a.href.match(/clubid=(\d+)/i);
      if (m) return m[1];
    }
    for (const el of document.querySelectorAll('iframe[src*="clubid"]')) {
      const m = (el.src || '').match(/clubid=(\d+)/i);
      if (m) return m[1];
    }
    return null;
  });
}

// ── Phase 2: article detail fetch ────────────────────────────────────────────

async function fetchArticleDetails(cafeId, idEntries, likeMap, dbg, log = createLogger()) {
  const results = [];
  for (let i = 0; i < idEntries.length; i += BATCH_SIZE) {
    const batch = idEntries.slice(i, i + BATCH_SIZE);
    const settled = await Promise.allSettled(
      batch.map(({ id }) =>
        fetch(`${DETAIL_BASE}/${cafeId}/articles/${id}?useCafeId=true&requestFrom=A`)
          .then(r => r.json())
          .then(j => j?.result ?? null)
          .catch(() => null)
      )
    );
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value) results.push(r.value);
    }
    if (i + BATCH_SIZE < idEntries.length) await delay(BATCH_DELAY);
    log.log(`Fetching details: ${Math.min(i + BATCH_SIZE, idEntries.length)}/${idEntries.length}`);
  }
  return results;
}

// ── Article parser (detail API format) ───────────────────────────────────────

function decodeHtmlEntities(str) {
  return str.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"');
}

function parseArticleDetail(result, cafeSlug, likeMap) {
  if (!result?.articleId || !result?.article) return null;
  const a   = result.article;
  const id  = result.articleId;

  const text = (a.contentHtml ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);

  return {
    id:         String(id),
    url:        `https://cafe.naver.com/${cafeSlug}/${id}`,
    title:      a.subject ?? '',
    text,
    created_at: a.writeDate ? new Date(a.writeDate).toISOString() : null,
    author: {
      id:       a.writer?.memberKey ?? '',
      nickname: a.writer?.nick      ?? '',
    },
    board: {
      id:   String(a.menu?.id   ?? ''),
      name: decodeHtmlEntities(a.menu?.name ?? ''),
    },
    head: a.head ?? null,
    metrics: {
      views:    a.readCount    ?? 0,
      comments: a.commentCount ?? 0,
      likes:    likeMap?.get(id) ?? 0,
      scraps:   a.scrapCount   ?? 0,
      reposts:  a.repostCount  ?? 0,
    },
    has_image: (a.contentHtml ?? '').includes('<img'),
    type:      'post',
    platform:  'naver_cafe',
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
    if (keyword && !`${p.title} ${p.text}`.toLowerCase().includes(keyword)) return false;
    return true;
  };
}

// ── Per-café scrape ───────────────────────────────────────────────────────────

export async function scrapeNaverCafe(target, page, opts = {}) {
  const { max = 1000, debug = false, logger = null, ...filterOpts } = opts;
  const log      = createLogger(logger);
  const dbg      = (...m) => debug && log.log('[DBG]', ...m);
  const filterFn = buildFilter(filterOpts);

  let clubId      = null;
  let memberCount = null;
  let menuList    = null;
  // Map: articleId → likeItCount (from list API)
  const likeMap   = new Map();
  // Ordered unique IDs from list API
  const idList    = [];
  const idSet     = new Set();

  const onResponse = async (response) => {
    if (response.status() !== 200) return;
    if (!(response.headers()['content-type'] ?? '').includes('json')) return;
    let json;
    try { json = await response.json(); } catch { return; }

    if (!clubId) {
      const id = extractClubId(json);
      if (id) { clubId = String(id); dbg(`clubId: ${clubId}`); }
    }
    if (memberCount === null) {
      const mc = extractMemberCount(json);
      if (mc != null) { memberCount = Number(mc); dbg(`memberCount: ${memberCount}`); }
    }
    if (!menuList) {
      const menus = extractMenus(json);
      if (menus?.length) { menuList = menus; dbg(`${menus.length} boards`); }
    }
    const entries = extractArticleIds(json);
    if (entries?.length) {
      for (const e of entries) {
        if (!idSet.has(e.id)) {
          idSet.add(e.id);
          idList.push(e.id);
          likeMap.set(e.id, e.likeCount);
        }
      }
      dbg(`+${entries.length} IDs (total: ${idSet.size})`);
    }
  };

  page.on('response', onResponse);

  try {
    // ── Phase 1: collect article IDs via list API ─────────────────────────────
    await page.goto(target.cafeUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await delay(NAV_DELAY);

    if (!clubId) {
      clubId = await extractClubIdFromDOM(page);
      dbg(`clubId from DOM: ${clubId}`);
    }
    if (!clubId) {
      log.error('[ERROR] Could not determine café ID.');
      return { posts: [], memberCount: null };
    }

    log.log(`  clubId      : ${clubId}`);
    if (memberCount !== null) log.log(`  Members     : ${memberCount.toLocaleString()}`);

    const boards = target.menuId
      ? [{ id: target.menuId, name: '(specified)' }]
      : (menuList?.length ? menuList : [{ id: '0', name: 'All' }]);

    log.log(`  Boards      : ${boards.length}`);

    for (const board of boards) {
      if (idSet.size >= max) break;
      let pageNum = 1;
      let stale   = 0;

      while (idSet.size < max && stale < 3) {
        const prevSize = idSet.size;

        const iframePath =
          `/ArticleList.nhn` +
          `?search.clubid=${clubId}` +
          `&search.menuid=${board.id}` +
          `&search.page=${pageNum}` +
          `&userDisplay=${PAGE_SIZE}` +
          `&search.boardtype=L`;

        const listUrl =
          `https://cafe.naver.com/${target.slug}` +
          `?iframe_url=${encodeURIComponent(iframePath)}`;

        log.log(`Board "${board.name}" — page ${pageNum} (${idSet.size} IDs)`);

        await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await delay(NAV_DELAY);

        const added = idSet.size - prevSize;
        if (!added) { stale++; } else { stale = 0; }

        if (idSet.size >= max) break;
        if (added > 0 && added < PAGE_SIZE) break;
        pageNum++;
        await delay(300);
      }
    }

  } finally {
    page.off('response', onResponse);
  }

  const cappedIds = idList.slice(0, max);
  if (!cappedIds.length) return { posts: [], memberCount };

  // ── Phase 2: fetch article details ───────────────────────────────────────
  log.log(`  Fetching ${cappedIds.length} article details...`);
  const idEntries = cappedIds.map(id => ({ id }));
  const details   = await fetchArticleDetails(clubId, idEntries, likeMap, dbg, log);

  const posts = [];
  for (const result of details) {
    const parsed = parseArticleDetail(result, target.slug, likeMap);
    if (parsed && filterFn(parsed)) posts.push(parsed);
  }

  return {
    posts: posts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    memberCount,
  };
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function scrapeNaver(targets, opts = {}) {
  const parsed = (Array.isArray(targets) ? targets : [targets])
    .map(t => typeof t === 'string' ? parseNaverCafe(t) : t)
    .filter(Boolean);
  if (!parsed.length) throw new Error('No valid Naver Café URL provided.');

  const {
    headed       = false,
    debug        = false,
    resetSession = false,
    sessionDir   = DEFAULT_SESSION_DIR,
    logger: rawLogger = null,
    ...cafeOpts
  } = opts;
  const log = createLogger(rawLogger);

  if (resetSession) clearSessionState(sessionDir);

  if (!hasSavedSession(sessionDir) && !headed)
    throw new Error('No saved session. Run with --headed to log in first.');

  const context = await launchSessionContext(sessionDir, { headless: !headed });

  try {
    const loginPage = await context.newPage();
    await loginPage.goto('https://www.naver.com', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await delay(2000);

    if (!(await isLoggedIn(loginPage))) {
      if (!headed) {
        await context.close();
        throw new Error('Session expired. Run with --headed to re-login.');
      }
      const ok = await waitForLogin(loginPage, log);
      if (!ok) throw new Error('Login timed out.');
      log.log('Login confirmed. Starting scrape...');
    } else {
      log.log('Session active.');
    }
    // Persist cookies + localStorage so the next launch is logged in (the
    // isolated context has no profile to write them back to automatically).
    await saveSessionState(context, sessionDir);
    await loginPage.close();

    const page    = await setupPage(context);
    const results = {};
    for (const target of parsed) {
      log.log(`${target.slug}  [Naver Café]`);
      results[target.slug] = await scrapeNaverCafe(target, page, { debug, logger: rawLogger, ...cafeOpts });
    }
    return results;
  } finally {
    await context.close();
  }
}
