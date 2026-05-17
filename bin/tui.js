#!/usr/bin/env node
/**
 * bin/tui.js — SNS Audit TUI launcher.
 * Builds the React/Ink bundle on first run (or --rebuild), then runs it.
 */

import { existsSync }    from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync, spawnSync } from 'child_process';

const __dir       = dirname(fileURLToPath(import.meta.url));
const root        = resolve(__dir, '..');
const bundle      = resolve(root, 'dist', 'tui-bundle.mjs');
const buildScript = resolve(root, 'scripts', 'build-tui.js');

const needsBuild = !existsSync(bundle) || process.argv.includes('--rebuild');

if (needsBuild) {
  process.stderr.write('Building TUI bundle (first run)...\n');
  execFileSync(process.execPath, [buildScript], { stdio: 'inherit', cwd: root });
}

// Spawn the bundle directly — inherits TTY so Ink raw mode works
const result = spawnSync(process.execPath, [bundle], {
  stdio: 'inherit',
  cwd:   root,
  env:   process.env,
});

process.exit(result.status ?? 0);
