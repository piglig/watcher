/**
 * classify-runner.js — TUI-friendly wrapper around the classifier pipeline.
 * Mirrors the logic in bin/cli.js classify command but returns structured results
 * instead of writing to stdout, so the Ink UI can render them.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, join, basename } from 'path';

function sessionStamp() {
  const d = new Date();
  const date = d.toISOString().slice(0, 10);
  const time = d.toTimeString().slice(0, 8).replace(/:/g, '');
  return `${date}_${time}`;
}

import { submitBatch, fetchBatchResults, aggregateUserRisk } from '../classifier/classifier.js';
import { applyRulesAll } from '../classifier/rules.js';
import { toClassifierJSON, toUserRiskCSV, toFlaggedPostsCSV } from '../classifier/output.js';
import { mergeAndNormalize } from '../shared/normalize.js';
import { saveBatch, updateBatch } from '../shared/batch-store.js';

/**
 * @param {object} config
 *   inputFiles: string[]   — absolute paths to scraper JSON files
 *   batchId?:   string     — existing batch to retrieve (skip submit)
 *   model:      string
 *   outDir:     string
 *   wait:       boolean
 *   apiKey?:    string
 * @param {function} onLog — called with log lines for live display
 * @returns {Promise<{
 *   batchId: string,
 *   status: 'submitted'|'completed',
 *   postCount: number,
 *   userRisk?: object[],
 *   savedFiles?: {file:string, label:string}[],
 * }>}
 */
export async function runClassify(config, onLog = () => {}) {
  const {
    inputFiles = [],
    batchId: existingBatchId,
    model     = 'gpt-4.1-mini',
    outDir    = './out/',
    wait      = true,
    apiKey    = process.env.OPENAI_API_KEY,
  } = config;

  if (!apiKey) throw new Error('OPENAI_API_KEY 未设置。请设置环境变量 $env:OPENAI_API_KEY。');

  const classifiedDir = join(resolve(outDir), 'classified');
  mkdirSync(classifiedDir, { recursive: true });

  // ── Load posts from files ──────────────────────────────────────────────────

  let allPosts = [];
  if (inputFiles.length) {
    const dataArray = inputFiles.map(f => {
      try { return JSON.parse(readFileSync(f, 'utf-8')); }
      catch { onLog(`[WARN] 无法读取文件: ${basename(f)}`); return null; }
    }).filter(Boolean);

    allPosts = mergeAndNormalize(dataArray);
    onLog(`共加载 ${allPosts.length} 条内容（${inputFiles.length} 个文件）`);
  }

  // ── Rule engine pre-filter ─────────────────────────────────────────────────

  let ruleResults = {};
  let llmPosts    = allPosts;

  if (allPosts.length) {
    const ruleHits = applyRulesAll(allPosts);
    ruleResults = Object.fromEntries(
      ruleHits.map(r => [String(r.id), { scores: r.scores, reasons: r.reasons ?? {}, source: 'rule' }])
    );
    llmPosts = allPosts.filter(p => !ruleResults[String(p.id)]);
    onLog(`规则引擎命中 ${Object.keys(ruleResults).length} 条，剩余 ${llmPosts.length} 条发送 LLM`);
  }

  // ── Submit or retrieve batch ───────────────────────────────────────────────

  let resolvedBatchId = existingBatchId;
  let llmResults = {};
  let finalStatus;

  if (resolvedBatchId) {
    onLog(`正在检索批次 ${resolvedBatchId}...`);
    const res = await fetchBatchResults(resolvedBatchId, { apiKey, wait, debug: false });
    finalStatus = res.status;
    if (res.status === 'completed') {
      llmResults = res.results;
      updateBatch(resolvedBatchId, { status: 'completed', completed_at: new Date().toISOString() });
      onLog(`批次已完成，共 ${Object.keys(llmResults).length} 条结果`);
    } else {
      onLog(`批次尚未完成（${res.status}）：${res.progress ?? ''}`);
      return { batchId: resolvedBatchId, status: res.status, postCount: allPosts.length };
    }
  } else if (llmPosts.length) {
    onLog(`正在提交批次（${llmPosts.length} 条，模型 ${model}）...`);
    const { batchId: newId } = await submitBatch(llmPosts, { apiKey, model, debug: false });
    resolvedBatchId = newId;
    onLog(`批次已提交：${newId}`);
    saveBatch({
      id:          newId,
      model,
      post_count:  llmPosts.length,
      input_files: inputFiles,
      out:         classifiedDir,
    });
    if (!wait) {
      return { batchId: newId, status: 'submitted', postCount: llmPosts.length };
    }
    onLog('等待批次完成（最长 24 小时，每 30 秒轮询一次）...');
    const res = await fetchBatchResults(newId, { apiKey, wait: true, debug: false });
    if (res.status !== 'completed') {
      return { batchId: newId, status: res.status, postCount: llmPosts.length };
    }
    llmResults = res.results;
    finalStatus = 'completed';
    updateBatch(newId, { status: 'completed', completed_at: new Date().toISOString() });
    onLog(`批次完成，共 ${Object.keys(llmResults).length} 条结果`);
  } else {
    onLog('所有内容已由规则引擎处理，无需 LLM 批次。');
    finalStatus = 'completed';
    resolvedBatchId = resolvedBatchId ?? null;
  }

  // ── Aggregate and write output ─────────────────────────────────────────────

  if (!allPosts.length) {
    // Resuming a batch whose input files are no longer available — can't generate output.
    if (existingBatchId) {
      throw new Error('批次已完成，但原始输入文件丢失，无法生成输出报告。\n请在 ClassifySetup 中重新指定原始文件并搭配 --batch-id 检索。');
    }
    return { batchId: resolvedBatchId, status: finalStatus, postCount: 0 };
  }

  const allResults = { ...ruleResults, ...llmResults };
  const userRisk   = aggregateUserRisk(allPosts, allResults);

  const stamp = sessionStamp();
  const base  = join(classifiedDir, stamp);

  const savedFiles = [];

  const jsonPath = `${base}.json`;
  writeFileSync(jsonPath, toClassifierJSON(userRisk, allPosts, allResults));
  savedFiles.push({ file: jsonPath, label: '综合报告 (JSON)' });

  const csvPath = `${base}_user_risk.csv`;
  writeFileSync(csvPath, toUserRiskCSV(userRisk));
  savedFiles.push({ file: csvPath, label: '用户风险 (CSV)' });

  const flagPath = `${base}_flagged.csv`;
  writeFileSync(flagPath, toFlaggedPostsCSV(userRisk));
  savedFiles.push({ file: flagPath, label: '标记内容 (CSV)' });

  onLog(`输出已写入 ${classifiedDir}`);

  return {
    batchId: resolvedBatchId ?? null,
    status:  'completed',
    postCount: allPosts.length,
    userRisk,
    savedFiles,
  };
}
