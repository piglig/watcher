import React from 'react';
import { render } from 'ink';
import App from './App.js';
import { applyToEnv } from '../shared/config-store.js';

applyToEnv(); // 将 ~/.sns-audit/config.json 中保存的 API Key 注入 process.env
// Inline (non-alternate-screen) rendering: log output flows into the
// terminal's real scrollback, which is what <Static> needs to print each line
// once and never re-render it. Under alternateScreen + a full-height root Box,
// Ink treats every frame as fullscreen and re-blits all accumulated Static
// output each frame — strictly worse. See src/tui/App.js (root Box width-only).
render(<App />);
