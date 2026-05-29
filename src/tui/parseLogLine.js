/**
 * parseLogLine — parse a raw log string into a render-ready record ONCE, at
 * append time, instead of re-running regex classification on every render.
 *
 * Accepted formats (auto-detected):
 *   - "T+MM:SS  rest"     — relative-time stamp (PipelineRun / WorkflowRun)
 *   - "HH:MM:SS  rest"    — absolute clock stamp (session.logs)
 *   - "rest"              — no stamp (ScrapeRun's console.log capture)
 *
 * Color / icon classification by content:
 *   ✗ red    — [ERR] / 失败 / error / FAIL
 *   ! yellow — [WARN] / warn(ing)
 *   ✓ green  — 完成: / 提交: / 成功 / 已生成 / completed
 *   ▸ cyan   — "[tag] 开始 …" / "[tag] start …"
 *   · magenta— other "[tag] …" platform/scope events
 *   · gray   — plain
 */

import { SYM } from './theme.js';

const TS_PATTERN = /^(T\+\d{1,3}:\d{2}|\d{2}:\d{2}:\d{2})\s+(.*)$/;

function classify(rest) {
  if (/^\[ERR\]|失败|^FAIL|error/i.test(rest))          return { color: 'red',     icon: SYM.cross };
  if (/^\[WARN\]|warn(ing)?/i.test(rest))               return { color: 'yellow',  icon: SYM.warn  };
  if (/完成[:：]|✓|成功|提交[:：]|已生成|completed/.test(rest)) return { color: 'green', icon: SYM.check };
  if (/^\[[\w\-/]+\]\s*(?:开始|start)/i.test(rest))     return { color: 'cyan',    icon: SYM.arrow };
  if (/^\[[\w\-/]+\]/.test(rest))                       return { color: 'magenta', icon: '·'       };
  return { color: 'gray', icon: '·' };
}

/** Parse a raw log string into { ts, icon, color, display }. */
export function parseLogLine(line) {
  const raw  = String(line ?? '');
  const m    = raw.match(TS_PATTERN);
  const ts   = m ? m[1] : '';
  const body = m ? m[2] : raw;

  // Tolerate ERR/WARN bracket prefixes that ScrapeRun emits ("[ERR] xxx") by
  // classifying on the body but stripping the bracket before display.
  const display = body.replace(/^\[(ERR|WARN)\]\s*/, '');

  const { color, icon } = classify(body);
  return { ts, icon, color, display };
}
