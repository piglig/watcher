import React from 'react';
import { render } from 'ink';
import App from './App.js';
import { applyToEnv } from '../shared/config-store.js';
import { captureConsole } from './console-capture.js';

applyToEnv(); // 将 ~/.sns-audit/config.json 中保存的 API Key 注入 process.env

// Divert all console.* to ~/.sns-audit/tui.log BEFORE rendering. In inline mode
// any out-of-band terminal write lands in the terminal scrollback for good, and
// Windows Terminal reflows the whole scrollback on every resize — so the 30s
// daemon's periodic console.warn (App.js) silently grows the buffer until a
// window drag hangs reflowing it. Capturing console keeps scrollback flat.
// See src/tui/console-capture.js for the full root-cause writeup.
const restoreConsole = captureConsole();

// alternateScreen: true — render into the terminal's alternate screen buffer.
// This is the real fix for the "park on a page, then a resize hangs the whole
// terminal" freeze. In the previous inline mode, every streamed log line (via
// <Static>) and any out-of-band write landed in the terminal's REAL scrollback
// and stayed there; Windows Terminal reflows the ENTIRE scrollback on every
// resize (O(scrollback)), so after a long scrape the buffer grew to thousands
// of lines and the next resize event (drag, DPI change, monitor sleep/wake,
// focus) froze the terminal reflowing it. The alternate screen has NO
// scrollback: nothing accumulates, so resize is always O(viewport).
//
// Prerequisite (done): no component may use Ink's <Static> anymore. In a
// fullscreen frame Ink re-blits its entire accumulated `fullStaticOutput` on
// every clear, which under alternateScreen is strictly worse than the inline
// scrollback it replaced. The run screens now render a bounded last-N log
// viewport (LogPanel) instead, so `fullStaticOutput` stays empty.
//
// patchConsole: false — pair with captureConsole above. Ink's default console
// patch reprints every console.* call as a line in the frame and forces a
// re-render; with console already going to a file, the only thing touching the
// terminal is Ink's own bounded fullscreen frame.
const { waitUntilExit } = render(<App />, { patchConsole: false, alternateScreen: true });

waitUntilExit().finally(restoreConsole);
