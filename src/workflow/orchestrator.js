/**
 * orchestrator.js — Drive a KOL investigation workflow through its stages.
 *
 * Stages (each `advance*` call performs work and may transition state):
 *   1. startWorkflows        → submits OSINT batch              → osint_pending
 *   2. tryAdvanceOsint       → fetches OSINT if ready           → osint_done
 *   3. runScrapeAndSubmitCls → scrape inline + submit classify  → classify_pending
 *   4. tryAdvanceClassify    → fetch classify + render report   → report_done
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';

import {
  submitBatch       as submitOsintBatch,
  getBatch          as getOsintBatch,
  getAllResults     as getAllOsintResults,
  loadOsintDir,
  extractScrapeTargets,
  enrichFromBios,
  enrichFromScrapedProfiles,
  discoveriesToPlatformConfigs,
} from '../osint/index.js';
import { writeResults as writeOsintResults } from '../osint/output.js';

import { runScrape } from '../platforms/run.js';
import { createSession, getSession } from '../shared/sessions-store.js';
import { advanceSession } from '../classifier/session.js';
import { defaultModelForProvider, envNameForProvider, inferProvider } from '../classifier/classifier.js';
import { getConfig } from '../shared/config-store.js';
import { renderReport } from './report.js';
import {
  kolDir, accountsDir, identityFile, osintStagingDir, ensureDir, pathSafe,
} from '../shared/paths.js';
import { createLogger } from '../shared/logger.js';
import {
  createWorkflow,
  newWorkflowId,
  updateWorkflow,
  updateStage,
  getWorkflow,
  WORKFLOW_STATE,
} from './store.js';
import { SESSION_STATE } from '../shared/sessions-store.js';

/**
 * Build scrape + classify options from saved config — the single source of
 * truth shared by the WorkflowRun screen and the background daemon, so a
 * batch-driven scrape uses exactly the same settings as an interactive one.
 *
 * scrapeMax left blank = full pull; 1e6 dwarfs any platform's natural API
 * ceiling, letting each scraper exhaust on its own.
 */
export function buildWorkflowScrapeOpts() {
  const saved = getConfig();
  const configuredMax    = (saved.scrapeMax || '').trim();
  const classifyProvider = inferProvider(saved.model, saved.aiProvider);
  return {
    max:             configuredMax || '1000000',
    since:           '',
    until:           '',
    headed:          false,
    redditSource:    'arctic',
    classifyProvider,
    classifyModel:   saved.model || defaultModelForProvider(classifyProvider),
  };
}

// ── 1. Start ───────────────────────────────────────────────────────────────────

/**
 * Submit ONE OSINT batch covering N KOLs and create N workflow records, all
 * pointing at the shared batch_id. Each workflow stores its own slug and a
 * private result_dir; tryAdvanceOsint filters the shared batch's results by
 * slug and writes per-workflow JSON.
 *
 * Single-KOL submission is just N=1.
 *
 * @param {{name:string, seedUrl:string}[]} kols
 * @param {{outBaseDir:string}} opts
 * @returns {Promise<object[]>} the created workflow records
 */
