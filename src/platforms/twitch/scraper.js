/**
 * twitch.js — Twitch channel scraper
 * Channel info + VODs + Clips via Twitch Helix API.
 *
 * Requires: TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET
 *   → https://dev.twitch.tv/console  (免费注册，无需审核)
 *
 * Rate limit: 800 req/min per Client-ID，远超日常用量。
 */

const HELIX       = 'https://api.twitch.tv/helix';
const TOKEN_URL   = 'https://id.twitch.tv/oauth2/token';
const CLIENT_ID_ENV     = 'TWITCH_CLIENT_ID';
const CLIENT_SECRET_ENV = 'TWITCH_CLIENT_SECRET';

// ── Input parsing ─────────────────────────────────────────────────────────────

export function parseTwitchLogin(raw) {
  if (typeof raw !== 'string') return null;
  raw = raw.trim();
  const urlMatch = raw.match(/twitch\.tv\/([A-Za-z0-9_]+)/i);
  if (urlMatch) return urlMatch[1].toLowerCase();
  return raw.replace(/^@/, '').toLowerCase() || null;
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function getAppToken(clientId, clientSecret) {
  const res = await fetch(
    `${TOKEN_URL}?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`,
    { method: 'POST' }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Twitch token request failed (${res.status}): ${body}`);
  }
  const data = await res.json();
  if (!data.access_token) throw new Error('Twitch token response missing access_token');
  return data.access_token;
}

function makeHeaders(clientId, token) {
  return {
    'Client-ID':     clientId,
    'Authorization': `Bearer ${token}`,
  };
}

async function helixGet(path, params, headers, debug = false) {
  const url = new URL(`${HELIX}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }
  const dbg = (...m) => debug && console.log('[DBG]', ...m);
  dbg(`GET ${url.toString()}`);

  const res = await fetch(url.toString(), { headers });
  if (res.status === 429) {
    const retry = Number(res.headers.get('Ratelimit-Reset') ?? 0);
    const wait  = Math.max(0, retry * 1000 - Date.now()) + 1000;
    console.warn(`[WARN] Twitch rate limit — waiting ${Math.ceil(wait / 1000)}s...`);
    await new Promise(r => setTimeout(r, wait));
    return helixGet(path, params, headers, debug);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Helix ${path} failed (${res.status}): ${body}`);
  }
  return res.json();
}

// ── Parsers ───────────────────────────────────────────────────────────────────

/** Convert Twitch duration string ("1h30m20s", "5m40s", "45s") to seconds */
function parseDuration(s) {
  if (!s) return 0;
  const m = s.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
  return (Number(m?.[1] ?? 0) * 3600)
       + (Number(m?.[2] ?? 0) * 60)
       + Number(m?.[3] ?? 0);
}

function parseUser(u) {
  if (!u) return null;
  return {
    id:           u.id,
    login:        u.login,
    display_name: u.display_name ?? u.login,
    description:  u.description ?? '',
    created_at:   u.created_at  ?? null,
    view_count:   u.view_count  ?? 0,
    profile_image_url: u.profile_image_url ?? '',
    platform:     'twitch',
  };
}

function parseVideo(v) {
  if (!v?.id) return null;
  const durationSecs = parseDuration(v.duration);

  // Twitch thumbnail URL: contains {width}x{height} placeholders
  const thumbnail = (v.thumbnail_url ?? '')
    .replace('{width}', '640')
    .replace('{height}', '360');

  return {
    id:          v.id,
    url:         v.url ?? `https://www.twitch.tv/videos/${v.id}`,
    title:       v.title       ?? '',
    description: v.description ?? '',
    created_at:  v.created_at  ?? null,
    duration:    durationSecs,
    duration_str: v.duration   ?? '',
    view_count:  v.view_count  ?? 0,
    thumbnail,
    language:    v.language    ?? '',
    type:        v.type        ?? 'archive',   // archive | highlight | upload
    author: {
      id:       v.user_id    ?? '',
      username: v.user_login ?? '',
      name:     v.user_name  ?? '',
    },
    platform: 'twitch',
  };
}

function parseClip(c) {
  if (!c?.id) return null;

  const thumbnail = (c.thumbnail_url ?? '')
    .replace('{width}', '640')
    .replace('{height}', '360');

  return {
    id:          c.id,
    url:         c.url ?? `https://clips.twitch.tv/${c.id}`,
    title:       c.title      ?? '',
    created_at:  c.created_at ?? null,
    duration:    c.duration   ?? 0,
    view_count:  c.view_count ?? 0,
    thumbnail,
    game_id:     c.game_id    ?? '',
    game_name:   c.game_name  ?? '',
    language:    c.language   ?? '',
    type:        'clip',
    // broadcaster (channel owner)
    author: {
      id:       c.broadcaster_id    ?? '',
      username: c.broadcaster_login ?? '',
      name:     c.broadcaster_name  ?? '',
    },
    // clip creator (who clipped it)
    creator: {
      id:       c.creator_id    ?? '',
      username: c.creator_name  ?? '',
    },
    platform: 'twitch',
  };
}

// ── Paginated fetchers ────────────────────────────────────────────────────────

async function fetchAllVideos(userId, headers, opts = {}) {
  const { max = 1000, type = 'all', debug = false } = opts;
  const items  = [];
  let   cursor = null;

  while (items.length < max) {
    const params = {
      user_id: userId,
      first:   Math.min(100, max - items.length),
      type,                                      // 'all' | 'archive' | 'highlight' | 'upload'
    };
    if (cursor) params.after = cursor;

    const data = await helixGet('/videos', params, headers, debug);
    for (const v of (data.data ?? [])) {
      const parsed = parseVideo(v);
      if (parsed) items.push(parsed);
    }

    cursor = data.pagination?.cursor;
    if (!cursor || !data.data?.length) break;
    console.log(`Twitch VODs: ${items.length} fetched...`);
  }

  return items;
}

async function fetchAllClips(broadcasterId, headers, opts = {}) {
  const { max = 1000, since, until, debug = false } = opts;
  const items  = [];
  let   cursor = null;

  while (items.length < max) {
    const params = {
      broadcaster_id: broadcasterId,
      first: Math.min(100, max - items.length),
    };
    if (cursor)  params.after    = cursor;
    if (since)   params.started_at = new Date(since).toISOString();
    if (until)   params.ended_at   = new Date(until).toISOString();

    const data = await helixGet('/clips', params, headers, debug);
    for (const c of (data.data ?? [])) {
      const parsed = parseClip(c);
      if (parsed) items.push(parsed);
    }

    cursor = data.pagination?.cursor;
    if (!cursor || !data.data?.length) break;
    console.log(`Twitch Clips: ${items.length} fetched...`);
  }

  return items;
}

async function fetchFollowers(broadcasterId, headers, debug = false) {
  try {
    const data = await helixGet('/channels/followers', { broadcaster_id: broadcasterId, first: 1 }, headers, debug);
    return data.total ?? 0;
  } catch {
    return 0;
  }
}

// ── Filter ────────────────────────────────────────────────────────────────────

function buildFilter(opts = {}) {
  const since   = opts.since   ? new Date(opts.since)   : null;
  const until   = opts.until   ? new Date(opts.until)   : null;
  const keyword = opts.keyword ? opts.keyword.toLowerCase() : null;

  return item => {
    if (since || until) {
      const d = new Date(item.created_at);
      if (since && d < since) return false;
      if (until && d > until) return false;
    }
    if (keyword && !item.title.toLowerCase().includes(keyword)) return false;
    return true;
  };
}

// ── Main scrape ───────────────────────────────────────────────────────────────

export async function scrapeTwitchChannel(login, clientId, clientSecret, opts = {}) {
  const {
    max       = 1000,
    maxVods   = max,
    maxClips  = max,
    vodType   = 'all',       // 'all' | 'archive' | 'highlight' | 'upload'
    debug     = false,
    ...filterOpts
  } = opts;

  const filterFn = buildFilter(filterOpts);
  const dbg      = (...m) => debug && console.log('[DBG]', ...m);

  console.log('\nTwitch: acquiring app access token...');
  const token   = await getAppToken(clientId, clientSecret);
  const headers = makeHeaders(clientId, token);

  // 1. User info
  console.log(`Twitch: fetching user @${login}...`);
  const userData = await helixGet('/users', { login }, headers, debug);
  const rawUser  = userData.data?.[0];
  if (!rawUser) throw new Error(`Twitch user not found: ${login}`);
  const profile = parseUser(rawUser);

  // 2. Follower count (separate endpoint)
  profile.followers = await fetchFollowers(profile.id, headers, debug);
  dbg(`${profile.display_name} — ${profile.followers} followers`);

  // 3. VODs
  let videos = [];
  if (maxVods > 0) {
    console.log('Twitch: fetching VODs...');
    videos = await fetchAllVideos(profile.id, headers, {
      max: maxVods, type: vodType, debug,
    });
    console.log(`Twitch VODs: ${videos.length} total`);
  }

  // 4. Clips
  let clips = [];
  if (maxClips > 0) {
    console.log('Twitch: fetching Clips...');
    clips = await fetchAllClips(profile.id, headers, {
      max: maxClips, debug,
      since: filterOpts.since,
      until: filterOpts.until,
    });
    console.log(`Twitch Clips: ${clips.length} total`);
  }

  // 5. Filter + sort
  const filterAndSort = arr =>
    arr.filter(filterFn)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  videos = filterAndSort(videos).slice(0, maxVods);
  clips  = filterAndSort(clips).slice(0, maxClips);

  return { profile, videos, clips };
}

export async function scrapeTwitch(targets, opts = {}) {
  const {
    clientId     = process.env[CLIENT_ID_ENV],
    clientSecret = process.env[CLIENT_SECRET_ENV],
    debug        = false,
    ...channelOpts
  } = opts;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Twitch API credentials required.\n' +
      `  Set env vars: $env:${CLIENT_ID_ENV}="xxx"  $env:${CLIENT_SECRET_ENV}="xxx"\n` +
      '  Or pass:      --client-id xxx --client-secret xxx\n' +
      '  Get keys:     https://dev.twitch.tv/console  (免费注册)'
    );
  }

  const logins = (Array.isArray(targets) ? targets : [targets])
    .map(parseTwitchLogin)
    .filter(Boolean);
  if (!logins.length) throw new Error('No valid Twitch login provided.');

  const results = {};
  for (const login of logins) {
    console.log(`\n${'═'.repeat(52)}`);
    console.log(`  ${login}  [Twitch]`);
    console.log(`${'═'.repeat(52)}`);
    results[login] = await scrapeTwitchChannel(login, clientId, clientSecret, { debug, ...channelOpts });
  }
  return results;
}
