/**
 * config-store.js — 持久化用户配置到 ~/.sns-audit/config.json
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CONFIG_DIR  = join(homedir(), '.sns-audit');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

function load() {
  try {
    if (!existsSync(CONFIG_FILE)) return {};
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  } catch { return {}; }
}

function save(cfg) {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
  } catch {}
}

export function getConfig() { return load(); }

export function setConfig(updates) {
  const cfg = { ...load(), ...updates };
  save(cfg);
  return cfg;
}

/** 将已保存的 API Key 注入 process.env（不覆盖已有的环境变量） */
export function applyToEnv() {
  const cfg = load();
  if (cfg.openaiKey  && !process.env.OPENAI_API_KEY)  process.env.OPENAI_API_KEY  = cfg.openaiKey;
  if (cfg.youtubeKey && !process.env.YOUTUBE_API_KEY) process.env.YOUTUBE_API_KEY = cfg.youtubeKey;
  if (cfg.xaiKey     && !process.env.XAI_API_KEY)     process.env.XAI_API_KEY     = cfg.xaiKey;
}
