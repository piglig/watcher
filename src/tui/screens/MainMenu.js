import React, { useState, useMemo } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import KeyBar from '../components/KeyBar.js';
import { SYM } from '../theme.js';
import { listWorkflows } from '../../workflow/index.js';

// ── Menu data ─────────────────────────────────────────────────────────────────

const GROUPS = [
  {
    label: '调查工作流',
    items: [
      {
        value:    'workflow',
        nav:      'workflow-setup',
        label:    '调查 KOL',
        badge:    '流水线',
        headline: '调查 KOL — 一键流水线',
        lines: [
          'OSINT 账号追踪  →  多平台内容采集',
          'AI 风险分类     →  Markdown 调查报告',
          '',
          '从一个名字出发，全自动完成 KOL 的社媒',
          '足迹挖掘、内容采集与风险评级，最终输出',
          '完整调查报告。',
        ],
      },
      {
        value:    'workflow-list',
        nav:      'workflow-list',
        label:    '调查任务列表',
        headline: '调查任务列表',
        lines: [
          '查看所有进行中及已完成的调查任务。',
          '',
          '可恢复中断的流水线、删除本地记录，',
          '或查看各阶段进度详情。',
        ],
      },
    ],
  },
  {
    label: '数据',
    items: [
      {
        value:    'pipeline',
        nav:      'scrape-setup',
        label:    '采集并分析',
        badge:    '一键',
        headline: '采集并分析',
        lines: [
          '指定目标账号，系统自动完成：',
          '多平台内容采集  →  AI 风险分类',
          '→  结论汇总报告',
          '',
          '适合已知目标账号、无需 OSINT',
          '发现阶段的快速分析场景。',
        ],
      },
      {
        value:    'scrape',
        nav:      'scrape-setup',
        label:    '采集内容',
        headline: '多平台内容采集',
        lines: [
          '支持 Twitter / TikTok / Reddit / Threads /',
          'YouTube / Instagram / Bluesky / Twitch。',
          '',
          '可从 OSINT 结果直接导入目标账号，批量',
          '采集并保存为 JSON / CSV 文件。',
        ],
      },
      {
        value:    'preview',
        nav:      'data-preview',
        label:    '预览采集数据',
        headline: '预览采集数据',
        lines: [
          '浏览已采集的 JSON 数据文件。',
          '',
          '支持翻页查看与字段详情展开，',
          '快速核查采集结果质量。',
        ],
      },
    ],
  },
  {
    label: 'AI 分析',
    items: [
      {
        value:    'classify',
        nav:      'classify-setup',
        label:    'AI 风险分类',
        headline: 'AI 风险分类',
        lines: [
          '使用 OpenAI Batch API 对采集内容进行',
          '多维度风险评分与类别标注。',
          '',
          '异步批量处理，低成本，适合大规模内容',
          '审查任务，结果可导出 CSV 报告。',
        ],
      },
      {
        value:    'jobs',
        nav:      'jobs',
        label:    '分类任务列表',
        headline: '分类任务列表',
        lines: [
          '查看历史分类批次及当前状态。',
          '',
          '检索已完成批次的结果，',
          '导出风险评分与标注详情。',
        ],
      },
    ],
  },
  {
    label: '工具',
    items: [
      {
        value:    'osint',
        nav:      'osint-setup',
        label:    'OSINT 社媒追踪',
        headline: 'OSINT 社媒追踪',
        lines: [
          '基于 xAI Grok（web_search + x_search）',
          '挖掘 KOL 的全网账号足迹。',
          '',
          '输出各平台账号列表，可直接导入采集',
          '流程作为目标账号。',
        ],
      },
    ],
  },
];

const UTILITY = [
  {
    value:    'settings',
    nav:      'settings',
    label:    '设置',
    headline: '设置',
    lines: [
      '配置 API 密钥、平台凭据与默认输出目录。',
      '',
      '支持 OpenAI、xAI、YouTube、',
      'Bluesky、Twitch 等平台的凭据管理。',
    ],
  },
  {
    value:    'quit',
    nav:      null,
    label:    '退出',
    headline: '退出',
    lines:    ['退出 SNS Audit 程序。'],
  },
];

const ALL_ITEMS = [...GROUPS.flatMap(g => g.items), ...UTILITY];

// ── Sub-components ────────────────────────────────────────────────────────────

function GroupSection({ group, selectedValue }) {
  return (
    <Box flexDirection="column">
      <Text color="gray" dimColor bold>{group.label}</Text>
      {group.items.map(item => {
        const active = item.value === selectedValue;
        return (
          <Box key={item.value} gap={1} paddingLeft={1}>
            <Text color={active ? 'cyan' : 'gray'}>
              {active ? SYM.cursor : ' '}
            </Text>
            <Text color={active ? 'white' : 'gray'} bold={active}>
              {item.label}
            </Text>
            {item.badge && (
              <Text color="gray" dimColor>{item.badge}</Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

function DetailPanel({ item, wfCount }) {
  if (!item) return null;

  const lines = item.value === 'workflow-list' && wfCount > 0
    ? [`共 ${wfCount} 个调查任务。`, ...item.lines.slice(1)]
    : item.lines;

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold color="white">{item.headline}</Text>
      <Box flexDirection="column">
        {lines.map((line, i) =>
          line === ''
            ? <Text key={i}> </Text>
            : <Text key={i} color="gray" dimColor>{line}</Text>
        )}
      </Box>
    </Box>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MainMenu({ onNav }) {
  const { exit } = useApp();
  const [cursor, setCursor] = useState(0);

  const wfCount = useMemo(() => {
    try { return listWorkflows().length; } catch { return 0; }
  }, []);

  const selected = ALL_ITEMS[cursor];

  useInput((input, key) => {
    if (key.upArrow)   setCursor(c => Math.max(0, c - 1));
    if (key.downArrow) setCursor(c => Math.min(ALL_ITEMS.length - 1, c + 1));
    if (key.return)    handleSelect(selected);
    if (key.escape || input === 'q') exit();
  });

  function handleSelect(item) {
    if (!item) return;
    if (item.value === 'quit') { exit(); return; }
    if (item.value === 'pipeline') { onNav('scrape-setup', { pipelineMode: true }); return; }
    if (item.nav) onNav(item.nav);
  }

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
      <Box gap={2}>

        {/* Left: grouped navigation */}
        <Box flexDirection="column" width={24} gap={1}>
          {GROUPS.map(group => (
            <GroupSection key={group.label} group={group} selectedValue={selected?.value} />
          ))}

          <Text color="gray" dimColor>{'─'.repeat(20)}</Text>

          {UTILITY.map(item => {
            const active = item.value === selected?.value;
            return (
              <Box key={item.value} gap={1} paddingLeft={1}>
                <Text color={active ? 'cyan' : 'gray'}>
                  {active ? SYM.cursor : ' '}
                </Text>
                <Text
                  color={active ? (item.value === 'quit' ? 'red' : 'white') : 'gray'}
                  bold={active}
                >
                  {item.label}
                </Text>
              </Box>
            );
          })}
        </Box>

        {/* Right: context detail */}
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="gray"
          borderDimColor
          paddingX={2}
          paddingY={1}
          flexGrow={1}
        >
          <DetailPanel item={selected} wfCount={wfCount} />
        </Box>
      </Box>

      <KeyBar hints={[
        { key: '↑↓',    label: '导航' },
        { key: 'Enter', label: '确认' },
        { key: 'q/ESC', label: '退出' },
      ]} />
    </Box>
  );
}
