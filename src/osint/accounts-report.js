/**
 * accounts-report.js — Render an "账号汇总" HTML for a batch OSINT run.
 *
 * Input: staging dir containing _summary.json + per-KOL identity JSON files.
 * Output: single <outDir>/accounts-summary.html aggregating every discovered
 * account (verified + suspected) across the whole batch, with client-side
 * search over KOL name / handle / URL.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { h, htmlShell, copyButton } from '../shared/report-kit.js';

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
  facebook:  'Facebook',
};

function platformLabel(p) {
  const key = String(p ?? '').trim().toLowerCase();
  return PLATFORM_LABELS[key] ?? (p ?? '—');
}

function safeReadJSON(path) {
  try { return JSON.parse(readFileSync(path, 'utf-8')); }
  catch { return null; }
}

function buildRows(stagingDir) {
  const summary = safeReadJSON(join(stagingDir, '_summary.json'));
  if (!summary?.items) return { rows: [], kolCount: 0, generated_at: null };

  const rows = [];
  let kolCount = 0;

  for (const item of summary.items) {
    if (item.status !== 'ok' || !item.file) continue;
    const identity = safeReadJSON(item.file);
    if (!identity) continue;
    kolCount++;
    const kolName = identity.kol_identity?.primary_name ?? item.name ?? item.slug;

    for (const a of (identity.verified_accounts ?? [])) {
      const ev = Array.isArray(a.verification_evidence)
        ? a.verification_evidence.join('；')
        : (a.verification_evidence ?? '');
      rows.push({
        kolName,
        kind: 'verified',
        platform: a.platform ?? '',
        platformLabel: platformLabel(a.platform),
        accountType: a.account_type ?? '',
        handle: a.handle_id ?? '',
        url: a.url ?? '',
        status: a.status ?? '',
        confidence: a.confidence_score ?? '',
        evidence: ev,
      });
    }
    for (const a of (identity.suspected_accounts ?? [])) {
      rows.push({
        kolName,
        kind: 'suspected',
        platform: a.platform ?? '',
        platformLabel: platformLabel(a.platform),
        accountType: '',
        handle: a.handle_id ?? '',
        url: a.url ?? '',
        status: '',
        confidence: a.confidence_score ?? '',
        evidence: a.reason ?? '',
      });
    }
  }

  return { rows, kolCount, generated_at: summary.generated_at };
}

// Report-specific CSS — wider container + filter chips + search input + badges.
const REPORT_CSS = `
.container{max-width:1400px}
.toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.search{flex:1;min-width:240px;max-width:420px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px;outline:none}
.search:focus{border-color:var(--primary)}
.filter-chip{padding:6px 12px;border:1px solid var(--border);border-radius:16px;font-size:12px;cursor:pointer;background:var(--surface);color:var(--gray);user-select:none}
.filter-chip.active{background:var(--primary);color:#fff;border-color:var(--primary)}
.count-pill{font-size:12px;color:var(--gray)}
.badge-verified{background:#e6f4ea;color:#137333}
.badge-suspected{background:#fef3e0;color:#b05a00}
.truncate{max-width:320px;display:inline-block;vertical-align:bottom}
@media print{.toolbar{display:none}}
`.trim();

// Filter / search / chip interactions. Lives outside the kit because it's
// specific to this report's UI.
const FILTER_SCRIPT = `
<script>
(function(){
  const input  = document.getElementById('search');
  const chips  = Array.from(document.querySelectorAll('.filter-chip'));
  const rows   = Array.from(document.querySelectorAll('#accounts-table tbody tr'));
  const countEl = document.getElementById('row-count');
  const total   = rows.length;
  let activeKind = 'all';

  function apply() {
    const q = (input.value ?? '').trim().toLowerCase();
    let shown = 0;
    for (const tr of rows) {
      const kind = tr.dataset.kind;
      const hay  = tr.dataset.search;
      const kindOk = activeKind === 'all' || kind === activeKind;
      const qOk    = !q || hay.includes(q);
      const show   = kindOk && qOk;
      tr.style.display = show ? '' : 'none';
      if (show) shown++;
    }
    countEl.textContent = shown === total ? (total + ' 条') : (shown + ' / ' + total + ' 条');
  }

  input.addEventListener('input', apply);
  for (const c of chips) {
    c.addEventListener('click', () => {
      chips.forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      activeKind = c.dataset.kind;
      apply();
    });
  }
  apply();
})();
</script>
`.trim();

function buildTable(rows) {
  const thead = `<thead><tr>
    <th>KOL 名称</th>
    <th>渠道</th>
    <th>类型</th>
    <th>账号类型</th>
    <th>Handle</th>
    <th>URL</th>
    <th>状态</th>
    <th>置信度</th>
    <th>证据 / 理由</th>
  </tr></thead>`;

  const bodyRows = rows.map(r => {
    const search = [r.kolName, r.handle, r.url].join(' ').toLowerCase();
    const kindBadge = r.kind === 'verified'
      ? '<span class="badge badge-verified">已验证</span>'
      : '<span class="badge badge-suspected">疑似</span>';
    const urlCell = r.url
      ? `<a href="${h(r.url)}" target="_blank" rel="noopener" class="truncate" title="${h(r.url)}">${h(r.url)}</a>`
      : '—';
    return `<tr data-kind="${r.kind}" data-search="${h(search)}">
      <td>${h(r.kolName)}</td>
      <td>${h(r.platformLabel)}</td>
      <td>${kindBadge}</td>
      <td>${h(r.accountType) || '—'}</td>
      <td>${r.handle ? h(r.handle) : '—'}</td>
      <td>${urlCell}</td>
      <td>${h(r.status) || '—'}</td>
      <td class="num" data-value="${h(r.confidence)}">${h(r.confidence) || '—'}</td>
      <td><span class="truncate" title="${h(r.evidence)}">${h(r.evidence) || '—'}</span></td>
    </tr>`;
  }).join('');

  return `<table id="accounts-table">${thead}<tbody>${bodyRows}</tbody></table>`;
}

/**
 * Render an aggregated accounts-summary HTML for a batch OSINT run.
 *
 * @param {string} stagingDir  dir containing _summary.json + per-KOL identity JSON
 * @param {string} outDir      where to write accounts-summary.html
 * @param {object} [opts]
 * @param {string} [opts.batchId]
 * @returns {string|null}  written HTML path, or null if no data
 */
