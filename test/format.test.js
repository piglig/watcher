import { describe, it, expect } from 'vitest';
import { formatNumber } from '../src/shared/format.js';

describe('formatNumber', () => {
  it('leaves sub-thousand values as plain integers', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(999)).toBe('999');
  });

  it('formats thousands with a K suffix to one decimal', () => {
    expect(formatNumber(1_000)).toBe('1.0K');
    expect(formatNumber(1_500)).toBe('1.5K');
    expect(formatNumber(12_345)).toBe('12.3K');
  });

  it('formats millions with an M suffix to one decimal', () => {
    expect(formatNumber(1_000_000)).toBe('1.0M');
    expect(formatNumber(2_500_000)).toBe('2.5M');
  });

  it('uses M at the million boundary, not K', () => {
    expect(formatNumber(999_999)).toBe('1000.0K');
    expect(formatNumber(1_000_000)).toBe('1.0M');
  });

  it('coerces nullish to "0"', () => {
    expect(formatNumber(null)).toBe('0');
    expect(formatNumber(undefined)).toBe('0');
  });
});
