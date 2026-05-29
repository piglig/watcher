/**
 * run.js — Platform-agnostic scrape runner.
 *
 * Drives the platform registry: parse targets → inject per-platform opts →
 * scrape → normalize each result into the uniform { profile?, posts } file.
 * No TUI/React dependency — consumed by the TUI screens AND by
 * workflow/orchestrator.js, so it lives in the platform layer (not src/tui/).
 */

import { writeFileSync } from 'fs';
import { join } from 'path';

import { scrapeDir, profileFile, profilesDir, ensureDir } from '../shared/paths.js';
import { cacheMediaInScrapeFile } from '../shared/media-cache.js';
import { REGISTRY, API_PLATFORMS } from './registry.js';
import { scrapeToJSON } from './scrape-output.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseTargets(raw) {
  return raw.split(',').map(t => t.trim()).filter(Boolean);
}

function sessionStamp() {
  const d = new Date();
  const date = d.toISOString().slice(0, 10);
  const time = d.toTimeString().slice(0, 8).replace(/:/g, '');
  return `${date}_${time}`;
}

// ── Main scrape runner ────────────────────────────────────────────────────────

/**
 * @param {object|object[]} config
 *   单个平台配置 或 多个平台配置数组（顺序执行，结果合并）
 *   每个配置：{ platform, targets, max, since, until, headed, apiKey, redditSource, outDir }
 * @returns {Promise<{ savedFiles: Array<{file,count,label}>, totalCount: number }>}
 */

// Throttled per-platform heartbeat. Scrapers may call it freely; this drops
// emits that arrive within `intervalMs` of the previous one.
function makeHeartbeat(platform, onLog, intervalMs = 15000) {
  let lastEmit = 0;
  return (info) => {
    const now = Date.now();
    if (now - lastEmit < intervalMs) return;
    lastEmit = now;
    onLog(`[${platform}] ${info}`);
  };
}

// Bridge the runner's single string `onLog` channel into a console-like sink
// that scrapers/classifier/osint accept as `opts.logger`. warn/error get the
// [WARN]/[ERR] prefixes that parseLogLine.js already colors, so the TUI renders
// them without change. No `write` key → createLogger() downgrades progress-bar
// writes to clean log lines (correct for the append-only StaticLog UI).
function makeLogger(onLog) {
  const fmt = (...a) => a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  return {
    log:   (...a) => onLog(fmt(...a)),
    warn:  (...a) => onLog('[WARN] ' + fmt(...a)),
    error: (...a) => onLog('[ERR] '  + fmt(...a)),
  };
}

async function runOnePlatform(c, onLog) {
  const tgts = parseTargets(c.targets);
  const sample = tgts.slice(0, 3).join(', ') + (tgts.length > 3 ? '...' : '');
  onLog(`[${c.platform}] 开始采集（${tgts.length} 个账号：${sample}）`);
  const t0 = Date.now();
  try {
    const res = await runScrape(c, onLog);
    const secs = Math.round((Date.now() - t0) / 1000);
    onLog(`[${c.platform}] 完成：${res.totalCount} 条（${secs}s）`);
    return res;
  } catch (e) {
    const secs = Math.round((Date.now() - t0) / 1000);
    const msg  = (e?.message ?? String(e)).slice(0, 200);
    onLog(`[${c.platform}] 失败（${secs}s）：${msg}`);
    // Keep workflow going for other platforms.
    return { savedFiles: [], totalCount: 0 };
  }
}

