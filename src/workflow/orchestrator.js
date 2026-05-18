/**
 * orchestrator.js — Drive a KOL investigation workflow through its stages.
 *
 * Stages (each `advance*` call performs work and may transition state):
 *   1. startWorkflow         → submits OSINT batch              → osint_pending
 *   2. tryAdvanceOsint       → fetches OSINT if ready           → osint_done
 *   3. runScrapeAndSubmitCls → scrape inline + submit classify  → classify_pending
 *   4. tryAdvanceClassify    → fetch classify + render report   → report_done
 */

import { mkdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';

import {
  submitBatch       as submitOsintBatch,
  getBatch          as getOsintBatch,
  getAllResults     as getAllOsintResults,
  loadOsintDir,
  extractScrapeTargets,
} from '../osint/index.js';
import { writeResults as writeOsintResults } from '../osint/output.js';

import { runScrape }         from '../tui/runner.js';
import { mergeAndNormalize } from '../shared/normalize.js';
import {
  submitBatch       as submitClassifyBatch,
  fetchBatchResults as fetchClassifyResults,
  aggregateUserRisk,
} from '../classifier/classifier.js';
import { applyRulesAll }   from '../classifier/rules.js';
import { toClassifierJSON, toUserRiskCSV, toFlaggedPostsCSV } from '../classifier/output.js';

import { readFileSync, writeFileSync } from 'fs';
import { renderReport } from './report.js';
import {
  createWorkflow,
  updateWorkflow,
  updateStage,
  getWorkflow,
} from './store.js';

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

  // Shared OSINT staging dir (holds the _targets.json + _summary.json for the
  // whole batch). Per-workflow result_dirs live under each wf's own out_dir.
  const sharedRoot = resolve(join(outBaseDir, 'workflows', `batch_${Date.now()}`));
  const sharedOsintDir = join(sharedRoot, 'osint-shared');
  mkdirSync(sharedOsintDir, { recursive: true });

  // 1) Submit the shared OSINT batch
  const { batchId, targetsMap } = await submitOsintBatch(kols, {
    apiKey: process.env.XAI_API_KEY,
    outDir: sharedOsintDir,
  });

  // targetsMap is insertion-ordered identically to `kols` (both come from
  // buildBatchRequests's single pass), so we zip by index. This is robust to
  // duplicate KOL names (slugger appends -2 / -3 suffixes).
  const slugs = Object.keys(targetsMap);
  if (slugs.length !== kols.length) {
    throw new Error(`slug count ${slugs.length} ≠ KOL count ${kols.length}`);
  }

  // 3) Create one workflow per KOL, all pointing at the same batch_id
  const workflows = [];
  for (let i = 0; i < kols.length; i++) {
    const k = kols[i];
    const slug = slugs[i];
    const wfOutDir = join(sharedRoot, slug);
    mkdirSync(wfOutDir, { recursive: true });
    const wfOsintDir = join(wfOutDir, 'osint');
    mkdirSync(wfOsintDir, { recursive: true });

    const wf = createWorkflow({ kolName: k.name, seedUrl: k.seedUrl, outDir: wfOutDir });
    const fresh = updateStage(wf.id, 'osint', {
      batch_id:   batchId,
      result_dir: wfOsintDir,
      slug,
      shared:     kols.length > 1,
    });
    workflows.push(fresh);
  }

  return workflows;
}

/** Back-compat single-KOL entry. */
export async function startWorkflow({ kolName, seedUrl, outBaseDir }) {
  const [wf] = await startWorkflows([{ name: kolName, seedUrl }], { outBaseDir });
  return wf;
}

// ── 2. After OSINT ─────────────────────────────────────────────────────────────

/**
 * If the shared OSINT batch is complete, pull only this workflow's slice of
 * results, write it into wf.osint.result_dir, and bump state to osint_done.
 *
 * Other workflows pointing at the same batch_id advance independently when
 * the user invokes tryAdvanceOsint on them — they each filter by their slug.
 */
