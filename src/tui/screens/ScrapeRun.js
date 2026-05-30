import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import KeyBar from '../components/KeyBar.js';
import LogPanel from '../components/LogPanel.js';
import StatusPanel from '../components/StatusPanel.js';
import { useWindowSize } from '../hooks/useWindowSize.js';
import ElapsedTimer from '../components/ElapsedTimer.js';
import { SYM } from '../theme.js';
import { parseLogLine } from '../parseLogLine.js';
import { runScrape } from '../../platforms/run.js';
import { getConfig } from '../../shared/config-store.js';
import { defaultModelForProvider, inferProvider } from '../../classifier/classifier.js';
import { confirmLogin, isLoginPending } from '../../shared/login-signal.js';
import { enrichFromScrapedProfiles, discoveriesToPlatformConfigs } from '../../osint/index.js';
import { kolDir } from '../../shared/paths.js';

export default function ScrapeRun({ config, onNav }) {
  const { rows } = useWindowSize();
  const [logEntries, setLogEntries]   = useState([]);
  const [status, setStatus]           = useState('running');
  const [result, setResult]           = useState(null);
  const [errorMsg, setError]          = useState('');
  const [loginPending, setLoginPending] = useState(false);

  const launched  = useRef(false);
  const seq       = useRef(0);

  // Append-only: parse each raw line once, then concat. LogPanel renders only
  // the last N entries, so the in-frame height stays bounded regardless of how
  // long the run streams. (Older lines stay in state but are never rendered.)
  const pushLogs = useCallback((rawLines) => {
    setLogEntries(prev =>
      prev.concat(rawLines.map(r => ({ id: seq.current++, ...parseLogLine(r) }))));
  }, []);

  useInput((input, key) => {
    if (key.escape && status !== 'running') { onNav('menu'); return; }

    // 浏览器登录等待中 → Enter 确认
    if (key.return && loginPending) { confirmLogin(); return; }

    // 采集完成后按 Enter → 直接进入 AI 分类
    if (key.return && status === 'done' && result) {
      const saved  = getConfig();
      const outDir = Array.isArray(config)
        ? (config[0]?.outDir ?? './out/')
        : (config?.outDir    ?? './out/');
      const provider = inferProvider(saved.model, saved.aiProvider);
      onNav('classify-run', {
        classifyConfig: {
          inputFiles: result.savedFiles.map(f => f.file),
          aiProvider: provider,
          model:      saved.model || defaultModelForProvider(provider),
          outDir,
          wait:       false,
        },
      });
    }

    // 采集完成后按 P → 预览第一个采集文件
    if ((input === 'p' || input === 'P') && status === 'done' && result?.savedFiles?.length) {
      onNav('data-preview', { previewFile: result.savedFiles[0].file });
    }
  });

  useEffect(() => {
    if (launched.current) return;
    launched.current = true;

    let cancelled = false;
    const onLog = (line) => {
      const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false });
      pushLogs([`[${ts}] ${line}`]);
      setLoginPending(isLoginPending());
    };

    runScrape(config, onLog)
      .then(async (res) => {
        if (cancelled) return;
        // Post-scrape bio enrichment + feedback scrape. Each scraped KOL's
        // profile snapshots are now on disk — mine their bios for outbound
        // platform URLs, merge new candidates into identity.json, and fan
        // out a second runScrape for the discoveries so they're included
        // in classify input alongside the original targets. One round only.
        try {
          const outDir = Array.isArray(config) ? (config[0]?.outDir ?? './out/') : (config?.outDir ?? './out/');
          const cfgs   = Array.isArray(config) ? config : [config];
          // Base scrape options carry the same params across rounds (max,
          // since, until, auth keys, etc.) so the second scrape behaves
          // identically to the first.
          const baseConfig = cfgs[0]
            ? Object.fromEntries(Object.entries(cfgs[0]).filter(([k]) =>
                !['platform', 'targets', 'kolId'].includes(k)
              ))
            : { outDir };

          const kolIds = [...new Set((res.savedFiles ?? []).map(f => f.kol_id).filter(Boolean))];
          const feedbackConfigs = [];
          for (const kolId of kolIds) {
            const r = enrichFromScrapedProfiles(kolDir(outDir, kolId), { onLog });
            if (r.added > 0) {
              onLog(`[bio-enrich:post-scrape] ${kolId}: 扫描 ${r.scanned} 个 profile，新增 ${r.added} 个候选账号`);
              feedbackConfigs.push(...discoveriesToPlatformConfigs(r.discovered, kolId, baseConfig));
            }
          }
          if (feedbackConfigs.length) {
            const platforms = feedbackConfigs.map(c => `${c.kolId}/${c.platform}`).join(', ');
            onLog(`[bio-enrich:feedback] 启动二轮采集 · ${feedbackConfigs.length} 个目标（${platforms}）`);
            const second = await runScrape(feedbackConfigs, onLog);
            if (cancelled) return;
            res.savedFiles.push(...second.savedFiles);
            res.totalCount += second.totalCount;
            onLog(`[bio-enrich:feedback] 二轮采集完成 · +${second.totalCount} 条 / ${second.savedFiles.length} 文件`);
          }
        } catch (e) {
          onLog(`[bio-enrich:post-scrape] 异常：${e.message ?? e}`);
        }
        if (cancelled) return;
        setResult(res);
        setStatus('done');
      })
      .catch(err => { if (!cancelled) { setError(err.message ?? String(err)); setStatus('error'); } });

    return () => { cancelled = true; };
  }, []); // eslint-disable-line

  const statusColor = status === 'error' ? 'red' : status === 'done' ? 'green' : 'cyan';
  const statusLabel = status === 'running' ? '采集运行中'
                    : status === 'done'    ? '采集完成'
                    :                        '出错';

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>

      <StatusPanel
        color={statusColor}
        label={statusLabel}
        headerRight={status === 'running' ? <ElapsedTimer active /> : null}
        error={status === 'error' ? errorMsg : undefined}
      >
        {status === 'running' && loginPending && (
          <Text bold color="yellow">  浏览器已打开，请完成登录后按 Enter 确认</Text>
        )}
      </StatusPanel>

      {/* ── Log stream — bounded last-N viewport inside the frame. We run in
            the alternate screen (no scrollback), so logs must NOT use <Static>
            (which re-blits its whole history every fullscreen frame). Only the
            most recent lines are shown. ── */}
      <LogPanel
        logs={logEntries}
        title="采集日志"
        limit={Math.max(6, rows - 14)}
        emptyText="等待采集输出…"
      />

      {/* ── Result panel ── */}
      {status === 'done' && result && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={result.totalCount > 0 ? 'green' : 'yellow'}
          paddingX={2}
          paddingY={0}
        >
          <Text bold color={result.totalCount > 0 ? 'green' : 'yellow'}>
            {result.totalCount > 0 ? SYM.check : SYM.warn} 共采集 {result.totalCount} 条内容
          </Text>
          {result.totalCount === 0 && (
            <Text color="yellow" dimColor>
              未采集到任何条目 — 请查看上方日志面板的具体原因（账号是否存在、API 是否报错、是否被限流等）
            </Text>
          )}
          {result.savedFiles.map(({ file, count, label }) => (
            <Box key={file} gap={2}>
              <Text color="gray" dimColor>{SYM.arrow}</Text>
              <Text color="cyan">{label}</Text>
              <Text color={count > 0 ? 'gray' : 'yellow'} dimColor={count > 0}>{count} 条</Text>
              <Text color="gray" dimColor wrap="truncate">{file}</Text>
            </Box>
          ))}
        </Box>
      )}

      <KeyBar hints={[
        ...(loginPending ? [{ key: 'Enter', label: '确认登录' }] : []),
        ...(status === 'done' ? [
          { key: 'Enter', label: '继续 AI 分类' },
          { key: 'P',     label: '预览数据' },
        ] : []),
        ...(status !== 'running' ? [{ key: 'ESC', label: '返回主菜单' }] : []),
      ]} />
    </Box>
  );
}
