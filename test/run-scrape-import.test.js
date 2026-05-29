import { describe, it, expect } from 'vitest';
import { runScrape } from '../src/platforms/run.js';

// runScrape moved out of the TUI layer (was src/tui/runner.js) so business
// code (workflow/orchestrator) no longer imports from src/tui/. This guards
// the relocation: the new path must export a usable function. The import
// transitively pulls registry + media-cache + paths (none touch SQLite).
describe('runScrape relocation to platforms/run.js', () => {
  it('is importable and is a function', () => {
    expect(typeof runScrape).toBe('function');
  });
});
