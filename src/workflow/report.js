/**
 * report.js — Render KOL investigation reports (Markdown + HTML) from workflow outputs.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';

// ── Shared helpers ────────────────────────────────────────────────────────────

function safeReadJSON(path) {
  try { return JSON.parse(readFileSync(path, 'utf-8')); }
  catch { return null; }
}

function findLatestClassifyJSON(classifyOutDir) {
  const dir = join(classifyOutDir, 'classified');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  if (!files.length) return null;
  files.sort();
  return join(dir, files[files.length - 1]);
}

function mdEscape(s) {
  return String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

const PLATFORM_LABELS = {
  twitter:   'Twitter / X',
  tiktok:    'TikTok',
  reddit:    'Reddit',
  threads:   'Threads',
  pixiv:     'Pixiv',
  naver:     'Naver Café',
  youtube:   'YouTube',
  instagram: 'Instagram',
  twitch:    'Twitch',
  bluesky:   'Bluesky',
};

const CATEGORY_LABELS = {
  religion:           '宗教',
  politics:           '政治',
  race_discrimination:'种族歧视',
  fandom_conflict:    '饭圈冲突',
  creative_risk:      '创作风险',
  community_conflict: '社区矛盾',
  crime:              '违法犯罪',
  r18:                'R18',
};

const RISK_LEVEL_CN = { critical: '极高风险', high: '高风险', medium: '中等风险', low: '低风险' };

function fmtNumber(n) {
  if (n == null) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

/** Extract platform key from a file path (parent directory name). */
function platformFromPath(filePath) {
  const known = new Set(Object.keys(PLATFORM_LABELS));
  const parts = filePath.replace(/\\/g, '/').split('/');
  for (let i = parts.length - 2; i >= 0; i--) {
    if (known.has(parts[i].toLowerCase())) return parts[i].toLowerCase();
  }
  return parts[parts.length - 2] ?? 'unknown';
}

/** Read profile + follower count from a scraped JSON file. */
function readProfileFromFile(filePath) {
  try {
    const data = safeReadJSON(filePath);
    if (!data) return {};
    const profile = data.profile ?? {};
    const items   = data.posts ?? data.tweets ?? data.videos ?? data.clips ?? [];
    const first   = items[0];
    return {
      username:  profile.username  ?? profile.handle   ?? profile.login
                 ?? first?.author?.username ?? null,
      followers: profile.followers ?? profile.follower_count
                 ?? first?.author?.followers ?? null,
      name:      profile.name      ?? profile.display_name ?? profile.nickname
                 ?? profile.title  ?? null,
      verified:  profile.verified  ?? first?.author?.verified ?? false,
    };
  } catch { return {}; }
}

/** Build enriched account rows merging saved files with classify results. */
function buildAccountRows(kolName, scrape, userRisks) {
  const riskByUsername = {};
  for (const u of (userRisks ?? [])) {
    riskByUsername[(u.username ?? '').toLowerCase()] = u;
  }

  const rows = [];
  for (const sf of (scrape?.saved_files ?? [])) {
    const platform = platformFromPath(sf.file);
    const profile  = readProfileFromFile(sf.file);
    const username = profile.username ?? sf.label?.replace(/^@/, '') ?? '—';
    const risk     = riskByUsername[username.toLowerCase()] ?? null;

    rows.push({
      kolName,
      platform,
      platformLabel: PLATFORM_LABELS[platform] ?? platform,
      username,
      followers:  profile.followers ?? null,
      postCount:  sf.count ?? 0,
      riskScore:  risk?.risk_score  ?? null,
      riskLevel:  risk?.risk_level  ?? null,
      isViolation: risk ? (risk.risk_level === 'critical' || risk.risk_level === 'high') : null,
      flaggedCount: risk?.flagged_post_count ?? null,
      topCategories: risk?.top_categories ?? [],
      categoryAverages: risk?.category_averages ?? {},
      flaggedPosts: risk?.flagged_posts ?? [],
    });
  }
  return rows;
}

