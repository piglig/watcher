import React, { useState, useEffect, useRef } from 'react';
import { Box, useWindowSize } from 'ink';
import Header        from './components/Header.js';
import MainMenu      from './screens/MainMenu.js';
import Settings      from './screens/Settings.js';
import ScrapeSetup   from './screens/ScrapeSetup.js';
import ScrapeRun     from './screens/ScrapeRun.js';
import ClassifySetup from './screens/ClassifySetup.js';
import ClassifyRun   from './screens/ClassifyRun.js';
import OsintSetup    from './screens/OsintSetup.js';
import OsintRun      from './screens/OsintRun.js';
import WorkflowSetup from './screens/WorkflowSetup.js';
import WorkflowRun   from './screens/WorkflowRun.js';
import WorkflowList  from './screens/WorkflowList.js';
import PipelineRun   from './screens/PipelineRun.js';
import JobsList      from './screens/JobsList.js';
import DataPreview   from './screens/DataPreview.js';

import { listActiveSessions, getSession, SESSION_STATE } from '../shared/sessions-store.js';
import { listBatches, BATCH_STATUS } from '../shared/batch-store.js';
import { advanceSession } from '../classifier/session.js';
import { fetchBatchResults } from '../osint/index.js';
import { finalizeWorkflowFromSession } from '../workflow/orchestrator.js';

const SUBTITLES = {
  menu:             '多平台内容风险审查',
  settings:         '设置',
  'scrape-setup':   '采集设置',
  'scrape-run':     '采集运行中',
  'classify-setup': 'AI 分类设置',
  'classify-run':   'AI 分类运行中',
  'osint-setup':    'OSINT 社媒追踪 — 设置',
  'osint-run':      'OSINT 社媒追踪 — 运行中',
  'workflow-setup': '调查 KOL — 新建任务',
  'workflow-run':   '调查 KOL — 任务运行',
  'workflow-list':  '调查任务列表',
  'pipeline-run':   '采集并分析',
  jobs:             '分类任务列表',
  'data-preview':   '数据预览',
};

// Daemon tick: every 30s, advance all non-terminal classify sessions AND
// poll any pending OSINT batches. Runs for the lifetime of the App
// (mounted once, regardless of screen), so a batch that finished while
// the user was away gets pulled down + marked completed on the next tick.
function useSessionDaemon() {
  const tickingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (tickingRef.current) return;        // skip overlap
      tickingRef.current = true;
      try {
        // ── Classify sessions ─────────────────────────────────────────
        const active = listActiveSessions();
        for (const s of active) {
          if (cancelled) break;
          const next = await advanceSession(s);
          if (next?.state === SESSION_STATE.COMPLETED && next.workflow_id) {
            try { await finalizeWorkflowFromSession(next); }
            catch (e) { console.warn('[workflow] finalize failed:', e.message ?? e); }
          }
        }

        // ── OSINT batches ─────────────────────────────────────────────
        // `fetchBatchResults` itself updates batch-store on completion.
        const xaiKey = process.env.XAI_API_KEY;
        if (xaiKey) {
          const pending = listBatches().filter(b => b.kind === 'osint' && b.status === BATCH_STATUS.PENDING);
          for (const b of pending) {
            if (cancelled) break;
            if (!b.out_dir) continue;
            try {
              await fetchBatchResults(b.id, { apiKey: xaiKey, outDir: b.out_dir, wait: false });
            } catch (e) {
              console.warn(`[osint] daemon advance ${b.id.slice(-12)} failed:`, e.message ?? e);
            }
          }
        }
      } finally {
        tickingRef.current = false;
      }
    };

    // Immediate first tick, then every 30s.
    tick();
    const timer = setInterval(tick, 30_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);
}

export default function App() {
  const [screen, setScreen]    = useState('menu');
  const [navParams, setParams] = useState({});
  const { rows, columns }      = useWindowSize();

  useSessionDaemon();

  const onNav = (target, params = {}) => {
    setParams(params);
    setScreen(target);
  };

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      <Header subtitle={SUBTITLES[screen]} />
      {screen === 'menu'           && <MainMenu       onNav={onNav} />}
      {screen === 'settings'       && <Settings       onNav={onNav} />}
      {screen === 'scrape-setup'   && <ScrapeSetup    prefill={navParams.scrapePrefill} pipelineMode={navParams.pipelineMode} onNav={onNav} />}
      {screen === 'scrape-run'     && <ScrapeRun      config={navParams.scrapeConfig}   onNav={onNav} />}
      {screen === 'classify-setup' && <ClassifySetup  onNav={onNav} />}
      {screen === 'classify-run'   && <ClassifyRun    config={navParams.classifyConfig} onNav={onNav} />}
      {screen === 'osint-setup'    && <OsintSetup     onNav={onNav} />}
      {screen === 'osint-run'      && <OsintRun       config={navParams.osintConfig}    onNav={onNav} />}
      {screen === 'workflow-setup' && <WorkflowSetup  onNav={onNav} />}
      {screen === 'workflow-run'   && <WorkflowRun    config={navParams.workflowConfig} onNav={onNav} />}
      {screen === 'workflow-list'  && <WorkflowList   onNav={onNav} />}
      {screen === 'jobs'           && <JobsList       onNav={onNav} />}
      {screen === 'data-preview'   && <DataPreview    initialFile={navParams.previewFile} onNav={onNav} />}
      {screen === 'pipeline-run'   && <PipelineRun    config={navParams.scrapeConfig}    onNav={onNav} sessionId={navParams.sessionId} />}
    </Box>
  );
}
