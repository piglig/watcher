/**
 * console-capture.js — divert all console.* output to a logfile while the Ink
 * TUI owns the terminal.
 *
 * Why this exists (root cause of the "completion page freeze on window drag"):
 *
 *   Ink renders inline (no alternate screen — see main.js). In that mode every
 *   byte written to the terminal outside Ink's own frame is appended to the
 *   real terminal SCROLLBACK and stays there. Windows Terminal reflows the
 *   ENTIRE scrollback buffer on every resize, an O(scrollback) operation — so
 *   an unbounded scrollback turns a window drag into a multi-second-to-infinite
 *   hang.
 *
 *   The App-level daemon (App.js) runs for the whole lifetime of the app and
 *   calls console.warn every 30s whenever a background OSINT batch / workflow
 *   stalls. Several screens log on errors too. Ink's default `patchConsole`
 *   intercepts each of those and prints it as a line above the live frame —
 *   i.e. straight into scrollback. Park on the completed page for a while and
 *   that scrollback grows without bound; the next drag reflows it and freezes.
 *
 *   Fixing each caller is whack-a-mole (and third-party deps log too). Instead
 *   we cut the channel: redirect console.* to a file. Combined with
 *   `patchConsole: false` in main.js, NOTHING reaches the terminal except Ink's
 *   own bounded frame, so scrollback stays flat and resize stays O(viewport).
 */

import { createWriteStream } from 'fs';
import { join } from 'path';
import { SYSTEM_DIR, ensureDir } from '../shared/paths.js';

const METHODS = ['log', 'info', 'warn', 'error', 'debug', 'trace'];

let installed = false;

/**
 * Replace console.* with file-backed writers. Idempotent. Returns a restore()
 * that puts the originals back (used on teardown so a post-TUI CLI run logs to
 * the terminal again).
 */
export function captureConsole() {
  if (installed) return () => {};
  installed = true;

  ensureDir(SYSTEM_DIR);
  const stream = createWriteStream(join(SYSTEM_DIR, 'tui.log'), { flags: 'a' });

  const originals = {};
  const write = (level, args) => {
    try {
      const line = args
        .map(a => (typeof a === 'string' ? a : inspectSafe(a)))
        .join(' ');
      stream.write(`${new Date().toISOString()} [${level}] ${line}\n`);
    } catch { /* never let logging throw into the render path */ }
  };

  for (const m of METHODS) {
    originals[m] = console[m];
    console[m] = (...args) => write(m, args);
  }

  return function restore() {
    if (!installed) return;
    for (const m of METHODS) console[m] = originals[m];
    try { stream.end(); } catch { /* already closed */ }
    installed = false;
  };
}

function inspectSafe(v) {
  if (v instanceof Error) return v.stack ?? v.message ?? String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
}
