import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import KeyBar from '../components/KeyBar.js';
import StepBar from '../components/StepBar.js';
import { SYM, RISK_COLORS, RISK_LABELS } from '../theme.js';
import { runScrape } from '../runner.js';
import { runClassify } from '../classify-runner.js';
import { getConfig } from '../../shared/config-store.js';
import { confirmLogin, isLoginPending } from '../../shared/login-signal.js';

const STAGE_ORDER = ['采集', 'AI 分析', '结论'];

const RECENT_LINES = 5;

function stageFromStatus(status) {
  switch (status) {
    case 'scraping':    return 0;
    case 'classifying': return 1;
    case 'done':        return 2;
    case 'error':       return 0;
    default:            return 0;
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

function fmtElapsed(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function PipelineRun({ config, onNav }) {
  const [status, setStatus]           = useState('scraping');
  const [logs, setLogs]               = useState([]);
  const [countdown, setCountdown]     = useState(null);
  const [loginPending, setLoginPending] = useState(false);
  const [scrapeResult, setScrapeResult] = useState(null);
  const [classifyResult, setClassifyResult] = useState(null);
  const [errorMsg, setErrorMsg]     = useState('');
  const [classifyBatchId, setClassifyBatchId] = useState(null);
  const [inputFiles, setInputFiles] = useState([]);

  const classifyBatchIdRef = useRef(null);
  const inputFilesRef      = useRef([]);
  const pollIntervalRef    = useRef(null);
  const launched           = useRef(false);
  const rawRef             = useRef([]);
  const committed          = useRef(0);

  const elapsed = useElapsed(status === 'scraping' || status === 'classifying');

  const log = (line) => setLogs(prev => [...prev.slice(-(RECENT_LINES - 1)), line]);

  const outDir = config?.[0]?.outDir ?? './out/';
  const model  = getConfig().model || 'gpt-4.1-mini';

  useInput((input, key) => {
    if (key.return && loginPending) { confirmLogin(); return; }
    if (key.escape && status !== 'scraping') onNav('menu');
  });

  const doClassify = async (files, batchId) => {
    try {
      log(batchId ? `检索分类批次 ${batchId}...` : `提交 AI 分类批次...`);
      const res = await runClassify(
        { inputFiles: files, batchId, model, outDir, wait: false },
        log
      );
      if (res.status === 'completed') {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        setCountdown(null);
        setClassifyResult(res);
        setStatus('done');
      } else {
        classifyBatchIdRef.current = res.batchId;
        setClassifyBatchId(res.batchId);
        log(`批次已提交：${res.batchId}，等待完成...`);
        if (!pollIntervalRef.current) {
          let cd = 30;
          setCountdown(cd);
          pollIntervalRef.current = setInterval(() => {
            cd -= 1;
            if (cd <= 0) {
              cd = 30;
              setCountdown(30);
              doClassify(inputFilesRef.current, classifyBatchIdRef.current);
            } else {
              setCountdown(cd);
            }
          }, 1000);
        }
      }
    } catch (e) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      setCountdown(null);
      setErrorMsg(e?.message ?? String(e));
      setStatus('error');
    }
  };

  useEffect(() => {
    if (launched.current) return;
    launched.current = true;

    const orig = {
      log:   console.log.bind(console),
      error: console.error.bind(console),
      warn:  console.warn.bind(console),
    };

    const push = (...args) => {
      const line = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      rawRef.current.push(line);
    };

    console.log   = push;
    console.error = (...a) => push('[ERR] ' + a.join(' '));
    console.warn  = (...a) => push('[WARN] ' + a.join(' '));

    const flush = () => {
      const all = rawRef.current;
      if (all.length <= committed.current) return;
      committed.current = all.length;
      setLogs(all.slice(-RECENT_LINES));
      setLoginPending(isLoginPending());
    };

    const timer = setInterval(flush, 500);

    runScrape(config)
      .then(async res => {
        clearInterval(timer);
        flush();
        Object.assign(console, orig);
        setScrapeResult(res);
        const files = res.savedFiles.map(f => f.file);
        inputFilesRef.current = files;
        setInputFiles(files);
        setStatus('classifying');
        await doClassify(files, null);
      })
      .catch(err => {
        clearInterval(timer);
        flush();
        Object.assign(console, orig);
        setErrorMsg(err?.message ?? String(err));
        setStatus('error');
      });

    return () => {
      clearInterval(timer);
      Object.assign(console, orig);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const stage = stageFromStatus(status);
  const statusColor =
    status === 'error' ? 'red' :
    status === 'done'  ? 'green' : 'cyan';

  const statusLabel =
    status === 'scraping'    ? `${SYM.run} 采集运行中` :
    status === 'classifying' ? `${SYM.run} AI 分析中` :
    status === 'done'        ? `${SYM.check} 分析完成` :
                               `${SYM.cross} 出错`;

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
      <Text bold color="cyan">采集并分析</Text>
      <StepBar steps={STAGE_ORDER} current={stage} />

      <Box flexDirection="column" borderStyle="round" borderColor={statusColor} paddingX={2} paddingY={0} gap={0}>
        <Box gap={2}>
          <Text bold color={statusColor}>{statusLabel}</Text>
          {(status === 'scraping' || status === 'classifying') && (
            <Text color="gray" dimColor>{fmtElapsed(elapsed)}</Text>
          )}
        </Box>
        {countdown !== null && status === 'classifying' && (
          <Text color="gray" dimColor>  下次自动检索：{countdown}s  [r 立即检索]</Text>
        )}
        {loginPending && status === 'scraping' && (
          <Text bold color="yellow">  浏览器已打开，请完成登录后按 Enter 确认</Text>
        )}
        {logs.length > 0 && status !== 'done' && (
          logs.map((l, i) => (
            <Text key={i} color="gray" dimColor wrap="truncate">  {l}</Text>
          ))
        )}
      </Box>

      {errorMsg && (
        <Box borderStyle="round" borderColor="red" paddingX={2}>
          <Text color="red">{SYM.cross} {errorMsg}</Text>
        </Box>
      )}

      {status === 'done' && classifyResult && (
        <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={2} paddingY={0} gap={0}>
          <Text bold color="green">{SYM.check} 分析完成</Text>
          {scrapeResult && (
            <Text color="gray" dimColor>  总帖子数：{scrapeResult.totalCount} 条</Text>
          )}
          {classifyResult.userRisk && classifyResult.userRisk.length > 0 && (
            <Box flexDirection="column" marginTop={0}>
              <Text color="gray" dimColor>  账号风险排行：</Text>
              {classifyResult.userRisk.slice(0, 5).map((u, i) => (
                <Box key={i} gap={2} paddingLeft={4}>
                  <Text color="white">@{u.username ?? '?'}</Text>
                  <Text color={RISK_COLORS[u.risk_level] ?? 'gray'}>
                    {RISK_LABELS[u.risk_level] ?? u.risk_level ?? '—'}
                  </Text>
                  <Text color="gray" dimColor>{u.risk_score ?? '—'} 分</Text>
                </Box>
              ))}
            </Box>
          )}
          {classifyResult.userRisk && (
            <Text color="gray" dimColor>
              {'  '}标记内容：{classifyResult.userRisk.reduce((s, u) => s + (u.flagged_post_count ?? 0), 0)} 条
            </Text>
          )}
          {classifyResult.savedFiles && classifyResult.savedFiles.length > 0 && (
            <Box flexDirection="column" marginTop={0}>
              <Text color="gray" dimColor>  输出文件：</Text>
              {classifyResult.savedFiles.map(({ file, label }) => (
                <Box key={file} gap={2} paddingLeft={4}>
                  <Text color="gray" dimColor>{SYM.arrow}</Text>
                  <Text color="cyan" wrap="truncate">{label}  {file}</Text>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      )}

      <KeyBar hints={[
        ...(loginPending ? [{ key: 'Enter', label: '确认登录' }] : []),
        ...(status !== 'scraping' ? [{ key: 'ESC', label: '返回菜单' }] : []),
      ]} />
    </Box>
  );
}
