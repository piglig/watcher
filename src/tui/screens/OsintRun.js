import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import KeyBar from '../components/KeyBar.js';
import { SYM } from '../theme.js';
import { submitBatch, fetchBatchResults, loadOsintDir, extractScrapeTargets } from '../../osint/index.js';

function fmtElapsed(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function useElapsed(active) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setSecs(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
  return secs;
}

export default function OsintRun({ config, onNav }) {
  const [status, setStatus]     = useState('running');
  const [result, setResult]     = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const elapsed = useElapsed(status === 'running');
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
          // Retrieval mode (from JobsList)
          const res = await fetchBatchResults(batchId, { apiKey, outDir, wait: false });
          if (res.status === 'completed') {
            setResult({ mode: 'completed', batchId, summary: res.summary, outDir });
            setStatus('done');
          } else {
            setResult({ mode: 'pending', batchId, progress: res.progress, statusText: res.status, outDir });
            setStatus('submitted');
          }
        } else {
          // Submit mode
          if (!targets.length) throw new Error('没有可提交的 KOL 目标');
          const { batchId: newId, count } = await submitBatch(targets, { apiKey, model, outDir });
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

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={statusColor}
        paddingX={2}
        paddingY={0}
      >
        <Box gap={2}>
          <Text bold color={statusColor}>
            {status === 'running'    ? `${SYM.run} OSINT 处理中`
             : status === 'done'     ? `${SYM.check} 任务完成`
             : status === 'submitted'? `${SYM.dot} 批次已提交 / 等待中`
             :                         `${SYM.cross} 出错`}
          </Text>
          {status === 'running' && (
            <Text color="gray" dimColor>{fmtElapsed(elapsed)}</Text>
          )}
        </Box>

        {status === 'error' && (
          <Text color="red" wrap="truncate">  {errorMsg}</Text>
        )}
      </Box>

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
            : [{ key: 'ESC', label: '返回主菜单' }]
        } />
      )}
    </Box>
  );
}