// ── Markdown sections ─────────────────────────────────────────────────────────

function renderIdentityMd(osint) {
  const id   = osint.kol_identity ?? {};
  const langs = (id.languages ?? []).join(', ') || '—';
  return [
    `## 身份图谱`, ``,
    `- **主要名称**：${mdEscape(id.primary_name ?? '—')}`,
    `- **真实姓名**：${mdEscape(id.real_name ?? '—')}`,
    `- **活动地区**：${mdEscape(id.region ?? '—')}`,
    `- **语言**：${langs}`,
    `- **商务邮箱**：${mdEscape(id.business_email ?? '—')}`,
    ``,
  ].join('\n');
}

function renderAccountsMd(osint) {
  const verified  = osint.verified_accounts  ?? [];
  const suspected = osint.suspected_accounts ?? [];
  const lines = [`## 账号清单`, ``];

  lines.push(`### 已验证账号（${verified.length}）`, ``);
  if (!verified.length) {
    lines.push(`_无_`, ``);
  } else {
    lines.push(`| 平台 | 类型 | Handle | URL | 状态 | 置信度 | 证据 |`);
    lines.push(`|---|---|---|---|---|---|---|`);
    for (const a of verified) {
      const ev = Array.isArray(a.verification_evidence)
        ? a.verification_evidence.join('；')
        : (a.verification_evidence ?? '');
      lines.push(`| ${mdEscape(a.platform)} | ${a.account_type ?? ''} | ${mdEscape(a.handle_id ?? '')} | ${a.url ?? ''} | ${a.status ?? ''} | ${a.confidence_score ?? ''} | ${mdEscape(ev)} |`);
    }
    lines.push(``);
  }
  lines.push(`### 疑似账号（${suspected.length}）`, ``);
  if (!suspected.length) {
    lines.push(`_无_`, ``);
  } else {
    lines.push(`| 平台 | URL | 置信度 | 理由 |`);
    lines.push(`|---|---|---|---|`);
    for (const a of suspected) {
      lines.push(`| ${mdEscape(a.platform)} | ${a.url ?? ''} | ${a.confidence_score ?? ''} | ${mdEscape(a.reason ?? '')} |`);
    }
    lines.push(``);
  }
  return lines.join('\n');
}

function renderScrapeMd(scrape) {
  const files = scrape.saved_files ?? [];
  const lines = [`## 采集汇总`, ``, `- **总条数**：${scrape.total_count ?? 0}`, `- **目标数**：${files.length}`, ``];
  if (files.length) {
    lines.push(`| 目标 | 条数 | 文件 |`);
    lines.push(`|---|---|---|`);
    for (const f of files) lines.push(`| ${mdEscape(f.label)} | ${f.count} | ${f.file} |`);
    lines.push(``);
  }
  return lines.join('\n');
}

