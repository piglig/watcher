import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import DirPicker from '../components/DirPicker.js';
import KeyBar from '../components/KeyBar.js';
import { SYM } from '../theme.js';
import { getConfig, setConfig } from '../../shared/config-store.js';

const MODEL_ITEMS = [
  { label: 'gpt-4.1-mini  快速省钱（推荐）', value: 'gpt-4.1-mini' },
  { label: 'gpt-4.1       高精度',           value: 'gpt-4.1'      },
  { label: 'gpt-4o-mini   备用',             value: 'gpt-4o-mini'  },
];

const SECTIONS = [
  {
    key:   'ai',
    label: 'AI 服务',
    desc:  'OpenAI · xAI · 模型',
    fields: [
      { key: 'openaiKey', label: 'OpenAI API Key', hint: '以 sk- 开头',                mask: true,  type: 'text'   },
      { key: 'xaiKey',    label: 'xAI API Key',    hint: '以 xai- 开头；OSINT 功能需要', mask: true,  type: 'text'   },
      { key: 'model',     label: '默认 AI 模型',   hint: '',                           mask: false, type: 'select', items: MODEL_ITEMS },
    ],
  },
  {
    key:   'platforms',
    label: '平台凭据',
    desc:  'YouTube · Bluesky · Twitch',
    fields: [
      { key: 'youtubeKey',         label: 'YouTube API Key',      hint: 'console.cloud.google.com',        mask: true,  type: 'text' },
      { key: 'blueskyIdentifier',  label: 'Bluesky 账号',         hint: '如 me.bsky.social',               mask: false, type: 'text' },
      { key: 'blueskyAppPassword', label: 'Bluesky App Password', hint: 'bsky.app → 设置 → App Passwords', mask: true,  type: 'text' },
      { key: 'twitchClientId',     label: 'Twitch Client ID',     hint: 'dev.twitch.tv/console',           mask: true,  type: 'text' },
      { key: 'twitchClientSecret', label: 'Twitch Client Secret', hint: '与 Client ID 配套',               mask: true,  type: 'text' },
    ],
  },
  {
    key:   'output',
    label: '输出设置',
    desc:  '文件保存路径',
    fields: [
      { key: 'outDir', label: '默认输出目录', hint: '采集结果保存位置', mask: false, type: 'dir' },
    ],
  },
];

function maskValue(val) {
  if (!val || val.length <= 8) return '••••••••';
  return val.slice(0, 4) + '•'.repeat(Math.min(val.length - 8, 16)) + val.slice(-4);
}

function displayVal(field, val) {
  if (!val) return '';
  if (field.mask) return maskValue(val);
  if (field.type === 'select') {
    const item = field.items?.find(i => i.value === val);
    return item ? item.label.replace(/\s{2,}.*$/, '') : val;
  }
  return val;
}

function Cursor({ active }) {
  return <Text color="cyan">{active ? SYM.cursor : ' '}</Text>;
}

function SectionNav({ sectionIdx, active }) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={active ? 'cyan' : 'gray'}
      borderDimColor={!active}
      paddingX={1}
      paddingY={0}
      width={20}
      gap={1}
    >
      {SECTIONS.map((s, i) => {
        const isCurrent = i === sectionIdx;
        return (
          <Box key={s.key} flexDirection="column">
            <Box gap={1}>
              <Cursor active={active && isCurrent} />
              <Text color={isCurrent ? 'white' : 'gray'} bold={isCurrent && active}>
                {s.label}
              </Text>
            </Box>
            <Text color="gray" dimColor>  {s.desc}</Text>
          </Box>
        );
      })}
    </Box>
  );
}

