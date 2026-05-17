import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import KeyBar from '../components/KeyBar.js';
import { SYM } from '../theme.js';
import { runScrape } from '../runner.js';
import { getConfig } from '../../shared/config-store.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtElapsed(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function logColor(line) {
  if (line.startsWith('[ERR]'))  return 'red';
  if (line.startsWith('[WARN]')) return 'yellow';
  return 'gray';
}

function LogLine({ text }) {
  const color  = logColor(text);
  const prefix = text.startsWith('[ERR]')  ? `${SYM.cross} `
               : text.startsWith('[WARN]') ? `${SYM.warn}  `
               : '  ';
  const body = text.replace(/^\[(ERR|WARN)\] /, '');
  return (
    <Box gap={0}>
      <Text color={color}>{prefix}</Text>
      <Text color={color} dimColor wrap="truncate">{body}</Text>
    </Box>
  );
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

// ── Main component ────────────────────────────────────────────────────────────

const RECENT_LINES = 5;

export default function ScrapeRun({ config, onNav }) {
  const [recentLogs, setRecentLogs] = useState([]);
  const [status, setStatus]         = useState('running');
  const [result, setResult]         = useState(null);
  const [errorMsg, setError]        = useState('');

  const rawRef    = useRef([]);
  const committed = useRef(0);
  const elapsed   = useElapsed(status === 'running');

  useInput((input, key) => {
    if (key.escape && status !== 'running') { onNav('menu'); return; }

    // 采集完成后按 Enter → 直接进入 AI 分类
    if (key.return && status === 'done' && result) {
      const saved  = getConfig();
      const outDir = Array.isArray(config)
        ? (config[0]?.outDir ?? './out/')
        : (config?.outDir    ?? './out/');
      onNav('classify-run', {
        classifyConfig: {
          inputFiles: result.savedFiles.map(f => f.file),
          model:      saved.model || 'gpt-4.1-mini',
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
    let cancelled = false;

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
    console.error = (...a) => push('[ERR] '  + a.join(' '));
    console.warn  = (...a) => push('[WARN] ' + a.join(' '));

    const flush = () => {
      if (cancelled) return;
      const all = rawRef.current;
      if (all.length <= committed.current) return;
      committed.current = all.length;
      setRecentLogs(all.slice(-RECENT_LINES));
    };

    const timer = setInterval(flush, 500);

    runScrape(config)
      .then(res  => { if (!cancelled) { setResult(res); setStatus('done'); } })
      .catch(err => { if (!cancelled) { setError(err.message ?? String(err)); setStatus('error'); } })
      .finally(() => {
        clearInterval(timer);
        flush();
        Object.assign(console, orig);
      });

    return () => {
      cancelled = true;
      clearInterval(timer);
      Object.assign(console, orig);
    };
  }, []); // eslint-disable-line

  const statusColor = status === 'error' ? 'red' : status === 'done' ? 'green' : 'cyan';

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>

      {/* ── Status panel ── */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={statusColor}
        paddingX={2}
        paddingY={0}
      >
        <Box gap={2}>
          <Text bold color={statusColor}>
            {status === 'running' ? `${SYM.run} 采集运行中`
             : status === 'done'  ? `${SYM.check} 采集完成`
             :                      `${SYM.cross} 出错`}
          </Text>
          {status === 'running' && (
            <Text color="gray" dimColor>{fmtElapsed(elapsed)}</Text>
          )}
        </Box>

        {status === 'running' && (
          recentLogs.length === 0
            ? <Text color="gray" dimColor>  正在启动...</Text>
            : recentLogs.map((line, i) => <LogLine key={i} text={line} />)
        )}

        {status === 'error' && (
          <Text color="red" wrap="truncate">  {errorMsg}</Text>
        )}
      </Box>

      {/* ── Result panel ── */}
      {status === 'done' && result && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="green"
          paddingX={2}
          paddingY={0}
        >
          <Text bold color="green">
            {SYM.check} 共采集 {result.totalCount} 条内容
          </Text>
          {result.savedFiles.map(({ file, count, label }) => (
            <Box key={file} gap={2}>
              <Text color="gray" dimColor>{SYM.arrow}</Text>
              <Text color="cyan">{label}</Text>
              <Text color="gray" dimColor>{count} 条</Text>
              <Text color="gray" dimColor wrap="truncate">{file}</Text>
            </Box>
          ))}
        </Box>
      )}

      {status !== 'running' && (
        <KeyBar hints={[
          ...(status === 'done' ? [
            { key: 'Enter', label: '继续 AI 分类' },
            { key: 'P',     label: '预览数据' },
          ] : []),
          { key: 'ESC', label: '返回主菜单' },
        ]} />
      )}
    </Box>
  );
}
