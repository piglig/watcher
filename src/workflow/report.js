/**
 * report.js — Render KOL investigation reports (Markdown + HTML) from workflow outputs.
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { h, htmlShell, copyButton } from '../shared/report-kit.js';

// ── Shared helpers ────────────────────────────────────────────────────────────

function safeReadJSON(path) {
  try { return JSON.parse(readFileSync(path, 'utf-8')); }
  catch { return null; }
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
  facebook:  'Facebook',
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

function pickFollowers(...vals) {
  for (const v of vals) {
    if (v == null) continue;
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/** Read profile + follower count from a scraped JSON file. */
function readProfileFromFile(filePath) {
  try {
    const data = safeReadJSON(filePath);
    if (!data) return {};
    const profile = data.profile ?? {};
    const items   = data.posts ?? [];
    const first   = items[0];
    return {
      username:  profile.username  ?? profile.handle   ?? profile.login
                 ?? first?.author?.username ?? null,
      // Author id surfaced by the scraper (YouTube channel id, Instagram numeric
      // id, etc.). Needed to match against classifier user_risks by author_id,
      // because the classifier groups by post.author.id which may differ from
      // the @handle stored in profile.handle.
      authorId:  profile.id ?? first?.author?.id ?? null,
      // Display name (e.g. YouTube channel title "space_man777_ XTRA") — the
      // classifier records this as `u.username` for platforms whose posts
      // don't carry a stable @handle (YouTube), so it's a fallback match key.
      displayName: profile.name ?? profile.display_name ?? profile.nickname
                 ?? profile.title ?? first?.author?.name ?? null,
      followers: pickFollowers(profile.followers, profile.follower_count, first?.author?.followers),
      name:      profile.name      ?? profile.display_name ?? profile.nickname
                 ?? profile.title  ?? null,
      verified:  profile.verified  ?? first?.author?.verified ?? false,
    };
  } catch { return {}; }
}

// Collapse handle variants ("@Space_Man777_", "space_man777_ XTRA",
// "Space-Man777") to a single token so user_risks built from post.author
// (display name) can match scrape profiles (URL handle).
function tokenizeHandle(s) {
  return String(s ?? '').replace(/^@+/, '').replace(/[\s_\-.]/g, '').toLowerCase();
}

const OSINT_PLATFORM_ALIASES = {
  twitter: ['x', 'twitter', 'x (twitter)', 'x/twitter'],
  tiktok:  ['tiktok'],
  reddit:  ['reddit'],
  threads: ['threads'],
  pixiv:   ['pixiv'],
  naver:   ['naver', 'naver café', 'naver cafe', 'naver blog'],
  youtube: ['youtube'],
  instagram: ['instagram'],
  twitch:  ['twitch'],
  bluesky: ['bluesky', 'bsky', 'bluesky (bsky)'],
  facebook:['facebook', 'fb', 'meta'],
};

function normalizePlatform(raw) {
  const p = String(raw ?? '').trim().toLowerCase();
  for (const [id, aliases] of Object.entries(OSINT_PLATFORM_ALIASES)) {
    if (aliases.includes(p)) return id;
  }
  return p;
}

function osintHandle(a) {
  const h = String(a.handle_id ?? '').replace(/^@+/, '').trim();
  if (h) return h;
  const m = String(a.url ?? '').match(/[\/@]([A-Za-z0-9_.\-]+)\/?$/);
  return m ? m[1] : '';
}

// (The ~70-line `findIdentityForWorkflow` fuzzy matcher that lived here is
// now dead. wf.out_dir is `<outRoot>/<kol_id>` by construction — identity.json
// is always at the canonical path. The fuzzy matcher only existed because
// scrape used to derive a different slug from a different field than OSINT,
// orphaning identity files from their reports. With kol_id unified, the
// problem doesn't exist any more.)

/**
 * Pull country/location hints from every platform's scrape JSON + cached
 * profile snapshot. Surfaces per-platform nationality (YouTube `country`,
 * Instagram bio `location`, etc.) so the identity section shows it even
 * when OSINT's synthesized `region` field is blank or generic.
 */