export default function Settings({ onNav }) {
  const saved = getConfig();

  const [values, setValues] = useState({
    openaiKey:          saved.openaiKey          ?? '',
    xaiKey:             saved.xaiKey             ?? '',
    model:              saved.model              ?? '',
    youtubeKey:         saved.youtubeKey         ?? '',
    blueskyIdentifier:  saved.blueskyIdentifier  ?? '',
    blueskyAppPassword: saved.blueskyAppPassword ?? '',
    twitchClientId:     saved.twitchClientId     ?? '',
    twitchClientSecret: saved.twitchClientSecret ?? '',
    outDir:             saved.outDir             ?? '',
  });

  // mode: 'section' | 'field' | 'editing'
  const [mode,       setMode]       = useState('section');
  const [sectionIdx, setSectionIdx] = useState(0);
  const [fieldIdx,   setFieldIdx]   = useState(0);
  const [draft,      setDraft]      = useState('');

  const section = SECTIONS[sectionIdx];
  const field   = section?.fields[fieldIdx];

  const saveAndExit = useCallback((vals) => {
    const src = vals ?? values;
    const toSave = {};
    for (const [k, v] of Object.entries(src)) {
      if (v) toSave[k] = v;
    }
    const cfg = setConfig(toSave);
    if (cfg.openaiKey)          process.env.OPENAI_API_KEY       = cfg.openaiKey;
    if (cfg.xaiKey)             process.env.XAI_API_KEY          = cfg.xaiKey;
    if (cfg.youtubeKey)         process.env.YOUTUBE_API_KEY      = cfg.youtubeKey;
    if (cfg.blueskyIdentifier)  process.env.BLUESKY_IDENTIFIER   = cfg.blueskyIdentifier;
    if (cfg.blueskyAppPassword) process.env.BLUESKY_APP_PASSWORD = cfg.blueskyAppPassword;
    if (cfg.twitchClientId)     process.env.TWITCH_CLIENT_ID     = cfg.twitchClientId;
    if (cfg.twitchClientSecret) process.env.TWITCH_CLIENT_SECRET = cfg.twitchClientSecret;
    onNav('menu');
  }, [values, onNav]);

  useInput((_, key) => {
    if (mode === 'section') {
      if (key.upArrow)                     setSectionIdx(i => Math.max(0, i - 1));
      if (key.downArrow)                   setSectionIdx(i => Math.min(SECTIONS.length - 1, i + 1));
      if (key.return || key.rightArrow)    { setFieldIdx(0); setMode('field'); }
      if (key.escape)                      saveAndExit();
      return;
    }

    if (mode === 'field') {
      if (key.upArrow)                     setFieldIdx(i => Math.max(0, i - 1));
      if (key.downArrow)                   setFieldIdx(i => Math.min(section.fields.length - 1, i + 1));
      if (key.escape || key.leftArrow)     setMode('section');
      if (key.return && field?.type !== 'select') {
        setDraft(values[field?.key] ?? '');
        setMode('editing');
      }
      return;
    }

    if (mode === 'editing') {
      if (key.escape) { setDraft(''); setMode('field'); }
    }
  });

  const commitText = () => {
    const trimmed = draft.trim();
    if (trimmed) setValues(v => ({ ...v, [field.key]: trimmed }));
    setDraft('');
    setMode('field');
  };

  const commitSelect = (value) => {
    setValues(v => ({ ...v, [field.key]: value }));
    setMode('field');
  };

  const commitDir = (path) => {
    setValues(v => ({ ...v, [field.key]: path }));
    setMode('field');
  };

  const isRightActive = mode !== 'section';

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
      <Text bold color="cyan">设置</Text>

      <Box gap={2} marginTop={1}>
        <SectionNav sectionIdx={sectionIdx} active={mode === 'section'} />

        {/* Right panel */}
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={isRightActive ? 'cyan' : 'gray'}
          borderDimColor={!isRightActive}
          paddingX={2}
          paddingY={0}
          flexGrow={1}
          gap={1}
        >
          <Text bold color={isRightActive ? 'cyan' : 'gray'}>{section.label}</Text>

          {section.fields.map((f, fi) => {
            const isCursor  = isRightActive && fi === fieldIdx;
            const isEditing = isCursor && mode === 'editing';
            const val       = values[f.key];
            const disp      = displayVal(f, val);

            return (
              <Box key={f.key} flexDirection="column" gap={0}>

                {/* Field header row */}
                <Box gap={1}>
                  <Cursor active={isCursor} />
                  <Text color={isCursor ? 'white' : 'gray'} bold={isCursor}>
                    {f.label}
                  </Text>

                  {/* Inline value (not when editing or select-open) */}
                  {!isEditing && f.type !== 'select' && (
                    disp
                      ? <Text color={f.mask ? 'yellow' : 'green'}>{disp}</Text>
                      : <Text color="gray" dimColor>未设置</Text>
                  )}

                  {/* Select current value */}
                  {f.type === 'select' && !isEditing && disp && (
                    <Text color="green">{disp}</Text>
                  )}
                  {f.type === 'select' && !isEditing && !disp && (
                    <Text color="gray" dimColor>未设置</Text>
                  )}
                </Box>

                {/* Hint line (only when cursor is here and not editing) */}
                {isCursor && !isEditing && f.hint && f.type !== 'select' && (
                  <Text color="gray" dimColor>  {f.hint}</Text>
                )}

                {/* Text input */}
                {isEditing && f.type === 'text' && (
                  <Box gap={1} marginLeft={2}>
                    <Text color="cyan">{SYM.arrow}</Text>
                    <TextInput
                      value={draft}
                      onChange={setDraft}
                      onSubmit={commitText}
                      placeholder={f.hint ?? ''}
                    />
                  </Box>
                )}

                {/* Dir picker */}
                {isEditing && f.type === 'dir' && (
                  <Box marginLeft={2}>
                    <DirPicker initial={val || '.'} onConfirm={commitDir} />
                  </Box>
                )}

                {/* Select options (shown when cursor on select field in field mode) */}
                {isCursor && f.type === 'select' && mode === 'field' && (
                  <Box marginLeft={2} flexDirection="column">
                    <SelectInput
                      items={f.items}
                      onSelect={({ value }) => commitSelect(value)}
                      indicatorComponent={({ isSelected }) => (
                        <Box marginRight={1}>
                          {isSelected
                            ? <Text color="cyan" bold>{SYM.cursor}</Text>
                            : <Text> </Text>}
                        </Box>
                      )}
                      itemComponent={({ label, isSelected }) => (
                        <Text color={isSelected ? 'white' : 'gray'}>{label}</Text>
                      )}
                    />
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      </Box>

      <KeyBar hints={
        mode === 'section'
          ? [{ key: '↑↓',    label: '切换分类' }, { key: 'Enter', label: '进入编辑' }, { key: 'ESC', label: '保存并返回' }]
        : mode === 'editing' && field?.type === 'dir'
          ? [{ key: '↑↓',   label: '导航' }, { key: '←', label: '上级目录' }, { key: 'Enter', label: '确认' }, { key: 'ESC', label: '取消' }]
        : mode === 'editing'
          ? [{ key: 'Enter', label: '保存' }, { key: 'ESC', label: '取消' }]
        : [{ key: '↑↓',      label: '切换字段' }, { key: 'Enter', label: '编辑' }, { key: '←/ESC', label: '返回分类' }]
      } />
    </Box>
  );
}
