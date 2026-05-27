/**
 * paths.js — Centralized path conventions.
 *
 * Layout (best-practice separation: user-facing vs system internals):
 *
 *   <outDir>/                                ← user-facing root (set in Settings)
 *     <subject-slug>/                        ← KOL name (workflow) or task name (pipeline)
 *       accounts/
 *         identity.json                      ← OSINT identity graph (workflow only)
 *         profiles/
 *           <platform>.json                  ← per-platform profile (followers/bio/...)
 *       scrape/
 *         <platform>/
 *           <handle>/
 *             <YYYY-MM-DD_HHMMSS>.json       ← timestamped raw scrape per session
 *       analysis/
 *         <session_id>/
 *           report.html  report.md  summary.csv
 *           by-account/
 *             <platform>_<handle>/
 *               posts.json  risk.json  flagged.csv  report.html  report.md
 *
 *   ~/.sns-audit/                            ← system root (hidden home dir)
 *     sessions.json  workflows.json  batches.json  config.json
 *     internal/
 *       rule_caches/<session_id>.json        ← rule-engine intermediates
 *       osint_staging/<batch_id>/            ← shared xAI batch artifacts
 *         _targets.json  _summary.json  <slug>.json
 */

import { join, resolve } from 'path';
import { homedir } from 'os';
import { mkdirSync } from 'fs';

export const SYSTEM_DIR   = join(homedir(), '.sns-audit');
export const INTERNAL_DIR = join(SYSTEM_DIR, 'internal');

export function ensureDir(p) {
  mkdirSync(p, { recursive: true });
  return p;
}

/**
 * Filesystem-safe slug: Unicode letter/number kept, other runs collapsed to '-'.
 *
 *   strict      drop underscores too (else `_` is preserved)
 *   maxLength   cap before fallback check
 *   fallback    returned when the slug ends up empty
 */
export function pathSafe(name, { strict = false, maxLength, fallback = 'unnamed' } = {}) {
  const re = strict ? /[^\p{L}\p{N}]+/gu : /[^\p{L}\p{N}\-_]+/gu;
  let s = String(name ?? '')
    .trim()
    .replace(re, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  if (maxLength) s = s.slice(0, maxLength);
  return s || fallback;
}

/**
 * Sequential slugger with collision suffixes — for batches writing many files
 * to one directory. Same regex/length contract as `pathSafe` (defaults to
 * `strict: true, maxLength: 60`, matching the original OSINT slugger).
 */
export function makeSlugger({ strict = true, maxLength = 60, fallback = 'unnamed' } = {}) {
  const seen = new Map();
  return (name) => {
    const base = pathSafe(name, { strict, maxLength, fallback });
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };
}

// ── User-facing paths ────────────────────────────────────────────────────────
//
// Every KOL artefact (identity, scrape, analysis, reports) is rooted at a
// stable canonical `kolId` — the slug assigned at OSINT submission time and
// recorded in identity.json. Downstream code MUST pass kolId, never a free-
// text subject. The legacy `subjectDir(outDir, freeText)` API has been
// removed precisely because letting different stages each derive a slug from
// different source fields is what produced the report-orphaning bugs we
// spent days patching.

export const kolDir       = (outDir, kolId) =>
  resolve(join(outDir, pathSafe(kolId)));

export const accountsDir  = (outDir, kolId) =>
  join(kolDir(outDir, kolId), 'accounts');

export const profilesDir  = (outDir, kolId) =>
  join(accountsDir(outDir, kolId), 'profiles');

export const identityFile = (outDir, kolId) =>
  join(accountsDir(outDir, kolId), 'identity.json');

export const profileFile  = (outDir, kolId, platform) =>
  join(profilesDir(outDir, kolId), `${platform}.json`);

export const scrapeDir    = (outDir, kolId, platform, handle) =>
  join(kolDir(outDir, kolId), 'scrape', platform, pathSafe(handle));

export const analysisDir  = (outDir, kolId, sessionId) =>
  join(kolDir(outDir, kolId), 'analysis', sessionId);

export const byAccountDir = (outDir, kolId, sessionId, platform, handle) =>
  join(analysisDir(outDir, kolId, sessionId), 'by-account', `${pathSafe(platform)}_${pathSafe(handle)}`);

// ── System / internal paths ──────────────────────────────────────────────────

export const ruleCacheFile   = (sessionId) =>
  join(INTERNAL_DIR, 'rule_caches', `${sessionId}.json`);

export const osintStagingDir = (batchId) =>
  join(INTERNAL_DIR, 'osint_staging', batchId);
