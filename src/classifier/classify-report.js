/**
 * classify-report.js — Generic classify session reports.
 *
 * Two renderers:
 *   - renderClassifyReport(): cross-account aggregate (top-level summary +
 *     per-account drill links). Used as the session's main report.
 *   - renderAccountReport():  single-account focused report (risk score,
 *     dimension breakdown, flagged posts with reasons).
 *
 * Both return { html, md }. HTML is self-contained (no external assets).
 */

import { CATEGORIES } from './classifier.js';
import { pathSafe } from '../shared/paths.js';

const CATEGORY_LABELS = {
  religion:            '宗教',
  politics:            '政治',
  race_discrimination: '种族歧视',
  fandom_conflict:     '粉丝冲突',
  creative_risk:       '创作风险',
  community_conflict:  '社群冲突',
  crime:               '犯罪 / 隐性广告',
  r18:                 'R18',
};

const RISK_COLORS = {
  critical: '#c92a2a',
  high:     '#e8590c',
  medium:   '#f59f00',
  low:      '#37b24d',
};

const RISK_LABELS_ZH = {
  critical: '严重',
  high:     '高',
  medium:   '中',
  low:      '低',
};

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function mdEsc(s) {
  return String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function categoryBar(value, max = 3, width = 20) {
  const filled = Math.round((value / max) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function htmlShell(title, body) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; max-width: 1100px; margin: 2rem auto; padding: 0 1.5rem; color: #222; line-height: 1.55; }
  h1 { font-size: 1.6rem; margin: 0 0 .3rem; }
  h2 { font-size: 1.2rem; margin-top: 2rem; border-bottom: 2px solid #eee; padding-bottom: .3rem; }
  h3 { font-size: 1rem; margin-top: 1.5rem; }
  .meta { color: #666; font-size: .9rem; margin-bottom: 1.5rem; }
  table { border-collapse: collapse; width: 100%; margin: .5rem 0 1.2rem; }
  th, td { text-align: left; padding: .45rem .65rem; border-bottom: 1px solid #eaeaea; vertical-align: top; font-size: .92rem; }
  th { background: #fafafa; font-weight: 600; }
  .risk-badge { display: inline-block; padding: .15rem .55rem; border-radius: 4px; color: white; font-size: .8rem; font-weight: 600; }
  .dim-bar { font-family: monospace; color: #4a4a4a; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .reason { color: #555; font-size: .85rem; font-style: italic; }
  .post-text { color: #333; max-width: 700px; }
  .source-tag { font-size: .72rem; padding: 0 .35rem; background: #eef; color: #339; border-radius: 3px; }
  .source-rules { background: #fee; color: #933; }
  details { margin: .5rem 0; }
  summary { cursor: pointer; color: #246; font-weight: 600; }
  a { color: #246; }
  .small { color: #999; font-size: .8rem; }
</style>
</head>
<body>
${body}
<footer class="meta" style="margin-top:3rem; border-top:1px solid #eee; padding-top:1rem;">
  生成时间：${new Date().toISOString()}
</footer>
</body>
</html>`;
}

// ── Cross-account aggregate report ───────────────────────────────────────────

export function renderClassifyReport({ session, userRisk, allPosts, allResults }) {
  // ── HTML ───────────────────────────────────────────────────────────────────
  const head = `
    <h1>分类报告 · ${esc(session.kol_id ?? '')}</h1>
    <div class="meta">
      Session ${esc(session.id)} · 模型 ${esc(session.model)} · ${allPosts.length} 条帖子 / ${userRisk.length} 个账号
    </div>
  `;

  const summaryTable = `
    <h2>账号风险排行</h2>
    <table>
      <thead><tr>
        <th>#</th><th>账号</th><th>平台</th><th>风险等级</th><th class="num">分数</th>
        <th class="num">帖子</th><th class="num">标记</th><th class="num">严重</th><th>高频维度</th>
      </tr></thead>
      <tbody>
      ${userRisk.map((u, i) => {
        const platform = uniquePlatforms(allPosts, u.author_id)[0] ?? '—';
        const handle = pathSafeLink(platform, u.username ?? u.author_id);
        return `<tr>
          <td>${i + 1}</td>
          <td><a href="by-account/${handle}/report.html">@${esc(u.username ?? u.author_id)}</a></td>
          <td>${esc(platform)}</td>
          <td><span class="risk-badge" style="background:${RISK_COLORS[u.risk_level] ?? '#888'}">${esc(RISK_LABELS_ZH[u.risk_level] ?? u.risk_level)}</span></td>
          <td class="num">${u.risk_score}</td>
          <td class="num">${u.post_count}</td>
          <td class="num">${u.flagged_post_count}</td>
          <td class="num">${u.severe_post_count}</td>
          <td>${(u.top_categories ?? []).map(c => esc(CATEGORY_LABELS[c] ?? c)).join(', ')}</td>
        </tr>`;
      }).join('\n')}
      </tbody>
    </table>
  `;

  const overallStats = renderOverallStatsHtml(userRisk);

  const html = htmlShell(`分类报告 · ${session.kol_id ?? ''}`, head + summaryTable + overallStats);

  // ── Markdown ───────────────────────────────────────────────────────────────
  const mdLines = [
    `# 分类报告 · ${session.kol_id ?? ''}`,
    ``,
    `- **Session**: \`${session.id}\``,
    `- **Model**: ${session.model}`,
    `- **帖子总数**: ${allPosts.length}`,
    `- **账号数**: ${userRisk.length}`,
    `- **总标记数**: ${userRisk.reduce((s, u) => s + (u.flagged_post_count ?? 0), 0)}`,
    ``,
    `## 账号风险排行`,
    ``,
    `| # | 账号 | 风险 | 分数 | 帖子 | 标记 | 严重 | 高频维度 |`,
    `|---|---|---|---|---|---|---|---|`,
    ...userRisk.map((u, i) =>
      `| ${i + 1} | @${mdEsc(u.username ?? u.author_id)} | ${RISK_LABELS_ZH[u.risk_level] ?? u.risk_level} | ${u.risk_score} | ${u.post_count} | ${u.flagged_post_count} | ${u.severe_post_count} | ${(u.top_categories ?? []).map(c => CATEGORY_LABELS[c] ?? c).join(', ')} |`
    ),
    ``,
    `> 单账号详情见 \`by-account/<platform>_<handle>/report.md\``,
  ];

  return { html, md: mdLines.join('\n') };
}

// ── Per-account report ───────────────────────────────────────────────────────

export function renderAccountReport({ user, posts, results, platform }) {
  const flagged = [...(user.flagged_posts ?? [])];

  // HTML
  const head = `
    <h1>@${esc(user.username ?? user.author_id)} · ${esc(platform)}</h1>
    <div class="meta">
      ${user.post_count} 条帖子 · ${user.flagged_post_count} 标记 · ${user.severe_post_count} 严重 ·
      风险等级 <span class="risk-badge" style="background:${RISK_COLORS[user.risk_level] ?? '#888'}">${esc(RISK_LABELS_ZH[user.risk_level] ?? user.risk_level)}</span> ·
      总分 ${user.risk_score}
    </div>
  `;

  const dimensionsTable = `
    <h2>维度分布</h2>
    <table>
      <thead><tr><th>维度</th><th class="num">均值</th><th>分布</th></tr></thead>
      <tbody>
      ${CATEGORIES.map(c => {
        const avg = user.category_averages?.[c] ?? 0;
        return `<tr>
          <td>${esc(CATEGORY_LABELS[c] ?? c)}</td>
          <td class="num">${avg.toFixed(2)}</td>
          <td class="dim-bar">${categoryBar(avg)}</td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>
  `;

  const flaggedTable = flagged.length ? `
    <h2>标记帖子（${flagged.length}）</h2>
    <table>
      <thead><tr>
        <th>日期</th><th>类型</th><th>内容</th><th>评分</th><th>原因</th><th>来源</th>
      </tr></thead>
      <tbody>
      ${flagged.map(f => {
        const scoreSummary = Object.entries(f.score ?? {})
          .filter(([, v]) => v > 0)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => `${CATEGORY_LABELS[k] ?? k}:${v}`)
          .join(', ');
        const reasonText = Object.entries(f.reasons ?? {})
          .map(([k, v]) => `<div class="reason"><b>${esc(CATEGORY_LABELS[k] ?? k)}</b>: ${esc(v)}</div>`)
          .join('');
        return `<tr>
          <td>${esc((f.created_at ?? '').slice(0, 10))}</td>
          <td>${esc(f.type ?? '')}</td>
          <td class="post-text">${esc(f.text ?? '')}${f.url ? ` <br><a class="small" href="${esc(f.url)}">原文 →</a>` : ''}</td>
          <td>${esc(scoreSummary)}</td>
          <td>${reasonText}</td>
          <td><span class="source-tag ${f.source === 'rules' ? 'source-rules' : ''}">${esc(f.source)}</span></td>
        </tr>`;
      }).join('\n')}
      </tbody>
    </table>
  ` : '<p class="meta">无标记帖子。</p>';

  const html = htmlShell(`@${user.username} · ${platform}`, head + dimensionsTable + flaggedTable);

  // Markdown
  const mdLines = [
    `# @${user.username ?? user.author_id} · ${platform}`,
    ``,
    `- **帖子总数**: ${user.post_count}`,
    `- **标记**: ${user.flagged_post_count}（严重 ${user.severe_post_count}）`,
    `- **风险等级**: ${RISK_LABELS_ZH[user.risk_level] ?? user.risk_level}（${user.risk_score} 分）`,
    ``,
    `## 维度分布`,
    ``,
    `| 维度 | 均值 |`,
    `|---|---|`,
    ...CATEGORIES.map(c => `| ${CATEGORY_LABELS[c] ?? c} | ${(user.category_averages?.[c] ?? 0).toFixed(2)} |`),
    ``,
    `## 标记帖子（${flagged.length}）`,
    ``,
    ...flagged.flatMap(f => {
      const scoreSummary = Object.entries(f.score ?? {})
        .filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${CATEGORY_LABELS[k] ?? k}:${v}`).join(', ');
      const reasons = Object.entries(f.reasons ?? {})
        .map(([k, v]) => `  - **${CATEGORY_LABELS[k] ?? k}**: ${mdEsc(v)}`).join('\n');
      return [
        `### ${(f.created_at ?? '').slice(0, 10)} · ${f.type ?? ''} · ${scoreSummary}`,
        ``,
        `> ${mdEsc(f.text ?? '').slice(0, 600)}`,
        ``,
        reasons,
        f.url ? `\n[原文 →](${f.url})` : '',
        ``,
      ];
    }),
  ];

  return { html, md: mdLines.join('\n') };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function uniquePlatforms(posts, authorId) {
  const set = new Set();
  for (const p of posts) {
    if (String(p.author?.id ?? p.author?.username ?? '') === String(authorId)) {
      if (p.platform) set.add(p.platform);
    }
  }
  return [...set];
}

function pathSafeLink(platform, handle) {
  return `${pathSafe(platform)}_${pathSafe(handle)}`;
}

function renderOverallStatsHtml(userRisk) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const u of userRisk) counts[u.risk_level] = (counts[u.risk_level] ?? 0) + 1;
  return `
    <h2>整体分布</h2>
    <table style="max-width:420px">
      <thead><tr><th>风险等级</th><th class="num">账号数</th></tr></thead>
      <tbody>
        <tr><td><span class="risk-badge" style="background:${RISK_COLORS.critical}">${RISK_LABELS_ZH.critical}</span></td><td class="num">${counts.critical ?? 0}</td></tr>
        <tr><td><span class="risk-badge" style="background:${RISK_COLORS.high}">${RISK_LABELS_ZH.high}</span></td><td class="num">${counts.high ?? 0}</td></tr>
        <tr><td><span class="risk-badge" style="background:${RISK_COLORS.medium}">${RISK_LABELS_ZH.medium}</span></td><td class="num">${counts.medium ?? 0}</td></tr>
        <tr><td><span class="risk-badge" style="background:${RISK_COLORS.low}">${RISK_LABELS_ZH.low}</span></td><td class="num">${counts.low ?? 0}</td></tr>
      </tbody>
    </table>
  `;
}
