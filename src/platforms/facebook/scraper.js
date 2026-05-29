/**
 * facebook.js — Facebook profile scraper
 * Uses CloakBrowser to intercept Facebook's internal GraphQL responses and
 * scrolls the profile timeline to harvest posts.
 *
 * First run: headed mode for manual login (Facebook credentials, 2FA, etc.).
 * Subsequent runs: headless with saved session.
 *
 * Target: facebook.com/<user>  (personal profiles AND pages — both render the
 * same timeline GraphQL shape under www.facebook.com).
 */

import { resolve }                          from 'path';
import { writeFileSync }                    from 'fs';
import { waitForLoginSignal }               from '../../shared/login-signal.js';
import { createLogger }                      from '../../shared/logger.js';
import {
  launchSessionContext, saveSessionState,
  hasSavedSession, clearSessionState,
}                                           from '../../shared/browser.js';

const DESKTOP_VIEWPORT = { width: 1280, height: 900 };

async function setupLoginPage(context) {
  const page = await context.newPage();
  await page.setViewportSize(DESKTOP_VIEWPORT);
  return page;
}

async function setupDesktopPage(context) {
  const page = await context.newPage();
  await page.route('**/*', route => {
    const type = route.request().resourceType();
    if (type === 'image' || type === 'media' || type === 'font') return route.abort();
    return route.continue();
  });
  await page.setViewportSize(DESKTOP_VIEWPORT);
  return page;
}

export const DEFAULT_SESSION_DIR = resolve('sessions/facebook');

// ── Username parsing ──────────────────────────────────────────────────────────

/**
 * Accept:
 *   - https://www.facebook.com/zuck
 *   - https://www.facebook.com/profile.php?id=4
 *   - facebook.com/people/Some-Name/100012345678901/
 *   - @zuck   /  zuck
 *
 * Returns the path-segment Facebook expects after /facebook.com/, e.g.
 *   "zuck"  or  "profile.php?id=4"  or  "people/Some-Name/100012345678901"
 */
export function parseFacebookUsername(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;

  // profile.php?id=...
  const idMatch = s.match(/facebook\.com\/profile\.php\?id=(\d+)/i);
  if (idMatch) return `profile.php?id=${idMatch[1]}`;

  // /people/<name>/<id>/
  const peopleMatch = s.match(/facebook\.com\/people\/([^/]+)\/(\d+)/i);
  if (peopleMatch) return `people/${peopleMatch[1]}/${peopleMatch[2]}`;

  // /<handle>
  const urlMatch = s.match(/facebook\.com\/([A-Za-z0-9_.\-]+)/i);
  if (urlMatch) return urlMatch[1];

  // bare numeric id → profile.php
  if (/^\d{6,}$/.test(s)) return `profile.php?id=${s}`;

  return s.replace(/^@/, '') || null;
}

function profileUrl(target) {
  return `https://www.facebook.com/${target}`;
}

// ── Login helpers ─────────────────────────────────────────────────────────────

export async function isLoggedInFacebook(page) {
  try {
    const cookies = await page.context().cookies();
    // c_user is FB's authenticated user id cookie; xs accompanies it.
    return cookies.some(c => c.name === 'c_user') && cookies.some(c => c.name === 'xs');
  } catch {
    return false;
  }
}

async function waitForFacebookLogin(page, log = createLogger()) {
  log.log('Not logged in. Please log in to Facebook in the browser window.');
  log.log('  After login completes → press Enter here to confirm');

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
      if (await isLoggedInFacebook(page)) finish(true);
    }, 1500);

    waitForLoginSignal().then(async () => {
      if (!done && await isLoggedInFacebook(page)) finish(true);
    });

    const timer = setTimeout(() => finish(false), 180_000);
  });
}

// ── Parsers ───────────────────────────────────────────────────────────────────

/**
 * Recursively pull a text body out of FB's "message" field, which can be either
 *   { text: "..." }   or   { text: "...", ranges: [...] }
 * or nested under `story.message` / `comet_sections.message.story.message`.
 */
function extractMessage(node) {
  if (!node || typeof node !== 'object') return '';
  if (typeof node.text === 'string') return node.text;
  if (node.message?.text) return node.message.text;
  if (node.story?.message?.text) return node.story.message.text;
  return '';
}