function renderRiskMd(classifyJSON) {
  if (!classifyJSON) return `## 内容风险\n\n_分类输出未找到。_\n`;
  const users = classifyJSON.user_risks ?? [];
  if (!users.length) return `## 内容风险\n\n_无用户级风险数据。_\n`;

  const lines = [`## 内容风险`, ``];
  const top = users[0];
  lines.push(`- **综合风险分**：${top.risk_score} (${top.risk_level})`);
  lines.push(`- **采集帖子总数**：${users.reduce((s, u) => s + (u.post_count ?? 0), 0)}`);
  lines.push(`- **标记帖子数**：${users.reduce((s, u) => s + (u.flagged_post_count ?? 0), 0)}`);
  lines.push(``);

  lines.push(`### 维度均值（合并所有账号）`, ``);
  lines.push(`| 维度 | 均值 |`);
  lines.push(`|---|---|`);
  const catSums = {}, catCnt = {};
  for (const u of users) {
    for (const [c, v] of Object.entries(u.category_averages ?? {})) {
      catSums[c] = (catSums[c] ?? 0) + v * (u.post_count ?? 1);
      catCnt[c]  = (catCnt[c]  ?? 0) + (u.post_count ?? 1);
    }
  }
  for (const c of Object.keys(catSums).sort()) {
    lines.push(`| ${c} | ${catCnt[c] ? (catSums[c] / catCnt[c]).toFixed(2) : '—'} |`);
  }
  lines.push(``);

  const flagged = users
    .flatMap(u => (u.flagged_posts ?? []).map(p => ({ ...p, _user: u.username })))
    .sort((a, b) => Math.max(...Object.values(b.score ?? {})) - Math.max(...Object.values(a.score ?? {})))
    .slice(0, 10);

  if (flagged.length) {
    lines.push(`### 高危帖子 TOP ${flagged.length}`, ``);
    lines.push(`| 用户 | 维度 | 分 | 时间 | 链接 | 摘录 |`);
    lines.push(`|---|---|---|---|---|---|`);
    for (const p of flagged) {
      const topCat = Object.entries(p.score ?? {}).sort((a, b) => b[1] - a[1])[0];
      lines.push(`| @${p._user} | ${topCat ? topCat[0] : '—'} | ${topCat ? topCat[1] : ''} | ${p.created_at ?? ''} | ${p.url ?? ''} | ${mdEscape((p.text ?? '').slice(0, 120))} |`);
    }
    lines.push(``);
  }
  return lines.join('\n');
}

function renderProvenanceMd(wf) {
  const lines = [`## 任务凭证`, ``];
  lines.push(`- **Workflow ID**：${wf.id}`);
  lines.push(`- **OSINT batch**：${wf.osint?.batch_id ?? '—'}`);
  lines.push(`- **Classify batch**：${wf.classify?.batch_id ?? '—'}`);
  lines.push(`- **OSINT 结果**：${wf.osint?.result_dir ?? '—'}`);
  lines.push(`- **采集输出**：${wf.scrape?.out_dir ?? '—'}`);
  lines.push(`- **分类输出**：${wf.classify?.out_dir ?? '—'}`);
  lines.push(``);
  return lines.join('\n');
}

// ── HTML report ───────────────────────────────────────────────────────────────