function gatherPlatformCountries(wf, scrape) {
  const seen = new Map();   // platform → country (first writer wins)
  const consider = (platform, country) => {
    if (!platform || !country) return;
    const v = String(country).trim();
    if (!v) return;
    if (seen.has(platform)) return;
    seen.set(platform, v);
  };

  for (const sf of (scrape?.saved_files ?? [])) {
    const platform = platformFromPath(sf.file);
    const data = safeReadJSON(sf.file);
    const p = data?.profile ?? {};
    consider(platform, p.country ?? p.location ?? p.locale);
  }
  if (wf?.out_dir) {
    const dir = join(wf.out_dir, 'accounts', 'profiles');
    try {
      for (const f of readdirSync(dir)) {
        if (!f.endsWith('.json')) continue;
        const platform = f.replace(/\.json$/, '');
        const p = safeReadJSON(join(dir, f));
        consider(platform, p?.country ?? p?.location ?? p?.locale);
      }
    } catch { /* dir missing — fine */ }
  }
  return [...seen.entries()].map(([platform, country]) => ({ platform, country }));
}

/** Build enriched account rows merging saved files with classify results. */
function buildAccountRows(kolName, scrape, userRisks, osintJson, profileFallback) {
  // Index user_risks by author_id — the only identifier the classifier exposes
  // that is unique within and across platforms. (We intentionally do NOT fall
  // back to a tokenized-username match: the same handle "space_man777_" lives
  // on TikTok/Twitch/YouTube/IG simultaneously, and user_risks carries no
  // platform field, so a token lookup would silently attach one platform's
  // risk row to another platform's scrape entry.)
  const riskById = {};
  for (const u of (userRisks ?? [])) {
    if (u.author_id != null) riskById[String(u.author_id)] = u;
  }

  // Compute a multi-token identity for each OSINT verified account so a scrape
  // row can be matched against ANY of {handle_id, account_name, URL @handle,
  // URL channel id}. Without this, e.g. a YouTube scrape row keyed on the
  // @handle never matches the OSINT entry keyed on the UC… channel id, and
  // both would emerge as two separate rows (one "scraped", one "未采集").
  const osintAccounts = [];   // { platform, primary, tokens:Set, raw }
  for (const a of (osintJson?.verified_accounts ?? [])) {
    const platform = normalizePlatform(a.platform);
    const primary  = osintHandle(a);
    if (!platform || !primary) continue;
    const tokens = new Set();
    const addTok = (v) => { const t = tokenizeHandle(v); if (t) tokens.add(t); };
    addTok(a.handle_id);
    addTok(a.account_name);
    addTok(primary);
    if (platform === 'youtube') {
      const url = String(a.url ?? '');
      const at  = url.match(/youtube\.com\/@([\w.\-]+)/i);          if (at?.[1]) addTok(at[1]);
      const ch  = url.match(/youtube\.com\/channel\/(UC[\w\-]+)/i); if (ch?.[1]) addTok(ch[1]);
    }
    // Carry the raw account along — we need `topics`, possibly other OSINT
    // fields, when rendering the accounts table.
    osintAccounts.push({ platform, primary, tokens, raw: a });
  }
  const consumedOsint = new Set();   // indexes into osintAccounts

  const rows = [];
  const seen = new Set();   // "platform::token" — dedupe scrape rows

  for (const sf of (scrape?.saved_files ?? [])) {
    const platform = platformFromPath(sf.file);
    const profile  = readProfileFromFile(sf.file);
    const rawUser  = profile.username ?? sf.label ?? '—';
    const username = String(rawUser).replace(/^@+/, '');

    // Every token this scrape row could be known by.
    const rowTokens = new Set();
    const addRow = (v) => { const t = tokenizeHandle(v); if (t) rowTokens.add(t); };
    addRow(username);
    addRow(profile.authorId);
    addRow(profile.displayName);

    const primaryToken = tokenizeHandle(username);
    const dedupKey = `${platform}::${primaryToken || username.toLowerCase()}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    const risk = profile.authorId != null ? (riskById[String(profile.authorId)] ?? null) : null;
    const followers = profile.followers
      ?? profileFallback?.(platform, username)
      ?? null;

    // Match an OSINT verified account by any token overlap on the same
    // platform. Consume it so it isn't re-emitted as "未采集" below, and
    // capture its topics so we can surface them on this row.
    let verified = false;
    let matchedTopics = [];
    for (let i = 0; i < osintAccounts.length; i++) {
      if (consumedOsint.has(i)) continue;
      const oa = osintAccounts[i];
      if (oa.platform !== platform) continue;
      let hit = false;
      for (const t of oa.tokens) if (rowTokens.has(t)) { hit = true; break; }
      if (hit) {
        verified = true;
        matchedTopics = Array.isArray(oa.raw?.topics) ? oa.raw.topics : [];
        consumedOsint.add(i);
        break;
      }
    }

    rows.push({
      kolName,
      platform,
      platformLabel: PLATFORM_LABELS[platform] ?? platform,
      username,
      followers,
      postCount:  sf.count ?? 0,
      riskScore:  risk?.risk_score  ?? null,
      riskLevel:  risk?.risk_level  ?? null,
      isViolation: risk ? (risk.risk_level === 'critical' || risk.risk_level === 'high') : null,
      flaggedCount: risk?.flagged_post_count ?? null,
      topCategories: risk?.top_categories ?? [],
      categoryAverages: risk?.category_averages ?? {},
      flaggedPosts: risk?.flagged_posts ?? [],
      topics:      matchedTopics,
      verified,
      scraped:     true,
    });
  }

  // Remaining OSINT verified accounts had no scrape row to attach to.
  for (let i = 0; i < osintAccounts.length; i++) {
    if (consumedOsint.has(i)) continue;
    const { platform, primary, raw } = osintAccounts[i];
    rows.push({
      kolName,
      platform,
      platformLabel: PLATFORM_LABELS[platform] ?? platform,
      username:      primary,
      followers:     null,
      postCount:     null,
      riskScore:     null,
      riskLevel:     null,
      isViolation:   null,
      flaggedCount:  null,
      topCategories: [],
      categoryAverages: {},
      flaggedPosts:  [],
      topics:        Array.isArray(raw?.topics) ? raw.topics : [],
      verified:      true,
      scraped:       false,
    });
  }

  return rows;
}

// ── Markdown sections ─────────────────────────────────────────────────────────

function renderIdentityMd(osint, platformCountries = []) {
  const id   = osint?.kol_identity ?? {};
  const langs = (id.languages ?? []).join(', ') || '—';
  const countryLine = platformCountries.length
    ? `- **国家 / 地点**：${platformCountries.map(p => `${mdEscape(p.country)}（${PLATFORM_LABELS[p.platform] ?? p.platform}）`).join('、')}`
    : null;
  return [
    `## 身份图谱`, ``,
    `- **主要名称**：${mdEscape(id.primary_name ?? '—')}`,
    `- **真实姓名**：${mdEscape(id.real_name ?? '—')}`,
    `- **活动地区**：${mdEscape(id.region ?? '—')}`,
    countryLine,
    `- **语言**：${langs}`,
    `- **商务邮箱**：${mdEscape(id.business_email ?? '—')}`,
    ``,
  ].filter(v => v !== null).join('\n');
}

