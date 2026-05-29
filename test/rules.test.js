import { describe, it, expect } from 'vitest';
import { normalizeForMatching } from '../src/classifier/rules.js';

describe('normalizeForMatching', () => {
  it('returns empty string for falsy input', () => {
    expect(normalizeForMatching('')).toBe('');
    expect(normalizeForMatching(null)).toBe('');
    expect(normalizeForMatching(undefined)).toBe('');
  });

  it('lowercases', () => {
    expect(normalizeForMatching('HELLO')).toBe('hello');
  });

  it('NFKC-folds fullwidth characters to halfwidth', () => {
    // Fullwidth "ＫＩＬＬ" → "kill"
    expect(normalizeForMatching('ＫＩＬＬ')).toBe('kill');
  });

  it('maps common leetspeak substitutions to letters', () => {
    // 0→o 1→i 3→e 4→a 5→s 7→t  @→a $→s !→i |→i +→t
    expect(normalizeForMatching('h3ll0')).toBe('hello');
    expect(normalizeForMatching('@$$')).toBe('ass');
    expect(normalizeForMatching('1d10t')).toBe('idiot');
  });

  it('collapses single-letter-space evasion of 4+ letters', () => {
    expect(normalizeForMatching('k i l l')).toBe('kill');
  });

  it('does NOT collapse short letter-space sequences (avoids false positives)', () => {
    // "i'll kill you" must survive — the apostrophe word breaks the run.
    const out = normalizeForMatching("i'll kill you");
    expect(out).toContain('kill');
    expect(out).toContain('you');
  });

  it('collapses punctuation padding within a word', () => {
    expect(normalizeForMatching('k.i.l.l')).toBe('kill');
    expect(normalizeForMatching('k*i*l*l')).toBe('kill');
    expect(normalizeForMatching('k-i-l-l')).toBe('kill');
  });

  it('is idempotent on already-normalized clean text', () => {
    const once = normalizeForMatching('hello world');
    expect(normalizeForMatching(once)).toBe(once);
  });
});
