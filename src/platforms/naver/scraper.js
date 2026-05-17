/**
 * naver.js — Naver Café scraper
 * Phase 1: login + article-list interception to collect IDs and likeItCount.
 * Phase 2: parallel detail fetch via article.cafe.naver.com (no auth needed)
 *          for full content, scrapCount, repostCount, accurate author/board info.
 */

import { resolve }           from 'path';
import { createInterface }   from 'readline';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { launchPersistentContext } from 'cloakbrowser';

export const DEFAULT_SESSION_DIR = resolve('.session-naver');

const PAGE_SIZE    = 50;
const NAV_DELAY    = 3000;
const BATCH_SIZE   = 10;   // concurrent detail requests per batch
const BATCH_DELAY  = 300;  // ms between batches

const delay = ms => new Promise(r => setTimeout(r, ms));

const DETAIL_BASE = 'https://article.cafe.naver.com/gw/v4/cafes';

// ── Browser helpers ───────────────────────────────────────────────────────────

function sessionExists(dir) {
  return existsSync(resolve(dir, 'Default'));
}

async function createBrowser(sessionDir, headless) {
  mkdirSync(sessionDir, { recursive: true });
  return launchPersistentContext({ userDataDir: sessionDir, headless, humanize: true });
}

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

async function waitForLogin(page) {
  console.log('\nNot logged in. Please log in to Naver in the browser window.');
  console.log('─'.repeat(50));
  console.log('  After login completes → press Enter here to confirm');
  console.log('─'.repeat(50));

  return Promise.race([
    (async () => {
      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline) {
        await delay(2000);
        if (await isLoggedIn(page)) return true;
      }
      return false;
    })(),
    new Promise(res => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      rl.question('', async () => {
        rl.close();
        try {
          await page.goto('https://www.naver.com', { waitUntil: 'domcontentloaded', timeout: 15_000 });
          await delay(1500);
        } catch {}
        res(await isLoggedIn(page));
      });
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

async function fetchArticleDetails(cafeId, idEntries, likeMap, dbg) {
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
    console.log(`Fetching details: ${Math.min(i + BATCH_SIZE, idEntries.length)}/${idEntries.length}`);
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
  const { max = 1000, debug = false, ...filterOpts } = opts;
  const dbg      = (...m) => debug && console.log('[DBG]', ...m);
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
      console.error('[ERROR] Could not determine café ID.');
      return { posts: [], memberCount: null };
    }

    console.log(`  clubId      : ${clubId}`);
    if (memberCount !== null) console.log(`  Members     : ${memberCount.toLocaleString()}`);

    const boards = target.menuId
      ? [{ id: target.menuId, name: '(specified)' }]
      : (menuList?.length ? menuList : [{ id: '0', name: 'All' }]);

    console.log(`  Boards      : ${boards.length}`);

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

        console.log(`Board "${board.name}" — page ${pageNum} (${idSet.size} IDs)`);

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
  console.log(`  Fetching ${cappedIds.length} article details...`);
  const idEntries = cappedIds.map(id => ({ id }));
  const details   = await fetchArticleDetails(clubId, idEntries, likeMap, dbg);

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
    ...cafeOpts
  } = opts;

  if (resetSession && existsSync(sessionDir))
    rmSync(sessionDir, { recursive: true, force: true });

  if (!sessionExists(sessionDir) && !headed)
    throw new Error('No saved session. Run with --headed to log in first.');

  const context = await createBrowser(sessionDir, !headed);

  try {
    const loginPage = await context.newPage();
    await loginPage.goto('https://www.naver.com', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await delay(2000);

    if (!(await isLoggedIn(loginPage))) {
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

    const page    = await setupPage(context);
    const results = {};
    for (const target of parsed) {
      console.log(`\n${'═'.repeat(52)}`);
      console.log(`  ${target.slug}  [Naver Café]`);
      console.log(`${'═'.repeat(52)}`);
      results[target.slug] = await scrapeNaverCafe(target, page, { debug, ...cafeOpts });
    }
    return results;
  } finally {
    await context.close();
  }
}