function renderAccountsMd(osint) {
  const verified  = osint.verified_accounts  ?? [];
  const suspected = osint.suspected_accounts ?? [];
  const lines = [`## 账号清单`, ``];

  lines.push(`### 已验证账号（${verified.length}）`, ``);
  if (!verified.length) {
    lines.push(`_无_`, ``);
  } else {
    lines.push(`| 平台 | 类型 | Handle | URL | 状态 | 置信度 | 话题 | 证据 |`);
    lines.push(`|---|---|---|---|---|---|---|---|`);
    for (const a of verified) {
      const ev = Array.isArray(a.verification_evidence)
        ? a.verification_evidence.join('；')
        : (a.verification_evidence ?? '');
      const topics = Array.isArray(a.topics) && a.topics.length
        ? a.topics.map(t => mdEscape(t)).join('、')
        : '—';
      lines.push(`| ${mdEscape(a.platform)} | ${a.account_type ?? ''} | ${mdEscape(a.handle_id ?? '')} | ${a.url ?? ''} | ${a.status ?? ''} | ${a.confidence_score ?? ''} | ${topics} | ${mdEscape(ev)} |`);
    }
    lines.push(``);
  }
  lines.push(`### 疑似账号（${suspected.length}）`, ``);
  if (!suspected.length) {
    lines.push(`_无_`, ``);
  } else {
    lines.push(`| 平台 | URL | 置信度 | 话题 | 理由 |`);
    lines.push(`|---|---|---|---|---|`);
    for (const a of suspected) {
      const topics = Array.isArray(a.topics) && a.topics.length
        ? a.topics.map(t => mdEscape(t)).join('、')
        : '—';
      lines.push(`| ${mdEscape(a.platform)} | ${a.url ?? ''} | ${a.confidence_score ?? ''} | ${topics} | ${mdEscape(a.reason ?? '')} |`);
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

  // ── 高危帖子 first (reviewers want actionable evidence up top) ───────────
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

  // ── 维度均值 second (supporting analysis) ──────────────────────────────
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

  return lines.join('\n');
}

function renderProvenanceMd(wf) {
  const lines = [`## 任务凭证`, ``];
  lines.push(`- **Workflow ID**：${wf.id}`);
  lines.push(`- **KOL 目录**：${wf.out_dir ?? '—'}`);
  lines.push(`- **OSINT batch**：${wf.osint?.batch_id ?? '—'}`);
  lines.push(`- **Classify session**：${wf.classify?.session_id ?? '—'}`);
  lines.push(``);
  return lines.join('\n');
}

// ── HTML report ───────────────────────────────────────────────────────────────

const REPORT_CSS = `
.badge-critical{background:#fce8e6;color:#c5221f}
.badge-high{background:#fef3e0;color:#b05a00}
.badge-medium{background:#fff8e1;color:#7b5800}
.badge-low{background:#e6f4ea;color:#137333}
.badge-yes{background:#fce8e6;color:#c5221f;font-weight:700}
.badge-no{background:#e6f4ea;color:#137333}
.badge-source-rules{background:#e8f0fe;color:#1967d2}
.badge-source-llm{background:#f1f3f4;color:#5f6368}
.badge-source-whitelist{background:#e6f4ea;color:#137333}
.badge-verified{background:#e6f4ea;color:#137333;margin-left:4px}
.badge-unscraped{background:#f1f3f4;color:#5f6368;margin-left:4px}
.split-stat{display:flex;justify-content:space-between;font-size:13px;color:#3c4043;padding:2px 0}
.split-stat .k{color:var(--gray)}
.split-stat .v{font-weight:600;font-variant-numeric:tabular-nums}
.score-bar{display:flex;align-items:center;gap:8px}
.score-bar-bg{width:60px;height:6px;background:#e8eaed;border-radius:3px;flex-shrink:0}
.score-bar-fill{height:6px;border-radius:3px;background:var(--danger)}
.tags{display:flex;flex-wrap:wrap;gap:4px}
.tag{padding:2px 6px;background:#e8eaed;border-radius:4px;font-size:12px;color:#3c4043}
.identity-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 32px}
.identity-row{display:flex;gap:12px;padding:8px 0;border-bottom:1px solid var(--border)}
.identity-row:last-child{border-bottom:none}
.identity-label{color:var(--gray);min-width:90px;font-size:13px;flex-shrink:0}
.identity-value{font-size:13px;font-weight:500;word-break:break-all}
`.trim();

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

function profileUrl(platform, username) {
  const u = String(username ?? '').replace(/^@+/, '');
  switch (platform) {
    case 'twitter':   return `https://x.com/${u}`;
    case 'tiktok':    return `https://tiktok.com/@${u}`;
    case 'youtube':   return `https://youtube.com/@${u}`;
    case 'threads':   return `https://threads.net/@${u}`;
    case 'instagram': return `https://instagram.com/${u}`;
    case 'reddit':    return `https://reddit.com/user/${u}`;
    case 'twitch':    return `https://twitch.tv/${u}`;
    case 'bluesky':   return `https://bsky.app/profile/${u}`;
    case 'facebook':  return /^\d+$/.test(u) ? `https://www.facebook.com/profile.php?id=${u}` : `https://www.facebook.com/${u}`;
    default:          return `https://${platform}.com/${u}`;
  }
}

function buildAccountsTable(rows, kolName) {
  const thead = `<thead><tr>
    <th>KOL 名称</th><th>渠道</th><th>渠道账号</th><th>粉丝数</th>
    <th>风险评分</th><th>风险等级</th><th>是否违规</th><th>标记内容数</th><th>采集数</th>
    <th>主要话题</th><th>主要风险类别</th>
  </tr></thead>`;

  const bodyRows = rows.map((r, i) => {
    const score     = r.riskScore ?? null;
    const scoreBar  = score !== null
      ? `<div class="score-bar"><div class="score-bar-bg"><div class="score-bar-fill" style="width:${score}%"></div></div><span>${score}</span></div>`
      : '—';
    const cats = r.topCategories.length
      ? `<div class="tags">${r.topCategories.map(c => `<span class="tag">${h(CATEGORY_LABELS[c] ?? c)}</span>`).join('')}</div>`
      : '—';
    const topics = Array.isArray(r.topics) && r.topics.length
      ? `<div class="tags">${r.topics.map(t => `<span class="tag">${h(t)}</span>`).join('')}</div>`
      : '—';
    const followersRaw = r.followers != null ? String(r.followers) : '';
    const kolCell = i === 0
      ? `<td rowspan="${Math.max(rows.length, 1)}" style="vertical-align:middle;text-align:center;font-size:14px"><b>${h(kolName)}</b></td>`
      : '';
    const verifiedTag = r.verified ? '<span class="badge badge-verified nocopy" title="OSINT 已验证账号">✓ 已验证</span>' : '';
    const notScrapedNote = !r.scraped ? '<span class="badge badge-unscraped nocopy" title="OSINT 发现但未采集">未采集</span>' : '';
    return `<tr>
      ${kolCell}
      <td>${h(r.platformLabel)}</td>
      <td><a href="${h(profileUrl(r.platform, r.username))}" target="_blank">@${h(r.username)}</a> ${verifiedTag} ${notScrapedNote}</td>
      <td class="num" data-value="${followersRaw}">${fmtNumber(r.followers)}</td>
      <td class="num" data-value="${score ?? ''}">${scoreBar}</td>
      <td>${riskBadge(r.riskLevel)}</td>
      <td>${violationBadge(r.isViolation)}</td>
      <td class="num" data-value="${r.flaggedCount ?? ''}">${r.flaggedCount ?? '—'}</td>
      <td class="num" data-value="${r.postCount ?? ''}">${r.postCount ?? '—'}</td>
      <td>${topics}</td>
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

function sourceBadge(source) {
  if (source === 'rules')
    return '<span class="badge badge-source-rules" title="本地规则引擎命中（关键词/模式/结构信号），未发往 LLM">规则</span>';
  if (source === 'whitelist')
    return '<span class="badge badge-source-whitelist" title="命中白名单短文本，跳过 LLM">白名单</span>';
  return '<span class="badge badge-source-llm" title="经 AI 模型判定">AI</span>';
}

function buildFlaggedTable(rows) {
  const allFlagged = rows
    .flatMap(r => r.flaggedPosts.map(p => ({ ...p, _username: r.username, _platform: r.platformLabel })))
    .sort((a, b) => Math.max(...Object.values(b.score ?? {})) - Math.max(...Object.values(a.score ?? {})))
    .slice(0, 50);

  if (!allFlagged.length) return '<p style="color:var(--gray);font-size:13px">无高危内容记录。</p>';

  const thead = `<thead><tr>
    <th>账号</th><th>渠道</th><th>日期</th><th>来源</th><th>最高风险维度</th><th>风险分</th><th>内容摘录</th>
  </tr></thead>`;

  const bodyRows = allFlagged.map(p => {
    const topCat = Object.entries(p.score ?? {}).sort((a, b) => b[1] - a[1])[0];
    const catLabel = topCat ? (CATEGORY_LABELS[topCat[0]] ?? topCat[0]) : '—';
    const score    = topCat ? topCat[1] : '';
    const text     = (p.text ?? '').replace(/\n/g, ' ').slice(0, 100);
    const date     = p.created_at ? p.created_at.slice(0, 10) : '—';
    const reasonLines = Object.entries(p.reasons ?? {})
      .map(([cat, r]) => `${CATEGORY_LABELS[cat] ?? cat}: ${r}`)
      .join('\n');
    const tooltip = reasonLines ? `${text}\n\n— 命中理由 —\n${reasonLines}` : text;
    const excerpt = p.url
      ? `<a href="${h(p.url)}" target="_blank" class="truncate" title="${h(tooltip)}\n\n${h(p.url)}">${h(text)}</a>`
      : `<span class="truncate" title="${h(tooltip)}">${h(text)}</span>`;
    return `<tr>
      <td>@${h(p._username)}</td>
      <td>${h(p._platform)}</td>
      <td>${h(date)}</td>
      <td data-value="${h(p.source ?? 'llm')}">${sourceBadge(p.source)}</td>
      <td><span class="badge badge-${score >= 3 ? 'critical' : score >= 2 ? 'high' : 'medium'}">${h(catLabel)}</span></td>
      <td class="num" data-value="${score}">${score}</td>
      <td>${excerpt}</td>
    </tr>`;
  }).join('');

  return `<table id="flagged-table">${thead}<tbody>${bodyRows}</tbody></table>`;
}

function formatHistorical(a) {
  if (!Array.isArray(a.historical_handles) || !a.historical_handles.length) return '';
  return `<div style="font-size:11px;color:var(--gray);margin-top:3px">曾用：${a.historical_handles.map(x => h(x)).join('、')}</div>`;
}

function formatTopics(a) {
  if (!Array.isArray(a.topics) || !a.topics.length) return '<span style="color:var(--gray)">—</span>';
  return `<div class="tags">${a.topics.map(t => `<span class="tag">${h(t)}</span>`).join('')}</div>`;
}

function buildIdentitySection(osint, platformCountries = []) {
  const id   = osint?.kol_identity ?? {};
  const verified  = osint?.verified_accounts  ?? [];
  const suspected = osint?.suspected_accounts ?? [];

  const countryHint = platformCountries
    .map(p => `${h(p.country)} <span style="color:var(--gray);font-size:12px">(${h(PLATFORM_LABELS[p.platform] ?? p.platform)})</span>`)
    .join('、');

  const rawRows = [
    ['主要名称',     id.primary_name,                              true],
    ['真实姓名',     id.real_name,                                 true],
    ['活动地区',     id.region,                                    true],
    ['国家 / 地点',  countryHint,                                  false /* already escaped */],
    ['语言',         (id.languages ?? []).join(', '),              true],
    ['商务邮箱',     id.business_email,                            true],
  ].filter(([, v]) => v);

  // Empty state — surface why the section is blank rather than dropping it.
  if (!rawRows.length && !verified.length && !suspected.length) {
    return `
  <div class="section">
    <div class="section-header"><div class="section-title">身份图谱</div></div>
    <p style="color:var(--gray);font-size:13px">未找到 OSINT 身份信息：<code>accounts/identity.json</code> 缺失或为空。可能是采集任务的 subject 名称与 OSINT 输出的 slug 不一致，导致两份数据落在不同目录。</p>
  </div>`;
  }

  const idRows = rawRows.map(([l, v, esc]) =>
    `<div class="identity-row"><div class="identity-label">${h(l)}</div><div class="identity-value">${esc ? h(v) : v}</div></div>`
  ).join('');

  const verTable = verified.length ? `
    <table id="identity-verified-table" style="margin-top:12px">
      <thead><tr><th>平台</th><th>类型</th><th>Handle</th><th>URL</th><th>状态</th><th>置信度</th><th>话题</th></tr></thead>
      <tbody>${verified.map(a => `<tr>
        <td>${h(a.platform)}</td><td>${h(a.account_type ?? '')}</td>
        <td>${h(a.handle_id ?? '')}${formatHistorical(a)}</td>
        <td>${a.url ? `<a href="${h(a.url)}" target="_blank">${h(a.url)}</a>` : '—'}</td>
        <td>${h(a.status ?? '')}</td><td>${h(a.confidence_score ?? '')}</td>
        <td>${formatTopics(a)}</td>
      </tr>`).join('')}</tbody>
    </table>` : '<p style="color:var(--gray);font-size:13px;margin-top:8px">无已验证账号。</p>';

  const suspTable = suspected.length ? `
    <table id="identity-suspected-table" style="margin-top:12px">
      <thead><tr><th>平台</th><th>Handle</th><th>URL</th><th>置信度</th><th>理由</th><th>话题</th></tr></thead>
      <tbody>${suspected.map(a => `<tr>
        <td>${h(a.platform)}</td>
        <td>${h(a.handle_id ?? '')}${formatHistorical(a)}</td>
        <td>${a.url ? `<a href="${h(a.url)}" target="_blank">${h(a.url)}</a>` : '—'}</td>
        <td>${h(a.confidence_score ?? '')}</td>
        <td>${h(a.reason ?? '')}</td>
        <td>${formatTopics(a)}</td>
      </tr>`).join('')}</tbody>
    </table>` : null;

  return `
  <div class="section">
    <div class="section-header"><div class="section-title">身份图谱</div></div>
    <div class="identity-grid">${idRows}</div>
    <div style="margin-top:20px">
      <div class="section-header">
        <div class="section-title" style="font-size:14px">已验证账号（${verified.length}）</div>
        ${verified.length ? copyButton('identity-verified-table', '复制为 TSV', { skipHeader: true }) : ''}
      </div>
      ${verTable}
    </div>${suspTable ? `
    <div style="margin-top:20px">
      <div class="section-header">
        <div class="section-title" style="font-size:14px">疑似账号（${suspected.length}）</div>
        ${copyButton('identity-suspected-table', '复制为 TSV', { skipHeader: true })}
      </div>
      ${suspTable}
    </div>` : ''}
  </div>`;
}

function renderHtmlReport(wf, osintJson, classifyJson, platformCountries = []) {
  const userRisks = classifyJson?.user_risks ?? [];

  const profileCache = new Map();
  const profileFallback = (platform, _username) => {
    if (!platform || !wf.out_dir) return null;
    if (profileCache.has(platform)) return profileCache.get(platform);
    const p = safeReadJSON(join(wf.out_dir, 'accounts', 'profiles', `${platform}.json`));
    const followers = pickFollowers(p?.followers, p?.follower_count);
    profileCache.set(platform, followers);
    return followers;
  };

  const rows = buildAccountRows(wf.kol?.name ?? '—', wf.scrape ?? {}, userRisks, osintJson, profileFallback);

  const totalFollowers  = rows.reduce((s, r) => s + (r.followers ?? 0), 0);
  const violationCount  = rows.filter(r => r.isViolation).length;
  const totalPosts      = rows.reduce((s, r) => s + (r.postCount ?? 0), 0);
  const flaggedCount    = rows.reduce((s, r) => s + (r.flaggedCount ?? 0), 0);

  const date = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });

  const body = `
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
    ${classifyJson ? `
    <div class="card" title="规则：本地正则/结构信号直接判定，未发往 AI&#10;AI：经模型判定&#10;白名单：识别为安全短文本，跳过 AI">
      <div class="card-label">判定分流</div>
      <div style="margin-top:6px">
        <div class="split-stat"><span class="k">规则</span><span class="v">${classifyJson.source_stats.rules}</span></div>
        <div class="split-stat"><span class="k">AI</span><span class="v">${classifyJson.source_stats.llm}</span></div>
        <div class="split-stat"><span class="k">白名单</span><span class="v">${classifyJson.source_stats.whitelist}</span></div>
      </div>
    </div>` : ''}
  </div>

  <!-- Identity -->
  ${buildIdentitySection(osintJson, platformCountries)}

  <!-- Accounts summary table -->
  <div class="section">
    <div class="section-header">
      <div class="section-title">账号汇总</div>
      ${copyButton('accounts-table', '复制为 TSV（Excel / Google Sheets）', { skipHeader: true })}
    </div>
    <div class="table-wrap">
      ${buildAccountsTable(rows, wf.kol?.name ?? '—')}
    </div>
    <div class="section-note">粘贴到 Google Sheets / Excel 时请选择"使用制表符分隔"。</div>
  </div>

  <!-- Flagged posts — placed before dimension breakdown because actionable
       evidence is what reviewers reach for first; the dimension matrix is
       supporting analysis. -->
  ${userRisks.length ? `
  <div class="section">
    <div class="section-header">
      <div class="section-title">高危内容明细（Top 50）</div>
      ${copyButton('flagged-table', '复制为 TSV（Excel / Google Sheets）', { skipHeader: true })}
    </div>
    <div class="table-wrap">
      ${buildFlaggedTable(rows)}
    </div>
  </div>` : ''}

  <!-- Risk dimensions -->
  ${userRisks.length ? `
  <div class="section">
    <div class="section-header">
      <div class="section-title">风险维度分析（各账号）</div>
      ${copyButton('risk-table', '复制为 TSV（Excel / Google Sheets）', { skipHeader: true })}
    </div>
    <div class="table-wrap">
      ${buildRiskTable(rows)}
    </div>
    <div class="section-note">各维度评分范围 0–3，数值越高风险越大。</div>
  </div>` : ''}

</div>
`;

  return htmlShell({
    title:    `风险审查报告 — ${wf.kol?.name ?? '—'}`,
    extraCss: REPORT_CSS,
    body,
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Render the full report and write report.md + report.html. Returns { mdPath, htmlPath }.
 */
export function renderReport(wf) {
  // OSINT identity lives at the canonical path because wf.out_dir is
  // kolDir(outRoot, kol_id) by construction. Direct read, no fallback.
  const osintJson = wf.out_dir
    ? safeReadJSON(join(wf.out_dir, 'accounts', 'identity.json'))
    : null;

  // Classify result: <wfDir>/analysis/<session_id>/summary.json
  const classifyJson = wf.classify?.session_id && wf.out_dir
    ? safeReadJSON(join(wf.out_dir, 'analysis', wf.classify.session_id, 'summary.json'))
    : null;

  // Per-platform country/location hints aggregated from scrape profiles —
  // surfaces nationality even when OSINT's `region` is blank or generic.
  const platformCountries = gatherPlatformCountries(wf, wf.scrape ?? {});

  // ── Markdown ──────────────────────────────────────────────────────────────
  const md = [
    `# ${wf.kol?.name ?? '—'} — 风险审查报告`,
    ``,
    `**生成时间**：${new Date().toISOString()}  `,
    `**Seed URL**：${wf.kol?.seed_url ?? '—'}  `,
    ``,
    osintJson
      ? renderIdentityMd(osintJson, platformCountries)
      : (platformCountries.length
          ? renderIdentityMd(null, platformCountries) + `\n_OSINT 身份输出未找到（accounts/identity.json 缺失）。仅显示采集到的平台国家信息。_\n`
          : `## 身份图谱\n\n_OSINT 输出未找到（accounts/identity.json 缺失或为空）。_\n`),
    osintJson ? renderAccountsMd(osintJson) : '',
    renderScrapeMd(wf.scrape ?? {}),
    renderRiskMd(classifyJson),
    renderProvenanceMd(wf),
  ].filter(Boolean).join('\n');

  const mdPath   = join(wf.out_dir, 'report.md');
  writeFileSync(mdPath, md, 'utf-8');

  // ── HTML ──────────────────────────────────────────────────────────────────
  const html     = renderHtmlReport(wf, osintJson, classifyJson, platformCountries);
  const htmlPath = join(wf.out_dir, 'report.html');
  writeFileSync(htmlPath, html, 'utf-8');

  return htmlPath;
}
