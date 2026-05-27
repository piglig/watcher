/**
 * to-scrape.js — Bridge OSINT batch output into the scrape pipeline.
 *
 * Reads an OSINT result directory (containing _summary.json + per-KOL JSON
 * files), aggregates every discovered account across all KOLs, maps each one
 * to the scrape pipeline's platform id + target handle format, and returns
 * { targets, unmapped, ignoredCount }.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join } from 'path';

// ── Platform mapping ──────────────────────────────────────────────────────────

const PLATFORM_ALIASES = {
  // scrape-pipeline id ← OSINT `platform` field (case-insensitive, trimmed)
  twitter: ['x', 'twitter', 'x (twitter)', 'x/twitter'],
  tiktok:  ['tiktok'],
  reddit:  ['reddit'],
  threads: ['threads'],
  pixiv:   ['pixiv'],
  naver:   ['naver', 'naver café', 'naver cafe', 'naver blog'],
  youtube:   ['youtube'],
  instagram: ['instagram'],
  twitch:    ['twitch'],
  bluesky:   ['bluesky', 'bsky', 'bluesky (bsky)'],
  facebook:  ['facebook', 'fb', 'meta'],
};

function resolvePlatform(rawPlatform) {
  const p = String(rawPlatform ?? '').trim().toLowerCase();
  for (const [scrapeId, aliases] of Object.entries(PLATFORM_ALIASES)) {
    if (aliases.includes(p)) return scrapeId;
  }
  return null;
}

// ── Handle normalization (per scrape platform) ────────────────────────────────

function stripAt(h) {
  return String(h ?? '').trim().replace(/^@+/, '');
}

function pickFromUrl(url, ...patterns) {
  for (const re of patterns) {
    const m = String(url ?? '').match(re);
    if (m && m[1]) return m[1];
  }
  return null;
}

/** @returns string | null  — normalized target the scraper expects */
function normalizeHandle(scrapeId, account) {
  const { handle_id, url } = account;
  switch (scrapeId) {
    case 'twitter': {
      const h = stripAt(handle_id) || pickFromUrl(url, /(?:twitter|x)\.com\/([A-Za-z0-9_]+)/i);
      return h || null;
    }
    case 'tiktok': {
      const h = stripAt(handle_id) || pickFromUrl(url, /tiktok\.com\/@([\w.\-]+)/i);
      return h || null;
    }
    case 'threads': {
      const h = stripAt(handle_id) || pickFromUrl(url, /threads\.net\/@([\w.\-]+)/i);
      return h || null;
    }
    case 'reddit': {
      // Accept u/xxx, /user/xxx, @xxx, or full URL. Output `u/xxx`.
      const raw = (handle_id ?? '').trim() || url || '';
      const u = pickFromUrl(raw, /\/user\/([\w\-]+)/i, /reddit\.com\/u\/([\w\-]+)/i)
              ?? raw.replace(/^@/, '').replace(/^u\//i, '').match(/^([\w\-]+)$/)?.[1];
      return u ? `u/${u}` : null;
    }
    case 'pixiv': {
      // Pixiv scraper wants the numeric user id.
      const h = String(handle_id ?? '').trim();
      if (/^\d+$/.test(h)) return h;
      return pickFromUrl(url, /pixiv\.net\/(?:en\/)?users\/(\d+)/i);
    }
    case 'naver': {
      // Naver scraper wants the full café URL.
      return (url && /^https?:\/\//.test(url)) ? url : null;
    }
    case 'youtube': {
      // YouTube scraper accepts @handle or channel URL.
      const h = String(handle_id ?? '').trim();
      if (h.startsWith('@')) return h;
      if (url && /^https?:\/\/(www\.)?youtube\.com\//i.test(url)) return url;
      if (h) return `@${h.replace(/^@/, '')}`;
      return null;
    }
    case 'instagram': {
      const h = stripAt(handle_id) || pickFromUrl(url, /instagram\.com\/([A-Za-z0-9_.]+)/i);
      return h || null;
    }
    case 'twitch': {
      const h = stripAt(handle_id) || pickFromUrl(url, /twitch\.tv\/([A-Za-z0-9_]+)/i);
      return h ? h.toLowerCase() : null;
    }
    case 'bluesky': {
      const h = stripAt(handle_id) || pickFromUrl(url, /bsky\.app\/profile\/([\w.\-@]+)/i);
      return h ? h.replace(/^@/, '') : null;
    }
    case 'facebook': {
      // Accept handle, profile.php?id=..., /people/.../<id>, or bare numeric id.
      const fromUrl = pickFromUrl(url,
        /facebook\.com\/profile\.php\?id=(\d+)/i,
        /facebook\.com\/people\/[^/]+\/(\d+)/i,
        /facebook\.com\/([A-Za-z0-9_.\-]+)/i,
      );
      const h = stripAt(handle_id) || fromUrl;
      if (!h) return null;
      return /^\d+$/.test(h) ? `profile.php?id=${h}` : h;
    }
    default:
      return null;
  }
}

// ── Reading OSINT results ─────────────────────────────────────────────────────

function safeReadJSON(path) {
  try { return JSON.parse(readFileSync(path, 'utf-8')); }
  catch { return null; }
}

/**
 * Load OSINT result from <wfDir>/accounts/identity.json. Returns [{ slug, data }].
 */
export function loadOsintDir(dir) {
  if (!existsSync(dir)) return [];
  const data = safeReadJSON(join(dir, 'identity.json'));
  if (!data) return [];
  const slug = dir.split(/[\\/]/).filter(Boolean).slice(-2, -1)[0] ?? 'unnamed';
  return [{ slug, data }];
}

/**
 * Walk one or many KOL OSINT results, return scrape-ready targets.
 *
 * @param {{slug:string,data:object}[]} kols
 * @returns {{
 *   targets: Record<string, string[]>,         // platform → unique handle list
 *   byPlatform: Record<string, Array<{handle:string, kol:string, account:object, kind:'verified'|'suspected'}>>,
 *   unmapped: Array<{ platform:string, url:string, kol:string, kind:string }>,
 *   ignoredCount: number,
 * }}
 */
export function extractScrapeTargets(kols) {
  const targets    = {};   // scrapeId → Set<string>
  const byPlatform = {};
  const unmapped   = [];

  const pushAccount = (kol, account, kind) => {
    const scrapeId = resolvePlatform(account.platform);
    if (!scrapeId) {
      unmapped.push({ platform: account.platform, url: account.url ?? '', kol, kind });
      return;
    }
    const handle = normalizeHandle(scrapeId, account);
    if (!handle) {
      unmapped.push({ platform: account.platform, url: account.url ?? '', kol, kind });
      return;
    }
    (targets[scrapeId]    ??= new Set()).add(handle);
    (byPlatform[scrapeId] ??= []).push({ handle, kol, account, kind });
  };

  for (const { slug, data } of kols) {
    for (const a of (data.verified_accounts  ?? [])) pushAccount(slug, a, 'verified');
    for (const a of (data.suspected_accounts ?? [])) pushAccount(slug, a, 'suspected');
  }

  // Convert sets → arrays, deterministic order
  const targetsArr = {};
  for (const [k, set] of Object.entries(targets)) {
    targetsArr[k] = Array.from(set).sort();
  }

  return {
    targets: targetsArr,
    byPlatform,
    unmapped,
    ignoredCount: unmapped.length,
  };
}

/**
 * List discoverable OSINT result directories under outDir.
 * New layout: each subject (KOL) has its own <outDir>/<slug>/accounts/identity.json.
 */
export function listOsintResultDirs(outDir) {
  const out = [];
  if (!outDir || !existsSync(outDir)) return out;

  let entries;
  try { entries = readdirSync(outDir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const identity = join(outDir, e.name, 'accounts', 'identity.json');
    if (!existsSync(identity)) continue;
    let mtime = 0;
    try { mtime = statSync(identity).mtimeMs; } catch {}
    out.push({ name: e.name, path: join(outDir, e.name, 'accounts'), mtime });
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}
