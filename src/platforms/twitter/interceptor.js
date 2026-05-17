/**
 * interceptor.js — P0
 * GraphQL 响应拦截、schema 校验、rate-limit 检测
 * 将监听器挂在 page 上，把解析结果写入共享的 tweetMap
 */

/**
 * P0: Schema validation
 * Returns a diagnostic object so callers can decide how to respond.
 */
function validateGraphQLResponse(json) {
  // API-level errors
  if (json?.errors?.length) {
    return { valid: false, reason: `API errors: ${json.errors.map(e => e.message).join('; ')}` };
  }

  const instructions =
    json?.data?.user?.result?.timeline_v2?.timeline?.instructions ??
    json?.data?.user?.result?.timeline?.timeline?.instructions;

  if (!instructions) {
    return { valid: false, reason: 'Unrecognised response shape — Twitter may have changed their API' };
  }

  const types = instructions.map(i => i.type);

  // Session terminated silently
  if (types.includes('TimelineTerminateTimeline') && !types.includes('TimelineAddEntries')) {
    return { valid: false, reason: 'TimelineTerminateTimeline without entries — session likely expired or access denied' };
  }

  return { valid: true, reason: null };
}

// Twitter API wraps some tweet results inside a nested `.tweet` property.
// Normalize upfront so all downstream code works with one consistent shape.
function unwrapTweetResult(raw) {
  return raw?.tweet ?? raw;
}

function parseTweetResult(raw) {
  if (!raw) return null;

  const result = unwrapTweetResult(raw);
  if (result.__typename === 'TweetTombstone') return null;

  const tweetId   = result.rest_id;
  const tweetData = result.legacy;
  if (!tweetId || !tweetData) return null;

  const userData = result.core?.user_results?.result?.legacy ?? {};
  const views    = parseInt(result.views?.count ?? '0', 10) || 0;

  // For retweets: extract the original tweet's full text and author for context.
  // tweetData.full_text is "RT @user: truncated..." — use the original full text instead.
  let text   = tweetData.full_text ?? tweetData.text ?? '';
  let rtFrom = null;
  if (tweetData.retweeted_status_result) {
    const origResult = unwrapTweetResult(tweetData.retweeted_status_result);
    const origLegacy = origResult?.legacy ?? {};
    const origUser   = origResult?.core?.user_results?.result?.legacy ?? {};
    if (origLegacy.full_text) text = origLegacy.full_text;
    rtFrom = {
      tweet_id: origResult?.rest_id ?? null,
      username: origUser.screen_name ?? null,
    };
  }

  return {
    id:         tweetId,
    authorId:   tweetData.user_id_str ?? null,   // numeric author ID from legacy; used for ownership filtering
    platform:   'twitter',
    url:        userData.screen_name
      ? `https://x.com/${userData.screen_name}/status/${tweetId}`
      : `https://x.com/i/web/status/${tweetId}`,
    text,
    created_at: tweetData.created_at
      ? new Date(tweetData.created_at).toISOString()
      : null,
    author: {
      id:        userData.id_str,
      username:  userData.screen_name,
      name:      userData.name,
      verified:  userData.verified        ?? false,
      followers: userData.followers_count ?? 0,
    },
    metrics: {
      replies:  tweetData.reply_count    ?? 0,
      retweets: tweetData.retweet_count  ?? 0,
      likes:    tweetData.favorite_count ?? 0,
      quotes:   tweetData.quote_count    ?? 0,
      views,
    },
    media: extractMedia(tweetData),
    type:  tweetData.retweeted_status_result   ? 'retweet'
         : tweetData.in_reply_to_status_id_str  ? 'reply'
         : result.quoted_status_result           ? 'quote'
         : 'tweet',
    lang:    tweetData.lang,
    rt_from: rtFrom,  // { tweet_id, username } for retweets; null otherwise
  };
}

function extractMedia(legacy) {
  const media = legacy?.extended_entities?.media ?? legacy?.entities?.media ?? [];
  return media.map(m => ({
    type:    m.type,
    url:     m.media_url_https,
    preview: m.type === 'video' ? m.media_url_https : undefined,
  }));
}

export function extractFromGraphQL(json) {
  const results = [];
  try {
    const tl =
      json?.data?.user?.result?.timeline_v2?.timeline ??
      json?.data?.user?.result?.timeline?.timeline;

    for (const inst of tl?.instructions ?? []) {
      if (inst.type !== 'TimelineAddEntries') continue;
      for (const entry of inst.entries ?? []) {
        const r1 = entry?.content?.itemContent?.tweet_results?.result;
        const t1 = parseTweetResult(r1);
        if (t1) results.push(t1);

        for (const item of entry?.content?.items ?? []) {
          const r2 = item?.item?.itemContent?.tweet_results?.result;
          const t2 = parseTweetResult(r2);
          if (t2) results.push(t2);
        }
      }
    }
  } catch { /* malformed — skip */ }
  return results;
}

/**
 * Attach response interceptor to a page.
 * @param {object} page         - Playwright page
 * @param {Map}    tweetMap     - shared tweet store
 * @param {object} state        - shared mutable state { rateLimitUntil, emptyResponseCount, schemaWarned }
 * @param {object} opts         - { debug, dumpOnce }
 */
export function attachInterceptor(page, tweetMap, state, opts = {}) {
  const { debug = false } = opts;
  const dbg = (...m) => debug && console.log('[DBG]', ...m);

  page.on('response', async response => {
    const url    = response.url();
    const status = response.status();

    // P0: rate-limit detection
    if (status === 429) {
      const retryAfter = parseInt(response.headers()['retry-after'] ?? '60', 10);
      state.rateLimitUntil = Date.now() + retryAfter * 1000;
      console.warn(`[WARN] Rate limit — pausing ${retryAfter}s...`);
      return;
    }

    if (debug && url.includes('/api/graphql/')) {
      const name = url.split('/').slice(-1)[0].split('?')[0];
      dbg(`graphql: ${name} [${status}]`);
    }

    if (!url.includes('UserTweets') && !url.includes('UserTweetsAndReplies')) return;
    if (status !== 200) return;

    try {
      const text = await response.text();
      const json = JSON.parse(text);

      // P0: debug dump
      if (debug && !state.dumpedOnce) {
        state.dumpedOnce = true;
        const { writeFileSync } = await import('fs');
        const { resolve } = await import('path');
        writeFileSync(resolve('debug_response.json'), JSON.stringify(json, null, 2), 'utf-8');
        dbg('Raw response → debug_response.json');
      }

      // P0: schema validation
      const { valid, reason } = validateGraphQLResponse(json);
      if (!valid) {
        state.emptyResponseCount = (state.emptyResponseCount ?? 0) + 1;
        if (!state.schemaWarned) {
          state.schemaWarned = true;
          console.warn(`\n[WARN] GraphQL schema issue: ${reason}`);
          if (state.emptyResponseCount >= 3) {
            console.error('[ERROR] 3 consecutive invalid responses — session may have expired.');
            state.sessionExpired = true;
          }
        }
        return;
      }

      state.emptyResponseCount = 0;
      state.schemaWarned = false;

      const found = extractFromGraphQL(json);
      dbg(`UserTweets parsed → ${found.length} tweets`);
      for (const t of found) {
        if (!tweetMap.has(t.id)) tweetMap.set(t.id, t);
      }
    } catch (e) {
      dbg('Parse error:', e.message);
    }
  });
}
