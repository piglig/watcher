import React from 'react';
import { render } from 'ink';
import App from './App.js';
import { applyToEnv } from '../shared/config-store.js';

applyToEnv(); // 将 ~/.sns-audit/config.json 中保存的 API Key 注入 process.env
render(<App />, { alternateScreen: true });
