import { describe, it, expect } from 'vitest';
import { scrapeToJSON } from '../src/platforms/scrape-output.js';

const tweet = {
  platform: 'twitter', id: '1', url: 'u', text: 'hi', created_at: null,
  type: 'tweet', author: { id: 'a', username: 'bob', name: 'Bob' }, media: [], metrics: {},
};

describe('scrapeToJSON', () => {
  it('includes profile when present and normalizes posts', () => {
    const o = JSON.parse(scrapeToJSON({ username: 'bob', platform: 'twitter' }, [tweet]));
    expect(o.profile).toBeTruthy();
    expect(o.posts).toHaveLength(1);
    expect(o.posts[0].platform).toBe('twitter');
  });

  it('omits the profile key when profile is null (reddit-style)', () => {
    const item = {
      platform: 'reddit', id: 'r1', url: 'u', title: 't', text: 'b',
      author: { username: 'x' }, media: [], metrics: { score: 1 }, created_at: null, type: 'post',
    };
    const o = JSON.parse(scrapeToJSON(null, [item]));
    expect('profile' in o).toBe(false);
    expect(o.posts).toHaveLength(1);
  });

  it('omits the profile key when profile is undefined', () => {
    const o = JSON.parse(scrapeToJSON(undefined, []));
    expect('profile' in o).toBe(false);
  });

  it('handles empty / nullish items', () => {
    const o = JSON.parse(scrapeToJSON({ title: 'chan' }, []));
    expect(o.posts).toEqual([]);
    expect(o.profile).toEqual({ title: 'chan' });
    expect(JSON.parse(scrapeToJSON(null, null)).posts).toEqual([]);
  });
});
