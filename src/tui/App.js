import React, { useState } from 'react';
import { Box, useWindowSize } from 'ink';
import Header        from './components/Header.js';
import MainMenu      from './screens/MainMenu.js';
import Settings      from './screens/Settings.js';
import ScrapeSetup   from './screens/ScrapeSetup.js';
import ScrapeRun     from './screens/ScrapeRun.js';
import ClassifySetup from './screens/ClassifySetup.js';
import ClassifyRun   from './screens/ClassifyRun.js';
import JobsList      from './screens/JobsList.js';

const SUBTITLES = {
  menu:             '多平台内容风险审查',
  settings:         '设置',
  'scrape-setup':   '采集设置',
  'scrape-run':     '采集运行中',
  'classify-setup': 'AI 分类设置',
  'classify-run':   'AI 分类运行中',
  jobs:             '分类任务列表',
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
      {screen === 'scrape-setup'   && <ScrapeSetup    onNav={onNav} />}
      {screen === 'scrape-run'     && <ScrapeRun      config={navParams.scrapeConfig}   onNav={onNav} />}
      {screen === 'classify-setup' && <ClassifySetup  onNav={onNav} />}
      {screen === 'classify-run'   && <ClassifyRun    config={navParams.classifyConfig} onNav={onNav} />}
      {screen === 'jobs'           && <JobsList       onNav={onNav} />}
    </Box>
  );
}