export async function startWorkflows(kols, { outBaseDir }) {
  if (!process.env.XAI_API_KEY) throw new Error('XAI_API_KEY 未设置');
  if (!kols?.length) throw new Error('至少需要 1 个 KOL');
  for (const k of kols) {
    if (!k.name || !k.seedUrl) throw new Error(`无效的 KOL 输入：${JSON.stringify(k)}`);
  }

  // Submit the shared OSINT batch. Shared staging lives under ~/.sns-audit/internal/
  // (it's system data — user doesn't browse it).
  const { batchId, targetsMap } = await submitOsintBatch(kols, {
    apiKey:     process.env.XAI_API_KEY,
    outDirFor:  (id) => osintStagingDir(id),
  });

  const slugs = Object.keys(targetsMap);
  if (slugs.length !== kols.length) {
    throw new Error(`slug count ${slugs.length} ≠ KOL count ${kols.length}`);
  }

  // One workflow per KOL — wf.out_dir IS <outBaseDir>/<kol-slug>/, the
  // user-facing per-person directory. Re-investigations of the same KOL
  // stack into the same dir (analysis/<session_id> isolates them).
  const outRoot = resolve(outBaseDir);
  const workflows = [];
  for (let i = 0; i < kols.length; i++) {
    const k     = kols[i];
    const kolId = slugs[i];          // OSINT slug = canonical kol_id

    const wfid     = newWorkflowId();
    const wfOutDir = kolDir(outRoot, kolId);
    ensureDir(accountsDir(outRoot, kolId));

    createWorkflow({ id: wfid, kolId, kolName: k.name, seedUrl: k.seedUrl, outDir: wfOutDir });
    const fresh = updateStage(wfid, 'osint', {
      batch_id:   batchId,
      staging:    osintStagingDir(batchId),
      slug:       kolId,             // kept as `slug` for the existing batch-filter contract
      shared:     kols.length > 1,
    });
    workflows.push(fresh);
  }

  return workflows;
}

// ── 2. After OSINT ─────────────────────────────────────────────────────────────

/**
 * If the shared OSINT batch is complete, pull only this workflow's slice of
 * results, write it into wf.osint.result_dir, and bump state to osint_done.
 *
 * Other workflows pointing at the same batch_id advance independently when
 * the user invokes tryAdvanceOsint on them — they each filter by their slug.
 */
export async function tryAdvanceOsint(workflowId, { logger = null } = {}) {
  const log = createLogger(logger);
  const wf = getWorkflow(workflowId);
  if (!wf) throw new Error(`Workflow ${workflowId} not found`);
  if (wf.state !== WORKFLOW_STATE.OSINT_PENDING) return { state: wf.state };

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error('XAI_API_KEY 未设置');

  // Poll the shared batch
  const batch = await getOsintBatch({ apiKey, batchId: wf.osint.batch_id });
  if (batch.state?.num_pending !== 0) {
    const s = batch.state ?? {};
    return {
      state:    WORKFLOW_STATE.OSINT_PENDING,
      progress: `${s.num_success ?? 0}/${s.num_requests ?? 0}`,
    };
  }

  // Pull all results (cached to staging for recovery/debug), then write this
  // workflow's slice as the user-facing accounts/identity.json.
  const all  = await getAllOsintResults({ apiKey, batchId: wf.osint.batch_id });
  const mine = all.filter(r => r.batch_request_id === wf.osint.slug);

  if (!mine.length) {
    updateWorkflow(workflowId, {
      state: WORKFLOW_STATE.ERROR,
      error: `共享 batch ${wf.osint.batch_id} 完成，但未找到 slug=${wf.osint.slug} 的结果`,
    });
    throw new Error(`Result missing for slug ${wf.osint.slug}`);
  }

  // Write/refresh staging (idempotent — writes every KOL's slice + _summary).
  const targetsMap = { [wf.osint.slug]: { name: wf.kol.name, seed_url: wf.kol.seed_url } };
  const stagingSummary = writeOsintResults(mine, wf.osint.staging, targetsMap);

  if (stagingSummary.success === 0) {
    updateWorkflow(workflowId, {
      state: WORKFLOW_STATE.ERROR,
      error: stagingSummary.items[0]?.error ?? 'OSINT 解析失败',
    });
    return { state: WORKFLOW_STATE.ERROR };
  }

  // Promote this wf's slice to user-facing accounts/identity.json. Stamp the
  // canonical kol_id (the OSINT slug — same string used everywhere else for
  // this person) into the document itself so downstream code never has to
  // re-derive identity from a directory name.
  const stagingSlugFile = stagingSummary.items[0]?.file;
  if (stagingSlugFile) {
    const accDir = ensureDir(join(wf.out_dir, 'accounts'));
    const identity = JSON.parse(readFileSync(stagingSlugFile, 'utf-8'));
    identity.kol_id = wf.kol_id ?? wf.osint.slug;

    // Bio-link enrichment: walk each verified profile's public bio for
    // outbound links to other platforms Grok didn't surface, and merge them
    // into suspected_accounts so the scrape stage picks them up too.
    try {
      const discovered = await enrichFromBios(identity);
      if (discovered.length) {
        identity.suspected_accounts = [
          ...(identity.suspected_accounts ?? []),
          ...discovered,
        ];
      }
    } catch (e) {
      // Bio enrichment is best-effort — never block OSINT completion on it.
      log.warn(`[bio-enrich] ${wf.kol_id}: ${e.message ?? e}`);
    }

    writeFileSync(join(accDir, 'identity.json'), JSON.stringify(identity, null, 2), 'utf-8');
  }

  updateStage(workflowId, 'osint', { completed_at: new Date().toISOString() });
  updateWorkflow(workflowId, { state: WORKFLOW_STATE.OSINT_DONE });
  return { state: WORKFLOW_STATE.OSINT_DONE, slug: wf.osint.slug };
}