function extractAttachmentMedia(attachments) {
  const media = [];
  if (!Array.isArray(attachments)) return media;
  for (const att of attachments) {
    // Old-style: media: { photo_image / image / playable_url }
    const m = att?.media ?? att?.styles?.attachment?.media ?? att?.style_type_renderer?.attachment?.media;
    if (!m) continue;

    if (m.playable_url || m.playable_url_quality_hd) {
      media.push({ type: 'video', url: m.playable_url_quality_hd ?? m.playable_url });
      continue;
    }
    const img = m.photo_image?.uri ?? m.image?.uri ?? m.thumbnailImage?.uri;
    if (img) media.push({ type: 'image', url: img });

    // Carousel (subattachments)
    const subs = att?.subattachments ?? att?.styles?.attachment?.subattachments;
    if (Array.isArray(subs)) {
      for (const s of subs) {
        const sm = s?.media;
        if (!sm) continue;
        if (sm.playable_url) media.push({ type: 'video', url: sm.playable_url });
        else if (sm.photo_image?.uri) media.push({ type: 'image', url: sm.photo_image.uri });
        else if (sm.image?.uri) media.push({ type: 'image', url: sm.image.uri });
      }
    }
  }
  return media;
}

/**
 * Parse a Facebook story / feed node.
 * FB has many shapes; we accept anything with creation_time + (id|post_id) +
 * either `message` text or `attachments`. Owner data is on `actors[0]` or
 * `comet_sections.context_layout.story.actor[0]`.
 */
