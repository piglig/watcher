/**
 * config-store.js — 持久化用户配置到 ~/.sns-audit/config.json
 */

import { createJsonStore } from './json-store.js';

const store = createJsonStore('config.json', { defaultValue: {} });
const load = () => store.load();
const save = (cfg) => store.persist(cfg);

export function getConfig() { return load(); }

export function setConfig(updates) {
  const cfg = { ...load(), ...updates };
  save(cfg);
  return cfg;
}

/** 将已保存的 API Key 注入 process.env（不覆盖已有的环境变量） */
export function applyToEnv() {
  const cfg = load();
  if (cfg.openaiKey          && !process.env.OPENAI_API_KEY)       process.env.OPENAI_API_KEY       = cfg.openaiKey;
  if (cfg.geminiKey          && !process.env.GEMINI_API_KEY)       process.env.GEMINI_API_KEY       = cfg.geminiKey;
  if (cfg.deepseekKey        && !process.env.DEEPSEEK_API_KEY)     process.env.DEEPSEEK_API_KEY     = cfg.deepseekKey;
  if (cfg.youtubeKey         && !process.env.YOUTUBE_API_KEY)      process.env.YOUTUBE_API_KEY      = cfg.youtubeKey;
  if (cfg.xaiKey             && !process.env.XAI_API_KEY)          process.env.XAI_API_KEY          = cfg.xaiKey;
  if (cfg.blueskyIdentifier  && !process.env.BLUESKY_IDENTIFIER)   process.env.BLUESKY_IDENTIFIER   = cfg.blueskyIdentifier;
  if (cfg.blueskyAppPassword && !process.env.BLUESKY_APP_PASSWORD) process.env.BLUESKY_APP_PASSWORD = cfg.blueskyAppPassword;
  if (cfg.twitchClientId     && !process.env.TWITCH_CLIENT_ID)     process.env.TWITCH_CLIENT_ID     = cfg.twitchClientId;
  if (cfg.twitchClientSecret && !process.env.TWITCH_CLIENT_SECRET) process.env.TWITCH_CLIENT_SECRET = cfg.twitchClientSecret;
}
