/**
 * bio-extractor.js — Pre-fetch profile-page bootstrap JSON to capture bio links
 * that Grok's web_search tool misses (e.g. YouTube's About panel headerLinks,
 * TikTok bioLink, Threads bio_links).
 *
 * Pure HTTPS fetch — no Playwright, no auth. Returns null on any failure so
 * the OSINT pipeline degrades gracefully to Grok-only extraction.
 *
 * Output shape (per seed):
 *   { platform, profile_url, links:[{label,url}], email?, location?, description? }
 *   or null if nothing extractable.
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
         + '(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const FETCH_TIMEOUT_MS = 15_000;

async function safeFetch(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent':      UA,
        'accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal:   ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Decode YouTube's outbound-redirect URL: /redirect?event=...&q=ENCODED
function decodeYtRedirect(href) {
  try {
    const u = new URL(href, 'https://www.youtube.com');
    const q = u.searchParams.get('q');
    return q ? decodeURIComponent(q) : null;
  } catch { return null; }
}

function dedupeLinks(links) {
  const seen = new Set();
  const out  = [];
  for (const l of links) {
    if (!l?.url) continue;
    const key = l.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
  }
  return out;
}

// ── YouTube ─────────────────────────────────────────────────────────────────
// /@handle/about renders bio links as /redirect?event=channel_description&q=URL.
// Title text (e.g. "Facebook", "TikTok") is the closest "title":"..." pair in
// the surrounding JSON — but reliably pairing them requires parsing the full
// ytInitialData blob. We instead emit the decoded URL and infer label from the
// URL's hostname later, which is good enough for downstream cross-platform
// identification.
async function extractYouTube(profileUrl) {
  // Normalize to /about so the headerLinks render in the initial HTML.
  let aboutUrl = profileUrl.replace(/\/+$/, '');
  if (!/\/about(\?|$)/i.test(aboutUrl)) aboutUrl += '/about';

  const html = await safeFetch(aboutUrl);
  if (!html) return null;

  // 1. External links — every visible bio link goes through /redirect?...&q=ENCODED.
  // YouTube serializes these inside JSON script blobs, so & arrives as &
  // and / as /. Capture the whole redirect URL and JSON-unescape before
  // parsing query params.
  const redirectMatches = html.matchAll(
    /"(https:\\?\/\\?\/www\.youtube\.com\\?\/redirect\?[^"]+)"/g,
  );
  const links = [];
  for (const m of redirectMatches) {
    let raw = m[1];
    try { raw = JSON.parse('"' + raw + '"'); } catch { /* fall through with raw */ }
    const decoded = decodeYtRedirect(raw);
    if (decoded && /^https?:\/\//i.test(decoded)) {
      try {
        const u = new URL(decoded);
        const host = u.hostname;
        const isYouTube = /(^|\.)youtube\.com$/i.test(host) || host === 'youtu.be';
        // YouTube → keep only channel/handle URLs (sub-account links are valuable
        // OSINT signal); drop /watch /playlist /shorts /redirect internal noise.
        if (isYouTube) {
          if (!/^\/(?:@|channel\/|c\/|user\/)/i.test(u.pathname)) continue;
        }
        links.push({ label: host, url: decoded });
      } catch { /* skip malformed */ }
    }
  }

  // 2. Business email is gated behind a captcha on /about — never in initial HTML.
  //    We deliberately skip it here; Grok handles it via x_search.

  // 3. Country / location appears as "country":"..." in pageHeaderRenderer.
  const country = html.match(/"country":\{"simpleText":"([^"]+)"\}/)?.[1]
              ?? html.match(/"country":"([^"]+)"/)?.[1]
              ?? null;

  // 4. Description (first sizable channelMetadataRenderer description field).
  const desc = html.match(/"channelMetadataRenderer":\{[^}]*?"description":"((?:\\"|[^"])*)"/)?.[1];
  const description = desc ? desc.replace(/\\n/g, '\n').replace(/\\"/g, '"').slice(0, 400) : null;

  const deduped = dedupeLinks(links);
  if (!deduped.length && !country && !description) return null;

  return {
    platform:    'youtube',
    profile_url: aboutUrl,
    links:       deduped,
    location:    country,
    description,
  };
}

// ── TikTok ──────────────────────────────────────────────────────────────────
// __UNIVERSAL_DATA_FOR_REHYDRATION__ contains userInfo.user.bioLink + signature.
async function extractTikTok(profileUrl) {
  const html = await safeFetch(profileUrl);
  if (!html) return null;

  const blob = html.match(
    /<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/,
  )?.[1];
  if (!blob) return null;

  let data;
  try { data = JSON.parse(blob); } catch { return null; }

  const user = data?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo?.user;
  if (!user) return null;

  const links = [];
  if (user.bioLink?.link) {
    links.push({ label: 'bioLink', url: user.bioLink.link });
  }

  return {
    platform:    'tiktok',
    profile_url: profileUrl,
    links:       dedupeLinks(links),
    location:    user.region ?? null,
    description: user.signature ?? null,
  };
}

// ── Threads ─────────────────────────────────────────────────────────────────
// User bio_links live in inline <script type="application/json" data-sjs> blobs.
async function extractThreads(profileUrl) {
  const html = await safeFetch(profileUrl);
  if (!html) return null;

  // bio_links arrays appear like: "bio_links":[{"url":"https://..."},{...}]
  const links = [];
  for (const m of html.matchAll(/"bio_links":\[([^\]]*?)\]/g)) {
    for (const u of m[1].matchAll(/"url":"((?:\\"|[^"])+?)"/g)) {
      const url = u[1].replace(/\\\//g, '/').replace(/\\u0026/g, '&');
      if (/^https?:\/\//i.test(url)) {
        links.push({ label: new URL(url).hostname, url });
      }
    }
  }

  // Bio text (first non-empty biography field)
  const bio = html.match(/"biography(?:_with_entities)?":"((?:\\"|[^"])*?)"/)?.[1];
  const description = bio
    ? bio.replace(/\\n/g, '\n').replace(/\\"/g, '"').slice(0, 400)
    : null;

  const deduped = dedupeLinks(links);
  if (!deduped.length && !description) return null;

  return {
    platform:    'threads',
    profile_url: profileUrl,
    links:       deduped,
    description,
  };
}

// ── Bluesky ────────────────────────────────────────────────────────────────
// Public AT-proto endpoint returns the profile record including description.
// Bio links aren't first-class fields in AT-proto — they live as facets inside
// the description text — so we URL-scrape the description itself.
async function extractBluesky(profileUrl) {
  const handle = profileUrl.match(/bsky\.app\/profile\/([^/?#]+)/i)?.[1];
  if (!handle) return null;
  const api = `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`;

  const res = await safeFetch(api);
  if (!res) return null;
  let data;
  try { data = JSON.parse(res); } catch { return null; }

  const description = data.description ?? null;
  const links = extractUrlsFromText(description);

  if (!links.length && !description) return null;
  return {
    platform:    'bluesky',
    profile_url: profileUrl,
    links,
    description: description?.slice(0, 400) ?? null,
  };
}

// ── Reddit ─────────────────────────────────────────────────────────────────
// Public profile endpoint /user/<handle>/about.json — no auth needed for
// public profiles. Bio lives at data.subreddit.public_description and
// data.subreddit.description; we also surface the user-supplied URL field
// (data.subreddit.url and data.subreddit.title sometimes carry links).
async function extractReddit(profileUrl) {
  const handle = profileUrl.match(/reddit\.com\/(?:user|u)\/([\w\-]+)/i)?.[1];
  if (!handle) return null;
  const api = `https://www.reddit.com/user/${encodeURIComponent(handle)}/about.json`;

  const res = await safeFetch(api);
  if (!res) return null;
  let data;
  try { data = JSON.parse(res); } catch { return null; }

  const sr = data?.data?.subreddit ?? {};
  const bio = [sr.public_description, sr.description, sr.title]
    .filter(Boolean).join('\n').trim();
  const links = extractUrlsFromText(bio);

  if (!links.length && !bio) return null;
  return {
    platform:    'reddit',
    profile_url: profileUrl,
    links,
    description: bio.slice(0, 400),
  };
}

// Generic URL scrape for free-text bios. Captures http(s) URLs and decorates
// each with the host as a label so downstream platform identification has
// something to match on. Exported because bio-enrichment.js re-uses it on
// the scraped profile.json blobs.
//
// Two passes:
//   1) Explicit http(s):// URLs.
//   2) Bare-domain shorthand common in bios — e.g. "twitch.tv/foo",
//      "instagram.com/bar". We restrict to known social hosts to avoid
//      matching arbitrary "site.com/something" prose. Each bare match is
//      synthesized into a full https URL so downstream identifyPlatformFromUrl
//      regexes (which require a scheme) match uniformly.
const BARE_SOCIAL_HOSTS = [
  'youtube\\.com', 'youtu\\.be',
  'twitter\\.com', 'x\\.com',
  'tiktok\\.com',
  'threads\\.(?:net|com)',
  'instagram\\.com',
  'reddit\\.com',
  'twitch\\.tv',
  'bsky\\.(?:app|social)',
  'facebook\\.com', 'fb\\.com',
];
const BARE_URL_RE = new RegExp(
  `(?:^|[^A-Za-z0-9/])((?:www\\.)?(?:${BARE_SOCIAL_HOSTS.join('|')})\\/[^\\s<>"',]+)`,
  'gi',
);

export function extractUrlsFromText(text) {
  if (!text) return [];
  const out = [];
  const seen = new Set();

  const push = (raw) => {
    let url = raw.replace(/[).,!?;:]+$/, '');
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url.replace(/^\/+/, '');
    try {
      const host = new URL(url).hostname;
      const key = url.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ label: host, url });
    } catch { /* skip malformed */ }
  };

  for (const m of String(text).matchAll(/https?:\/\/[^\s<>"']+/gi)) push(m[0]);
  for (const m of String(text).matchAll(BARE_URL_RE))               push(m[1]);

  return out;
}

// ── Dispatch ────────────────────────────────────────────────────────────────

function pickExtractor(seedUrl) {
  let host;
  try { host = new URL(seedUrl).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return null; }

  if (host.endsWith('youtube.com') || host === 'youtu.be')       return extractYouTube;
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com'))     return extractTikTok;
  if (host === 'threads.net' || host === 'threads.com'
      || host.endsWith('.threads.net') || host.endsWith('.threads.com')) return extractThreads;
  if (host === 'bsky.app' || host === 'bsky.social'
      || host.endsWith('.bsky.app') || host.endsWith('.bsky.social')) return extractBluesky;
  if (host === 'reddit.com' || host.endsWith('.reddit.com'))     return extractReddit;

  // Instagram, Facebook, X/Twitter require authenticated sessions — covered
  // separately during scrape (their profile.json files contain `biography`
  // /`description` already; bio-enrichment can mine that post-scrape).
  return null;
}

/**
 * @param {string} seedUrl
 * @returns {Promise<object | null>}  Extraction result or null when unsupported / failed.
 */
export async function extractBioLinks(seedUrl) {
  if (!seedUrl || typeof seedUrl !== 'string') return null;
  const fn = pickExtractor(seedUrl);
  if (!fn) return null;
  try {
    return await fn(seedUrl);
  } catch {
    return null;
  }
}

/**
 * Render an extraction result into a compact text block for prompt injection.
 * Returns "(none)" when nothing was extracted — keeps the prompt valid.
 */
export function renderBioExtract(extract) {
  if (!extract) return '(none — Grok must rely on web_search/x_search)';

  const lines = [`Platform: ${extract.platform}`, `Source: ${extract.profile_url}`];
  if (extract.location)    lines.push(`Location: ${extract.location}`);
  if (extract.description) lines.push(`Description: ${extract.description.replace(/\s+/g, ' ').trim()}`);
  if (extract.links?.length) {
    lines.push('Bio links:');
    for (const { label, url } of extract.links) {
      lines.push(`  - ${label ? `${label}: ` : ''}${url}`);
    }
  } else {
    lines.push('Bio links: (none found in bootstrap JSON)');
  }
  return lines.join('\n');
}
