import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import KeyBar from '../components/KeyBar.js';
import { RiskBadge } from '../components/StatusBadge.js';
import { SYM } from '../theme.js';
import { runClassify } from '../classify-runner.js';

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

export default function ClassifyRun({ config, onNav }) {
  const [recentLogs, setRecentLogs] = useState([]);
  const [status, setStatus]         = useState('running');
  const [result, setResult]         = useState(null);
  const [errorMsg, setError]        = useState('');

  const rawRef    = useRef([]);
  const committed = useRef(0);
  const elapsed   = useElapsed(status === 'running');

  useInput((_, key) => {
    if (key.escape && status !== 'running') onNav('menu');
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

    const onLog = (msg) => { rawRef.current.push(msg); };

    const flush = () => {
      if (cancelled) return;
      const all = rawRef.current;
      if (all.length <= committed.current) return;
      committed.current = all.length;
      setRecentLogs(all.slice(-RECENT_LINES));
    };

    const timer = setInterval(flush, 500);

    runClassify(config, onLog)
      .then(res => {
        if (!cancelled) {
          setResult(res);
          setStatus(res.status === 'submitted' ? 'submitted' : 'done');
        }
      })
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

  const topUsers = result?.userRisk?.slice(0, 5) ?? [];

  const statusColor =
    status === 'error'     ? 'red'    :
    status === 'done'      ? 'green'  :
    status === 'submitted' ? 'yellow' : 'cyan';

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
            {status === 'running'    ? `${SYM.run} AI 分类运行中`
             : status === 'done'     ? `${SYM.check} 分类完成`
             : status === 'submitted'? `${SYM.dot} 批次已提交`
             :                         `${SYM.cross} 出错`}
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

      {/* ── Submitted info ── */}
      {status === 'submitted' && result && (
        <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={2}>
          <Text color="yellow" bold>
            {SYM.dot} 批次已提交{result.batchId ? ` — ${result.batchId}` : ''}
          </Text>
          <Text color="gray" dimColor>
            结果通常在 1–24 小时内就绪，请在"查看分类任务"中检索。
          </Text>
        </Box>
      )}

      {/* ── Done result ── */}
      {status === 'done' && result && (
        <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={2} paddingY={0} gap={1}>
          <Text bold color="green">
            {SYM.check} 完成  共 {result.postCount} 条内容
          </Text>

          {topUsers.length > 0 && (
            <Box flexDirection="column">
              <Text color="gray" dimColor>风险最高用户（前 {topUsers.length}）</Text>
              {topUsers.map(u => (
                <Box key={u.author_id} gap={3}>
                  <RiskBadge level={u.risk_level} />
                  <Text>@{u.username}</Text>
                  <Text color="gray" dimColor>
                    {u.risk_score} 分 · {u.flagged_post_count} 条标记
                  </Text>
                </Box>
              ))}
            </Box>
          )}

          {result.savedFiles?.length > 0 && (
            <Box flexDirection="column">
              <Text color="gray" dimColor>输出文件</Text>
              {result.savedFiles.map(({ file, label }) => (
                <Box key={file} gap={2}>
                  <Text color="gray" dimColor>{SYM.arrow}</Text>
                  <Text color="cyan">{label}</Text>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      )}

      {status !== 'running' && (
        <KeyBar hints={[{ key: 'ESC', label: '返回主菜单' }]} />
      )}
    </Box>
  );
}
