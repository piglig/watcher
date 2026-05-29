/**
 * bluesky.js — Bluesky scraper via AT Protocol API
 *
 * Uses App Password authentication for higher rate limits and reliable
 * access to R18-labeled content (labels are returned in full).
 *
 * Create an App Password at: https://bsky.app/settings/app-passwords
 * Env vars: BLUESKY_IDENTIFIER (handle), BLUESKY_APP_PASSWORD
 */

import { createLogger } from '../../shared/logger.js';

const BSKY_API = 'https://bsky.social/xrpc';

const R18_LABELS = new Set([
  'sexual', 'nudity', 'porn', 'graphic-media', 'gore', 'nsfl',
]);

// ── Handle parsing ─────────────────────────────────────────────────────────────

export function parseBlueskyHandle(raw) {
  if (!raw || typeof raw !== 'string') return null;
  raw = raw.trim();
  const urlMatch = raw.match(/bsky\.app\/profile\/([\w.\-@]+)/i);
  if (urlMatch) return urlMatch[1].replace(/^@/, '');
  return raw.replace(/^@/, '') || null;
}

// ── Auth ───────────────────────────────────────────────────────────────────────

async function createSession(identifier, appPassword) {
  const res = await fetch(`${BSKY_API}/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password: appPassword }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Bluesky login failed (${res.status}): ${body}`);
  }
  return res.json(); // { accessJwt, refreshJwt, handle, did }
}

function makeHeaders(accessJwt) {
  return {
    'Authorization': `Bearer ${accessJwt}`,
    'Accept': 'application/json',
  };
}

// ── API helpers ────────────────────────────────────────────────────────────────

async function apiGet(path, params, headers, debug = false, log = createLogger()) {
  const url = new URL(`${BSKY_API}/${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }

  if (debug) log.log('[DBG] GET', url.toString());

  const res = await fetch(url.toString(), { headers });

  if (res.status === 429) {
    const wait = Number(res.headers.get('Retry-After') ?? 5);
    log.warn(`[WARN] Bluesky rate limit — waiting ${wait}s...`);
    await new Promise(r => setTimeout(r, wait * 1000));
    return apiGet(path, params, headers, debug, log);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Bluesky ${path} failed (${res.status}): ${body}`);
  }

  return res.json();
}

// ── Parsers ────────────────────────────────────────────────────────────────────

function extractTags(record) {
  const tags = [];
  for (const facet of (record.facets ?? [])) {
    for (const feat of (facet.features ?? [])) {
      if (feat.$type === 'app.bsky.richtext.facet#tag' && feat.tag) {
        tags.push(feat.tag);
      }
    }
  }
  return tags;
}

function extractMedia(embed) {
  if (!embed) return [];
  const media = [];
  const type  = embed.$type ?? '';

  if (type === 'app.bsky.embed.images#view') {
    for (const img of (embed.images ?? [])) {
      media.push({ type: 'image', url: img.fullsize ?? img.thumb ?? '', alt: img.alt ?? '' });
    }
  } else if (type === 'app.bsky.embed.video#view') {
    media.push({
      type:      'video',
      url:       embed.playlist ?? '',
      thumbnail: embed.thumbnail ?? '',
    });
  } else if (type === 'app.bsky.embed.external#view') {
    const ext = embed.external ?? {};
    if (ext.thumb) media.push({ type: 'image', url: ext.thumb, alt: ext.title ?? '' });
  } else if (type === 'app.bsky.embed.recordWithMedia#view') {
    media.push(...extractMedia(embed.media));
  }

  return media;
}

function hasR18Label(labels) {
  return (labels ?? []).some(l => R18_LABELS.has(l.val));
}

function checkR18(post) {
  if (hasR18Label(post.labels)) return true;
  const embed = post.embed;
  if (embed?.$type === 'app.bsky.embed.images#view') {
    for (const img of (embed.images ?? [])) {
      if (hasR18Label(img.labels)) return true;
    }
  }
  return false;
}

function parsePost(item) {
  const { post, reason } = item;
  if (!post?.uri) return null;

  const uriParts = post.uri.split('/');
  const rkey     = uriParts[uriParts.length - 1];
  const handle   = post.author?.handle ?? '';
  const record   = post.record ?? {};

  const isRepost = reason?.$type === 'app.bsky.feed.defs#reasonRepost';
  const isReply  = !!record.reply;
  const type     = isRepost ? 'repost' : isReply ? 'reply' : 'post';

  return {
    id:         post.uri,
    uri:        post.uri,
    url:        `https://bsky.app/profile/${handle}/post/${rkey}`,
    text:       record.text ?? '',
    created_at: record.createdAt ?? post.indexedAt ?? null,
    author: {
      id:        post.author?.did          ?? '',
      username:  handle,
      name:      post.author?.displayName  ?? handle,
      followers: post.author?.followersCount ?? 0,
      verified:  false,
      avatar:    post.author?.avatar       ?? '',
    },
    metrics: {
      likes:   post.likeCount   ?? 0,
      reposts: post.repostCount ?? 0,
      replies: post.replyCount  ?? 0,
      quotes:  post.quoteCount  ?? 0,
    },
    media:    extractMedia(post.embed),
    type,
    language: (record.langs ?? [])[0] ?? '',
    tags:     extractTags(record),
    is_r18:   checkR18(post),
    ...(isRepost && reason?.by ? {
      repost_by: {
        id:       reason.by.did     ?? '',
        username: reason.by.handle  ?? '',
        name:     reason.by.displayName ?? '',
      },
    } : {}),
    platform: 'bluesky',
  };
}

