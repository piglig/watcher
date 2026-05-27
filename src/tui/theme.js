// Design tokens — ANSI 16 colors only for broad terminal compatibility
export const SYM = {
  logo:    '◆',
  check:   '✓',
  cross:   '✗',
  dot:     '●',
  arrow:   '›',
  cursor:  '❯',
  warn:    '▲',
  info:    '◈',
  run:     '◎',
  dash:    '─',
};

export const C = {
  primary:  'cyan',
  success:  'green',
  warning:  'yellow',
  error:    'red',
  info:     'blue',
  accent:   'magenta',
  muted:    'gray',
};

export const RISK_COLORS = {
  critical: 'red',
  high:     'redBright',
  medium:   'yellow',
  low:      'green',
};

export const RISK_LABELS = {
  critical: '严重',
  high:     '高风险',
  medium:   '中风险',
  low:      '低风险',
};

export const BATCH_COLORS = { pending: 'yellow', completed: 'green', failed: 'red' };
export const BATCH_LABELS = { pending: '等待中', completed: '已完成', failed: '失败' };

export const PLATFORM_LABELS = {
  twitter: 'Twitter / X',
  tiktok:  'TikTok',
  reddit:  'Reddit',
  threads: 'Threads',
  pixiv:   'Pixiv',
  naver:   'Naver Café',
  youtube: 'YouTube',
  instagram: 'Instagram',
  twitch:  'Twitch',
  bluesky: 'Bluesky',
  facebook:'Facebook',
};
