/**
 * bio-enrichment.js — Post-OSINT bio link harvest.
 *
 * OSINT (Grok) gives us a starting set of verified_accounts across platforms.
 * Each of those profiles has a public bio that often advertises *other*
 * accounts the OSINT search didn't surface (a YouTuber linking to their
 * Discord/Patreon/X, a TikToker pointing at their Threads, etc.).
 *
 * This pass fetches each verified profile's bio, parses outbound URLs, and
 * returns candidate suspected_accounts for any platform/handle pairing that
 * isn't already in the identity graph. The result is fed back into
 * identity.json before the scrape stage starts, so newly-discovered accounts
 * become scrape targets automatically — no human re-trigger needed.
 *
 * Coverage today:
 *   - Fetched via bio-extractor: YouTube, TikTok, Threads, Bluesky, Reddit
 *   - Identified as candidates: Twitter/X, TikTok, Threads, Instagram,
 *     YouTube, Reddit, Twitch, Bluesky, Facebook
 *
 * Auth-walled platforms (IG / X / FB) can't be fetched here without a
 * Playwright session; their bios become available later as
 * <kolDir>/accounts/profiles/<platform>.json after scrape — a second
 * enrichment pass at that point is the natural extension.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import pLimit from 'p-limit';
import { extractBioLinks, extractUrlsFromText } from './bio-extractor.js';
import { extractScrapeTargets } from './to-scrape.js';

const FETCH_CONCURRENCY = 4;

// One regex per platform; capture group 1 is the handle/ID. Patterns are
// permissive on trailing slashes / segments because bios paste URLs in many
// forms. Order matters: the first match wins, so put more-specific patterns
// (e.g. youtube /channel/UC...) ahead of more-generic ones.
const PLATFORM_URL_PATTERNS = [
  { id: 'youtube',   re: /^https?:\/\/(?:www\.)?youtube\.com\/channel\/(UC[\w\-]+)/i,                handle: (m) => m[1] },
  { id: 'youtube',   re: /^https?:\/\/(?:www\.)?youtube\.com\/(?:@|c\/|user\/)([\w.\-]+)/i,           handle: (m) => m[1].replace(/^@/, '') },
  { id: 'twitter',   re: /^https?:\/\/(?:www\.)?(?:twitter|x)\.com\/([A-Za-z0-9_]{1,20})(?:\/|$|\?)/i, handle: (m) => m[1] },
  { id: 'tiktok',    re: /^https?:\/\/(?:www\.|vm\.|vt\.)?tiktok\.com\/@([\w.\-]+)/i,                 handle: (m) => m[1] },
  { id: 'threads',   re: /^https?:\/\/(?:www\.)?threads\.(?:net|com)\/@([\w.\-]+)/i,                  handle: (m) => m[1] },
  { id: 'instagram', re: /^https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9_.]+)(?:\/|$|\?)/i,        handle: (m) => m[1] },
  { id: 'reddit',    re: /^https?:\/\/(?:www\.|old\.|new\.)?reddit\.com\/(?:user|u)\/([\w\-]+)/i,     handle: (m) => m[1] },
  { id: 'twitch',    re: /^https?:\/\/(?:www\.)?twitch\.tv\/([A-Za-z0-9_]+)(?:\/|$|\?)/i,             handle: (m) => m[1] },
  { id: 'bluesky',   re: /^https?:\/\/(?:www\.)?bsky\.app\/profile\/([\w.\-:]+)/i,                    handle: (m) => m[1] },
  { id: 'facebook',  re: /^https?:\/\/(?:www\.|m\.)?facebook\.com\/(?!share|sharer|dialog|tr)([A-Za-z0-9_.\-]+)/i, handle: (m) => m[1] },
];

// Path segments that look like a profile but aren't (homepage, search, etc.)
const HANDLE_BLACKLIST = new Set([
  'about', 'home', 'login', 'signup', 'search', 'explore', 'watch',
  'shorts', 'playlist', 'channel', 'user', 'profile', 'post', 'posts',
  'video', 'videos', 'live', 'feed', 'p', 'reel', 'reels', 'stories',
  'tv', 'directory', 'events', 'support', 'help', 'settings',
]);

/**
 * Identify the (platform, handle, canonical_url) for a single outbound URL.
 * Returns null when the URL doesn't point at a recognized profile page.
 */
export function identifyPlatformFromUrl(rawUrl) {
  if (!rawUrl) return null;
  const cleaned = String(rawUrl).split('#')[0].trim();
  for (const { id, re, handle } of PLATFORM_URL_PATTERNS) {
    const m = cleaned.match(re);
    if (!m) continue;
    const h = handle(m);
    if (!h || HANDLE_BLACKLIST.has(h.toLowerCase())) continue;
    return {
      platform: id,
      handle:   h,
      url:      canonicalProfileUrl(id, h),
    };
  }
  return null;
}

