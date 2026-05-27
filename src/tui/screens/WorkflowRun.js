import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import KeyBar from '../components/KeyBar.js';
import StepBar from '../components/StepBar.js';
import LogPanel from '../components/LogPanel.js';
import { SYM } from '../theme.js';
import { useElapsed } from '../hooks/useElapsed.js';
import {
  startWorkflows,
  tryAdvanceOsint,
  runScrapeAndSubmitClassify,
  tryAdvanceClassify,
  getWorkflow,
  STATE_LABELS,
  WORKFLOW_STATE,
} from '../../workflow/index.js';
import { getConfig } from '../../shared/config-store.js';
import { defaultModelForProvider, inferProvider } from '../../classifier/classifier.js';

const LOG_LIMIT = 14;
const STAGE_ORDER = ['OSINT', '采集', '分类', '报告'];

const STATE_TO_STAGE = {
  [WORKFLOW_STATE.OSINT_PENDING]:    0,
  [WORKFLOW_STATE.OSINT_DONE]:       1,
  [WORKFLOW_STATE.SCRAPING]:         1,
  [WORKFLOW_STATE.SCRAPE_DONE]:      2,
  [WORKFLOW_STATE.CLASSIFY_PENDING]: 2,
  [WORKFLOW_STATE.CLASSIFY_DONE]:    3,
  [WORKFLOW_STATE.REPORT_DONE]:      3,
  [WORKFLOW_STATE.ERROR]:            0,
};

const stateToStage = (state) => STATE_TO_STAGE[state] ?? 0;

