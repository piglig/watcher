import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import KeyBar from '../components/KeyBar.js';
import StepBar from '../components/StepBar.js';
import StaticLog from '../components/StaticLog.js';
import ElapsedTimer from '../components/ElapsedTimer.js';
import Countdown from '../components/Countdown.js';
import { SYM } from '../theme.js';
import { parseLogLine } from '../parseLogLine.js';
import {
  startWorkflows,
  tryAdvanceOsint,
  runWorkflowScrape,
  tryAdvanceClassify,
  getWorkflow,
  STATE_LABELS,
  WORKFLOW_STATE,
} from '../../workflow/index.js';

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
  const [logEntries, setLogEntries] = useState([]);
  const [wf, setWf]               = useState(null);
  const [busy, setBusy]           = useState(true);
  const [errorMsg, setErrorMsg]   = useState('');
  const launched      = useRef(false);
  const startedAt     = useRef(Date.now());
  const seq           = useRef(0);

  const log = (line) => {
    const dt    = Math.floor((Date.now() - startedAt.current) / 1000);
    const mm    = String(Math.floor(dt / 60)).padStart(2, '0');
    const ss    = String(dt % 60).padStart(2, '0');
    const rec   = { id: seq.current++, ...parseLogLine(`T+${mm}:${ss} ${line}`) };
    setLogEntries(prev => prev.concat(rec));
  };

  useInput((input, key) => {
    if (key.escape) {
      // <Countdown> clears its own interval on unmount, so nothing to tear down.
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
      const res = await runWorkflowScrape(wf.id, { onLog: log });
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

  // Auto-advance countdown spec, derived from the current wait state. The
  // per-second tick lives inside <Countdown> (rendered below), so it re-renders
  // only itself — not this whole screen. onExpire fires the same advance the
  // old interval did, exactly once. No countdown while busy or in a non-wait
  // state. The `key` forces a fresh <Countdown> (resetting its timer + fired
  // latch) whenever the wait phase changes.
  const countdownSpec = (!busy && wf) ? (
    wf.state === WORKFLOW_STATE.OSINT_PENDING
      ? { key: 'osint-pending', seconds: 30, onExpire: doAdvanceOsint,
          text: (n) => `  下次自动检索：${n}s  [r 立即检索]` }
    : wf.state === WORKFLOW_STATE.OSINT_DONE
      ? { key: 'osint-done', seconds: 3, onExpire: doScrape,
          text: (n) => `  即将自动开始采集…（${n}s）  [s 立即采集]` }
    : wf.state === WORKFLOW_STATE.CLASSIFY_PENDING
      ? { key: 'classify-pending', seconds: 30, onExpire: doAdvanceClassify,
          text: (n) => `  下次自动检索：${n}s  [r 立即检索]` }
    : null
  ) : null;

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
          {busy && <ElapsedTimer active format="seconds" />}
        </Box>
        {wf && (
          <Text color="gray" dimColor>
            {wf.kol?.name}  ·  {wf.id}
          </Text>
        )}
        {countdownSpec && (
          <Countdown
            key={countdownSpec.key}
            seconds={countdownSpec.seconds}
            onExpire={countdownSpec.onExpire}
            render={(n) => <Text color="gray" dimColor>{countdownSpec.text(n)}</Text>}
          />
        )}
      </Box>

      <StaticLog entries={logEntries} />

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