// Render a clean canonical URL we'd use as the profile's identifier in
// identity.json. Keeps suspected_accounts shape consistent regardless of how
// the bio originally formatted the link.
function canonicalProfileUrl(platform, handle) {
  switch (platform) {
    case 'twitter':   return `https://x.com/${handle}`;
    case 'tiktok':    return `https://www.tiktok.com/@${handle}`;
    case 'threads':   return `https://www.threads.net/@${handle}`;
    case 'instagram': return `https://www.instagram.com/${handle}/`;
    case 'youtube':   return /^UC[\w\-]+$/.test(handle)
                        ? `https://www.youtube.com/channel/${handle}`
                        : `https://www.youtube.com/@${handle}`;
    case 'reddit':    return `https://www.reddit.com/user/${handle}/`;
    case 'twitch':    return `https://www.twitch.tv/${handle}`;
    case 'bluesky':   return `https://bsky.app/profile/${handle}`;
    case 'facebook':  return /^\d+$/.test(handle)
                        ? `https://www.facebook.com/profile.php?id=${handle}`
                        : `https://www.facebook.com/${handle}`;
    default:          return `https://${platform}.com/${handle}`;
  }
}

// Set of "<platform>::<handle-lowercased>" keys for everything already
// known in identity, so we don't propose duplicates.
function buildKnownSet(identity) {
  const known = new Set();
  const all = [
    ...(identity.verified_accounts  ?? []),
    ...(identity.suspected_accounts ?? []),
  ];
  for (const a of all) {
    const ident = identifyPlatformFromUrl(a.url) ?? (
      a.platform && a.handle_id
        ? { platform: String(a.platform).toLowerCase(), handle: a.handle_id }
        : null
    );
    if (ident) known.add(`${ident.platform}::${ident.handle.toLowerCase()}`);
  }
  return known;
}

/**
 * For each verified account in identity, fetch its bio and harvest links to
 * other platforms not already known. Returns suspected_account candidates
 * in the same shape identity.json uses elsewhere (so they can be appended
 * directly to suspected_accounts).
 *
 * @param {object} identity                       parsed identity.json
 * @param {object} [opts]
 * @param {(line:string)=>void} [opts.onLog]
 * @returns {Promise<Array>}                      discovered candidates
 */
export async function enrichFromBios(identity, { onLog = () => {} } = {}) {
  const verified = identity?.verified_accounts ?? [];
  if (!verified.length) return [];

  const known       = buildKnownSet(identity);
  const discovered  = new Map();   // platform::handle → candidate
  const limit       = pLimit(FETCH_CONCURRENCY);

  await Promise.all(verified.map(account => limit(async () => {
    if (!account?.url) return;
    let bio;
    try { bio = await extractBioLinks(account.url); } catch { /* swallow */ }
    if (!bio?.links?.length) {
      onLog(`[bio-enrich] ${account.platform} ${account.handle_id ?? ''}: no public bio links`);
      return;
    }
    onLog(`[bio-enrich] ${account.platform} ${account.handle_id ?? ''}: ${bio.links.length} 个外链待匹配`);

    for (const link of bio.links) {
      const ident = identifyPlatformFromUrl(link.url);
      if (!ident) continue;
      const key = `${ident.platform}::${ident.handle.toLowerCase()}`;
      if (known.has(key)) continue;
      // De-dupe across iterations: first sighting wins; subsequent ones
      // augment evidence_urls so the user can see all source bios.
      const prev = discovered.get(key);
      if (prev) {
        if (!prev.evidence_urls.includes(account.url)) prev.evidence_urls.push(account.url);
        continue;
      }
      discovered.set(key, {
        platform:         ident.platform,
        handle_id:        ident.handle,
        url:              ident.url,
        confidence_score: 70,
        reason:           `Discovered via ${account.platform} bio outbound link`,
        evidence_urls:    [account.url, link.url],
        matched_signals: {
          avatar_match:           false,
          bio_match:              true,
          cross_linked:           true,
          same_username_pattern:  ident.handle.toLowerCase() === String(account.handle_id ?? '').toLowerCase(),
          same_watermark:         false,
        },
        // Provenance — distinguishes bio-link discoveries from LLM-suspected
        // ones for downstream filtering / display.
        discovery_source: 'bio_link',
      });
    }
  })));

  return [...discovered.values()];
}

// ── Post-scrape enrichment ─────────────────────────────────────────────────
//
// The pre-scrape pass (enrichFromBios) is limited to platforms whose bio is
// publicly fetchable: YouTube /about, TikTok, Threads, Bluesky, Reddit.
// Instagram / X / Facebook all sit behind auth walls so we can't reach their
// bios from a plain fetch — but once their scraper has actually run, the
// bio text is sitting on disk inside the saved profile snapshot. This
// second pass mines those.

// Any string-valued field that could hold bio text. We don't enumerate the
// exact field name each scraper writes — different platforms use different
// keys (biography / signature / description / about) — so we just check the
// well-known ones. Keeps the helper schema-agnostic.
const BIO_TEXT_FIELDS = [
  'biography', 'bio', 'description', 'signature', 'about', 'summary', 'intro',
];

