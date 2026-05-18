import React, { useState } from 'react';
import { Box, useWindowSize } from 'ink';
import Header        from './components/Header.js';
import MainMenu      from './screens/MainMenu.js';
import Settings      from './screens/Settings.js';
import ScrapeSetup   from './screens/ScrapeSetup.js';
import ScrapeRun     from './screens/ScrapeRun.js';
import ClassifySetup from './screens/ClassifySetup.js';
import ClassifyRun   from './screens/ClassifyRun.js';
import OsintSetup    from './screens/OsintSetup.js';
import OsintRun      from './screens/OsintRun.js';
import WorkflowSetup from './screens/WorkflowSetup.js';
import WorkflowRun   from './screens/WorkflowRun.js';
import WorkflowList  from './screens/WorkflowList.js';
import JobsList      from './screens/JobsList.js';
import DataPreview   from './screens/DataPreview.js';

const SUBTITLES = {
  menu:             '多平台内容风险审查',
  settings:         '设置',
  'scrape-setup':   '采集设置',
  'scrape-run':     '采集运行中',
  'classify-setup': 'AI 分类设置',
  'classify-run':   'AI 分类运行中',
  'osint-setup':    'OSINT 社媒追踪 — 设置',
  'osint-run':      'OSINT 社媒追踪 — 运行中',
  'workflow-setup': '调查 KOL — 新建任务',
  'workflow-run':   '调查 KOL — 任务运行',
  'workflow-list':  '调查任务列表',
  jobs:             '分类任务列表',
  'data-preview':   '数据预览',
};

export default function App() {
  const [screen, setScreen]    = useState('menu');
  const [navParams, setParams] = useState({});
  const { rows, columns }      = useWindowSize();

  const onNav = (target, params = {}) => {
    setParams(params);
    setScreen(target);
  };

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      <Header subtitle={SUBTITLES[screen]} />
      {screen === 'menu'           && <MainMenu       onNav={onNav} />}
      {screen === 'settings'       && <Settings       onNav={onNav} />}
      {screen === 'scrape-setup'   && <ScrapeSetup    prefill={navParams.scrapePrefill} onNav={onNav} />}
      {screen === 'scrape-run'     && <ScrapeRun      config={navParams.scrapeConfig}   onNav={onNav} />}
      {screen === 'classify-setup' && <ClassifySetup  onNav={onNav} />}
      {screen === 'classify-run'   && <ClassifyRun    config={navParams.classifyConfig} onNav={onNav} />}
      {screen === 'osint-setup'    && <OsintSetup     onNav={onNav} />}
      {screen === 'osint-run'      && <OsintRun       config={navParams.osintConfig}    onNav={onNav} />}
      {screen === 'workflow-setup' && <WorkflowSetup  onNav={onNav} />}
      {screen === 'workflow-run'   && <WorkflowRun    config={navParams.workflowConfig} onNav={onNav} />}
      {screen === 'workflow-list'  && <WorkflowList   onNav={onNav} />}
      {screen === 'jobs'           && <JobsList       onNav={onNav} />}
      {screen === 'data-preview'   && <DataPreview    initialFile={navParams.previewFile} onNav={onNav} />}
    </Box>
  );
}
