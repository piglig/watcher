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

// ── Twitter ───────────────────────────────────────────────────────────────────
export {
  scrapeTwitter, scrapeTwitterUser, parseTwitterUsername,
  toJSON   as toTwitterJSON,
  toCSV    as toTwitterCSV,
  generateReport as generateTwitterReport,
} from './platforms/twitter/index.js';

// ── TikTok ────────────────────────────────────────────────────────────────────
export {
  scrapeTikTok, scrapeTikTokUser, parseTikTokUser,
  toTikTokJSON, toTikTokCSV, toTikTokCommentsCSV,
} from './platforms/tiktok/index.js';

// ── Reddit ────────────────────────────────────────────────────────────────────
export {
  scrapeReddit, fetchSubreddit, fetchUser,
  scrapeArctic, fetchSubredditArctic, fetchUserArctic,
  toRedditJSON, toRedditCSV,
} from './platforms/reddit/index.js';

// ── Threads ───────────────────────────────────────────────────────────────────
export {
  scrapeThreads, scrapeThreadsUser, parseThreadsUsername,
  toThreadsJSON, toThreadsCSV,
} from './platforms/threads/index.js';

// ── Pixiv ─────────────────────────────────────────────────────────────────────
export {
  scrapePixiv, scrapePixivUser, parsePixivUser,
  toPixivJSON, toPixivCSV,
} from './platforms/pixiv/index.js';

// ── Naver ─────────────────────────────────────────────────────────────────────
export {
  scrapeNaver, scrapeNaverCafe, parseNaverCafe,
  toNaverJSON, toNaverCSV,
} from './platforms/naver/index.js';

// ── YouTube ───────────────────────────────────────────────────────────────────
export {
  scrapeYouTube, scrapeYouTubeChannel, parseYouTubeChannel,
  toYouTubeJSON, toYouTubeCSV,
} from './platforms/youtube/index.js';

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
  normalizePost, normalizePosts, extractPosts, mergeAndNormalize,
} from './shared/normalize.js';

// ── Shared ────────────────────────────────────────────────────────────────────
export { formatNumber } from './shared/format.js';
