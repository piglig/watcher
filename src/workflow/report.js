/**
 * report.js — Render a KOL investigation Markdown report from workflow outputs.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

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

function renderIdentity(osint) {
  const id = osint.kol_identity ?? {};
  const langs = (id.languages ?? []).join(', ') || '—';
  return [
    `## 身份图谱`,
    ``,
    `- **主要名称**：${mdEscape(id.primary_name ?? '—')}`,
    `- **真实姓名**：${mdEscape(id.real_name ?? '—')}`,
    `- **活动地区**：${mdEscape(id.region ?? '—')}`,
    `- **语言**：${langs}`,
    `- **商务邮箱**：${mdEscape(id.business_email ?? '—')}`,
    ``,
  ].join('\n');
}

function renderAccounts(osint) {
  const verified  = osint.verified_accounts  ?? [];
  const suspected = osint.suspected_accounts ?? [];
  const lines = [`## 账号清单`, ``];

  lines.push(`### 已验证账号（${verified.length}）`, ``);
  if (verified.length === 0) {
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
  if (suspected.length === 0) {
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

function renderScrape(scrape) {
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

function renderRisk(classifyJSON) {
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
  // average each category across all users weighted by post_count
  const catSums = {};
  const catCnt  = {};
  for (const u of users) {
    for (const [c, v] of Object.entries(u.category_averages ?? {})) {
      catSums[c] = (catSums[c] ?? 0) + v * (u.post_count ?? 1);
      catCnt[c]  = (catCnt[c]  ?? 0) + (u.post_count ?? 1);
    }
  }
  for (const c of Object.keys(catSums).sort()) {
    const avg = catCnt[c] ? (catSums[c] / catCnt[c]).toFixed(2) : '—';
    lines.push(`| ${c} | ${avg} |`);
  }
  lines.push(``);

  // Top flagged posts (across all users)
  const flagged = users.flatMap(u => (u.flagged_posts ?? []).map(p => ({ ...p, _user: u.username })))
    .sort((a, b) => Math.max(...Object.values(b.score ?? {})) - Math.max(...Object.values(a.score ?? {})))
    .slice(0, 10);

  if (flagged.length) {
    lines.push(`### 高危帖子 TOP ${flagged.length}`, ``);
    lines.push(`| 用户 | 维度 | 分 | 时间 | 链接 | 摘录 |`);
    lines.push(`|---|---|---|---|---|---|`);
    for (const p of flagged) {
      const topCat = Object.entries(p.score ?? {}).sort((a,b) => b[1] - a[1])[0];
      const cat    = topCat ? `${topCat[0]} ` : '—';
      const score  = topCat ? topCat[1] : '';
      lines.push(`| @${p._user} | ${cat} | ${score} | ${p.created_at ?? ''} | ${p.url ?? ''} | ${mdEscape((p.text ?? '').slice(0, 120))} |`);
    }
    lines.push(``);
  }
  return lines.join('\n');
}

function renderProvenance(wf) {
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

/**
 * Render the full report and write to <out_dir>/report.md. Returns the path.
 */
export function renderReport(wf) {
  const osintSlug = wf.osint?.slug;
  const osintJson = osintSlug && wf.osint?.result_dir
    ? safeReadJSON(join(wf.osint.result_dir, `${osintSlug}.json`))
    : null;

  const classifyJson = wf.classify?.out_dir
    ? safeReadJSON(findLatestClassifyJSON(wf.classify.out_dir))
    : null;

  const md = [
    `# ${wf.kol?.name ?? '—'} — 风险审查报告`,
    ``,
    `**生成时间**：${new Date().toISOString()}  `,
    `**Seed URL**：${wf.kol?.seed_url ?? '—'}  `,
    ``,
    osintJson ? renderIdentity(osintJson) : `## 身份图谱\n\n_OSINT 输出未找到。_\n`,
    osintJson ? renderAccounts(osintJson) : '',
    renderScrape(wf.scrape ?? {}),
    renderRisk(classifyJson),
    renderProvenance(wf),
  ].filter(Boolean).join('\n');

  const path = join(wf.out_dir, 'report.md');
  writeFileSync(path, md, 'utf-8');
  return path;
}
