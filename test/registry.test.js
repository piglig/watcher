import { describe, it, expect } from 'vitest';
import { REGISTRY, PLATFORM_ORDER, PLATFORMS, API_PLATFORMS } from '../src/platforms/registry.js';

const REQUIRED = ['value', 'label', 'scrape', 'buildOpts', 'extract'];

describe('registry completeness', () => {
  it('has all 11 platforms, in order', () => {
    expect(PLATFORM_ORDER).toHaveLength(11);
    expect(Object.keys(REGISTRY).sort()).toEqual([...PLATFORM_ORDER].sort());
  });

  it('PLATFORMS metadata array matches order and exposes wizard fields', () => {
    expect(PLATFORMS.map(p => p.value)).toEqual(PLATFORM_ORDER);
    for (const p of PLATFORMS) {
      expect(typeof p.label).toBe('string');
      expect(typeof p.needsBrowser).toBe('boolean');
    }
  });

  for (const id of PLATFORM_ORDER) {
    it(`${id} has required fields`, () => {
      const d = REGISTRY[id];
      for (const k of REQUIRED) expect(d[k], `${id}.${k}`).toBeDefined();
      expect(typeof d.scrape).toBe('function');
      expect(typeof d.buildOpts).toBe('function');
      expect(typeof d.extract).toBe('function');
      expect(d.value).toBe(id);
    });
  }

  it('API_PLATFORMS = the non-browser set', () => {
    expect([...API_PLATFORMS].sort()).toEqual(['bluesky', 'reddit', 'twitch', 'youtube']);
  });
});

describe('extract() shapes', () => {
  it('twitter: profile from first author, label @key', () => {
    const r = REGISTRY.twitter.extract('bob', [{ author: { username: 'bob', id: '1' } }]);
    expect(r).toMatchObject({ handle: 'bob', label: '@bob' });
    expect(r.profile.platform).toBe('twitter');
    expect(r.items).toHaveLength(1);
  });

  it('twitter: null profile when no author', () => {
    expect(REGISTRY.twitter.extract('x', [{}]).profile).toBeNull();
  });

  it('reddit: null profile + slash→underscore handle', () => {
    const r = REGISTRY.reddit.extract('r/aww', [{}, {}]);
    expect(r.profile).toBeNull();
    expect(r.handle).toBe('r_aww');
    expect(r.label).toBe('r/aww');
    expect(r.items).toHaveLength(2);
  });

  it('tiktok: items = videos', () => {
    const r = REGISTRY.tiktok.extract('u', { profile: { username: 'u' }, videos: [{}] });
    expect(r.items).toHaveLength(1);
    expect(r.profile.username).toBe('u');
    expect(r.label).toBe('@u');
  });

  it('pixiv: items = artworks, label Pixiv:key', () => {
    const r = REGISTRY.pixiv.extract('123', { artworks: [{ author: { name: 'A' } }] });
    expect(r.label).toBe('Pixiv:123');
    expect(r.profile.platform).toBe('pixiv');
    expect(r.items).toHaveLength(1);
  });

  it('twitch: items = videos ++ clips', () => {
    const r = REGISTRY.twitch.extract('l', { profile: {}, videos: [{}], clips: [{}, {}] });
    expect(r.items).toHaveLength(3);
  });

  it('naver: profile = full cafe object', () => {
    const r = REGISTRY.naver.extract('slug', { cafe: { name: 'My Cafe', memberCount: 9 }, posts: [{}] });
    expect(r.profile).toEqual({ name: 'My Cafe', memberCount: 9 });
    expect(r.handle).toBe('my-cafe');
  });

  it('facebook: handle strips /?=&', () => {
    const r = REGISTRY.facebook.extract('profile.php?id=5', { profile: {}, posts: [{}] });
    expect(r.handle).toBe('profile.php_id_5');
  });

  it('youtube: handle strips @,/ and label = title', () => {
    const r = REGISTRY.youtube.extract('x', { profile: { handle: '@chan', title: 'Chan' }, videos: [] });
    expect(r.handle).toBe('chan');
    expect(r.label).toBe('Chan');
    expect(r.items).toEqual([]);
  });
});

describe('buildOpts()', () => {
  it('reddit defaults to arctic', () => {
    expect(REGISTRY.reddit.buildOpts({}, {}).redditSource).toBe('arctic');
    expect(REGISTRY.reddit.buildOpts({ redditSource: 'reddit' }, {}).redditSource).toBe('reddit');
  });
  it('youtube apiKey: config over env', () => {
    expect(REGISTRY.youtube.buildOpts({ apiKey: 'K' }, { YOUTUBE_API_KEY: 'E' }).apiKey).toBe('K');
    expect(REGISTRY.youtube.buildOpts({}, { YOUTUBE_API_KEY: 'E' }).apiKey).toBe('E');
  });
  it('twitch + bluesky creds from config/env', () => {
    expect(REGISTRY.twitch.buildOpts({}, { TWITCH_CLIENT_ID: 'c' }).clientId).toBe('c');
    expect(REGISTRY.bluesky.buildOpts({ blueskyIdentifier: 'me' }, {}).identifier).toBe('me');
  });
});
