import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scrapeReddit } from '../src/platforms/reddit/scraper.js';

// Proves the reddit scraper routes progress/errors through the injected logger
// and never touches the global console. fetch is stubbed so no network hits.
describe('scrapeReddit logger injection', () => {
  let consoleLog, consoleWarn;
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      status: 200, ok: true,
      json: async () => ({ data: { children: [], after: null } }),
    });
    consoleLog  = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('routes to the injected logger, not console', async () => {
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    await scrapeReddit('r/test', { max: 1, logger });
    expect(logger.log).toHaveBeenCalled();          // banner + page line
    expect(consoleLog).not.toHaveBeenCalled();
  });

  it('routes the unrecognised-target warning to logger.warn, not console.warn', async () => {
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    await scrapeReddit('not-a-target', { max: 1, logger });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Unrecognised target'));
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it('is silent (no console) when no logger is injected', async () => {
    await scrapeReddit('r/test', { max: 1 });
    expect(consoleLog).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
  });
});
