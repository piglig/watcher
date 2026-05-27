import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import TreeMultiSelect from '../components/TreeMultiSelect.js';
import StepBar from '../components/StepBar.js';
import KeyBar from '../components/KeyBar.js';
import { Indicator, Item } from '../components/SelectChrome.js';
import { SYM } from '../theme.js';
import { readdirSync, existsSync, statSync } from 'fs';
import { resolve, join, basename } from 'path';
import { walkFiles } from '../../shared/fs-walk.js';
import { getConfig } from '../../shared/config-store.js';
import { CLASSIFY_MODEL_ITEMS, DEFAULT_GEMINI_MODEL } from '../../classifier/classifier.js';
import { inferProvider } from '../../shared/ai-provider.js';

const MODEL_ITEMS = CLASSIFY_MODEL_ITEMS.map(item => ({
  label: item.label,
  value: `${item.provider}:${item.model}`,
}));

const STEPS = [
  { key: 'inputFile', short: '文件', label: '选择文件', type: 'multi-files' },
  { key: 'model',     short: '模型', label: '模型',     type: 'select', items: MODEL_ITEMS },
];

/**
 * Build a KOL → channel → file tree from <outDir>.
 * Layout: <outDir>/<kol>/scrape/<platform>/<handle>/<timestamp>.json
 */
function listJsonFiles(dir) {
  return walkFiles(dir, {
    match: (n) => n.endsWith('.json') && !n.startsWith('_'),
  }).map(f => f.path);
}

function buildKolTree(rootDir) {
  const abs = resolve(rootDir);
  if (!existsSync(abs)) return [];

  const kolNodes = [];
  for (const ent of readdirSync(abs, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const scrapeRoot = join(abs, ent.name, 'scrape');
    if (!existsSync(scrapeRoot)) continue;

    const channelNodes = [];
    for (const pEnt of readdirSync(scrapeRoot, { withFileTypes: true })) {
      if (!pEnt.isDirectory()) continue;
      const platformDir = join(scrapeRoot, pEnt.name);
      for (const hEnt of readdirSync(platformDir, { withFileTypes: true })) {
        if (!hEnt.isDirectory()) continue;
        const files = listJsonFiles(join(platformDir, hEnt.name)).sort();
        if (!files.length) continue;
        channelNodes.push({
          id:    `${ent.name}::${pEnt.name}::${hEnt.name}`,
          label: `${pEnt.name} · @${hEnt.name}`,
          files,
          children: files.slice().reverse().map(f => ({
            id:    f,
            label: basename(f),
            files: [f],
          })),
        });
      }
    }

    if (!channelNodes.length) continue;
    channelNodes.sort((a, b) => a.label.localeCompare(b.label));
    kolNodes.push({
      id:       ent.name,
      label:    ent.name,
      files:    channelNodes.flatMap(c => c.files),
      children: channelNodes,
      mtime:    safeMtime(join(abs, ent.name)),
    });
  }

  return kolNodes.sort((a, b) => b.mtime - a.mtime);
}

function safeMtime(p) {
  try { return statSync(p).mtimeMs; } catch { return 0; }
}

export default function ClassifySetup({ onNav }) {
  const [config, setConfig]   = useState({});
  const [stepIdx, setStepIdx] = useState(0);
  const [draft, setDraft]     = useState('');

  const step       = STEPS[stepIdx];
  const stepLabels = STEPS.map(s => s.short);

  const saved    = getConfig();
  const scanDir  = saved.outDir || './out/';

  const tree     = useMemo(() => buildKolTree(scanDir), [scanDir]);
  const allFiles = useMemo(() => {
    const out = [];
    const walk = (ns) => { for (const n of ns) { if (n.children?.length) walk(n.children); else out.push(...n.files); } };
    walk(tree);
    return out;
  }, [tree]);

  useInput((_, key) => {
    if (key.escape) {
      if (stepIdx === 0) onNav('menu');
      else { setStepIdx(i => i - 1); setDraft(''); }
    }
  });

  const advance = (value) => {
    const isMulti = step.type === 'multi-files';
    const val  = isMulti ? value : (value ?? draft).trim();
    const next = { ...config, [step.key]: val };
    setConfig(next);

    if (stepIdx + 1 >= STEPS.length) {
      const selectedModel = next.model
        || `${inferProvider(saved.model, saved.aiProvider)}:${saved.model || DEFAULT_GEMINI_MODEL}`;
      const [aiProvider, model] = selectedModel.includes(':') ? selectedModel.split(':') : ['openai', selectedModel];
      const outDir = scanDir;

      let inputFiles;
      const selected = next.inputFile;
      if (Array.isArray(selected) && selected.length > 0) {
        inputFiles = selected;
      } else {
        inputFiles = allFiles;
      }
      onNav('classify-run', { classifyConfig: { inputFiles, aiProvider, model, outDir, wait: false } });
    } else {
      setStepIdx(i => i + 1);
      setDraft('');
    }
  };

  if (!step) return null;

  const doneSteps = STEPS.slice(0, stepIdx);

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
      <Text bold color="cyan">AI 分类设置</Text>

      <StepBar steps={stepLabels} current={stepIdx} />

      {doneSteps.length > 0 && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="green"
          borderDimColor
          paddingX={2}
          marginTop={1}
        >
          {doneSteps.map(s => (
            <Box key={s.key} gap={2}>
              <Text color="green">{SYM.check}</Text>
              <Text color="gray" dimColor>{s.label.padEnd(6)}</Text>
              <Text color="white">
                {s.key === 'inputFile'
                  ? (Array.isArray(config[s.key]) && config[s.key].length > 0
                      ? `已选 ${config[s.key].length} 个文件`
                      : '全部文件')
                  : config[s.key] || '（默认）'}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="cyan"
        paddingX={2}
        paddingY={0}
        marginTop={1}
        gap={1}
      >
        <Text bold color="cyan">{step.label}</Text>
        <Text color="gray" dimColor>目录：{scanDir}</Text>

        {step.type === 'multi-files' ? (
          tree.length === 0 ? (
            <Text color="gray" dimColor>目录中暂无 .json 文件</Text>
          ) : (
            <>
              <Text color="gray" dimColor>按 KOL 选择，展开可挑渠道 / 单个文件。共 {tree.length} 个 KOL · {allFiles.length} 个文件。</Text>
              <TreeMultiSelect nodes={tree} onConfirm={(vals) => advance(vals)} />
            </>
          )
        ) : (
          <SelectInput
            items={step.items}
            onSelect={({ value }) => advance(value)}
            indicatorComponent={Indicator}
            itemComponent={Item}
          />
        )}
      </Box>

      <KeyBar hints={
        step.type === 'multi-files'
          ? [
              { key: 'Space', label: '选/反选' },
              { key: '→',     label: '展开' },
              { key: 'c',     label: '确认' },
              { key: 'ESC',   label: stepIdx === 0 ? '返回菜单' : '上一步' },
            ]
          : [
              { key: 'Enter', label: '确认' },
              { key: 'ESC',   label: stepIdx === 0 ? '返回菜单' : '上一步' },
            ]
      } />
    </Box>
  );
}