export async function tryAdvanceOsint(workflowId) {
  const wf = getWorkflow(workflowId);
  if (!wf) throw new Error(`Workflow ${workflowId} not found`);
  if (wf.state !== 'osint_pending') return { state: wf.state };

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error('XAI_API_KEY 未设置');

  // Poll the shared batch
  const batch = await getOsintBatch({ apiKey, batchId: wf.osint.batch_id });
  if (batch.state?.num_pending !== 0) {
    const s = batch.state ?? {};
    return {
      state:    'osint_pending',
      progress: `${s.num_success ?? 0}/${s.num_requests ?? 0}`,
    };
  }

  // Pull all results, then keep only the one matching this workflow's slug.
  const all  = await getAllOsintResults({ apiKey, batchId: wf.osint.batch_id });
  const mine = all.filter(r => r.batch_request_id === wf.osint.slug);

  if (!mine.length) {
    updateWorkflow(workflowId, {
      state: 'error',
      error: `共享 batch ${wf.osint.batch_id} 完成，但未找到 slug=${wf.osint.slug} 的结果`,
    });
    throw new Error(`Result missing for slug ${wf.osint.slug}`);
  }

  // Write the per-KOL JSON into THIS workflow's osint dir
  const targetsMap = { [wf.osint.slug]: { name: wf.kol.name, seed_url: wf.kol.seed_url } };
  const summary = writeOsintResults(mine, wf.osint.result_dir, targetsMap);

  updateStage(workflowId, 'osint', { completed_at: new Date().toISOString() });

  if (summary.success === 0) {
    updateWorkflow(workflowId, {
      state: 'error',
      error: summary.items[0]?.error ?? 'OSINT 解析失败',
    });
    return { state: 'error' };
  }

  updateWorkflow(workflowId, { state: 'osint_done' });
  return { state: 'osint_done', slug: wf.osint.slug };
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
  if (wf.state !== 'osint_done') throw new Error(`Workflow not in osint_done state (got ${wf.state})`);
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY 未设置');

  // ── 3a. Build scrape targets from OSINT result ──────────────────────────────
  const kols    = loadOsintDir(wf.osint.result_dir);
  const extract = extractScrapeTargets(kols);
  const pvs     = Object.keys(extract.targets);

  updateStage(workflowId, 'scrape', {
    targets:       extract.targets,
    ignored_count: extract.ignoredCount,
    config:        scrapeOpts,
  });

  if (!pvs.length) {
    updateWorkflow(workflowId, {
      state: 'error',
      error: `OSINT 未发现可采集账号（忽略 ${extract.ignoredCount} 个未支持平台）`,
    });
    throw new Error('No scrapable accounts discovered');
  }

  // ── 3b. Run scraper (synchronous) ───────────────────────────────────────────
  updateWorkflow(workflowId, { state: 'scraping' });
  onLog(`开始采集 ${pvs.length} 个平台 / ${Object.values(extract.targets).reduce((s,a)=>s+a.length,0)} 个账号`);

  const scrapeDir = join(wf.out_dir, 'scrape');
  mkdirSync(scrapeDir, { recursive: true });

  const platformConfigs = pvs.map(pv => ({
    platform:     pv,
    targets:      extract.targets[pv].join(','),
    max:          scrapeOpts.max          || '200',
    since:        scrapeOpts.since        || '',
    until:        scrapeOpts.until        || '',
    headed:       !!scrapeOpts.headed,
    redditSource: scrapeOpts.redditSource || 'arctic',
    apiKey:       process.env.YOUTUBE_API_KEY,
    outDir:       scrapeDir,
  }));

  const scrapeResult = await runScrape(platformConfigs);
  onLog(`采集完成：${scrapeResult.totalCount} 条内容（${scrapeResult.savedFiles.length} 个文件）`);

  updateStage(workflowId, 'scrape', {
    out_dir:      scrapeDir,
    saved_files:  scrapeResult.savedFiles,
    total_count:  scrapeResult.totalCount,
    completed_at: new Date().toISOString(),
  });
  updateWorkflow(workflowId, { state: 'scrape_done' });

  if (!scrapeResult.totalCount) {
    updateWorkflow(workflowId, { state: 'error', error: '采集到 0 条内容，跳过分类' });
    throw new Error('Scrape produced 0 posts');
  }

  // ── 3c. Load scraped posts, run rule engine, submit classify batch ──────────
  const dataArrays = scrapeResult.savedFiles
    .map(f => { try { return JSON.parse(readFileSync(f.file, 'utf-8')); } catch { return null; } })
    .filter(Boolean);
  const allPosts = mergeAndNormalize(dataArrays);
  onLog(`合并并规范化 ${allPosts.length} 条内容`);

  const classifyDir = join(wf.out_dir, 'classify');
  mkdirSync(classifyDir, { recursive: true });

  const ruleHits    = applyRulesAll(allPosts);
  const ruleResults = Object.fromEntries(
    ruleHits.map(r => [String(r.id), { scores: r.scores, reasons: r.reasons ?? {}, source: 'rule' }])
  );
  const llmPosts = allPosts.filter(p => !ruleResults[String(p.id)]);
  onLog(`规则命中 ${Object.keys(ruleResults).length} 条；剩余 ${llmPosts.length} 条送 LLM`);

  let classifyBatchId = null;
  if (llmPosts.length) {
    const { batchId } = await submitClassifyBatch(llmPosts, {
      apiKey: process.env.OPENAI_API_KEY,
      model:  scrapeOpts.classifyModel || 'gpt-4.1-mini',
    });
    classifyBatchId = batchId;
    onLog(`Classify batch 提交：${batchId}`);
  } else {
    onLog('全部由规则处理，无需 LLM 批次');
  }

  // Persist rule pre-results to disk so the next stage can merge them in.
  const ruleCachePath = join(classifyDir, '_rules.json');
  writeFileSync(ruleCachePath, JSON.stringify({ ruleResults, allPosts }, null, 2), 'utf-8');

  updateStage(workflowId, 'classify', {
    batch_id:      classifyBatchId,
    out_dir:       classifyDir,
    rule_cache:    ruleCachePath,
  });
  updateWorkflow(workflowId, { state: classifyBatchId ? 'classify_pending' : 'classify_done' });

  return { state: classifyBatchId ? 'classify_pending' : 'classify_done', batchId: classifyBatchId };
}