export async function runScrape(config, onLog = () => {}) {
  if (Array.isArray(config)) {
    // Split: API platforms parallelize freely; browser-based run sequentially to
    // avoid spawning multiple Playwright contexts that fight for memory/cookies.
    const apiConfigs     = config.filter(c => API_PLATFORMS.has(c.platform));
    const browserConfigs = config.filter(c => !API_PLATFORMS.has(c.platform));

    const apiPromise = Promise.all(apiConfigs.map(c => runOnePlatform(c, onLog)));

    const browserPromise = (async () => {
      const out = [];
      for (const c of browserConfigs) out.push(await runOnePlatform(c, onLog));
      return out;
    })();

    const [apiResults, browserResults] = await Promise.all([apiPromise, browserPromise]);
    const all = [...apiResults, ...browserResults];

    return {
      savedFiles: all.flatMap(r => r.savedFiles),
      totalCount: all.reduce((s, r) => s + r.totalCount, 0),
    };
  }
  // Platform-specific config (redditSource / apiKey / twitch* / bluesky*) is
  // read straight from `config` by each registry entry's buildOpts(config, env).
  const {
    platform,
    targets: rawTargets,
    kolId,                                    // ★ canonical KOL identifier (OSINT slug)
    max      = '200',
    since,
    until,
    headed   = false,
    outDir   = './out/',
  } = config;

  if (!kolId) throw new Error('runScrape: `kolId` is required (canonical OSINT slug).');

  const targets = parseTargets(rawTargets);
  const logger  = makeLogger(onLog);
  const opts = {
    max:    parseInt(max, 10) || 200,
    since:  since || undefined,
    until:  until || undefined,
    headed: !!headed,
    debug:  !!process.env.SCRAPE_DEBUG,
    logger,
  };

  const stamp       = sessionStamp();
  const savedFiles  = [];
  let   totalCount  = 0;

  /**
   * Write one account's scrape output under <outDir>/<kolId>/scrape/<platform>/<handle>/<stamp>.json
   * and extract profile to <outDir>/<kolId>/accounts/profiles/<platform>.json (last writer wins —
   * the per-platform profile is a snapshot, not a history).
   */
  const save = (handle, content, profile, count, label) => {
    const dir  = ensureDir(scrapeDir(outDir, kolId, platform, handle));
    const file = join(dir, `${stamp}.json`);
    writeFileSync(file, content);
    savedFiles.push({ file, count, label, handle, kol_id: kolId });
    totalCount += count;

    if (profile) {
      ensureDir(profilesDir(outDir, kolId));
      const profileWithMeta = {
        platform,
        handle,
        captured_at: new Date().toISOString(),
        ...profile,
      };
      // One profile file per (kolId, platform). If the KOL has multiple
      // handles on the same platform we keep the last write — acceptable since
      // profiles for distinct handles also live inside scrape JSONs.
      writeFileSync(profileFile(outDir, kolId, platform), JSON.stringify(profileWithMeta, null, 2));
    }
    return file;
  };

  // Cache images locally on disk so the classifier can base64-embed them.
  // Without this, OpenAI's batch processor fetches CDN URLs hours later when
  // their signed tokens have already expired and the requests fail silently
  // into the batch error_file. Called after every successful save() that may
  // produce image media. No-op (and very cheap) for platforms whose `media`
  // is empty (TikTok / YouTube / Twitch).
  const cacheAfterSave = async (file, handle) => {
    try {
      const r = await cacheMediaInScrapeFile(file, { onLog });
      if (r.downloaded || r.failed) {
        onLog(`[${platform}] ${handle}: 媒体缓存 ↓${r.downloaded} ↺${r.skipped} ✗${r.failed}`);
      }
    } catch (e) {
      onLog(`[${platform}] ${handle}: 媒体缓存异常 ${e.message ?? e}`);
    }
  };

  // ── Data-driven dispatch ────────────────────────────────────────────────
  // The registry knows, per platform: how to parse targets, what extra opts to
  // inject, how to scrape, and how to map each heterogeneous result entry into
  // the uniform { handle, label, profile, items }. See src/platforms/registry.js.
  const def = REGISTRY[platform];
  if (!def) throw new Error(`runScrape: unknown platform '${platform}'`);

  const tgts = def.parseTarget ? targets.map(t => def.parseTarget(t) ?? t) : targets;
  const scrapeOpts = {
    ...opts,
    ...def.buildOpts(config, process.env),
    ...(def.onProgress ? { onProgress: makeHeartbeat(platform, onLog) } : {}),
  };

  const results = await def.scrape(tgts, scrapeOpts);

  for (const [key, value] of Object.entries(results)) {
    const { handle, label, profile, items } = def.extract(key, value);
    const count = items.length;

    if (!count) {
      // YouTube: persist a profile-only snapshot so the report still has
      // subscribers/title even when no videos came back.
      if (def.persistEmptyProfile && profile) {
        onLog(`[${platform}] ${label}: 0 items（仅保存 profile 快照）`);
        save(handle, scrapeToJSON(profile, []), profile, 0, label);
      }
      continue;
    }

    const file = save(handle, scrapeToJSON(profile, items), profile, count, label);
    if (def.cacheMedia) await cacheAfterSave(file, label);
  }

  return { savedFiles, totalCount };
}