function parseProfile(data) {
  return {
    id:          data.did            ?? '',
    handle:      data.handle         ?? '',
    username:    data.handle         ?? '',
    name:        data.displayName    ?? data.handle ?? '',
    bio:         data.description    ?? '',
    followers:   data.followersCount ?? 0,
    following:   data.followsCount   ?? 0,
    posts_count: data.postsCount     ?? 0,
    avatar:      data.avatar         ?? '',
    banner:      data.banner         ?? '',
    created_at:  data.createdAt      ?? null,
    verified:    false,
    labels:      (data.labels ?? []).map(l => l.val),
    platform:    'bluesky',
  };
}

// ── Filter ─────────────────────────────────────────────────────────────────────

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
    if (keyword && !p.text.toLowerCase().includes(keyword)) return false;
    return true;
  };
}

// ── Per-user scrape ────────────────────────────────────────────────────────────

export async function scrapeBlueskyUser(handle, headers, opts = {}) {
  const {
    max    = 200,
    filter = 'posts_with_replies',
    debug  = false,
    logger = null,
    ...filterOpts
  } = opts;
  const log = createLogger(logger);

  log.log(`  @${handle}  [Bluesky]`);

  const filterFn = buildFilter(filterOpts);

  log.log(`Bluesky: fetching profile @${handle}...`);
  const profileData = await apiGet('app.bsky.actor.getProfile', { actor: handle }, headers, debug, log);
  const profile     = parseProfile(profileData);

  const postMap = new Map();
  let   cursor  = null;

  while (postMap.size < max) {
    const params = {
      actor:  handle,
      limit:  Math.min(100, max - postMap.size),
      filter,
    };
    if (cursor) params.cursor = cursor;

    const data = await apiGet('app.bsky.feed.getAuthorFeed', params, headers, debug, log);

    for (const item of (data.feed ?? [])) {
      const p = parsePost(item);
      if (p && !postMap.has(p.id)) postMap.set(p.id, p);
    }

    cursor = data.cursor;
    if (!cursor || !data.feed?.length) break;
    log.log(`Bluesky: ${postMap.size} posts collected...`);
  }

  const posts = Array.from(postMap.values())
    .filter(filterFn)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, max);

  const r18Count = posts.filter(p => p.is_r18).length;
  log.log(`Bluesky: ${posts.length} posts (${r18Count} R18)`);

  return { profile, posts };
}

// ── Main entry ─────────────────────────────────────────────────────────────────

/**
 * Scrape Bluesky posts for one or more handles.
 *
 * @example
 * const results = await scrapeBluesky('user.bsky.social', {
 *   identifier: 'me.bsky.social', appPassword: 'xxxx-xxxx-xxxx-xxxx',
 * });
 * const { profile, posts } = results['user.bsky.social'];
 */
export async function scrapeBluesky(usernames, opts = {}) {
  const handles = (Array.isArray(usernames) ? usernames : [usernames])
    .map(parseBlueskyHandle)
    .filter(Boolean);

  if (!handles.length) throw new Error('No valid Bluesky handle provided.');

  const {
    identifier  = process.env.BLUESKY_IDENTIFIER,
    appPassword = process.env.BLUESKY_APP_PASSWORD,
    debug       = false,
    logger: rawLogger = null,
    ...userOpts
  } = opts;
  const log = createLogger(rawLogger);

  if (!identifier || !appPassword) {
    throw new Error(
      'Bluesky credentials required.\n' +
      '  Env vars: BLUESKY_IDENTIFIER="user.bsky.social"  BLUESKY_APP_PASSWORD="xxxx-xxxx-xxxx-xxxx"\n' +
      '  Create:   https://bsky.app/settings/app-passwords'
    );
  }

  log.log('Bluesky: authenticating...');
  const session = await createSession(identifier, appPassword);
  const headers = makeHeaders(session.accessJwt);
  log.log(`Bluesky: logged in as @${session.handle}`);

  const results = {};
  for (const handle of handles) {
    results[handle] = await scrapeBlueskyUser(handle, headers, { debug, logger: rawLogger, ...userOpts });
  }
  return results;
}