// ── 3. Scrape + submit classify ────────────────────────────────────────────────

/**
 * Run scrape synchronously using the discovered OSINT accounts, then submit a
 * classify batch. After this call the workflow is in classify_pending.
 *
 * @param {string} workflowId
 * @param {{
 *   max:string, since:string, until:string, headed:boolean, redditSource:string
 * }} scrapeOpts
 * @param {(line:string)=>void} onLog
 */
export async function runScrapeAndSubmitClassify(workflowId, scrapeOpts, onLog = () => {}) {
  const wf = getWorkflow(workflowId);
  if (!wf) throw new Error(`Workflow ${workflowId} not found`);
  if (wf.state !== WORKFLOW_STATE.OSINT_DONE) throw new Error(`Workflow not in osint_done state (got ${wf.state})`);
  const provider = inferProvider(scrapeOpts.classifyModel, scrapeOpts.classifyProvider);
  const envName = envNameForProvider(provider);
  if (!process.env[envName]) throw new Error(`${envName} 未设置`);

  // ── 3a. Build scrape targets from user-facing identity.json ────────────────
  const identityFile = join(wf.out_dir, 'accounts', 'identity.json');
  const identity = JSON.parse(readFileSync(identityFile, 'utf-8'));
  const extract  = extractScrapeTargets([{ slug: wf.osint.slug, data: identity }]);
  const pvs      = Object.keys(extract.targets);

  updateStage(workflowId, 'scrape', {
    targets:       extract.targets,
    ignored_count: extract.ignoredCount,
    config:        scrapeOpts,
  });

  if (!pvs.length) {
    updateWorkflow(workflowId, {
      state: WORKFLOW_STATE.ERROR,
      error: `OSINT 未发现可采集账号（忽略 ${extract.ignoredCount} 个未支持平台）`,
    });
    throw new Error('No scrapable accounts discovered');
  }

  // ── 3b. Run scraper (synchronous) — outputs go under <kol_id>/scrape/ ─────
  updateWorkflow(workflowId, { state: WORKFLOW_STATE.SCRAPING });
  onLog(`开始采集 ${pvs.length} 个平台 / ${Object.values(extract.targets).reduce((s,a)=>s+a.length,0)} 个账号`);

  // outDir = the per-user-output ROOT (the layer above <kol_id>/).
  // wf.out_dir == <outRoot>/<kol_id>; runner.js uses kolId to construct
  // the full <outRoot>/<kol_id>/scrape/<platform>/<handle>/<stamp>.json path.
  const outRoot = resolve(join(wf.out_dir, '..'));
  const kolId   = wf.kol_id;
  if (!kolId) throw new Error(`Workflow ${workflowId} has no kol_id — corrupted state`);

  const platformConfigs = pvs.map(pv => ({
    platform:     pv,
    targets:      extract.targets[pv].join(','),
    kolId,
    max:          scrapeOpts.max          || '200',
    since:        scrapeOpts.since        || '',
    until:        scrapeOpts.until        || '',
    headed:       !!scrapeOpts.headed,
    redditSource: scrapeOpts.redditSource || 'arctic',
    apiKey:       process.env.YOUTUBE_API_KEY,
    outDir:       outRoot,
  }));

  const scrapeResult = await runScrape(platformConfigs, onLog);
  onLog(`采集完成：${scrapeResult.totalCount} 条内容（${scrapeResult.savedFiles.length} 个文件）`);

  // Post-scrape bio enrichment + feedback scrape.
  //
  // IG / X / Facebook are auth-walled at OSINT time, but their bio text is
  // now sitting on disk in this KOL's accounts/profiles/<platform>.json
  // snapshots. Mine outbound URLs, append new candidates to identity.json,
  // and *also* fan out a second runScrape pass for the new targets so the
  // classify session sees the full set of posts — not just the OSINT-known
  // accounts. Capped at one feedback round to avoid runaway exploration.
  try {
    const r = enrichFromScrapedProfiles(wf.out_dir, { onLog });
    if (r.added > 0) {
      onLog(`[bio-enrich:post-scrape] 从 ${r.scanned} 个平台 profile 中发现 ${r.added} 个新候选账号`);

      const followUp = discoveriesToPlatformConfigs(r.discovered, kolId, {
        max:          scrapeOpts.max          || '200',
        since:        scrapeOpts.since        || '',
        until:        scrapeOpts.until        || '',
        headed:       !!scrapeOpts.headed,
        redditSource: scrapeOpts.redditSource || 'arctic',
        apiKey:       process.env.YOUTUBE_API_KEY,
        outDir:       outRoot,
      });
      if (followUp.length) {
        const platforms = followUp.map(c => c.platform).join(', ');
        onLog(`[bio-enrich:feedback] 启动二轮采集 · ${followUp.length} 个平台（${platforms}）`);
        const second = await runScrape(followUp, onLog);
        scrapeResult.savedFiles.push(...second.savedFiles);
        scrapeResult.totalCount += second.totalCount;
        onLog(`[bio-enrich:feedback] 二轮采集完成 · +${second.totalCount} 条 / ${second.savedFiles.length} 文件`);
      }
    }
  } catch (e) {
    onLog(`[bio-enrich:post-scrape] 异常：${e.message ?? e}`);
  }

  updateStage(workflowId, 'scrape', {
    saved_files:  scrapeResult.savedFiles,
    total_count:  scrapeResult.totalCount,
    completed_at: new Date().toISOString(),
  });
  updateWorkflow(workflowId, { state: WORKFLOW_STATE.SCRAPE_DONE });

  if (!scrapeResult.totalCount) {
    updateWorkflow(workflowId, { state: WORKFLOW_STATE.ERROR, error: '采集到 0 条内容，跳过分类' });
    throw new Error('Scrape produced 0 posts');
  }

  // ── 3c. Create classify session — WorkflowRun advances it in foreground ────
  // Every input file is annotated with this workflow's kol_id; in the
  // single-KOL workflow path all files belong to the same KOL.
  const inputFiles = scrapeResult.savedFiles.map(f => ({ file: f.file, kol_id: kolId }));
  const session = createSession({
    source:       'workflow',
    workflow_id:  workflowId,
    kol_ids:      [kolId],
    out_root:     outRoot,
    input_files:  inputFiles,
    provider,
    model:        scrapeOpts.classifyModel || defaultModelForProvider(provider),
  });
  onLog(`Classify session 创建：${session.id}（${inputFiles.length} 个采集文件 → 由本任务前台推进）`);

  updateStage(workflowId, 'classify', {
    session_id: session.id,
  });
  updateWorkflow(workflowId, { state: WORKFLOW_STATE.CLASSIFY_PENDING });

  return { state: WORKFLOW_STATE.CLASSIFY_PENDING, sessionId: session.id };
}

