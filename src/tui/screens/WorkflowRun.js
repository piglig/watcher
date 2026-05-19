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
  const [logs, setLogs]           = useState([]);
  const [wf, setWf]               = useState(null);
  const [busy, setBusy]           = useState(true);
  const [errorMsg, setErrorMsg]   = useState('');
  const [countdown, setCountdown] = useState(null);
  const launched      = useRef(false);
  const elapsed       = useElapsed(busy);
  const cdIntervalRef = useRef(null);

  const log = (line) => setLogs(prev => [...prev.slice(-9), line]);

  useInput((input, key) => {
    if (busy) return;
    if (key.escape) onNav('menu');
    if (wf?.state === 'osint_pending' && (input === 'r' || input === 'R')) doAdvanceOsint();
    if (wf?.state === 'osint_done'    && (input === 's' || input === 'S')) doScrape();
    if (wf?.state === 'classify_pending' && (input === 'r' || input === 'R')) doAdvanceClassify();
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
      const opts = { max: '200', since: '', until: '', headed: false, redditSource: 'arctic' };
      const res = await runScrapeAndSubmitClassify(wf.id, opts, log);
      const fresh = refreshWf(wf.id);
      if (res.state === 'classify_pending') {
        log(`Classify batch：${res.batchId}`);
        log(`稍后回来按 r 拉取结果并生成报告。`);
      } else {
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
      if (initial.state === 'osint_pending')    doAdvanceOsint();
      else if (initial.state === 'classify_pending') doAdvanceClassify();
      else if (initial.state === 'classify_done')    doAdvanceClassify();
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

    if (wf.state === 'osint_pending') {
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
    } else if (wf.state === 'osint_done') {
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
    } else if (wf.state === 'classify_pending') {
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
        {countdown !== null && !busy && wf?.state === 'osint_pending' && (
          <Text color="gray" dimColor>  下次自动检索：{countdown}s  [r 立即检索]</Text>
        )}
        {countdown !== null && !busy && wf?.state === 'osint_done' && (
          <Text color="gray" dimColor>  即将自动开始采集…（{countdown}s）  [s 立即采集]</Text>
        )}
        {countdown !== null && !busy && wf?.state === 'classify_pending' && (
          <Text color="gray" dimColor>  下次自动检索：{countdown}s  [r 立即检索]</Text>
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
        <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={2} paddingY={0} gap={0}>
          <Text bold color="green">{SYM.check} 报告已生成</Text>
          <Text color="cyan" wrap="truncate">  HTML {wf.report.path}</Text>
          <Text color="cyan" wrap="truncate">  MD  {wf.report.path.replace(/\.html$/, '.md')}</Text>
          <Text color="gray" dimColor>  HTML 报告支持直接复制到 Excel / Google Sheets</Text>
        </Box>
      )}

      <KeyBar hints={(() => {
        if (busy) return [];
        if (wf?.state === 'osint_pending')    return [{ key: 'r', label: '立即检索' }, { key: 'ESC', label: '返回菜单' }];
        if (wf?.state === 'osint_done')       return [{ key: 's', label: '立即采集' }, { key: 'ESC', label: '返回菜单' }];
        if (wf?.state === 'classify_pending') return [{ key: 'r', label: '立即检索' }, { key: 'ESC', label: '返回菜单' }];
        return [{ key: 'ESC', label: '返回菜单' }];
      })()} />
    </Box>
  );
}
