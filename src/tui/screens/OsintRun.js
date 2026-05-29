import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import KeyBar from '../components/KeyBar.js';
import StatusPanel from '../components/StatusPanel.js';
import ElapsedTimer from '../components/ElapsedTimer.js';
import { SYM } from '../theme.js';
import { submitBatch, fetchBatchResults, loadOsintDir, extractScrapeTargets, renderAccountsSummary, enrichFromBios } from '../../osint/index.js';
import { BATCH_STATUS } from '../../shared/batch-store.js';
import { osintStagingDir, kolDir, ensureDir, pathSafe } from '../../shared/paths.js';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * After staging dir is filled with <slug>.json per KOL, write each one into
 * <outDir>/<kol_id>/accounts/identity.json so the result is user-facing and
 * discoverable by ScrapeSetup's OSINT picker.
 *
 * The OSINT slug (item.slug) IS the canonical kol_id — stamp it inside the
 * identity document so downstream code never has to re-derive it from a
 * directory name or fuzzy-match against display names.
 *
 * After stamping, runs bio-link enrichment per KOL: each verified profile's
 * public bio is fetched and outbound platform URLs are mined for accounts
 * Grok didn't surface. New finds land in suspected_accounts so they show up
 * in the ScrapeSetup picker without a second OSINT round-trip.
 *
 * @returns {Promise<{kols:number, discovered:number}>}
 */
async function promoteIdentitiesToSubjects(stagingDir, outDir) {
  const summaryPath = join(stagingDir, '_summary.json');
  let summary;
  try { summary = JSON.parse(readFileSync(summaryPath, 'utf-8')); }
  catch { return { kols: 0, discovered: 0 }; }

  let kols = 0, discovered = 0;
  for (const item of summary.items ?? []) {
    if (item.status !== 'ok' || !item.file) continue;
    const kolId  = pathSafe(item.slug ?? item.name ?? 'unnamed');
    const accDir = ensureDir(join(kolDir(outDir, kolId), 'accounts'));
    try {
      const identity = JSON.parse(readFileSync(item.file, 'utf-8'));
      identity.kol_id = kolId;

      // Bio-link enrichment per KOL — best-effort, never block on it.
      try {
        const found = await enrichFromBios(identity);
        if (found.length) {
          identity.suspected_accounts = [
            ...(identity.suspected_accounts ?? []),
            ...found,
          ];
          discovered += found.length;
        }
      } catch (e) {
        console.warn(`[bio-enrich] ${kolId}: ${e.message ?? e}`);
      }

      writeFileSync(join(accDir, 'identity.json'), JSON.stringify(identity, null, 2));
      kols++;
    } catch { /* skip */ }
  }
  return { kols, discovered };
}

