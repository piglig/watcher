#!/usr/bin/env node
/**
 * Bundle the Ink TUI source with JSX transpilation.
 * node_modules are kept external (resolved at runtime from project dir).
 * Output: dist/tui-bundle.mjs
 *
 * Usage: node scripts/build-tui.js
 */

import { build } from 'esbuild';
import { mkdirSync } from 'fs';

mkdirSync('./dist', { recursive: true });

await build({
  entryPoints: ['src/tui/main.js'],
  bundle:      true,
  packages:    'external',   // All node_modules stay as runtime imports
  platform:    'node',
  target:      'node18',
  format:      'esm',
  outfile:     'dist/tui-bundle.mjs',
  loader: { '.js': 'jsx' },
  jsx:         'automatic',
  jsxImportSource: 'react',
  logLevel:    'info',
  sourcemap:   false,
});

console.log('Build complete: dist/tui-bundle.mjs');
