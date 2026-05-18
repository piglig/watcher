import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import KeyBar from '../components/KeyBar.js';
import StepBar from '../components/StepBar.js';
import { SYM } from '../theme.js';
import {
  startWorkflows,
  tryAdvanceOsint,
  runScrapeAndSubmitClassify,
  tryAdvanceClassify,
  getWorkflow,
  STATE_LABELS,
} from '../../workflow/index.js';

const STAGE_ORDER = ['OSINT', '采集', '分类', '报告'];

// Map a workflow state → 0-based active stage index
function stateToStage(state) {
  switch (state) {
    case 'osint_pending':    return 0;
    case 'osint_done':       return 1;
    case 'scraping':         return 1;
    case 'scrape_done':      return 2;
    case 'classify_pending': return 2;
    case 'classify_done':    return 3;
    case 'report_done':      return 3;
    case 'error':            return 0;
    default:                 return 0;
  }
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

export default function WorkflowRun({ config, onNav }) {
  const [logs, setLogs]         = useState([]);
  const [wf, setWf]             = useState(null);
  const [busy, setBusy]         = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const launched = useRef(false);
  const elapsed  = useElapsed(busy);

  const log = (line) => setLogs(prev => [...prev.slice(-9), line]);

  useInput((input, key) => {
    if (busy) return;
    if (key.escape) onNav('menu');

    // Stage-specific actions when idle
    if (wf?.state === 'osint_pending' && (input === 'r' || input === 'R')) doAdvanceOsint();
    if (wf?.state === 'osint_done'    && (input === 's' || input === 'S')) doScrape();
    if (wf?.state === 'classify_pending' && (input === 'r' || input === 'R')) doAdvanceClassify();
  });

  // ── Async actions ───────────────────────────────────────────────────────────

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

  const doAdvanceOsint = async () => {
    if (!wf) return;
    setBusy(true);
    try {
      log('检索 OSINT 结果...');
      const res = await tryAdvanceOsint(wf.id);
      const fresh = refreshWf(wf.id);
      if (res.state === 'osint_done') {
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
      const opts = {
        max:          '200',
        since:        '',
        until:        '',
        headed:       false,
        redditSource: 'arctic',
      };
      const res = await runScrapeAndSubmitClassify(wf.id, opts, log);
      const fresh = refreshWf(wf.id);
      if (res.state === 'classify_pending') {
        log(`Classify batch：${res.batchId}`);
        log(`稍后回来按 r 拉取结果并生成报告。`);
      } else {
        // classify_done immediately (rule-only path) — proceed to render
        await doAdvanceClassify();
      }
    } catch (e) {
      setErrorMsg(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const doAdvanceClassify = async () => {
    if (!wf) return;
    setBusy(true);
    try {
      log('检索 Classify 结果...');
      const res = await tryAdvanceClassify(wf.id);
      refreshWf(wf.id);
      if (res.state === 'report_done') {
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

  // ── Bootstrap ───────────────────────────────────────────────────────────────

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
      // Auto-attempt the natural next step.
      if (initial.state === 'osint_pending')    doAdvanceOsint();
      else if (initial.state === 'classify_pending') doAdvanceClassify();
      else if (initial.state === 'classify_done')    doAdvanceClassify();   // re-render report
      else                                       setBusy(false);
    }
  }, []); // eslint-disable-line

  // ── Render ─────────────────────────────────────────────────────────────────

  const stage = wf ? stateToStage(wf.state) : 0;
  const stateColor =
    wf?.state === 'error'        ? 'red'    :
    wf?.state === 'report_done'  ? 'green'  :
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
      </Box>

      {logs.length > 0 && (
        <Box flexDirection="column" borderStyle="round" borderColor="gray" borderDimColor paddingX={2} paddingY={0}>
          {logs.map((l, i) => (
            <Text key={i} color="gray" dimColor wrap="truncate">  {l}</Text>
          ))}
        </Box>
      )}

      {errorMsg && (
        <Box borderStyle="round" borderColor="red" paddingX={2}>
          <Text color="red">{SYM.cross} {errorMsg}</Text>
        </Box>
      )}

      {wf?.state === 'report_done' && wf.report?.path && (
        <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={2}>
          <Text bold color="green">{SYM.check} 报告已生成</Text>
          <Text color="cyan">{wf.report.path}</Text>
        </Box>
      )}

      <KeyBar hints={(() => {
        if (busy) return [];
        if (wf?.state === 'osint_pending')    return [{ key: 'r', label: '检索 OSINT' }, { key: 'ESC', label: '返回菜单' }];
        if (wf?.state === 'osint_done')       return [{ key: 's', label: '启动采集 + 分类' }, { key: 'ESC', label: '返回菜单' }];
        if (wf?.state === 'classify_pending') return [{ key: 'r', label: '检索分类 + 渲染报告' }, { key: 'ESC', label: '返回菜单' }];
        return [{ key: 'ESC', label: '返回菜单' }];
      })()} />
    </Box>
  );
}
