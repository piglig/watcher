/**
 * sns-audit — Programmatic API
 *
 * @example
 * import { scrapeTwitter, submitBatch, fetchBatchResults, aggregateUserRisk } from 'sns-audit';
 *
 * const tweets  = await scrapeTwitter('username', { max: 200, logger: console });
 * const { batchId } = await submitBatch(tweets, { apiKey: process.env.OPENAI_API_KEY });
 * const { results } = await fetchBatchResults(batchId, { apiKey, wait: true });
 * const report = aggregateUserRisk(tweets, results);
 */

// ── Platform scrapers ───────────────────────────────────────────────────────
// Every platform writes the uniform { profile?, posts } shape via scrapeToJSON
// (below). Per-platform CSV/print serializers were removed in favour of the
// registry + unified output.
export { scrapeTwitter, scrapeTwitterUser, parseTwitterUsername,
         generateReport as generateTwitterReport } from './platforms/twitter/index.js';
export { scrapeTikTok, scrapeTikTokUser, parseTikTokUser } from './platforms/tiktok/index.js';
export { scrapeReddit, fetchSubreddit, fetchUser,
         scrapeArctic, fetchSubredditArctic, fetchUserArctic } from './platforms/reddit/index.js';
export { scrapeThreads, scrapeThreadsUser, parseThreadsUsername } from './platforms/threads/index.js';
export { scrapePixiv, scrapePixivUser, parsePixivUser } from './platforms/pixiv/index.js';
export { scrapeNaver, scrapeNaverCafe, parseNaverCafe } from './platforms/naver/index.js';
export { scrapeTwitch, scrapeTwitchChannel, parseTwitchLogin } from './platforms/twitch/index.js';
export { scrapeInstagram, scrapeInstagramUser, parseInstagramUsername } from './platforms/instagram/index.js';
export { scrapeBluesky, scrapeBlueskyUser, parseBlueskyHandle } from './platforms/bluesky/index.js';
export { scrapeFacebook, scrapeFacebookUser, parseFacebookUsername } from './platforms/facebook/index.js';
export { scrapeYouTube, scrapeYouTubeChannel, parseYouTubeChannel } from './platforms/youtube/index.js';

// ── Platform registry + unified output ────────────────────────────────────────
export { REGISTRY, PLATFORMS, PLATFORM_ORDER, API_PLATFORMS } from './platforms/registry.js';
export { scrapeToJSON } from './platforms/scrape-output.js';

// ── Classifier ────────────────────────────────────────────────────────────────
export {
  CATEGORIES,
  extractText,
  submitBatch, fetchBatchResults, aggregateUserRisk,
  applyRulesAll,
  toClassifierJSON, toUserRiskCSV, toFlaggedPostsCSV,
} from './classifier/index.js';

// ── Normalization ─────────────────────────────────────────────────────────────
export {
  normalizePosts, extractPosts, mergeAndNormalize,
} from './shared/normalize.js';
export { normalizeToPost, normalizeToPosts, isAuthoredText } from './shared/post.js';

// ── Shared ────────────────────────────────────────────────────────────────────
export { formatNumber } from './shared/format.js';
