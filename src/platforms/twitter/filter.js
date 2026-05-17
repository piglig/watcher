/**
 * filter.js — P2
 * Tweet filtering: date range, type, keyword
 */

/**
 * Build a filter function from CLI options.
 * @param {object} opts
 * @param {string} [opts.since]       - ISO date string, keep tweets >= this date
 * @param {string} [opts.until]       - ISO date string, keep tweets <= this date
 * @param {boolean} [opts.noRetweets] - exclude retweets
 * @param {boolean} [opts.noReplies]  - exclude replies
 * @param {string}  [opts.keyword]    - only tweets containing this text (case-insensitive)
 */
export function buildFilter(opts = {}) {
  const since   = opts.since   ? new Date(opts.since)   : null;
  const until   = opts.until   ? new Date(opts.until)   : null;
  const keyword = opts.keyword ? opts.keyword.toLowerCase() : null;

  return function applyFilter(tweet) {
    if (since || until) {
      const d = new Date(tweet.created_at);
      if (since && d < since) return false;
      if (until && d > until) return false;
    }
    if (opts.noRetweets && tweet.is_retweet) return false;
    if (opts.noReplies  && tweet.is_reply)   return false;
    if (keyword && !tweet.text.toLowerCase().includes(keyword)) return false;
    return true;
  };
}

/**
 * Stop-early predicate: when scraping in date-bounded mode,
 * we can stop scrolling once all DOM tweets are older than --since.
 */
export function buildEarlyStop(opts = {}) {
  if (!opts.since) return () => false;
  const since = new Date(opts.since);
  return function shouldStop(tweets) {
    // If every tweet in the current batch is before `since`, we've gone far enough
    return tweets.length > 0 && tweets.every(t => new Date(t.created_at) < since);
  };
}
