/**
 * PipelineRun — "采集并分析"
 *
 * Two phases:
 *   1. SCRAPE — runs synchronously in-screen (scrape isn't async-backed by an
 *      external job system, so it has to run while a screen is alive). Logs
 *      go through a stamped buffer for nice rendering.
 *   2. SESSION VIEW — after scrape, we create a classify session and switch
 *      to displaying it. The session is advanced by the App-level daemon,
 *      so navigating away no longer kills it.
 *
 * Resume: if `props.sessionId` is provided (e.g. from JobsList), we skip
 * scrape and jump straight to session view.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import KeyBar from '../components/KeyBar.js';
import StepBar from '../components/StepBar.js';
import StaticLog from '../components/StaticLog.js';
import StatusPanel from '../components/StatusPanel.js';
import ElapsedTimer from '../components/ElapsedTimer.js';
import { SYM } from '../theme.js';
import { parseLogLine } from '../parseLogLine.js';
import { runScrape } from '../../platforms/run.js';
import { getConfig } from '../../shared/config-store.js';
import { confirmLogin, isLoginPending } from '../../shared/login-signal.js';
import { createSession, SESSION_STATE } from '../../shared/sessions-store.js';
import { advanceSession } from '../../classifier/session.js';
import { defaultModelForProvider, inferProvider } from '../../classifier/classifier.js';
import { useSession } from '../hooks/useSession.js';
import SessionView from '../components/SessionView.js';
import { join, resolve } from 'path';

const STAGE_ORDER = ['采集', 'AI 分析', '结论'];

export default function PipelineRun({ config, onNav, sessionId: initialSessionId }) {
  const [phase, setPhase]               = useState(initialSessionId ? 'view' : 'scraping');
  const [logEntries, setLogEntries]     = useState([]);
  const [scrapeResult, setScrapeResult] = useState(null);
  const [sessionId, setSessionId]       = useState(initialSessionId ?? null);
  const [errorMsg, setErrorMsg]         = useState('');
  const [loginPending, setLoginPending] = useState(false);

  const launched   = useRef(false);
  const startedAt  = useRef(Date.now());
  const seq        = useRef(0);

  const session = useSession(sessionId);

  // Stamped logger for scrape phase — parse once, append-only into <Static>.
  const stampedLog = (line) => {
    const dt = Math.floor((Date.now() - startedAt.current) / 1000);
    const mm = String(Math.floor(dt / 60)).padStart(2, '0');
    const ss = String(dt % 60).padStart(2, '0');
    const rec = { id: seq.current++, ...parseLogLine(`T+${mm}:${ss} ${line}`) };
    setLogEntries(prev => prev.concat(rec));
    setLoginPending(isLoginPending());
  };

  const outDir  = config?.[0]?.outDir ?? './out/';
  const saved   = getConfig();
  const provider = inferProvider(saved.model, saved.aiProvider);
  const model   = saved.model || defaultModelForProvider(provider);

  useInput((input, key) => {
    if (key.return && loginPending) { confirmLogin(); return; }
    if (phase === 'view' && (input === 'j' || input === 'J')) { onNav('jobs'); return; }
    if (key.escape && phase !== 'scraping') onNav('menu');
  });

  // SCRAPE phase — runs once
  useEffect(() => {
    if (phase !== 'scraping' || launched.current) return;
    launched.current = true;

    runScrape(config, stampedLog)
      .then(async res => {
        setScrapeResult(res);

        if (!res.totalCount) {
          setErrorMsg('采集到 0 条内容，无可分析数据');
          setPhase('error');
          return;
        }

        // Create classify session — daemon will take it from here. Each saved
        // file already carries its owning kolId (the runner stamps it), so
        // the session gets per-file kol_id annotations and per-kol grouping
        // downstream becomes a one-line map lookup instead of path scanning.
        const inputFiles = res.savedFiles.map(f => ({ file: f.file, kol_id: f.kol_id }));
        const kolIds = [...new Set(inputFiles.map(f => f.kol_id))];
        const s = createSession({
          source:      'pipeline',
          kol_ids:     kolIds,
          out_root:    resolve(outDir),
          input_files: inputFiles,
          provider,
          model,
        });
        stampedLog(`Classify session 创建：${s.id} · ${inputFiles.length} 个文件`);
        stampedLog('daemon 将自动推进，可按 ESC 安全离开。');
        setSessionId(s.id);
        setPhase('view');
        // Kick once for UX immediacy
        advanceSession(s).catch(() => {});
      })
      .catch(err => {
        setErrorMsg(err?.message ?? String(err));
        setPhase('error');
      });
  }, [phase]);

  const stage = session?.state === SESSION_STATE.COMPLETED ? 2
              : phase === 'scraping'          ? 0
              : 1;

  // ── SCRAPE / ERROR phase render ────────────────────────────────────────────
  if (phase === 'scraping' || phase === 'error') {
    const color = phase === 'error' ? 'red' : 'cyan';
    const label = phase === 'error' ? '出错' : '采集运行中';

    return (
      <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
        <Text bold color="cyan">采集并分析</Text>
        <StepBar steps={STAGE_ORDER} current={stage} />

        <StatusPanel
          color={color}
          label={label}
          headerRight={phase === 'scraping' ? <ElapsedTimer active /> : null}
        >
          {loginPending && phase === 'scraping' && (
            <Text bold color="yellow">{SYM.warn} 浏览器已打开，请完成登录后按 Enter 确认</Text>
          )}
        </StatusPanel>

        <StaticLog entries={logEntries} />

        {errorMsg && (
          <Box borderStyle="round" borderColor="red" paddingX={2}>
            <Text color="red">{SYM.cross} {errorMsg}</Text>
          </Box>
        )}

        <KeyBar hints={[
          ...(loginPending ? [{ key: 'Enter', label: '确认登录' }] : []),
          ...(phase !== 'scraping' ? [{ key: 'ESC', label: '返回菜单' }] : []),
        ]} />
      </Box>
    );
  }

  // ── SESSION VIEW phase ─────────────────────────────────────────────────────
  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
      <Text bold color="cyan">采集并分析</Text>
      <StepBar steps={STAGE_ORDER} current={stage} />

      <SessionView
        session={session}
        scrapeResult={scrapeResult}
        emptyText="正在创建 session…"
      />

      <KeyBar hints={[
        { key: 'j', label: '前往分类任务列表' },
        { key: 'ESC', label: '返回菜单' },
      ]} />
    </Box>
  );
}
