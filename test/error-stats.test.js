import { describe, it, expect } from 'vitest';
import { computeErrorStats, aggregateUserRisk, CATEGORIES } from '../src/classifier/classifier.js';

const zeroScores = () => Object.fromEntries(CATEGORIES.map(c => [c, 0]));

describe('computeErrorStats', () => {
  const posts = [{ id: 1 }, { id: 2 }, { id: 3 }];

  it('counts unclassified as posts with no result', () => {
    const r = computeErrorStats(posts, { 1: {}, 2: {} }, []);
    expect(r.unclassified).toBe(1);
  });

  it('classify_failed = batchErrors length; sample capped at 3', () => {
    const errs = [
      { code: '429', message: 'rate_limited' },
      { code: '500', message: 'x' },
      { code: 'a', message: 'b' },
      { code: 'c' },
    ];
    const r = computeErrorStats(posts, {}, errs);
    expect(r.classify_failed).toBe(4);
    expect(r.error_sample).toHaveLength(3);
    expect(r.error_sample[0]).toEqual({ code: '429', message: 'rate_limited' });
  });

  it('handles missing code/message in error sample', () => {
    const r = computeErrorStats([], {}, [{}]);
    expect(r.error_sample[0]).toEqual({ code: 'unknown', message: '' });
  });

  it('zero failures and full coverage → all zero', () => {
    const r = computeErrorStats(posts, { 1: {}, 2: {}, 3: {} }, []);
    expect(r).toMatchObject({ classify_failed: 0, unclassified: 0 });
    expect(r.error_sample).toEqual([]);
  });

  it('unclassified count is consistent with aggregateUserRisk skips', () => {
    // Only post 1 has a result; aggregateUserRisk skips 2 and 3.
    const results = { 1: { scores: zeroScores(), reasons: {}, source: 'llm' } };
    const postsWithAuthor = posts.map(p => ({ ...p, author: { id: 'a', username: 'a' } }));
    const risk = aggregateUserRisk(postsWithAuthor, results);
    const totalRiskPosts = risk.reduce((s, u) => s + u.post_count, 0);
    const { unclassified } = computeErrorStats(postsWithAuthor, results, []);
    expect(totalRiskPosts + unclassified).toBe(postsWithAuthor.length);
  });
});
