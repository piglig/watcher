/**
 * Probe whether the native better-sqlite3 binary loads in this environment.
 *
 * On a node_modules tree built for a different OS/arch (e.g. Windows binaries
 * checked out under WSL on a /mnt drive, where the .node file also can't be
 * rebuilt in place), `new Database()` throws "invalid ELF header". The store
 * integration tests are valid but un-runnable there, so they skip with a clear
 * reason instead of hard-failing. They activate automatically once the binary
 * matches the host (run `npm rebuild better-sqlite3`).
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export function sqliteAvailable() {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(':memory:');
    db.close();
    return true;
  } catch {
    return false;
  }
}

export const SQLITE_OK = sqliteAvailable();