// ── 4. After classify ─────────────────────────────────────────────────────────

/**
 * If the classify batch is complete, aggregate + write outputs + render report.
 */
export async function tryAdvanceClassify(workflowId) {
  const wf = getWorkflow(workflowId);
  if (!wf) throw new Error(`Workflow ${workflowId} not found`);
  if (![WORKFLOW_STATE.CLASSIFY_PENDING, WORKFLOW_STATE.CLASSIFY_DONE].includes(wf.state)) return { state: wf.state };

  const sessionId = wf.classify?.session_id;
  if (!sessionId) throw new Error('Workflow has no classify session — corrupted state');

  let session = getSession(sessionId);
  if (!session) return { state: WORKFLOW_STATE.CLASSIFY_PENDING, progress: 'session missing' };

  // User pressing 'r' (or auto-timer) → kick session forward immediately.
  // advanceSession is locked, so it's a no-op if daemon is currently advancing.
  session = await advanceSession(session);

  if (session?.state === SESSION_STATE.COMPLETED) {
    return await finalizeWorkflowFromSession(session);
  }
  if (session?.state === SESSION_STATE.ERROR) {
    updateWorkflow(workflowId, { state: WORKFLOW_STATE.ERROR, error: session.error || 'classify session error' });
    return { state: WORKFLOW_STATE.ERROR, error: session.error };
  }

  const progress = `${session.completed}/${session.chunks_total || '?'} 完成 · ${session.batch_ids.length} 已提交`;
  return { state: WORKFLOW_STATE.CLASSIFY_PENDING, progress };
}