// ── 4. After classify ─────────────────────────────────────────────────────────

/**
 * If the classify batch is complete, aggregate + write outputs + render report.
 */
export async function tryAdvanceClassify(workflowId) {
  const wf = getWorkflow(workflowId);
  if (!wf) throw new Error(`Workflow ${workflowId} not found`);
  if (!['classify_pending', 'classify_done'].includes(wf.state)) return { state: wf.state };

  // Pull cached rule results and original posts.
  const cachePath = wf.classify.rule_cache;
  if (!cachePath || !existsSync(cachePath)) throw new Error('Rule cache missing — workflow integrity error');
  const { ruleResults, allPosts } = JSON.parse(readFileSync(cachePath, 'utf-8'));

  let llmResults = {};
  if (wf.classify.batch_id) {
    const res = await fetchClassifyResults(wf.classify.batch_id, {
      apiKey: process.env.OPENAI_API_KEY,
      wait:   false,
    });
    if (res.status !== 'completed') return { state: 'classify_pending', progress: res.progress };
    llmResults = res.results;
  }

  const allResults = { ...ruleResults, ...llmResults };
  const userRisk   = aggregateUserRisk(allPosts, allResults);

  // Write classify outputs into the workflow's classify dir
  const classifiedDir = join(wf.classify.out_dir, 'classified');
  mkdirSync(classifiedDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T.]/g, '').slice(0, 15);
  const base  = join(classifiedDir, stamp);

  const result_files = [];
  writeFileSync(`${base}.json`,            toClassifierJSON(userRisk, allResults));   result_files.push({ file: `${base}.json`,            label: '综合报告 JSON' });
  writeFileSync(`${base}_user_risk.csv`,   toUserRiskCSV(userRisk));                  result_files.push({ file: `${base}_user_risk.csv`,   label: '用户风险 CSV'  });
  writeFileSync(`${base}_flagged.csv`,     toFlaggedPostsCSV(userRisk));              result_files.push({ file: `${base}_flagged.csv`,     label: '标记内容 CSV'  });

  updateStage(workflowId, 'classify', {
    result_files,
    completed_at: new Date().toISOString(),
  });
  updateWorkflow(workflowId, { state: 'classify_done' });

  // ── Render report ─────────────────────────────────────────────────────────
  const fresh = getWorkflow(workflowId);
  const reportPath = renderReport(fresh);
  updateStage(workflowId, 'report', { path: reportPath, completed_at: new Date().toISOString() });
  updateWorkflow(workflowId, { state: 'report_done' });

  return { state: 'report_done', reportPath };
}
