import { describe, it, expect } from 'vitest';
import {
  CATEGORIES,
  extractText,
  chunkPosts,
  aggregateUserRisk,
  MAX_POSTS_PER_BATCH,
} from '../src/classifier/classifier.js';

const zeroScores = () => Object.fromEntries(CATEGORIES.map(c => [c, 0]));
const scoresWith = (overrides) => ({ ...zeroScores(), ...overrides });

describe('extractText', () => {
  it('truncates non-youtube posts to 1500 chars', () => {
    const long = 'a'.repeat(2000);
    expect(extractText({ text: long }).length).toBe(1500);
  });

  it('allows youtube posts up to 2000 chars', () => {
    const long = 'a'.repeat(2500);
    expect(extractText({ platform: 'youtube', text: long }).length).toBe(2000);
  });

  it('tolerates missing text', () => {
    expect(extractText({})).toBe('');
  });
});

describe('chunkPosts', () => {
  it('returns no chunks for an empty input', () => {
    expect(chunkPosts([])).toEqual([]);
  });

  it('keeps a small batch in a single chunk', () => {
    const posts = Array.from({ length: 10 }, (_, i) => ({ id: i, text: 'hi' }));
    const chunks = chunkPosts(posts);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(10);
  });

  it('splits on the hard post-count ceiling', () => {
    const posts = Array.from({ length: MAX_POSTS_PER_BATCH + 50 }, (_, i) => ({ id: i, text: 'x' }));
    const chunks = chunkPosts(posts);
    expect(chunks.length).toBeGreaterThan(1);
    // No chunk may exceed the hard ceiling.
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(MAX_POSTS_PER_BATCH);
    // Every post is preserved exactly once.
    expect(chunks.flat()).toHaveLength(posts.length);
  });

  it('splits when the token budget overflows even below the count ceiling', () => {
    // Huge text per post → each post is expensive; many fewer than 1000 fit.
    const big = 'あ'.repeat(1500);
    const posts = Array.from({ length: 1500 }, (_, i) => ({ id: i, text: big }));
    const chunks = chunkPosts(posts);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThan(MAX_POSTS_PER_BATCH);
    expect(chunks.flat()).toHaveLength(posts.length);
  });

  it('never drops or duplicates posts (order preserved)', () => {
    const posts = Array.from({ length: 2345 }, (_, i) => ({ id: i, text: 'x'.repeat(i % 50) }));
    const flat = chunkPosts(posts).flat();
    expect(flat.map(p => p.id)).toEqual(posts.map(p => p.id));
  });
});

describe('aggregateUserRisk', () => {
  const mkPost = (id, author, extra = {}) => ({
    id, author: { id: author, username: author }, type: 'tweet', ...extra,
  });

  it('returns an empty array when no posts have results', () => {
    const posts = [mkPost(1, 'alice')];
    expect(aggregateUserRisk(posts, {})).toEqual([]);
  });

  it('groups by author and counts posts that have results', () => {
    const posts = [mkPost(1, 'alice'), mkPost(2, 'alice'), mkPost(3, 'bob')];
    const results = {
      1: { scores: zeroScores() },
      2: { scores: zeroScores() },
      3: { scores: zeroScores() },
    };
    const out = aggregateUserRisk(posts, results);
    const alice = out.find(u => u.username === 'alice');
    const bob = out.find(u => u.username === 'bob');
    expect(alice.post_count).toBe(2);
    expect(bob.post_count).toBe(1);
  });

  it('flags posts whose max category score >= 2 and counts severe (==3)', () => {
    const posts = [mkPost(1, 'alice'), mkPost(2, 'alice'), mkPost(3, 'alice')];
    const results = {
      1: { scores: scoresWith({ politics: 1 }) },  // not flagged
      2: { scores: scoresWith({ crime: 2 }) },     // flagged, not severe
      3: { scores: scoresWith({ r18: 3 }) },       // flagged + severe
    };
    const [alice] = aggregateUserRisk(posts, results);
    expect(alice.flagged_post_count).toBe(2);
    expect(alice.severe_post_count).toBe(1);
  });

  it('assigns a higher risk level to a clearly worse author and sorts desc', () => {
    const posts = [mkPost(1, 'clean'), mkPost(2, 'toxic')];
    const results = {
      1: { scores: zeroScores() },
      2: { scores: scoresWith({ crime: 3, r18: 3 }) },
    };
    const out = aggregateUserRisk(posts, results);
    // Sorted by risk_score descending.
    expect(out[0].username).toBe('toxic');
    expect(out[0].risk_score).toBeGreaterThan(out[1].risk_score);
    expect(out[0].risk_level).not.toBe('low');
    expect(out[1].risk_level).toBe('low');
  });

  it('produces risk_score within [0,100] and a valid risk_level', () => {
    const posts = [mkPost(1, 'a')];
    const out = aggregateUserRisk(posts, { 1: { scores: scoresWith({ crime: 3 }) } });
    const u = out[0];
    expect(u.risk_score).toBeGreaterThanOrEqual(0);
    expect(u.risk_score).toBeLessThanOrEqual(100);
    expect(['critical', 'high', 'medium', 'low']).toContain(u.risk_level);
  });

  it('caps flagged_posts detail at 10 entries', () => {
    const posts = Array.from({ length: 20 }, (_, i) => mkPost(i, 'a'));
    const results = Object.fromEntries(
      posts.map(p => [p.id, { scores: scoresWith({ crime: 2 }) }])
    );
    const [u] = aggregateUserRisk(posts, results);
    expect(u.flagged_post_count).toBe(20);          // count reflects all
    expect(u.flagged_posts.length).toBe(10);        // detail list is capped
  });
});
