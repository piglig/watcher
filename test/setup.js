/**
 * Global test setup.
 *
 * The SQLite store (src/shared/json-store.js) hardcodes its DB path to
 * `join(homedir(), '.sns-audit', 'sns-audit.db')` with no injection point.
 * On Linux, os.homedir() honors $HOME, so we redirect HOME to a throwaway
 * temp dir BEFORE any store module is imported. This guarantees tests never
 * read or write the developer's real ~/.sns-audit database.
 *
 * (That the only way to isolate the DB is to hijack $HOME is itself an
 * architecture smell — the store should accept a configurable path. Noted in
 * the architecture assessment.)
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const testHome = mkdtempSync(join(tmpdir(), 'sns-audit-test-'));
process.env.HOME = testHome;
process.env.USERPROFILE = testHome; // Windows fallback for os.homedir()

// Best-effort cleanup when the worker exits.
process.once('exit', () => {
  try { rmSync(testHome, { recursive: true, force: true }); } catch { /* ignore */ }
});