export function renderAccountsSummary(stagingDir, outDir, opts = {}) {
  if (!existsSync(stagingDir)) return null;
  const { rows, kolCount, generated_at } = buildRows(stagingDir);
  if (!rows.length) return null;

  const verifiedCount  = rows.filter(r => r.kind === 'verified').length;
  const suspectedCount = rows.length - verifiedCount;
  const date = new Date(generated_at ?? Date.now())
    .toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });

  const body = `
<div class="report-header">
  <h1>OSINT 账号汇总</h1>
  <div class="meta">生成时间：${h(date)} &nbsp;|&nbsp; KOL 数：${kolCount} &nbsp;|&nbsp; 账号数：${rows.length}${opts.batchId ? ` &nbsp;|&nbsp; Batch：${h(opts.batchId)}` : ''}</div>
</div>

<div class="container">

  <div class="cards">
    <div class="card"><div class="card-label">KOL 数</div><div class="card-value">${kolCount}</div></div>
    <div class="card"><div class="card-label">账号总数</div><div class="card-value">${rows.length}</div></div>
    <div class="card"><div class="card-label">已验证</div><div class="card-value" style="color:var(--ok)">${verifiedCount}</div></div>
    <div class="card"><div class="card-label">疑似</div><div class="card-value" style="color:var(--warn)">${suspectedCount}</div></div>
  </div>

  <div class="section">
    <div class="section-header">
      <div class="section-title">账号汇总 <span class="count-pill" id="row-count">${rows.length} 条</span></div>
      ${copyButton('accounts-table', '复制为 TSV（当前筛选）')}
    </div>
    <div class="toolbar" style="margin-bottom:12px">
      <input id="search" class="search" type="search" placeholder="搜索 KOL 名称 / Handle / URL …" autocomplete="off"/>
      <span class="filter-chip active" data-kind="all">全部</span>
      <span class="filter-chip" data-kind="verified">已验证</span>
      <span class="filter-chip" data-kind="suspected">疑似</span>
    </div>
    <div class="table-wrap">
      ${buildTable(rows)}
    </div>
    <div class="section-note">粘贴到 Google Sheets / Excel 时选「使用制表符分隔」。复制 TSV 只导出当前筛选结果。</div>
  </div>

</div>
`;

  const html = htmlShell({
    title:    `OSINT 账号汇总 — ${kolCount} 个 KOL`,
    extraCss: REPORT_CSS,
    body,
    scripts:  FILTER_SCRIPT,
  });

  const outPath = join(outDir, 'accounts-summary.html');
  writeFileSync(outPath, html, 'utf-8');
  return outPath;
}