function parseStory(node) {
  if (!node || typeof node !== 'object') return null;

  const created = node.creation_time
              ?? node.publish_time
              ?? node.story?.creation_time
              ?? node.comet_sections?.context_layout?.story?.comet_sections?.metadata?.[0]?.story?.creation_time;
  if (!created) return null;

  const id  = node.post_id ?? node.id ?? node.legacy_story_hideable_id ?? node.story?.id;
  if (!id) return null;

  const actor = node.actors?.[0]
             ?? node.story?.actors?.[0]
             ?? node.comet_sections?.context_layout?.story?.actors?.[0]
             ?? node.comet_sections?.content?.story?.actors?.[0];

  const message = extractMessage(node.message ?? node.story?.message ?? node);

  // Permalink / URL — wwwURL on the story or fall back to /<id>
  const url = node.wwwURL
           ?? node.url
           ?? node.story?.wwwURL
           ?? node.comet_sections?.feedback?.story?.url
           ?? `https://www.facebook.com/${id}`;

  const feedback = node.feedback
                ?? node.comet_sections?.feedback?.story?.feedback
                ?? node.comet_sections?.feedback?.story?.story_ufi_container?.story?.feedback;

  const likes = feedback?.reactors?.count
             ?? feedback?.reaction_count?.count
             ?? feedback?.i18n_reaction_count
             ?? 0;
  const comments = feedback?.total_comment_count
                ?? feedback?.comment_count?.total_count
                ?? feedback?.comments_count_summary_renderer?.feedback?.total_comment_count
                ?? 0;
  const shares = feedback?.share_count?.count
              ?? feedback?.share_count_reduced
              ?? 0;
  const views  = node.video_view_count ?? feedback?.video_view_count ?? 0;

  const attachments = node.attachments
                   ?? node.story?.attachments
                   ?? node.comet_sections?.content?.story?.attachments;
  const media = extractAttachmentMedia(attachments);

  const hasVideo = media.some(m => m.type === 'video');
  const type = hasVideo ? 'video' : (media.length > 1 ? 'carousel' : media.length === 1 ? 'photo' : 'status');

  return {
    id:         String(id),
    url:        typeof url === 'string' ? url : `https://www.facebook.com/${id}`,
    text:       typeof message === 'string' ? message : '',
    created_at: new Date(Number(created) * 1000).toISOString(),
    author: {
      id:        String(actor?.id ?? ''),
      username:  actor?.url ? (String(actor.url).match(/facebook\.com\/([^/?#]+)/i)?.[1] ?? '') : '',
      name:      actor?.name ?? '',
      followers: actor?.profile_social_context?.content?.[0]?.text
                  ? null  // FB rarely exposes follower count on story actors
                  : null,
      verified:  !!actor?.is_verified,
    },
    metrics: {
      likes:    Number(likes) || 0,
      comments: Number(comments) || 0,
      shares:   Number(shares) || 0,
      views:    Number(views) || 0,
    },
    media,
    type,
    platform: 'facebook',
  };
}

// ── Deep-search for stories in a raw JSON tree ────────────────────────────────

function findStoriesInObj(obj, results, depth = 0, signals = null) {
  if (depth > 35 || !obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (const item of obj) findStoriesInObj(item, results, depth + 1, signals);
    return;
  }

  // Pagination & profile signals — only trusted on the target user node.
  if (signals?.targetKey) {
    const matchesTarget =
      (obj.__typename === 'User' || obj.__typename === 'Page') &&
      (
        (obj.url && String(obj.url).toLowerCase().includes(signals.targetKey)) ||
        (obj.username && String(obj.username).toLowerCase() === signals.targetKey) ||
        (obj.id && String(obj.id) === signals.targetKey)
      );

    if (matchesTarget) {
      if (obj.id && !signals.targetId) signals.targetId = String(obj.id);
      if (obj.name && !signals.profileName) signals.profileName = obj.name;
      if (typeof obj.is_verified === 'boolean') signals.verified = obj.is_verified || signals.verified;

      // Page follower count surface
      const fc = obj.followers?.count
              ?? obj.profile_social_context?.content?.[0]?.followers?.count
              ?? null;
      if (typeof fc === 'number' && fc > 0) signals.followers = fc;

      const bio = obj.bio_text?.text ?? obj.page_about?.text ?? obj.about_field_section?.text ?? null;
      if (bio && !signals.biography) signals.biography = bio;
    }

    // Feed exhaustion signal: page_info on a timeline_list_feed_units edge set
    if (obj.page_info && obj.page_info.has_next_page === false &&
        (obj.__typename === 'TimelineListFeedUnitsConnection' ||
         obj.__typename === 'UserTimelineListFeedUnitsConnection' ||
         obj.__typename?.includes?.('TimelineFeedUnitsConnection'))) {
      signals.feedExhausted = true;
    }
  }

  // Story candidates — accept anything that has a creation timestamp, an id-ish
  // field, and at least one story-shaped sibling (message / attachments / actors
  // / feedback). CometFeedStoryRenderer nodes don't carry __typename:"Story".
  const hasTime = obj.creation_time != null || obj.publish_time != null;
  const hasId   = !!(obj.post_id || obj.legacy_story_hideable_id || obj.id);
  const looksLikeStory =
    hasTime && hasId &&
    (obj.message != null ||
     obj.attachments != null ||
     obj.actors != null ||
     obj.feedback != null ||
     obj.comet_sections != null ||
     obj.__typename === 'Story');
  if (looksLikeStory) {
    const p = parseStory(obj);
    if (p) {
      results.push(p);
      return;
    }
  }

  for (const val of Object.values(obj)) findStoriesInObj(val, results, depth + 1, signals);
}

// ── Interceptor ───────────────────────────────────────────────────────────────

export function attachFacebookInterceptor(page, postMap, state, opts = {}) {
  const { debug = false, logger = null } = opts;
  const log = createLogger(logger);
  const dbg = (...m) => debug && log.log('[DBG]', ...m);

  page.on('response', async response => {
    const url    = response.url();
    const status = response.status();

    if (status === 429) {
      state.rateLimitUntil = Date.now() + 60_000;
      log.warn('[WARN] Rate limit 429 — pausing 60s...');
      return;
    }
    if (!url.includes('facebook.com') || status !== 200) return;

    const isGraphQL = url.includes('/graphql/') || url.includes('/api/graphql/');
    if (!isGraphQL) return;

    try {
      let text = await response.text();

      // FB wraps responses with `for (;;);` (or similar) to defeat JSON
      // hijacking — strip any non-{[ prefix before parsing.
      text = text.replace(/^for\s*\(\s*;\s*;\s*\)\s*;\s*/, '');
      const firstBrace = text.search(/[{[]/);
      if (firstBrace > 0) text = text.slice(firstBrace);

      if (debug && !state.dumpedOnce) {
        state.dumpedOnce = true;
        writeFileSync(resolve('debug_facebook_response.txt'), text.slice(0, 500_000), 'utf-8');
        dbg(`Raw response dumped → debug_facebook_response.txt  (url: ${url.slice(0, 80)})`);
      }

      // Most FB GraphQL responses are line-delimited JSON (one document per
      // line). Some endpoints return a single JSON document. Try both.
      const docs = [];
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      let parsedLines = 0;
      for (const line of lines) {
        try { docs.push(JSON.parse(line)); parsedLines++; } catch { /* not a complete json line */ }
      }
      if (!parsedLines) {
        try { docs.push(JSON.parse(text)); } catch { /* malformed */ }
      }

      let added = 0;
      for (const json of docs) {
        const found = [];
        findStoriesInObj(json, found, 0, state);
        for (const p of found) {
          if (!postMap.has(p.id)) { postMap.set(p.id, p); added++; }
        }
      }
      if (added) {
        dbg(`XHR parsed → +${added} stories  (url: ${url.slice(0, 80)})`);
      } else if (debug) {
        dbg(`XHR no stories  (docs=${docs.length}, bytes=${text.length}, url: ${url.slice(0, 80)})`);
      }
    } catch (e) {
      dbg('XHR parse error:', e.message);
    }
  });
}

// ── Initial SSR extraction ────────────────────────────────────────────────────

async function extractSSRStories(page, state = null) {
  const scriptTexts = await page.evaluate(() =>
    Array.from(document.querySelectorAll('script[type="application/json"]'))
      .map(s => s.textContent)
  );
  const results = [];
  for (const text of scriptTexts) {
    try { findStoriesInObj(JSON.parse(text), results, 0, state); } catch { /* skip malformed */ }
  }
  return results;
}

// ── Scroll loop ───────────────────────────────────────────────────────────────

async function scrollPage(page, postMap, state, opts = {}) {
  const { max = 200, debug = false, onProgress = null, logger = null } = opts;
  const log = createLogger(logger);
  const dbg = (...m) => debug && log.log('[DBG]', ...m);

  let staleRounds = 0;
  let prevCount   = postMap.size;
  let round       = 0;

  await page.mouse.move(640, 450);

  // FB's profile timeline can take 3–4 scroll rounds before the first feed
  // GraphQL fetch fires. Allow more stale rounds when we haven't seen anything
  // yet, otherwise we'd bail before posts ever surface.
  while (postMap.size < max && staleRounds < (postMap.size === 0 ? 12 : 10)) {
    round++;

    if (state.feedExhausted) {
      log.log(`Facebook: feed exhausted (has_next_page=false). Stopping at ${postMap.size}.`);
      break;
    }

    const pause = (state.rateLimitUntil ?? 0) - Date.now();
    if (pause > 0) {
      log.warn(`[WARN] Rate limit — waiting ${Math.ceil(pause / 1000)}s...`);
      await page.waitForTimeout(pause);
    }

    log.log(`Facebook: ${postMap.size} collected (scroll #${round})`);
    if (onProgress) onProgress(postMap.size, null);

    for (let i = 0; i < 15; i++) {
      await page.mouse.wheel(0, 700);
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(4500);

    if (postMap.size === prevCount) {
      staleRounds++;
      dbg(`Stale round ${staleRounds}`);
      if (staleRounds === 3) {
        // Nudge: scroll up briefly then back down — re-triggers FB's
        // virtualized feed renderer when it stops emitting batches.
        for (let i = 0; i < 6; i++) {
          await page.mouse.wheel(0, -500);
          await page.waitForTimeout(120);
        }
        await page.waitForTimeout(800);
        for (let i = 0; i < 15; i++) {
          await page.mouse.wheel(0, 700);
          await page.waitForTimeout(120);
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
 * Scrape posts for a single Facebook profile / page using an existing context.
 */
export async function scrapeFacebookUser(target, context, opts = {}) {
  const {
    max         = 1000,
    debug       = false,
    onProgress  = null,
    logger      = null,
    ...filterOpts
  } = opts;
  const log = createLogger(logger);
  const userProgress = onProgress
    ? (count) => onProgress(`${target}: ${count} 条`)
    : null;

  log.log(`  ${target}  [Facebook]`);

  const postMap = new Map();
  const targetKey = target.toLowerCase().replace(/^profile\.php\?id=/, '').replace(/^people\/[^/]+\//, '');
  const state   = {
    rateLimitUntil: 0,
    dumpedOnce:     false,
    feedExhausted:  false,
    targetKey,
    targetId:       /^\d+$/.test(targetKey) ? targetKey : null,
    followers:      null,
    profileName:    null,
    verified:       false,
    biography:      null,
  };
  const filterFn = buildFilter(filterOpts);
  const page    = await setupDesktopPage(context);

  attachFacebookInterceptor(page, postMap, state, { debug, logger });

  try {
    await page.goto(profileUrl(target), {
      waitUntil: 'domcontentloaded', timeout: 60_000,
    });
    await page.waitForTimeout(3500);

    const bodyText = await page.evaluate(() => document.body.innerText ?? '');
    const notFound =
      bodyText.includes("This content isn't available") ||
      bodyText.includes('Page not found') ||
      bodyText.includes('该内容目前无法显示') ||
      bodyText.includes('找不到该页面');
    if (notFound) {
      log.error(`[ERROR] ${target} not found or unavailable.`);
      return { profile: null, posts: [] };
    }

    const ssr = await extractSSRStories(page, state);
    for (const p of ssr) {
      if (!postMap.has(p.id)) postMap.set(p.id, p);
    }
    log.log(`Facebook: ${postMap.size} posts from SSR`);

    await scrollPage(page, postMap, state, { max, debug, onProgress: userProgress, logger });
  } finally {
    await page.close();
  }

  const posts = Array.from(postMap.values())
    .filter(filterFn)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, max);

  const first   = posts[0];
  const profile = (first || state.followers || state.profileName)
    ? {
        username:  /^profile\.php/.test(target) ? (state.targetId ?? target) : target,
        name:      state.profileName ?? first?.author?.name ?? '',
        id:        state.targetId    ?? first?.author?.id   ?? '',
        followers: state.followers   ?? null,
        verified:  state.verified    ?? first?.author?.verified ?? false,
        biography: state.biography   ?? '',
        platform:  'facebook',
      }
    : null;

  return { profile, posts };
}

/**
 * Scrape Facebook posts for one or more profiles.
 * Handles browser lifecycle and session management.
 */
export async function scrapeFacebook(targets, opts = {}) {
  const list = (Array.isArray(targets) ? targets : [targets])
    .map(parseFacebookUsername)
    .filter(Boolean);

  if (!list.length) throw new Error('No valid Facebook target provided.');

  const {
    headed       = false,
    debug        = false,
    resetSession = false,
    sessionDir   = DEFAULT_SESSION_DIR,
    logger: rawLogger = null,
    ...userOpts
  } = opts;
  const log = createLogger(rawLogger);

  if (resetSession) clearSessionState(sessionDir);

  if (!hasSavedSession(sessionDir) && !headed) {
    throw new Error('No saved session. Call scrapeFacebook() with headed: true to log in first.');
  }

  const context = await launchSessionContext(sessionDir, {
    headless: !headed,
    viewport: DESKTOP_VIEWPORT,
  });

  try {
    const checkPage = await setupLoginPage(context);
    await checkPage.goto('https://www.facebook.com', {
      waitUntil: 'domcontentloaded', timeout: 60_000,
    });
    await checkPage.waitForTimeout(3000);

    const loggedIn = await isLoggedInFacebook(checkPage);
    if (!loggedIn) {
      if (headed) {
        const ok = await waitForFacebookLogin(checkPage, log);
        if (!ok) throw new Error('Login timed out.');
        log.log('Login confirmed. Starting scrape...');
      } else {
        await context.close();
        throw new Error('Session expired. Call scrapeFacebook() with headed: true to re-login.');
      }
    } else {
      log.log('Session active.');
    }
    // Persist cookies + localStorage so the next launch is logged in (the
    // isolated context has no profile to write them back to automatically).
    await saveSessionState(context, sessionDir);
    await checkPage.close();

    const results = {};
    for (const target of list) {
      results[target] = await scrapeFacebookUser(target, context, { ...userOpts, logger: rawLogger });
    }
    return results;
  } finally {
    await context.close();
  }
}