function h(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function riskBadge(level) {
  if (!level) return '<span class="badge badge-low">—</span>';
  const cls = `badge-${level}`;
  const label = h(RISK_LEVEL_CN[level] ?? level);
  return `<span class="badge ${cls}">${label}</span>`;
}

function violationBadge(isViolation) {
  if (isViolation === null) return '<span class="badge badge-low">—</span>';
  return isViolation
    ? '<span class="badge badge-yes">是</span>'
    : '<span class="badge badge-no">否</span>';
}

function buildHtmlStyle() {
  return `
<style>
:root{--primary:#1a73e8;--danger:#d93025;--warn:#f29900;--ok:#188038;--gray:#5f6368;--border:#dadce0;--bg:#f8f9fa;--surface:#fff}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;background:var(--bg);color:#202124;line-height:1.6}
a{color:var(--primary);text-decoration:none}
a:hover{text-decoration:underline}
.report-header{background:var(--surface);border-bottom:3px solid var(--primary);padding:24px 40px}
.report-header h1{font-size:22px;font-weight:700;color:#202124}
.report-header .meta{color:var(--gray);font-size:13px;margin-top:6px}
.container{max-width:1200px;margin:0 auto;padding:24px 40px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px;margin-bottom:24px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:16px 20px}
.card-label{font-size:11px;color:var(--gray);text-transform:uppercase;letter-spacing:.6px}
.card-value{font-size:26px;font-weight:700;margin-top:4px;color:#202124}
.card-value.danger{color:var(--danger)}
.card-value.ok{color:var(--ok)}
.section{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:24px;margin-bottom:20px}
.section-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;gap:12px;flex-wrap:wrap}
.section-title{font-size:15px;font-weight:600;color:#202124}
.table-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:13px}
th{background:#f1f3f4;color:var(--gray);font-weight:600;text-align:left;padding:10px 12px;border-bottom:2px solid var(--border);white-space:nowrap}
td{padding:10px 12px;border-bottom:1px solid var(--border);vertical-align:middle}
tr:last-child td{border-bottom:none}
tbody tr:hover td{background:#f8f9fa}
.badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:500;white-space:nowrap}
.badge-critical{background:#fce8e6;color:#c5221f}
.badge-high{background:#fef3e0;color:#b05a00}
.badge-medium{background:#fff8e1;color:#7b5800}
.badge-low{background:#e6f4ea;color:#137333}
.badge-yes{background:#fce8e6;color:#c5221f;font-weight:700}
.badge-no{background:#e6f4ea;color:#137333}
.score-bar{display:flex;align-items:center;gap:8px}
.score-bar-bg{width:60px;height:6px;background:#e8eaed;border-radius:3px;flex-shrink:0}
.score-bar-fill{height:6px;border-radius:3px;background:var(--danger)}
.tags{display:flex;flex-wrap:wrap;gap:4px}
.tag{padding:2px 6px;background:#e8eaed;border-radius:4px;font-size:12px;color:#3c4043}
.truncate{max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.identity-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 32px}
.identity-row{display:flex;gap:12px;padding:8px 0;border-bottom:1px solid var(--border)}
.identity-row:last-child{border-bottom:none}
.identity-label{color:var(--gray);min-width:90px;font-size:13px;flex-shrink:0}
.identity-value{font-size:13px;font-weight:500;word-break:break-all}
.btn-copy{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;background:var(--primary);color:#fff;border:none;border-radius:4px;font-size:13px;cursor:pointer;transition:background .15s;white-space:nowrap}
.btn-copy:hover{background:#1557b0}
.btn-copy.copied{background:var(--ok)}
.num{font-variant-numeric:tabular-nums;text-align:right}
.section-note{font-size:12px;color:var(--gray);margin-top:8px}
@media print{body{background:#fff}.btn-copy{display:none}.section{border:1px solid #ccc;break-inside:avoid}}
</style>`;
}

function buildCopyScript() {
  return `
<script>
function copyTSV(tableId, btn) {
  const table = document.getElementById(tableId);
  const rows = Array.from(table.querySelectorAll('tr'));
  const tsv = rows.map(row => {
    const cells = Array.from(row.querySelectorAll('th,td'));
    return cells.map(c => {
      const v = (c.getAttribute('data-value') ?? c.textContent).trim().replace(/\\t|\\n|\\r/g,' ');
      return v.includes('\\t') ? '"' + v.replace(/"/g,'""') + '"' : v;
    }).join('\\t');
  }).join('\\n');
  navigator.clipboard.writeText(tsv).then(() => {
    const orig = btn.textContent;
    btn.textContent = '\\u2713 已复制到剪贴板';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 2200);
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = tsv; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    btn.textContent = '\\u2713 已复制'; btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '复制为 TSV（Excel / Google Sheets）'; btn.classList.remove('copied'); }, 2200);
  });
}
</script>`;
}

function buildAccountsTable(rows, kolName) {
  const thead = `<thead><tr>
    <th>KOL 名称</th><th>渠道</th><th>渠道账号</th><th>粉丝数</th>
    <th>风险评分</th><th>风险等级</th><th>是否违规</th><th>标记内容数</th><th>采集数</th><th>主要风险类别</th>
  </tr></thead>`;

  const bodyRows = rows.map(r => {
    const score     = r.riskScore ?? null;
    const scoreBar  = score !== null
      ? `<div class="score-bar"><div class="score-bar-bg"><div class="score-bar-fill" style="width:${score}%"></div></div><span>${score}</span></div>`
      : '—';
    const cats = r.topCategories.length
      ? `<div class="tags">${r.topCategories.map(c => `<span class="tag">${h(CATEGORY_LABELS[c] ?? c)}</span>`).join('')}</div>`
      : '—';
    const followersRaw = r.followers != null ? String(r.followers) : '';
    return `<tr>
      <td>${h(r.kolName)}</td>
      <td>${h(r.platformLabel)}</td>
      <td><a href="https://${h(r.platform === 'twitter' ? 'x.com' : r.platform + '.com')}/${h(r.username)}" target="_blank">@${h(r.username)}</a></td>
      <td class="num" data-value="${followersRaw}">${fmtNumber(r.followers)}</td>
      <td class="num" data-value="${score ?? ''}">${scoreBar}</td>
      <td>${riskBadge(r.riskLevel)}</td>
      <td>${violationBadge(r.isViolation)}</td>
      <td class="num" data-value="${r.flaggedCount ?? ''}">${r.flaggedCount ?? '—'}</td>
      <td class="num" data-value="${r.postCount}">${r.postCount}</td>
      <td>${cats}</td>
    </tr>`;
  }).join('');

  return `<table id="accounts-table">${thead}<tbody>${bodyRows}</tbody></table>`;
}

function buildRiskTable(rows) {
  const CATS = Object.keys(CATEGORY_LABELS);
  const thead = `<thead><tr>
    <th>渠道账号</th><th>渠道</th>
    ${CATS.map(c => `<th>${h(CATEGORY_LABELS[c])}</th>`).join('')}
  </tr></thead>`;

  const bodyRows = rows.filter(r => r.riskScore !== null).map(r => {
    const avgs = r.categoryAverages;
    const catCells = CATS.map(c => {
      const v = avgs[c];
      const vn = v != null ? v.toFixed(2) : '—';
      const pct = v != null ? Math.round(v / 3 * 100) : 0;
      const color = v >= 2 ? 'var(--danger)' : v >= 1 ? 'var(--warn)' : '#dadce0';
      return `<td class="num" data-value="${v ?? ''}">
        <div class="score-bar">
          <div class="score-bar-bg"><div class="score-bar-fill" style="width:${pct}%;background:${color}"></div></div>
          <span>${vn}</span>
        </div>
      </td>`;
    }).join('');
    return `<tr><td>@${h(r.username)}</td><td>${h(r.platformLabel)}</td>${catCells}</tr>`;
  }).join('');

  return `<table id="risk-table">${thead}<tbody>${bodyRows}</tbody></table>`;
}

function buildFlaggedTable(rows) {
  const allFlagged = rows
    .flatMap(r => r.flaggedPosts.map(p => ({ ...p, _username: r.username, _platform: r.platformLabel })))
    .sort((a, b) => Math.max(...Object.values(b.score ?? {})) - Math.max(...Object.values(a.score ?? {})))
    .slice(0, 50);

  if (!allFlagged.length) return '<p style="color:var(--gray);font-size:13px">无高危内容记录。</p>';

  const thead = `<thead><tr>
    <th>账号</th><th>渠道</th><th>日期</th><th>最高风险维度</th><th>风险分</th><th>内容摘录</th><th>链接</th>
  </tr></thead>`;

  const bodyRows = allFlagged.map(p => {
    const topCat = Object.entries(p.score ?? {}).sort((a, b) => b[1] - a[1])[0];
    const catLabel = topCat ? (CATEGORY_LABELS[topCat[0]] ?? topCat[0]) : '—';
    const score    = topCat ? topCat[1] : '';
    const text     = (p.text ?? '').replace(/\n/g, ' ').slice(0, 100);
    const date     = p.created_at ? p.created_at.slice(0, 10) : '—';
    const url      = p.url ? `<a href="${h(p.url)}" target="_blank" title="${h(p.url)}">↗</a>` : '—';
    return `<tr>
      <td>@${h(p._username)}</td>
      <td>${h(p._platform)}</td>
      <td>${h(date)}</td>
      <td><span class="badge badge-${score >= 3 ? 'critical' : score >= 2 ? 'high' : 'medium'}">${h(catLabel)}</span></td>
      <td class="num" data-value="${score}">${score}</td>
      <td><span class="truncate" title="${h(text)}">${h(text)}</span></td>
      <td>${url}</td>
    </tr>`;
  }).join('');

  return `<table id="flagged-table">${thead}<tbody>${bodyRows}</tbody></table>`;
}

function buildIdentitySection(osint) {
  if (!osint) return '';
  const id   = osint.kol_identity ?? {};
  const rows = [
    ['主要名称', id.primary_name],
    ['真实姓名', id.real_name],
    ['活动地区', id.region],
    ['语言',     (id.languages ?? []).join(', ')],
    ['商务邮箱', id.business_email],
  ].filter(([, v]) => v);

  const verified  = osint.verified_accounts  ?? [];
  const suspected = osint.suspected_accounts ?? [];

  const idRows = rows.map(([l, v]) =>
    `<div class="identity-row"><div class="identity-label">${h(l)}</div><div class="identity-value">${h(v)}</div></div>`
  ).join('');

  const verTable = verified.length ? `
    <table id="identity-verified-table" style="margin-top:12px">
      <thead><tr><th>平台</th><th>类型</th><th>Handle</th><th>URL</th><th>状态</th><th>置信度</th></tr></thead>
      <tbody>${verified.map(a => `<tr>
        <td>${h(a.platform)}</td><td>${h(a.account_type ?? '')}</td>
        <td>${h(a.handle_id ?? '')}</td>
        <td>${a.url ? `<a href="${h(a.url)}" target="_blank">${h(a.url)}</a>` : '—'}</td>
        <td>${h(a.status ?? '')}</td><td>${h(a.confidence_score ?? '')}</td>
      </tr>`).join('')}</tbody>
    </table>` : '<p style="color:var(--gray);font-size:13px;margin-top:8px">无已验证账号。</p>';

  return `
  <div class="section">
    <div class="section-header"><div class="section-title">身份图谱</div></div>
    <div class="identity-grid">${idRows}</div>
    <div style="margin-top:20px">
      <div class="section-header">
        <div class="section-title" style="font-size:14px">已验证账号（${verified.length}）</div>
        ${verified.length ? `<button class="btn-copy" onclick="copyTSV('identity-verified-table',this)">复制为 TSV</button>` : ''}
      </div>
      ${verTable}
    </div>
  </div>`;
}

function renderHtmlReport(wf, osintJson, classifyJson) {
  const userRisks = classifyJson?.user_risks ?? [];
  const rows      = buildAccountRows(wf.kol?.name ?? '—', wf.scrape ?? {}, userRisks);

  const totalFollowers  = rows.reduce((s, r) => s + (r.followers ?? 0), 0);
  const violationCount  = rows.filter(r => r.isViolation).length;
  const totalPosts      = rows.reduce((s, r) => s + r.postCount, 0);
  const flaggedCount    = rows.reduce((s, r) => s + (r.flaggedCount ?? 0), 0);

  const date = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>风险审查报告 — ${h(wf.kol?.name ?? '—')}</title>
${buildHtmlStyle()}
</head>
<body>

<div class="report-header">
  <h1>${h(wf.kol?.name ?? '—')} — 风险审查报告</h1>
  <div class="meta">生成时间：${h(date)} &nbsp;|&nbsp; Seed URL：${wf.kol?.seed_url ? `<a href="${h(wf.kol.seed_url)}" target="_blank">${h(wf.kol.seed_url)}</a>` : '—'} &nbsp;|&nbsp; Workflow：${h(wf.id ?? '—')}</div>
</div>

<div class="container">

  <!-- Summary cards -->
  <div class="cards">
    <div class="card">
      <div class="card-label">采集账号数</div>
      <div class="card-value">${rows.length}</div>
    </div>
    <div class="card">
      <div class="card-label">违规账号</div>
      <div class="card-value ${violationCount > 0 ? 'danger' : 'ok'}">${violationCount}</div>
    </div>
    <div class="card">
      <div class="card-label">采集内容总数</div>
      <div class="card-value">${totalPosts.toLocaleString()}</div>
    </div>
    <div class="card">
      <div class="card-label">标记内容数</div>
      <div class="card-value ${flaggedCount > 0 ? 'danger' : 'ok'}">${flaggedCount}</div>
    </div>
    <div class="card">
      <div class="card-label">总粉丝数</div>
      <div class="card-value">${fmtNumber(totalFollowers)}</div>
    </div>
  </div>

  <!-- Identity -->
  ${buildIdentitySection(osintJson)}

  <!-- Accounts summary table -->
  <div class="section">
    <div class="section-header">
      <div class="section-title">账号汇总</div>
      <button class="btn-copy" onclick="copyTSV('accounts-table',this)">复制为 TSV（Excel / Google Sheets）</button>
    </div>
    <div class="table-wrap">
      ${buildAccountsTable(rows, wf.kol?.name ?? '—')}
    </div>
    <div class="section-note">粘贴到 Google Sheets / Excel 时请选择"使用制表符分隔"。</div>
  </div>

  <!-- Risk dimensions -->
  ${userRisks.length ? `
  <div class="section">
    <div class="section-header">
      <div class="section-title">风险维度分析（各账号）</div>
      <button class="btn-copy" onclick="copyTSV('risk-table',this)">复制为 TSV（Excel / Google Sheets）</button>
    </div>
    <div class="table-wrap">
      ${buildRiskTable(rows)}
    </div>
    <div class="section-note">各维度评分范围 0–3，数值越高风险越大。</div>
  </div>` : ''}

  <!-- Flagged posts -->
  ${userRisks.length ? `
  <div class="section">
    <div class="section-header">
      <div class="section-title">高危内容明细（Top 50）</div>
      <button class="btn-copy" onclick="copyTSV('flagged-table',this)">复制为 TSV（Excel / Google Sheets）</button>
    </div>
    <div class="table-wrap">
      ${buildFlaggedTable(rows)}
    </div>
  </div>` : ''}

</div>

${buildCopyScript()}
</body>
</html>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Render the full report and write report.md + report.html. Returns { mdPath, htmlPath }.
 */
export function renderReport(wf) {
  const osintSlug = wf.osint?.slug;
  const osintJson = osintSlug && wf.osint?.result_dir
    ? safeReadJSON(join(wf.osint.result_dir, `${osintSlug}.json`))
    : null;

  const classifyJson = wf.classify?.out_dir
    ? safeReadJSON(findLatestClassifyJSON(wf.classify.out_dir))
    : null;

  // ── Markdown ──────────────────────────────────────────────────────────────
  const md = [
    `# ${wf.kol?.name ?? '—'} — 风险审查报告`,
    ``,
    `**生成时间**：${new Date().toISOString()}  `,
    `**Seed URL**：${wf.kol?.seed_url ?? '—'}  `,
    ``,
    osintJson ? renderIdentityMd(osintJson) : `## 身份图谱\n\n_OSINT 输出未找到。_\n`,
    osintJson ? renderAccountsMd(osintJson) : '',
    renderScrapeMd(wf.scrape ?? {}),
    renderRiskMd(classifyJson),
    renderProvenanceMd(wf),
  ].filter(Boolean).join('\n');

  const mdPath   = join(wf.out_dir, 'report.md');
  writeFileSync(mdPath, md, 'utf-8');

  // ── HTML ──────────────────────────────────────────────────────────────────
  const html     = renderHtmlReport(wf, osintJson, classifyJson);
  const htmlPath = join(wf.out_dir, 'report.html');
  writeFileSync(htmlPath, html, 'utf-8');

  return htmlPath;   // keep backward compat — callers store this as wf.report.path
}