/**
 * Called by tryAdvanceClassify once a workflow-bound session reaches
 * 'completed'. Writes per-workflow classify outputs (already done by
 * session.js) and generates the workflow report. Idempotent — safe to call
 * again.
 */
export async function finalizeWorkflowFromSession(session) {
  if (!session?.workflow_id) return null;
  const wf = getWorkflow(session.workflow_id);
  if (!wf) return null;
  if (wf.state === WORKFLOW_STATE.REPORT_DONE) return { state: WORKFLOW_STATE.REPORT_DONE, reportPath: wf.report?.path };

  updateStage(session.workflow_id, 'classify', {
    result_files: session.result_files ?? [],
    summary:      session.summary ?? null,
    completed_at: new Date().toISOString(),
  });
  updateWorkflow(session.workflow_id, { state: WORKFLOW_STATE.CLASSIFY_DONE });

  const fresh = getWorkflow(session.workflow_id);
  const reportPath = renderReport(fresh);
  updateStage(session.workflow_id, 'report', {
    path:         reportPath,
    completed_at: new Date().toISOString(),
  });
  updateWorkflow(session.workflow_id, { state: WORKFLOW_STATE.REPORT_DONE });

  return { state: WORKFLOW_STATE.REPORT_DONE, reportPath };
}

// ── Scrape driver ───────────────────────────────────────────────────────────
//
// One workflow scrape at a time, process-wide. The `busy` mutex guards against
// a second scrape being kicked off (e.g. rapid key presses) while one is live —
// scrape is the only heavy, non-reentrant stage. There is no background worker:
// workflows are driven entirely in the foreground by the WorkflowRun screen.

let busy = false;

/**
 * Run one workflow's scrape stage interactively (WorkflowRun screen) with live
 * logs. Throws if a scrape is already running so the caller can surface that.
 *
 * @param {string} workflowId
 * @param {{ onLog?: (line:string)=>void }} [opts]
 */
export async function runWorkflowScrape(workflowId, { onLog = () => {} } = {}) {
  if (busy) throw new Error('已有采集任务在执行，请稍候');
  busy = true;
  try {
    return await runScrapeAndSubmitClassify(workflowId, buildWorkflowScrapeOpts(), onLog);
  } finally {
    busy = false;
  }
}