export default function OsintRun({ config, onNav }) {
  const [status, setStatus]     = useState('running');
  const [result, setResult]     = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const launched = useRef(false);

  useInput((input, key) => {
    if (key.escape && status !== 'running') onNav('menu');
    if (status === 'done' && (input === 's' || input === 'S')) {
      const outDir = result?.outDir;
      if (!outDir) return;
      const kols = loadOsintDir(outDir);
      const prefill = extractScrapeTargets(kols);
      onNav('scrape-setup', { scrapePrefill: { ...prefill, sourceDir: outDir } });
    }
    if (status === 'submitted' && (input === 'j' || input === 'J')) {
      onNav('jobs');
    }
  });

  useEffect(() => {
    if (launched.current) return;
    launched.current = true;

    (async () => {
      try {
        const apiKey = process.env.XAI_API_KEY;
        if (!apiKey) throw new Error('XAI_API_KEY 未设置，请在设置中录入 xAI API Key');

        const { batchId, targets = [], outDir, model } = config ?? {};

        if (batchId) {
          // Retrieval mode — fetch from xAI, write staging, promote each KOL's
          // slice to <outDir>/<kol-slug>/accounts/identity.json.
          const res = await fetchBatchResults(batchId, {
            apiKey,
            outDir: osintStagingDir(batchId),
            wait: false,
          });
          if (res.status === BATCH_STATUS.COMPLETED) {
            const staging = osintStagingDir(batchId);
            const promo = await promoteIdentitiesToSubjects(staging, outDir);
            let summaryPath = null;
            try { summaryPath = renderAccountsSummary(staging, outDir, { batchId }); }
            catch (e) { console.warn('[osint] summary render failed:', e.message ?? e); }
            setResult({
              mode: 'completed',
              batchId,
              summary: res.summary,
              outDir,
              summaryPath,
              enrichment: promo,
            });
            setStatus('done');
          } else {
            setResult({ mode: 'pending', batchId, progress: res.progress, statusText: res.status, outDir });
            setStatus('submitted');
          }
        } else {
          // Submit mode — outDir is staging under ~/.sns-audit/internal/
          if (!targets.length) throw new Error('没有可提交的 KOL 目标');
          const { batchId: newId, count } = await submitBatch(targets, {
            apiKey, model,
            outDirFor:     (id) => osintStagingDir(id),
            subjectOutDir: outDir,
          });
          setResult({ mode: 'submitted', batchId: newId, count, outDir });
          setStatus('submitted');
        }
      } catch (e) {
        setErrorMsg(e?.message ?? String(e));
        setStatus('error');
      }
    })();
  }, []); // eslint-disable-line

  const statusColor =
    status === 'error'     ? 'red'    :
    status === 'done'      ? 'green'  :
    status === 'submitted' ? 'yellow' : 'cyan';

  const statusLabel =
    status === 'running'    ? 'OSINT 处理中' :
    status === 'done'       ? '任务完成' :
    status === 'submitted'  ? '批次已提交 / 等待中' :
                              '出错';

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
      <StatusPanel
        color={statusColor}
        label={statusLabel}
        headerRight={status === 'running' ? <ElapsedTimer active /> : null}
        error={status === 'error' ? errorMsg : undefined}
      />

      {/* Submitted (new) */}
      {status === 'submitted' && result?.mode === 'submitted' && (
        <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={2}>
          <Text color="yellow" bold>{SYM.dot} Batch ID: {result.batchId}</Text>
          <Text color="gray" dimColor>目标数：{result.count}</Text>
          <Text color="gray" dimColor>输出目录：{result.outDir}</Text>
          <Text color="gray" dimColor>已写入任务列表，稍后在「查看分类任务」中检索。</Text>
        </Box>
      )}

      {/* Pending (retrieval) */}
      {status === 'submitted' && result?.mode === 'pending' && (
        <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={2}>
          <Text color="yellow" bold>{SYM.dot} 批次 {result.batchId}</Text>
          <Text color="gray" dimColor>状态：{result.statusText} · 进度：{result.progress ?? '?'}</Text>
          <Text color="gray" dimColor>结果尚未就绪，请稍后再试。</Text>
        </Box>
      )}

      {/* Done */}
      {status === 'done' && result?.mode === 'completed' && (
        <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={2} gap={1}>
          <Text color="green" bold>
            {SYM.check} 完成 — 成功 {result.summary.success} / 失败 {result.summary.failed} / 共 {result.summary.total}
          </Text>
          <Text color="gray" dimColor>输出目录：{result.outDir}</Text>
          {result.enrichment?.discovered > 0 && (
            <Text color="cyan" dimColor>
              Bio 链路扩展：从 {result.enrichment.kols} 个 KOL 的简介中发现了 {result.enrichment.discovered} 个新候选账号（已并入 suspected_accounts）
            </Text>
          )}
          {result.summaryPath && (
            <Text color="cyan" dimColor>账号汇总：{result.summaryPath}</Text>
          )}
          <Box flexDirection="column">
            {result.summary.items.slice(0, 10).map(it => (
              <Box key={it.slug} gap={2}>
                <Text color={it.status === 'ok' ? 'green' : 'red'}>
                  {it.status === 'ok' ? SYM.check : SYM.cross}
                </Text>
                <Text color="cyan">{it.slug}</Text>
                <Text color="gray" dimColor wrap="truncate">
                  {it.status === 'ok' ? (it.file ?? '') : (it.error ?? '')}
                </Text>
              </Box>
            ))}
            {result.summary.items.length > 10 && (
              <Text color="gray" dimColor>... 另有 {result.summary.items.length - 10} 条，详见 _summary.json</Text>
            )}
          </Box>
        </Box>
      )}

      {status !== 'running' && (
        <KeyBar hints={
          status === 'done'
            ? [{ key: 's', label: '发送到采集' }, { key: 'ESC', label: '返回主菜单' }]
          : status === 'submitted'
            ? [{ key: 'j', label: '前往分类任务列表' }, { key: 'ESC', label: '返回主菜单' }]
            : [{ key: 'ESC', label: '返回主菜单' }]
        } />
      )}
    </Box>
  );
}
