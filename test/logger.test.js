import { describe, it, expect, vi, afterEach } from 'vitest';
import { createLogger } from '../src/shared/logger.js';

afterEach(() => vi.restoreAllMocks());

describe('createLogger', () => {
  it('returns no-ops when given null (silent by default)', () => {
    const l = createLogger(null);
    expect(() => { l.log('x'); l.warn('y'); l.error('z'); l.write('\rp'); }).not.toThrow();
  });

  it('routes log/warn/error to the injected sink', () => {
    const sink = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const l = createLogger(sink);
    l.log('a'); l.warn('b'); l.error('c');
    expect(sink.log).toHaveBeenCalledWith('a');
    expect(sink.warn).toHaveBeenCalledWith('b');
    expect(sink.error).toHaveBeenCalledWith('c');
  });

  it('passes through multiple args', () => {
    const sink = { log: vi.fn() };
    createLogger(sink).log('[DBG]', 'x', 1);
    expect(sink.log).toHaveBeenCalledWith('[DBG]', 'x', 1);
  });

  it('falls back warn/error to log when the sink lacks them', () => {
    const sink = { log: vi.fn() };
    const l = createLogger(sink);
    l.warn('w'); l.error('e');
    expect(sink.log).toHaveBeenCalledTimes(2);
    expect(sink.log).toHaveBeenNthCalledWith(1, 'w');
    expect(sink.log).toHaveBeenNthCalledWith(2, 'e');
  });

  // ── the write() bug fix ──────────────────────────────────────────────────
  it('write uses sink.write verbatim when present', () => {
    const sink = { log: vi.fn(), write: vi.fn() };
    createLogger(sink).write('\r progress 1/2');
    expect(sink.write).toHaveBeenCalledWith('\r progress 1/2');
    expect(sink.log).not.toHaveBeenCalled();
  });

  it('write downgrades to log with \\r/\\n stripped when sink has no write', () => {
    const sink = { log: vi.fn() };
    createLogger(sink).write('\r  Waiting: 1/2...\n');
    expect(sink.log).toHaveBeenCalledWith('Waiting: 1/2...');
  });

  it('write swallows whitespace-only progress (no empty log line)', () => {
    const sink = { log: vi.fn() };
    createLogger(sink).write('\r\n');
    expect(sink.log).not.toHaveBeenCalled();
  });

  it('write never touches process.stdout for an injected non-tty sink', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    createLogger({ log: vi.fn() }).write('\rx');
    expect(spy).not.toHaveBeenCalled();
  });
});
