import React, { useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import KeyBar from '../components/KeyBar.js';
import { SYM } from '../theme.js';

const ITEMS = [
  {
    label: '调查 KOL（一键流水线）',
    value: 'workflow',
    desc:  'OSINT → 采集 → 分类 → Markdown 报告，单 KOL 端到端调查',
  },
  {
    label: '调查任务列表',
    value: 'workflow-list',
    desc:  '查看进行中 / 已完成的调查任务，恢复中断的流水线',
  },
  {
    label: '采集内容',
    value: 'scrape',
    desc:  '从 Twitter、TikTok、Reddit 等平台批量采集帖子，支持多平台同时采集',
  },
  {
    label: 'AI 风险分类',
    value: 'classify',
    desc:  '使用 OpenAI Batch API 对帖子进行多维度风险评分',
  },
  {
    label: 'OSINT 社媒追踪',
    value: 'osint',
    desc:  '基于 Grok 4.3 批处理 API（web_search + x_search）挖掘 KOL 全网账号足迹',
  },
  {
    label: '预览采集数据',
    value: 'preview',
    desc:  '浏览已采集的 JSON 数据，↑↓ 选行，←→ 翻页',
  },
  {
    label: '查看分类任务',
    value: 'jobs',
    desc:  '查看历史批次，检索已完成的分类结果',
  },
  {
    label: '设置',
    value: 'settings',
    desc:  '配置 OpenAI API Key、YouTube API Key、默认输出目录等参数',
  },
  {
    label: '退出',
    value: 'quit',
    desc:  '退出 SNS Audit',
  },
];

function Indicator({ isSelected }) {
  return (
    <Box marginRight={1}>
      {isSelected
        ? <Text color="cyan" bold>{SYM.cursor}</Text>
        : <Text> </Text>
      }
    </Box>
  );
}

function Item({ label, isSelected }) {
  return (
    <Text color={isSelected ? 'white' : 'gray'} bold={isSelected}>
      {label}
    </Text>
  );
}

export default function MainMenu({ onNav }) {
  const { exit } = useApp();
  const [highlighted, setHighlighted] = useState(ITEMS[0]);

  const handleSelect = ({ value }) => {
    if (value === 'quit') { exit(); return; }
    onNav(
      value === 'workflow'      ? 'workflow-setup'
    : value === 'workflow-list' ? 'workflow-list'
    : value === 'scrape'        ? 'scrape-setup'
    : value === 'classify'      ? 'classify-setup'
    : value === 'osint'         ? 'osint-setup'
    : value === 'preview'       ? 'data-preview'
    : value === 'jobs'          ? 'jobs'
    : value === 'settings'      ? 'settings'
    : 'menu'
    );
  };

  useInput((_, key) => {
    if (key.escape) exit();
  });

  const current = highlighted ?? ITEMS[0];

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
      <Text bold color="cyan">请选择操作</Text>

      <Box flexDirection="column" marginTop={1}>
        <SelectInput
          items={ITEMS}
          onSelect={handleSelect}
          onHighlight={setHighlighted}
          indicatorComponent={Indicator}
          itemComponent={Item}
        />
      </Box>

      {current?.desc && (
        <Box
          borderStyle="round"
          borderColor="gray"
          borderDimColor
          paddingX={2}
          paddingY={0}
          marginTop={1}
        >
          <Text color="gray">{current.desc}</Text>
        </Box>
      )}

      <KeyBar hints={[
        { key: '↑↓',   label: '导航' },
        { key: 'Enter', label: '确认' },
        { key: 'ESC',   label: '退出' },
      ]} />
    </Box>
  );
}
