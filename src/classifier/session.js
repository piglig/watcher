/**
 * session.js — Pure state-transition for a classify session.
 *
 * Called by the App-level daemon (and once manually right after creation, for
 * UX immediacy). Each call advances the session by AT MOST one observable step.
 *
 * Output layout (driven by paths.js):
 *   <out_root>/<subject>/analysis/<session_id>/
 *     report.html  report.md  summary.csv
 *     by-account/<platform>_<handle>/
 *       posts.json  risk.json  flagged.csv  report.html  report.md
 *
 * Rule cache is INTERNAL (~/.sns-audit/internal/rule_caches/<session_id>.json).
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';

import { mergeAndNormalize } from '../shared/normalize.js';
import { applyRulesAll } from './rules.js';
import {
  submitBatch, fetchBatchResults, aggregateUserRisk, chunkPosts, inferProvider,
  apiKeyForProvider, envNameForProvider, computeErrorStats,
} from './classifier.js';
import { toClassifierJSON, toUserRiskCSV, toFlaggedPostsCSV } from './output.js';
import { updateSession, appendSessionLog, getSession, SESSION_STATE, TERMINAL_STATES } from '../shared/sessions-store.js';
import { saveBatch, updateBatch, BATCH_STATUS } from '../shared/batch-store.js';
import {
  analysisDir, byAccountDir, ruleCacheFile, ensureDir, kolDir,
} from '../shared/paths.js';
import { renderClassifyReport, renderAccountReport } from './classify-report.js';
import { renderReport } from '../workflow/report.js';

/**
 * Load every post across input_files, tagging each post with its file's
 * kol_id. Returns `{ posts, fileMeta }` where:
 *  - posts: canonical Post[] with an extra `_kol_id` field
 *  - fileMeta: [{ file, kol_id, platform, handle, count }] per input file
 *    (the saved-files manifest, kept ordered as input_files was)
 *
 * input_files MUST be the new annotated form `[{file, kol_id}]`. The store
 * layer (sessions-store.js) rejects bare strings, so by the time we reach
 * here every entry carries its kol_id.
 */
