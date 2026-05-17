/**
 * shared/writer.js — Unified file output helpers
 *
 * Centralises the resolveOutputPath + writeFileSync pattern
 * that was previously duplicated across every CLI entry file.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { resolve, join, extname }   from 'path';

/**
 * Resolve the output file path for a single target.
 *
 * @param {string|null} outPath  - Raw --out value from CLI (file or directory)
 * @param {string}      name     - Target name used as filename stem (e.g. username)
 * @param {string}      format   - 'json' | 'csv'
 * @returns {string|null}
 */
export function resolveOutputPath(outPath, name, format) {
  if (!outPath) return null;
  const ext = extname(outPath);
  if (ext) {
    // Explicit file path: strip extension, apply resolved format
    return resolve(outPath).slice(0, -ext.length) + '.' + format;
  }
  // Directory path
  const dir = resolve(outPath);
  mkdirSync(dir, { recursive: true });
  return join(dir, `${name}.${format}`);
}

/**
 * Write content to a file, creating parent directories as needed.
 *
 * @param {string} filePath
 * @param {string} content
 */
export function writeOutput(filePath, content) {
  mkdirSync(resolve(filePath, '..'), { recursive: true });
  writeFileSync(filePath, content, 'utf-8');
}

/**
 * Infer output format from --format flag and --out file extension.
 *
 * @param {string|null} flagFormat  - Value of --format option
 * @param {string|null} outPath     - Value of --out option
 * @returns {'json'|'csv'}
 */
export function resolveFormat(flagFormat, outPath) {
  if (flagFormat) return flagFormat.toLowerCase();
  const ext = extname(outPath ?? '').slice(1).toLowerCase();
  return (ext === 'csv' ? 'csv' : 'json');
}
