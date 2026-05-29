import { describe, it, expect } from 'vitest';
import { pathSafe, makeSlugger } from '../src/shared/paths.js';

describe('pathSafe', () => {
  it('lowercases and collapses unsafe runs to a single dash', () => {
    expect(pathSafe('Hello World!!')).toBe('hello-world');
    expect(pathSafe('a / b \\ c')).toBe('a-b-c');
  });

  it('preserves Unicode letters and numbers', () => {
    expect(pathSafe('田中太郎')).toBe('田中太郎');
    expect(pathSafe('account_123')).toBe('account_123'); // underscore kept by default
  });

  it('strips underscores in strict mode', () => {
    expect(pathSafe('account_123', { strict: true })).toBe('account-123');
  });

  it('trims leading/trailing dashes', () => {
    expect(pathSafe('  --weird--  ')).toBe('weird');
    expect(pathSafe('!!!')).toBe('unnamed'); // collapses to empty → fallback
  });

  it('applies the fallback for empty/nullish input', () => {
    expect(pathSafe('')).toBe('unnamed');
    expect(pathSafe(null)).toBe('unnamed');
    expect(pathSafe('   ', { fallback: 'x' })).toBe('x');
  });

  it('caps length before the empty/fallback check', () => {
    expect(pathSafe('abcdefghij', { maxLength: 4 })).toBe('abcd');
  });
});

describe('makeSlugger', () => {
  it('returns the bare slug the first time and suffixes on collision', () => {
    const slug = makeSlugger();
    expect(slug('Tanaka Tarou')).toBe('tanaka-tarou');
    expect(slug('Tanaka Tarou')).toBe('tanaka-tarou-2');
    expect(slug('Tanaka Tarou')).toBe('tanaka-tarou-3');
  });

  it('treats names that slug to the same base as collisions', () => {
    const slug = makeSlugger();
    expect(slug('Hello World')).toBe('hello-world');
    expect(slug('hello!!world')).toBe('hello-world-2');
  });

  it('defaults to strict slugging (underscores dropped)', () => {
    const slug = makeSlugger();
    expect(slug('a_b')).toBe('a-b');
  });

  it('keeps independent counters per slugger instance', () => {
    const a = makeSlugger();
    const b = makeSlugger();
    expect(a('x')).toBe('x');
    expect(b('x')).toBe('x'); // separate instance → no collision suffix
  });
});
