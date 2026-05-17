/**
 * extract.js — DOM fallback scraper
 * Used when GraphQL interception misses tweets (e.g. first page load).
 */

export async function extractFromDOM(page) {
  return page.evaluate(() => {
    const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
    return articles.map(article => {
      // Anchor wrapping <time> is always the tweet's own timestamp link.
      // Context/parent tweets shown above a reply appear WITHOUT a <time> element,
      // so this avoids accidentally picking up the parent's /status/ link first.
      const timeEl   = article.querySelector('time');
      const timeLink = timeEl
        ? (timeEl.closest('a[href*="/status/"]') ?? article.querySelector('a[href*="/status/"]'))
        : article.querySelector('a[href*="/status/"]');

      const href    = timeLink?.getAttribute('href') ?? '';
      const idMatch = href.match(/\/status\/(\d+)/);
      const tweetId = idMatch?.[1] ?? '';

      // Derive username from the same link so they always match.
      // Falls back to first role="link" anchor only when the href uses /i/web/status/.
      const urlUsername = href.match(/^\/([^/]+)\/status\//)?.[1] ?? '';
      const userLink    = urlUsername ? null : article.querySelector('a[href^="/"][role="link"]');
      const username    = urlUsername || (userLink?.getAttribute('href')?.replace(/^\//, '') ?? '');

      const textEl = article.querySelector('[data-testid="tweetText"]');

      const getStat = testId => {
        const btn   = article.querySelector(`[data-testid="${testId}"]`);
        const label = btn?.getAttribute('aria-label') ?? '';
        const num   = label.match(/[\d,]+/)?.[0]?.replace(/,/g, '');
        return num ? parseInt(num, 10) : 0;
      };

      return {
        id:         tweetId,
        url:        tweetId ? `https://x.com/${username}/status/${tweetId}` : '',
        text:       textEl?.innerText ?? '',
        created_at: timeEl?.getAttribute('datetime') ?? '',
        author:     { username },
        metrics: {
          replies:  getStat('reply'),
          retweets: getStat('retweet'),
          likes:    getStat('like'),
          quotes:   0,
          views:    getStat('analyticsButton'),
        },
        media:      [],
        is_retweet: !!article.querySelector('[data-testid="socialContext"]'),
        is_quote:   false,
        is_reply:   false,
        lang:       '',
      };
    }).filter(t => t.id);
  });
}