export default function WorkflowRun({ config, onNav }) {
  const [logs, setLogs]           = useState([]);
  const [wf, setWf]               = useState(null);
  const [busy, setBusy]           = useState(true);
  const [errorMsg, setErrorMsg]   = useState('');
  const [countdown, setCountdown] = useState(null);
  const launched      = useRef(false);
  const elapsed       = useElapsed(busy);
  const cdIntervalRef = useRef(null);
  const startedAt     = useRef(Date.now());

  const log = (line) => {
    const dt    = Math.floor((Date.now() - startedAt.current) / 1000);
    const mm    = String(Math.floor(dt / 60)).padStart(2, '0');
    const ss    = String(dt % 60).padStart(2, '0');
    const stamp = `T+${mm}:${ss}`;
    setLogs(prev => [...prev.slice(-(LOG_LIMIT - 1)), `${stamp} ${line}`]);
  };

  useInput((input, key) => {
    if (key.escape) {
      if (cdIntervalRef.current) {
        clearInterval(cdIntervalRef.current);
        cdIntervalRef.current = null;
      }
      onNav('menu');
      return;
    }
    if ((wf?.state === WORKFLOW_STATE.OSINT_PENDING || wf?.state === WORKFLOW_STATE.CLASSIFY_PENDING)
        && (input === 'j' || input === 'J')) {
      onNav('jobs');
      return;
    }
    if (busy) return;
    if (wf?.state === WORKFLOW_STATE.OSINT_PENDING && (input === 'r' || input === 'R')) doAdvanceOsint();
    if (wf?.state === WORKFLOW_STATE.OSINT_DONE    && (input === 's' || input === 'S')) doScrape();
    if (wf?.state === WORKFLOW_STATE.CLASSIFY_PENDING && (input === 'r' || input === 'R')) doAdvanceClassify();
  });

  const refreshWf = (id) => {
    const fresh = getWorkflow(id);
    if (fresh) setWf(fresh);
    return fresh;
  };

  const doStart = async () => {
    setBusy(true);
    try {
      const kols = config.kols ?? [];
      log(`提交共享 OSINT 批次（${kols.length} 个 KOL）`);
      const created = await startWorkflows(kols, { outBaseDir: config.outBaseDir });
      if (created.length === 1) {
        setWf(created[0]);
        log(`Workflow 创建：${created[0].id}`);
        log(`OSINT batch：${created[0].osint.batch_id}`);
        log(`稍后回到「调查任务列表」继续。`);
      } else {
        log(`已创建 ${created.length} 个 workflow，共享 OSINT batch ${created[0].osint.batch_id}`);
        log(`跳转到「调查任务列表」...`);
        setTimeout(() => onNav('workflow-list'), 1500);
      }
    } catch (e) {
      setErrorMsg(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const doAdvanceOsint = async (idOverride) => {
    const id = idOverride ?? wf?.id;
    if (!id) return;
    setBusy(true);
    try {
      log('检索 OSINT 结果...');
      const res = await tryAdvanceOsint(id);
      const fresh = refreshWf(id);
      if (res.state === WORKFLOW_STATE.OSINT_DONE) {
        log(`OSINT 完成，slug=${res.slug}。按 s 启动采集。`);
      } else {
        log(`仍在等待：${res.progress ?? '?'}`);
      }
    } catch (e) {
      setErrorMsg(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const doScrape = async () => {
    if (!wf) return;
    setBusy(true);
    try {
      // scrapeMax 留空 = 全量；用 1e6 远超任何平台 API 自然上限，让 scraper 自然耗尽
      const saved = getConfig();
      const configuredMax = (saved.scrapeMax || '').trim();
      const classifyProvider = inferProvider(saved.model, saved.aiProvider);
      const opts = {
        max:          configuredMax || '1000000',
        since:        '',
        until:        '',
        headed:       false,
        redditSource: 'arctic',
        classifyProvider,
        classifyModel:    saved.model || defaultModelForProvider(classifyProvider),
      };
      const res = await runScrapeAndSubmitClassify(wf.id, opts, log);
      refreshWf(wf.id);
      if (res.state === WORKFLOW_STATE.CLASSIFY_PENDING) {
        log(`Classify session ${res.sessionId} 已创建 — daemon 在后台推进。`);
        log(`可安全离开本屏，状态保存在 sessions.json。`);
      }
    } catch (e) {
      setErrorMsg(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const doAdvanceClassify = async (idOverride) => {
    const id = idOverride ?? wf?.id;
    if (!id) return;
    setBusy(true);
    try {
      log('检索 Classify 结果...');
      const res = await tryAdvanceClassify(id);
      refreshWf(id);
      if (res.state === WORKFLOW_STATE.REPORT_DONE) {
        log(`完成 — 报告：${res.reportPath}`);
      } else {
        log(`仍在等待：${res.progress ?? '?'}`);
      }
    } catch (e) {
      setErrorMsg(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (launched.current) return;
    launched.current = true;
    if (config?.action === 'start') {
      doStart();
      return;
    }
    if (config?.action === 'resume' && config.workflowId) {
      const initial = getWorkflow(config.workflowId);
      if (!initial) { setErrorMsg(`找不到 Workflow ${config.workflowId}`); setBusy(false); return; }
      setWf(initial);
      if (initial.state === WORKFLOW_STATE.OSINT_PENDING)    doAdvanceOsint(initial.id);
      else if (initial.state === WORKFLOW_STATE.CLASSIFY_PENDING) doAdvanceClassify(initial.id);
      else if (initial.state === WORKFLOW_STATE.CLASSIFY_DONE)    doAdvanceClassify(initial.id);
      else                                       setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (cdIntervalRef.current) {
      clearInterval(cdIntervalRef.current);
      cdIntervalRef.current = null;
    }
    setCountdown(null);

    if (busy || !wf) return;

    if (wf.state === WORKFLOW_STATE.OSINT_PENDING) {
      let cd = 30;
      setCountdown(cd);
      cdIntervalRef.current = setInterval(() => {
        cd -= 1;
        if (cd <= 0) {
          clearInterval(cdIntervalRef.current);
          cdIntervalRef.current = null;
          setCountdown(null);
          doAdvanceOsint();
        } else {
          setCountdown(cd);
        }
      }, 1000);
    } else if (wf.state === WORKFLOW_STATE.OSINT_DONE) {
      let cd = 3;
      setCountdown(cd);
      cdIntervalRef.current = setInterval(() => {
        cd -= 1;
        if (cd <= 0) {
          clearInterval(cdIntervalRef.current);
          cdIntervalRef.current = null;
          setCountdown(null);
          doScrape();
        } else {
          setCountdown(cd);
        }
      }, 1000);
    } else if (wf.state === WORKFLOW_STATE.CLASSIFY_PENDING) {
      let cd = 30;
      setCountdown(cd);
      cdIntervalRef.current = setInterval(() => {
        cd -= 1;
        if (cd <= 0) {
          clearInterval(cdIntervalRef.current);
          cdIntervalRef.current = null;
          setCountdown(null);
          doAdvanceClassify();
        } else {
          setCountdown(cd);
        }
      }, 1000);
    }

    return () => {
      if (cdIntervalRef.current) {
        clearInterval(cdIntervalRef.current);
        cdIntervalRef.current = null;
      }
    };
  }, [wf?.state, busy]);

  const stage = wf ? stateToStage(wf.state) : 0;
  const stateColor =
    wf?.state === WORKFLOW_STATE.ERROR        ? 'red'    :
    wf?.state === WORKFLOW_STATE.REPORT_DONE  ? 'green'  :
    busy                          ? 'cyan'   : 'yellow';

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
      <Text bold color="cyan">调查 KOL — 任务运行</Text>
      <StepBar steps={STAGE_ORDER} current={stage} />

      <Box flexDirection="column" borderStyle="round" borderColor={stateColor} paddingX={2} paddingY={0} gap={0}>
        <Box gap={2}>
          <Text bold color={stateColor}>
            {wf ? STATE_LABELS[wf.state] ?? wf.state : '初始化...'}
          </Text>
          {busy && <Text color="gray" dimColor>{elapsed}s</Text>}
        </Box>
        {wf && (
          <Text color="gray" dimColor>
            {wf.kol?.name}  ·  {wf.id}
          </Text>
        )}
        {countdown !== null && !busy && wf?.state === WORKFLOW_STATE.OSINT_PENDING && (
          <Text color="gray" dimColor>  下次自动检索：{countdown}s  [r 立即检索]</Text>
        )}
        {countdown !== null && !busy && wf?.state === WORKFLOW_STATE.OSINT_DONE && (
          <Text color="gray" dimColor>  即将自动开始采集…（{countdown}s）  [s 立即采集]</Text>
        )}
        {countdown !== null && !busy && wf?.state === WORKFLOW_STATE.CLASSIFY_PENDING && (
          <Text color="gray" dimColor>  下次自动检索：{countdown}s  [r 立即检索]</Text>
        )}
      </Box>

      <LogPanel logs={logs} limit={LOG_LIMIT} />

      {errorMsg && (
        <Box borderStyle="round" borderColor="red" paddingX={2}>
          <Text color="red">{SYM.cross} {errorMsg}</Text>
        </Box>
      )}

      {wf?.state === WORKFLOW_STATE.REPORT_DONE && wf.report?.path && (
        <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={2} paddingY={0} gap={0}>
          <Text bold color="green">{SYM.check} 报告已生成</Text>
          <Text color="cyan" wrap="truncate">  HTML {wf.report.path}</Text>
          <Text color="cyan" wrap="truncate">  MD  {wf.report.path.replace(/\.html$/, '.md')}</Text>
          <Text color="gray" dimColor>  HTML 报告支持直接复制到 Excel / Google Sheets</Text>
        </Box>
      )}

      <KeyBar hints={(() => {
        const jobsHint = { key: 'j', label: '前往分类任务列表' };
        const escHint  = { key: 'ESC', label: '返回菜单' };
        if (busy) return [escHint];
        if (wf?.state === WORKFLOW_STATE.OSINT_PENDING)    return [{ key: 'r', label: '立即检索' }, jobsHint, escHint];
        if (wf?.state === WORKFLOW_STATE.OSINT_DONE)       return [{ key: 's', label: '立即采集' }, escHint];
        if (wf?.state === WORKFLOW_STATE.CLASSIFY_PENDING) return [{ key: 'r', label: '立即检索' }, jobsHint, escHint];
        return [escHint];
      })()} />
    </Box>
  );
}
