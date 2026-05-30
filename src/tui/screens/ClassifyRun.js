/**
 * ClassifyRun — manual "AI 分类" entry from ClassifySetup or JobsList resume.
 *
 * If config.sessionId is supplied (from JobsList): just render that session.
 * Otherwise: create a new session from the provided inputFiles, then render.
 * Daemon (App.js) takes care of all advancement.
 */

import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import KeyBar from '../components/KeyBar.js';
import { SYM } from '../theme.js';
import { createSession } from '../../shared/sessions-store.js';
import { advanceSession } from '../../classifier/session.js';
import { defaultModelForProvider } from '../../classifier/classifier.js';
import { useSession, useAdvanceSession } from '../hooks/useSession.js';
import SessionView from '../components/SessionView.js';
import { join, resolve } from 'path';

export default function ClassifyRun({ config, onNav }) {
  const [sessionId, setSessionId] = useState(config?.sessionId ?? null);
  const [errorMsg,  setErrorMsg]  = useState('');
  const [pickerMode, setPickerMode] = useState('nav');
  const session = useSession(sessionId);
  // Foreground-drive this session while the screen is open (replaces the old
  // background daemon). Pauses when we navigate away; resumes on return.
  useAdvanceSession(sessionId);

  useInput((input, key) => {
    // While the results list is in search mode, the TextInput owns every key —
    // don't let 'j' or ESC navigate away mid-query (that made search unusable).
    if (pickerMode === 'search') return;
    if (key.escape) { onNav('menu'); return; }
    if (input === 'j' || input === 'J') onNav('jobs');
  });

  useEffect(() => {
    if (sessionId) return;                          // already attached to a session
    const inputFiles = config?.inputFiles ?? [];
    if (!inputFiles.length) {
      setErrorMsg('未提供输入文件，且未指定 sessionId。');
      return;
    }

    // Manual entry: files are paths under <outDir>/<kolId>/scrape/...; pull
    // the kolId out of the path. The convention is fully owned by this app
    // (scrape runner writes them), so this regex is canonical, not heuristic.
    const annotated = [];
    const skipped   = [];
    for (const file of inputFiles) {
      const norm = String(file).replace(/\\/g, '/');
      const m = norm.match(/\/([^/]+)\/scrape\/[^/]+\/[^/]+\//);
      if (m) annotated.push({ file, kol_id: m[1] });
      else   skipped.push(file);
    }
    if (skipped.length) {
      setErrorMsg(`${skipped.length} 个输入文件路径不符合 <outDir>/<kolId>/scrape/<platform>/<handle>/ 结构，已跳过：\n${skipped.slice(0, 3).join('\n')}`);
      return;
    }

    const s = createSession({
      source:      'manual',
      input_files: annotated,
      out_root:    resolve(config?.outDir ?? './out/'),
      provider:    config?.aiProvider,
      model:       config?.model ?? defaultModelForProvider(config?.aiProvider),
    });
    setSessionId(s.id);
    advanceSession(s).catch(() => {});
  }, [sessionId, config]);

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
      <Text bold color="cyan">AI 分类</Text>

      {errorMsg ? (
        <Box borderStyle="round" borderColor="red" paddingX={2}>
          <Text color="red">{SYM.cross} {errorMsg}</Text>
        </Box>
      ) : (
        <SessionView session={session} emptyText="正在创建 session…" onModeChange={setPickerMode} />
      )}

      <KeyBar hints={[
        { key: 'j',   label: '前往分类任务列表' },
        { key: 'ESC', label: '返回菜单' },
      ]} />
    </Box>
  );
}
