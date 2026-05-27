/**
 * fs-walk.js — Recursive directory walker shared by every "scan for files" caller.
 *
 *   const files = walkFiles(root, { match: '.csv' });
 *   const json  = walkFiles(root, { match: (n) => n.endsWith('.json') && !n.startsWith('_') });
 *
 * Returns `[]` (never throws) so callers can use it directly in render paths.
 * Unreadable subdirectories are silently skipped — same behaviour callers had
 * before, just consolidated here.
 */

import { readdirSync, existsSync } from 'fs';
import { resolve, join, relative } from 'path';

export const DEFAULT_IGNORE = new Set([
  'node_modules', '.git', '.next', '.cache', '.turbo',
  'dist', 'build', '.vite', '.parcel-cache', '.svelte-kit',
]);

/**
 * Walk `root` and collect files matching `match`.
 *
 * @param {string} root
 * @param {object} [opts]
 * @param {string | ((name: string) => boolean)} [opts.match]   filename predicate
 *        or case-insensitive extension suffix (e.g. `.csv`); default = match all.
 * @param {Set<string>} [opts.ignore]                            directory names to skip
 * @returns {Array<{ path: string, rel: string, base: string }>}
 */
export function walkFiles(root, { match = () => true, ignore = DEFAULT_IGNORE } = {}) {
  const abs = resolve(root);
  if (!existsSync(abs)) return [];

  const matcher = typeof match === 'string'
    ? (n) => n.toLowerCase().endsWith(match.toLowerCase())
    : match;

  const out = [];
  (function walk(d) {
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (ignore.has(e.name)) continue;
        walk(join(d, e.name));
      } else if (matcher(e.name)) {
        const full = join(d, e.name);
        out.push({ path: full, rel: relative(abs, full), base: e.name });
      }
    }
  })(abs);

  return out;
}