function collectBioText(profile) {
  const parts = [];
  for (const f of BIO_TEXT_FIELDS) {
    const v = profile?.[f];
    if (typeof v === 'string' && v.trim()) parts.push(v);
  }
  return parts.join('\n');
}

/**
 * Second-pass enrichment: scan each platform's scraped profile snapshot for
 * outbound URLs and merge any new platform/handle into identity.json's
 * suspected_accounts. Returns `{ added, scanned }`.
 *
 * Scanned files: <kolDir>/accounts/profiles/<platform>.json
 *
 * @param {string} kolDir         absolute KOL directory
 * @param {object} [opts]
 * @param {(line:string)=>void} [opts.onLog]
 */
export function enrichFromScrapedProfiles(kolDir, { onLog = () => {} } = {}) {
  const identityPath = join(kolDir, 'accounts', 'identity.json');
  if (!existsSync(identityPath)) return { added: 0, scanned: 0 };

  let identity;
  try { identity = JSON.parse(readFileSync(identityPath, 'utf-8')); }
  catch { return { added: 0, scanned: 0 }; }

  const profilesDir = join(kolDir, 'accounts', 'profiles');
  if (!existsSync(profilesDir)) return { added: 0, scanned: 0 };

  let files;
  try { files = readdirSync(profilesDir).filter(f => f.endsWith('.json')); }
  catch { return { added: 0, scanned: 0 }; }

  const known      = buildKnownSet(identity);
  const discovered = new Map();
  let scanned = 0;

  for (const f of files) {
    let profile;
    try { profile = JSON.parse(readFileSync(join(profilesDir, f), 'utf-8')); }
    catch { continue; }
    const platform = profile.platform ?? f.replace(/\.json$/, '');
    const bioText  = collectBioText(profile);
    if (!bioText) continue;
    scanned++;

    const links = extractUrlsFromText(bioText);
    if (!links.length) continue;
    onLog(`[bio-enrich:post-scrape] ${platform}: bio ${bioText.length}c → ${links.length} 个外链`);

    for (const link of links) {
      const ident = identifyPlatformFromUrl(link.url);
      if (!ident) continue;
      const key = `${ident.platform}::${ident.handle.toLowerCase()}`;
      if (known.has(key)) continue;

      const sourceUrl = profile.url ?? `(${platform} profile snapshot)`;
      const prev = discovered.get(key);
      if (prev) {
        if (!prev.evidence_urls.includes(sourceUrl)) prev.evidence_urls.push(sourceUrl);
        continue;
      }
      discovered.set(key, {
        platform:         ident.platform,
        handle_id:        ident.handle,
        url:              ident.url,
        // Higher confidence than the pre-scrape pass: the source bio came
        // from an authenticated scrape of a verified account, not a guess.
        confidence_score: 75,
        reason:           `Discovered via ${platform} profile bio (post-scrape)`,
        evidence_urls:    [sourceUrl, link.url],
        matched_signals: {
          avatar_match:          false,
          bio_match:             true,
          cross_linked:          true,
          same_username_pattern: ident.handle.toLowerCase() === String(profile.handle ?? '').toLowerCase(),
          same_watermark:        false,
        },
        discovery_source: 'scraped_bio',
      });
    }
  }

  const list = [...discovered.values()];
  if (list.length > 0) {
    identity.suspected_accounts = [
      ...(identity.suspected_accounts ?? []),
      ...list,
    ];
    writeFileSync(identityPath, JSON.stringify(identity, null, 2), 'utf-8');
  }
  // `discovered` is the raw list of new candidates so callers can drive a
  // follow-up scrape against them without having to re-read identity.json.
  return { added: list.length, scanned, discovered: list };
}

// ── Discoveries → scrape configs ──────────────────────────────────────────
//
// Turn enrichment output into the platformConfig shape runner.runScrape
// expects. Routes through extractScrapeTargets so platform aliasing /
// handle-id normalization / URL-fallback parsing all stay in one place
// instead of being duplicated in callers.
//
// @param {Array}  discovered    candidates from enrichFromBios / enrichFromScrapedProfiles
// @param {string} kolId         which KOL these belong to (carried into runScrape)
// @param {object} baseConfig    shared options spread into every platform config
//                               (max / since / until / outDir / api keys / …)
// @returns {Array}              [] when no candidate maps to a supported platform
export function discoveriesToPlatformConfigs(discovered, kolId, baseConfig = {}) {
  if (!discovered?.length || !kolId) return [];

  // extractScrapeTargets reads from {verified_accounts, suspected_accounts}
  // — feed everything in as suspected so the function's verified/suspected
  // partitioning doesn't matter; we just want the targets map.
  const miniIdentity = { verified_accounts: [], suspected_accounts: discovered };
  const extract = extractScrapeTargets([{ slug: kolId, data: miniIdentity }]);

  const configs = [];
  for (const [pv, handles] of Object.entries(extract.targets ?? {})) {
    if (!handles?.length) continue;
    configs.push({
      platform: pv,
      targets:  handles.join(','),
      kolId,
      ...baseConfig,
    });
  }
  return configs;
}