function loadAllPosts(inputFiles) {
  const posts   = [];
  const fileMeta = [];
  for (const entry of (inputFiles ?? [])) {
    const { file, kol_id } = entry;
    let data;
    try { data = JSON.parse(readFileSync(file, 'utf-8')); } catch { continue; }
    if (!data) continue;

    // Extract platform + handle from the canonical scrape path
    //   <…>/<kol_id>/scrape/<platform>/<handle>/<stamp>.json
    // (purely for the saved_files manifest displayed in the report — never
    // used for KOL attribution any more).
    const norm = String(file).replace(/\\/g, '/');
    const m = norm.match(/\/scrape\/([^/]+)\/([^/]+)\//);
    const platform = m?.[1] ?? 'unknown';
    const handle   = m?.[2] ?? '';

    const filePosts = mergeAndNormalize([data]);
    for (const p of filePosts) p._kol_id = kol_id;
    posts.push(...filePosts);
    fileMeta.push({ file, kol_id, platform, handle, count: filePosts.length });
  }
  return { posts, fileMeta };
}

const RISK_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const worstLevel = (risks) => {
  let best = 'low';
  for (const u of risks) {
    if ((RISK_ORDER[u.risk_level] ?? 9) < (RISK_ORDER[best] ?? 9)) best = u.risk_level;
  }
  return best;
};

// NB: in the pre-canonical-kol_id world, ~150 lines of code lived here:
// PLATFORM_ALIASES, URL_HANDLE_RE, parseScrapeFilePath, normToken,
// identityKeys, buildKolHandleMap, lookupKolSlug. All of it existed to
// answer "which KOL does this user_risk belong to?" by fuzzy-matching the
// classifier's view of an author against identity.json content scattered
// across sibling KOL directories.
//
// That entire problem disappeared once input_files started carrying kol_id.
// Each post is now tagged at load time with its file's kol_id, and user_risk
// → kol_id is a one-line lookup: pick any post belonging to that author.

/**
 * Pure-disk render: write all per-KOL artefacts and return { result_files, summary }.
 *
 * Layout (one tree per KOL — directory name == kol_id by construction):
 *   <out_root>/<kol_id>/analysis/<session_id>/
 *     report.html  report.md  summary.csv  summary.json
 *     by-account/<platform>_<handle>/{posts.json, risk.json, flagged.csv, report.html, report.md}
 *
 * Per-post `_kol_id` (stamped by loadAllPosts from the file annotation) is
 * the single source of truth for KOL ownership. No identity-graph walking,
 * no token matching, no slug-from-path scraping.
 */
function writeAllReports(session, { allPosts, fileMeta, allResults, userRisk, sourceStats }) {
  // author_id → kol_id, sourced directly from posts (every post carries it).
  const authorKol = new Map();
  for (const p of allPosts) {
    const aid = String(p.author?.id ?? p.author?.username ?? '');
    if (aid && p._kol_id && !authorKol.has(aid)) authorKol.set(aid, p._kol_id);
  }

  // author_id → { platform, handle, uPosts } — for per-account drill-downs.
  const userInfo = new Map();
  for (const u of userRisk) {
    const uPosts = allPosts.filter(p =>
      String(p.author?.id ?? p.author?.username ?? '') === String(u.author_id),
    );
    if (!uPosts.length) continue;
    userInfo.set(u.author_id, {
      platform: uPosts[0].platform ?? 'unknown',
      handle:   u.username ?? u.author_id,
      uPosts,
    });
  }

  // Group user_risks by kol_id. Posts with no kol_id mapping (would only
  // happen if a user_risk has zero matching posts in allPosts, e.g. a stale
  // result with all posts filtered out at load time) get an isolated bucket.
  const groups = new Map();   // kolId → user_risk[]
  for (const u of userRisk) {
    const kolId = authorKol.get(String(u.author_id))
               ?? `unmapped-${String(u.username ?? u.author_id ?? 'unknown').replace(/^@+/, '')}`;
    if (!groups.has(kolId)) groups.set(kolId, []);
    groups.get(kolId).push(u);
  }

  const kolReports = [];

  for (const [kolId, kolUserRisk] of groups) {
    const dir = ensureDir(analysisDir(session.out_root, kolId, session.id));

    const authorSet = new Set(kolUserRisk.map(u => String(u.author_id)));
    const kolPosts = allPosts.filter(p =>
      authorSet.has(String(p.author?.id ?? p.author?.username ?? '')),
    );

    const summaryJsonPath = join(dir, 'summary.json');
    const summaryCsvPath  = join(dir, 'summary.csv');
    const reportHtmlPath  = join(dir, 'report.html');
    const reportMdPath    = join(dir, 'report.md');

    const kolResults = {};
    for (const p of kolPosts) {
      const r = allResults[String(p.id)];
      if (r) kolResults[String(p.id)] = r;
    }

    writeFileSync(summaryJsonPath, toClassifierJSON(kolUserRisk, kolResults, sourceStats));
    writeFileSync(summaryCsvPath,  toUserRiskCSV(kolUserRisk));

    const { html, md } = renderClassifyReport({
      session: { ...session, kol_id: kolId },
      userRisk: kolUserRisk,
      allPosts: kolPosts,
      allResults: kolResults,
    });
    writeFileSync(reportHtmlPath, html);
    writeFileSync(reportMdPath,   md);

    // Per-account drilldowns — under THIS KOL's analysis dir.
    for (const u of kolUserRisk) {
      const info = userInfo.get(u.author_id);
      if (!info) continue;
      const { platform, handle, uPosts } = info;
      const accDir = ensureDir(byAccountDir(session.out_root, kolId, session.id, platform, handle));
      const uResults = {};
      for (const p of uPosts) {
        const r = allResults[String(p.id)];
        if (r) uResults[String(p.id)] = r;
      }
      writeFileSync(join(accDir, 'posts.json'),  JSON.stringify(uPosts, null, 2));
      writeFileSync(join(accDir, 'risk.json'),   JSON.stringify({ user: u, results: uResults }, null, 2));
      writeFileSync(join(accDir, 'flagged.csv'), toFlaggedPostsCSV([u]));
      const { html: aHtml, md: aMd } = renderAccountReport({
        user: u, posts: uPosts, results: uResults, platform,
      });
      writeFileSync(join(accDir, 'report.html'), aHtml);
      writeFileSync(join(accDir, 'report.md'),   aMd);
    }

    // ── Comprehensive "风险审查报告" — identity + scrape + classify combined ────
    const kolRoot = kolDir(session.out_root, kolId);
    const identityJson = (() => {
      try { return JSON.parse(readFileSync(join(kolRoot, 'accounts', 'identity.json'), 'utf-8')); }
      catch { return null; }
    })();

    // saved_files = the subset of session.input_files belonging to this KOL.
    // No path parsing, no platform/handle matching — kol_id is annotated on
    // every entry.
    const savedFiles = fileMeta
      .filter(m => m.kol_id === kolId)
      .map(m => ({ label: `${m.platform} · @${m.handle}`, count: m.count, file: m.file }));

    const seedUrl = identityJson?.verified_accounts?.[0]?.url
                  ?? identityJson?.suspected_accounts?.[0]?.url
                  ?? '';
    const kolName = identityJson?.kol_identity?.primary_name ?? kolId;

    let reviewHtmlPath = null;
    try {
      reviewHtmlPath = renderReport({
        id:       session.id,
        kol_id:   kolId,
        out_dir:  kolRoot,
        kol:      { name: kolName, seed_url: seedUrl },
        scrape:   { total_count: savedFiles.reduce((s, f) => s + (f.count ?? 0), 0), saved_files: savedFiles },
        classify: { session_id: session.id },
      });
    } catch (e) {
      appendSessionLog(session.id, `[report] renderReport failed for ${kolId}: ${e.message ?? e}`);
    }

    const level = worstLevel(kolUserRisk);
    const score = kolUserRisk.reduce((max, u) => Math.max(max, u.risk_score ?? 0), 0);
    const flaggedTotal = kolUserRisk.reduce((s, u) => s + (u.flagged_post_count ?? 0), 0);

    const files = [];
    if (reviewHtmlPath) files.push({ file: reviewHtmlPath, label: '风险审查报告' });
    files.push({ file: reportHtmlPath, label: '分类报告' });

    kolReports.push({
      kol_id:        kolId,
      slug:          kolId,           // kept as alias for callers that still read `.slug`
      name:          kolName,
      account_count: kolUserRisk.length,
      flagged_count: flaggedTotal,
      risk_level:    level,
      risk_score:    score,
      files,
    });
  }

  kolReports.sort((a, b) =>
    (RISK_ORDER[a.risk_level] ?? 9) - (RISK_ORDER[b.risk_level] ?? 9)
    || (b.risk_score ?? 0) - (a.risk_score ?? 0)
  );

  const summary = {
    total_posts:   allPosts.length,
    flagged_total: userRisk.reduce((s, u) => s + (u.flagged_post_count ?? 0), 0),
    top_kols:      kolReports.slice(0, 5).map(k => ({
      slug:          k.slug,
      name:          k.name,
      account_count: k.account_count,
      risk_level:    k.risk_level,
      risk_score:    k.risk_score,
      flagged_count: k.flagged_count,
    })),
    kol_count:     kolReports.length,
  };

  return { result_files: kolReports, summary, kolCount: kolReports.length };
}

/**
 * Walk <outRoot>/<*>/analysis/<sid> and delete each one. Used by regenerate to
 * clear stale outputs from the old single-subject layout before re-running.
 */
function purgeAnalysisDirs(outRoot, sid) {
  if (!outRoot || !existsSync(outRoot)) return;
  let entries;
  try { entries = readdirSync(outRoot, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = join(outRoot, e.name, 'analysis', sid);
    if (existsSync(dir)) {
      try { rmSync(dir, { recursive: true, force: true }); }
      catch (err) { appendSessionLog(sid, `[regenerate] failed to clean ${dir}: ${err.message ?? err}`); }
    }
  }
}

/**
 * Manual rebuild for an already-completed session. Reads results from
 * `summary.json` on disk (no API calls) and re-renders every report.
 *
 * Throws if input files or summary.json are missing — surface those to the UI.
 */
/**
 * Reconstruct the master aggregate by refetching every batch's results from
 * the provider's Batch API. Used when master file is missing AND the legacy
 * summary.json looks unusable. Output files (rule cache, batch outputs) are
 * cached by the provider so this doesn't trigger another classification run.
 */
async function recoverMasterFromBatches(session) {
  const provider = inferProvider(session.model, session.provider);
  const apiKey = apiKeyForProvider(provider);
  if (!apiKey) {
    throw new Error(
      `${envNameForProvider(provider)} 未设置 —— 无法从 Batch API 恢复聚合结果`,
    );
  }
  if (!session.batch_ids?.length) {
    throw new Error('session 没有 batch_ids 记录，无法从 Batch API 恢复');
  }

  const { posts: allPosts, fileMeta } = loadAllPosts(session.input_files);
  if (!allPosts.length) throw new Error('input_files 加载为空，无法恢复');

  const ruleHits    = applyRulesAll(allPosts);
  const ruleResults = Object.fromEntries(ruleHits);
  const llmResults  = {};

  for (const bid of session.batch_ids) {
    const res = await fetchBatchResults(bid, { apiKey, provider, model: session.model, wait: false });
    if (res.status !== 'completed') {
      throw new Error(`batch ${bid} 尚未完成（${res.status}），无法恢复`);
    }
    Object.assign(llmResults, res.results);
    const errCount = res.errors?.length ?? 0;
    if (errCount) {
      const sample = res.errors[0];
      appendSessionLog(session.id, `batch ${bid}: ${errCount} 条失败，示例：${sample.code} ${String(sample.message).slice(0, 120)}`);
    }
  }

  const allResults = { ...ruleResults, ...llmResults };
  const userRisk   = aggregateUserRisk(allPosts, allResults);
  let whitelisted = 0, ruleFlagged = 0;
  for (const r of ruleHits.values()) {
    if (r.source === 'whitelist') whitelisted++; else ruleFlagged++;
  }
  const sourceStats = {
    total:     allPosts.length,
    rules:     ruleFlagged,
    whitelist: whitelisted,
    llm:      allPosts.length - ruleFlagged - whitelisted,
  };
  return { allPosts, fileMeta, allResults, userRisk, sourceStats };
}

export async function regenerateReports(sessionId) {
  const session = getSession(sessionId);
  if (!session) throw new Error(`session ${sessionId} 不存在`);

  // Always refetch from the Batch API — that's the single trustworthy source
  // of the full per-post results. (Result retrieval doesn't cost tokens; the
  // batches were already paid for during the original submission.)
  appendSessionLog(session.id, '重建报告：从 Batch API 拉取全部结果');
  const { allPosts, fileMeta, allResults, userRisk, sourceStats } = await recoverMasterFromBatches(session);

  if (!allPosts.length) {
    throw new Error('未能从 input_files 加载到 post —— 原始采集文件可能已被移动或删除');
  }

  // Wipe every <kol>/analysis/<sid> dir before writing fresh, so stale
  // per-account folders from earlier (buggy) layouts don't linger.
  purgeAnalysisDirs(session.out_root, session.id);

  const { result_files, summary, kolCount } = writeAllReports(session, {
    allPosts, fileMeta, allResults, userRisk, sourceStats,
  });

  appendSessionLog(session.id, `重建完成 · ${kolCount} 个 KOL 独立报告`);
  updateSession(session.id, { result_files, summary });
  return { result_files, summary };
}

// ── Per-session in-process locks (prevent daemon + immediate-kick race) ──────
const advanceLocks  = new Map();
// AbortControllers for in-flight realtime submits (currently: DeepSeek). Used
// by requestSessionCancel to stop the in-process work loop. Cleaned up in
// _doAdvance's finally.
const activeAborts  = new Map();

// Per-session derivation cache. The daemon ticks _doAdvance every 30s while a
// session is pending; without this cache, every tick re-reads every input file
// (potentially hundreds of MB of synchronous I/O) and re-runs the rule pass and
// the chunker — all to compute values that are deterministic from input_files
// and don't change for the lifetime of the session. We also accumulate per-
// batch LLM results here so already-drained batches don't get re-fetched from
// the provider on every tick.
//
// Shape: sessionId → {
//   allPosts, fileMeta, ruleResults, ruleHits, llmPosts, chunks,
//   llmResults: {},          // accumulated across ticks; merged into final aggregate
//   drainedBatchIds: Set     // batches we've already fetched + folded into llmResults
// }
//
// Evicted by advanceSession() when the session reaches a terminal state, by
// retryErroredSession() (so a retry starts fresh), and by requestSessionCancel.
const sessionCaches = new Map();

function evictSessionCache(sessionId) {
  sessionCaches.delete(sessionId);
}

/**
 * Mark a session cancelled and abort any in-flight realtime work it owns.
 * Used by the TUI cancel handler — particularly necessary for DeepSeek, where
 * `submit` is the full classification work (no remote batch to cancel).
 */
/**
 * Retry an errored session. Clears the error and flips state back to PENDING
 * so the App-level daemon picks it up. Also kicks advanceSession immediately
 * for UX (no 30s wait). Safe to call on non-ERROR sessions — it's a no-op.
 *
 * On the next tick, `_doAdvance` walks session.batch_ids and re-fetches each
 * batch: already-completed batches return cached results from the provider,
 * the previously-failed batch is retried, and remaining chunks are submitted.
 * Per-batch "[i/N] 批次完成" logs flow into the existing SessionView LogPanel,
 * so the user sees download progress live.
 */
export function retryErroredSession(sessionId) {
  const s = getSession(sessionId);
  if (!s) return null;
  if (s.state !== SESSION_STATE.ERROR) return s;
  appendSessionLog(sessionId, `主动重试：从 Batch API 重新拉取 ${s.batch_ids?.length ?? 0} 个批次`);
  // Drop any stale cache so the retry rebuilds chunks + refetches batch results
  // from scratch (the prior failure may have left llmResults partially populated).
  evictSessionCache(sessionId);
  const updated = updateSession(sessionId, { state: SESSION_STATE.PENDING, error: null });
  // Kick advance loop in background — don't block caller; errors are
  // already routed back into session state by _doAdvance.
  advanceSession(updated).catch(e => appendSessionLog(updated.id, `重试失败：${e.message ?? e}`));
  return updated;
}

export function requestSessionCancel(sessionId, reason = '用户取消') {
  const s = getSession(sessionId);
  if (!s) return null;
  if (TERMINAL_STATES.has(s.state)) return s;
  updateSession(sessionId, { state: SESSION_STATE.CANCELLED, error: reason });
  activeAborts.get(sessionId)?.abort(reason);
  evictSessionCache(sessionId);
  return getSession(sessionId);
}

export async function advanceSession(initial) {
  const id = initial?.id;
  if (!id) return null;
  const inFlight = advanceLocks.get(id);
  if (inFlight) return inFlight;
  const p = (async () => {
    try {
      return await _doAdvance(initial);
    } finally {
      advanceLocks.delete(id);
      // Free the derivation cache the moment the session reaches a terminal
      // state — these caches can hold hundreds of MB of post arrays.
      const cur = getSession(id);
      if (cur && TERMINAL_STATES.has(cur.state)) evictSessionCache(id);
    }
  })();
  advanceLocks.set(id, p);
  return p;
}

async function _doAdvance(initial) {
  let session = getSession(initial.id);
  if (!session) return null;
  if (!['submitting', 'pending'].includes(session.state)) return session;

  const provider = inferProvider(session.model, session.provider);
  const apiKey = apiKeyForProvider(provider);
  if (!apiKey) {
    const envName = envNameForProvider(provider);
    return updateSession(session.id, { state: SESSION_STATE.ERROR, error: `${envName} 未设置` });
  }

  try {
    // 1) Re-derive deterministic chunks from inputs — cached per session.
    //    loadAllPosts + applyRulesAll + chunkPosts depend only on input_files,
    //    which never changes after createSession. Caching avoids re-reading and
    //    re-parsing potentially hundreds of MB of scrape JSON every daemon tick.
    let cache = sessionCaches.get(session.id);
    if (!cache) {
      const { posts: allPosts, fileMeta } = loadAllPosts(session.input_files);
      const ruleHits    = applyRulesAll(allPosts);
      const ruleResults = Object.fromEntries(ruleHits);
      const llmPosts    = allPosts.filter(p => !ruleResults[String(p.id)]);
      const chunks      = chunkPosts(llmPosts);
      cache = {
        allPosts, fileMeta, ruleHits, ruleResults, llmPosts, chunks,
        // llmResults accumulates as batches drain — persistent across ticks so
        // a session with N completed batches doesn't re-hit the provider for
        // results we've already fetched.
        llmResults: {},
        drainedBatchIds: new Set(),
        // Accumulated per-batch LLM errors (res.errors) across all drained
        // batches — folded into the session summary at completion.
        errors: [],
      };
      sessionCaches.set(session.id, cache);
    }
    const { allPosts, fileMeta, ruleHits, ruleResults, llmPosts, chunks } = cache;

    if (session.chunks_total !== chunks.length) {
      session = updateSession(session.id, { chunks_total: chunks.length });
    }
    if (session.batch_ids.length === 0 && (session.logs?.length ?? 0) === 0) {
      appendSessionLog(session.id, `加载 ${allPosts.length} 条 · 规则命中 ${Object.keys(ruleResults).length} · LLM ${llmPosts.length} 条 / ${chunks.length} 批`);
    }

    const batchIds = [...session.batch_ids];

    // 2) Drain submitted batches. Skip batches already folded into the cache —
    //    fetchBatchResults is a network round-trip per call, and previously we
    //    re-fetched every batch on every tick.
    for (let i = 0; i < batchIds.length; i++) {
      const bid = batchIds[i];
      if (cache.drainedBatchIds.has(bid)) continue;
      const res = await fetchBatchResults(bid, { apiKey, provider, model: session.model, wait: false });
      if (res.status !== 'completed') {
        return updateSession(session.id, { state: SESSION_STATE.PENDING, completed: i });
      }
      Object.assign(cache.llmResults, res.results);
      cache.drainedBatchIds.add(bid);
      if (res.errors?.length) cache.errors.push(...res.errors);
      updateBatch(bid, { status: 'completed', completed_at: new Date().toISOString() });
      if (i >= session.completed) {
        const okCount  = Object.keys(res.results).length;
        const errCount = res.errors?.length ?? 0;
        let msg = `[${i + 1}/${chunks.length}] 批次完成（${okCount} 条结果`;
        if (errCount) {
          const sample = res.errors[0];
          msg += ` · ${errCount} 条失败，示例：${sample.code} ${String(sample.message).slice(0, 120)}`;
        }
        appendSessionLog(session.id, msg + '）');
      }
    }
    const llmResults = cache.llmResults;

    // 3) Submit next chunk if any.
    if (batchIds.length < chunks.length) {
      const next = chunks[batchIds.length];
      const idx  = batchIds.length;
      appendSessionLog(session.id, `[${idx + 1}/${chunks.length}] 提交批次（${next.length} 条 · ${provider} · model ${session.model}）`);

      // For realtime providers (DeepSeek), submit IS the work. Stream progress
      // and expose an AbortController so the user can cancel it mid-flight.
      const abort = new AbortController();
      activeAborts.set(session.id, abort);
      let lastFlush = 0;
      const onProgress = (done, total) => {
        const now = Date.now();
        // Throttle disk writes — 1 update / second is enough for the 2s TUI poll.
        if (now - lastFlush < 1000 && done < total) return;
        lastFlush = now;
        updateSession(session.id, { inflight_done: done, inflight_total: total });
      };

      let batchId;
      try {
        ({ batchId } = await submitBatch(next, {
          apiKey, provider, model: session.model,
          signal: abort.signal, onProgress,
        }));
      } finally {
        activeAborts.delete(session.id);
        updateSession(session.id, { inflight_done: null, inflight_total: null });
      }

      saveBatch({
        id:          batchId,
        kind:        'classify',
        provider,
        model:       session.model,
        post_count:  next.length,
        input_files: session.input_files,
        session_id:  session.id,
      });
      appendSessionLog(session.id, `[${idx + 1}/${chunks.length}] 已提交 ${batchId}`);
      return updateSession(session.id, {
        state:     'pending',
        batch_ids: [...batchIds, batchId],
        completed: idx,
      });
    }

    // 4) All chunks done → aggregate + write per-subject outputs + reports.
    if (!allPosts.length) {
      return updateSession(session.id, { state: SESSION_STATE.COMPLETED, completed: 0 });
    }

    const allResults = { ...ruleResults, ...llmResults };
    const userRisk   = aggregateUserRisk(allPosts, allResults);

    let whitelisted = 0, ruleFlagged = 0;
    for (const r of ruleHits.values()) {
      if (r.source === 'whitelist') whitelisted++;
      else ruleFlagged++;
    }
    const sourceStats = {
      total:        allPosts.length,
      rules:        ruleFlagged,
      whitelist:    whitelisted,
      llm:          llmPosts.length,
    };

    const { result_files, summary, kolCount } = writeAllReports(session, {
      allPosts, fileMeta, allResults, userRisk, sourceStats,
    });

    // Fold error stats into the persisted summary so the UI/report can surface
    // them — classify_failed (LLM requests that errored) + unclassified (posts
    // that entered the pipeline but got no result).
    const errStats    = computeErrorStats(allPosts, allResults, cache.errors);
    const fullSummary = { ...summary, ...errStats };
    if (errStats.classify_failed || errStats.unclassified) {
      const ex = errStats.error_sample[0];
      appendSessionLog(session.id,
        `⚠ ${errStats.classify_failed} 条分类失败 · ${errStats.unclassified} 条未分类`
        + (ex ? `（示例：${ex.code} ${ex.message}）` : ''));
    }
    appendSessionLog(session.id, `全部完成 · 输出 ${kolCount} 个 KOL 报告`);
    return updateSession(session.id, {
      state:        'completed',
      completed:    chunks.length,
      result_files,
      summary:      fullSummary,
    });
  } catch (e) {
    // If we were cancelled, requestSessionCancel already set the state — do
    // not overwrite it with 'error'.
    const current = getSession(initial.id);
    if (current?.state === SESSION_STATE.CANCELLED) {
      appendSessionLog(initial.id, `已取消`);
      return current;
    }
    const msg = e?.message ?? String(e);
    appendSessionLog(session.id, `失败：${msg}`);
    return updateSession(session.id, { state: SESSION_STATE.ERROR, error: msg });
  }
}
