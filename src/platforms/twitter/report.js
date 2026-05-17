/**
 * report.js — HTML Report Generator
 * Aesthetic: SIGNAL — deep-space black + amber, radar-terminal meets editorial
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

// ── Activity chart SVG ────────────────────────────────────────────────────────

function buildActivityChart(tweets) {
  const buckets = {};
  for (const t of tweets) {
    if (!t.created_at) continue;
    const d   = new Date(t.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    buckets[key] = (buckets[key] ?? 0) + 1;
  }
  const sorted = Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b));
  if (!sorted.length) return '';

  const max    = Math.max(...sorted.map(([, v]) => v));
  const W = 860, H = 100;
  const PAD = { top: 8, right: 4, bottom: 28, left: 36 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;
  const n  = sorted.length;
  const step = cW / n;
  const barW = Math.max(3, Math.floor(step * 0.65));

  const bars = sorted.map(([label, count], i) => {
    const barH  = Math.max(2, Math.round((count / max) * cH));
    const x     = PAD.left + i * step + (step - barW) / 2;
    const y     = PAD.top + cH - barH;
    const alpha = 0.25 + 0.75 * (count / max);
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW}" height="${barH}"
      rx="2" fill="rgba(245,166,35,${alpha.toFixed(2)})" filter="url(#barGlow)">
      <title>${label}: ${count} posts</title></rect>`;
  }).join('');

  const every = Math.ceil(n / 10);
  const labels = sorted.map(([label], i) => {
    if (i % every !== 0) return '';
    const x = PAD.left + i * step + step / 2;
    return `<text x="${x.toFixed(1)}" y="${H - 6}" text-anchor="middle"
      fill="#3a5068" font-size="8.5" font-family="'Space Mono',monospace">${label.slice(2)}</text>`;
  }).join('');

  const gridLines = [0.25, 0.5, 0.75, 1].map(f => {
    const y = (PAD.top + cH * (1 - f)).toFixed(1);
    const v = Math.round(f * max);
    return `<line x1="${PAD.left}" y1="${y}" x2="${W - PAD.right}" y2="${y}"
      stroke="#111d2e" stroke-width="1"/>
      <text x="${PAD.left - 5}" y="${y}" text-anchor="end" dominant-baseline="middle"
      fill="#3a5068" font-size="8" font-family="'Space Mono',monospace">${v}</text>`;
  }).join('');

  return `
    <div class="chart-section">
      <div class="section-label">POSTING FREQUENCY</div>
      <div class="chart-wrap">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"
             style="width:100%;height:${H}px;overflow:visible;display:block">
          <defs>
            <filter id="barGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          ${gridLines}${bars}${labels}
        </svg>
      </div>
    </div>`;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function buildStats(tweets) {
  if (!tweets.length) return '';
  const orig  = tweets.filter(t => !t.is_retweet && !t.is_reply).length;
  const rts   = tweets.filter(t =>  t.is_retweet).length;
  const reps  = tweets.filter(t =>  t.is_reply && !t.is_retweet).length;
  const likes = tweets.reduce((s, t) => s + (t.metrics?.likes    ?? 0), 0);
  const retws = tweets.reduce((s, t) => s + (t.metrics?.retweets ?? 0), 0);
  const views = tweets.reduce((s, t) => s + (t.metrics?.views    ?? 0), 0);
  const repls = tweets.reduce((s, t) => s + (t.metrics?.replies  ?? 0), 0);
  const avg   = Math.round(likes / (tweets.length || 1));

  const dates   = tweets.filter(t => t.created_at).map(t => new Date(t.created_at));
  const oldest  = dates.length ? new Date(Math.min(...dates)) : null;
  const newest  = dates.length ? new Date(Math.max(...dates)) : null;
  const span    = oldest && newest
    ? `${oldest.toISOString().slice(0,10)} → ${newest.toISOString().slice(0,10)}`
    : '—';

  const items = [
    { n: fmt(tweets.length), label: 'TOTAL POSTS',   sub: `${orig} original · ${rts} RT · ${reps} reply`, accent: '' },
    { n: fmt(likes),         label: 'TOTAL LIKES',   sub: `avg ${fmt(avg)} per post`,                      accent: 'amber' },
    { n: fmt(retws),         label: 'RETWEETS',      sub: 'total received',                                 accent: '' },
    { n: fmt(repls),         label: 'REPLIES',       sub: 'total received',                                 accent: '' },
    { n: fmt(views),         label: 'IMPRESSIONS',   sub: 'total views',                                    accent: 'cyan' },
    { n: span,               label: 'TIME PERIOD',   sub: 'date range',                                     accent: '', wide: true, small: true },
  ];

  const cards = items.map(c => `
    <div class="stat-card${c.wide ? ' stat-wide' : ''}${c.accent ? ` stat-${c.accent}` : ''}">
      <div class="stat-n${c.small ? ' stat-n--sm' : ''}">${c.n}</div>
      <div class="stat-label">${c.label}</div>
      <div class="stat-sub">${c.sub}</div>
    </div>`).join('');

  return `<div class="stats-grid">${cards}</div>`;
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Mono:ital,wght@0,400;0,700;1,400&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --void:        #05080f;
  --deep:        #080d18;
  --surface:     #0c1220;
  --card:        #0f1624;
  --card-h:      #131c2e;
  --border:      #18243a;
  --border-h:    #22344e;
  --amber:       #f5a623;
  --amber-d:     rgba(245,166,35,0.12);
  --amber-g:     rgba(245,166,35,0.06);
  --amber-glow:  0 0 20px rgba(245,166,35,0.25), 0 0 40px rgba(245,166,35,0.08);
  --cyan:        #00cfe0;
  --cyan-d:      rgba(0,207,224,0.10);
  --green:       #00d4a0;
  --red:         #ff4d72;
  --text:        #c8daea;
  --muted:       #5a7a96;
  --dim:         #2e4560;
  --mono:        'Space Mono', 'Courier New', monospace;
  --display:     'Bebas Neue', 'Arial Narrow', sans-serif;
  --body:        'DM Sans', system-ui, sans-serif;
  --r:           10px;
  --r-sm:        6px;
}

html { scroll-behavior: smooth; color-scheme: dark; }

body {
  background: var(--void);
  color: var(--text);
  font-family: var(--body);
  font-size: 13.5px;
  line-height: 1.55;
  min-height: 100vh;
  overflow-x: hidden;
}

/* Scanline texture overlay */
body::before {
  content: '';
  pointer-events: none;
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(0,0,0,0.05) 2px,
    rgba(0,0,0,0.05) 4px
  );
  opacity: 0.4;
}

/* Noise grain overlay */
body::after {
  content: '';
  pointer-events: none;
  position: fixed;
  inset: -200%;
  z-index: 9998;
  width: 500%;
  height: 500%;
  opacity: 0.025;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  animation: grain 0.5s steps(1) infinite;
}

@keyframes grain {
  0%  { transform: translate(0,0); }
  10% { transform: translate(-2%,-3%); }
  20% { transform: translate(3%,1%); }
  30% { transform: translate(-1%,4%); }
  40% { transform: translate(2%,-2%); }
  50% { transform: translate(-3%,2%); }
  60% { transform: translate(1%,-4%); }
  70% { transform: translate(-2%,3%); }
  80% { transform: translate(3%,-1%); }
  90% { transform: translate(-1%,2%); }
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}

.animate { animation: fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both; }
.delay-1 { animation-delay: 0.05s; }
.delay-2 { animation-delay: 0.10s; }
.delay-3 { animation-delay: 0.15s; }
.delay-4 { animation-delay: 0.20s; }

/* ── Header ────────────────────────────────────────────────────── */
.header {
  background: linear-gradient(180deg, #070c18 0%, var(--void) 100%);
  border-bottom: 1px solid var(--border);
  padding: 40px 28px 32px;
  position: relative;
  overflow: hidden;
}

.header::before {
  content: '';
  position: absolute;
  top: -60px; right: -80px;
  width: 360px; height: 360px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(245,166,35,0.07) 0%, transparent 70%);
  pointer-events: none;
}

.header-inner { max-width: 900px; margin: 0 auto; }

.header-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 28px;
  flex-wrap: wrap;
}

.profile-block {}

.profile-eyebrow {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--amber);
  letter-spacing: 2px;
  text-transform: uppercase;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.profile-eyebrow::before {
  content: '';
  display: inline-block;
  width: 20px; height: 1px;
  background: var(--amber);
}

.profile-name {
  font-family: var(--display);
  font-size: clamp(42px, 6vw, 68px);
  letter-spacing: 1px;
  line-height: 0.95;
  color: var(--text);
  margin-bottom: 8px;
}

.profile-handle {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--muted);
}

.profile-handle span { color: var(--amber); }

.header-meta {
  text-align: right;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.archive-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--amber);
  color: var(--amber);
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 2px;
  padding: 4px 10px;
  border-radius: 2px;
  text-transform: uppercase;
}

.archive-badge::before {
  content: '';
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--amber);
  box-shadow: 0 0 6px var(--amber);
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.3; }
}

.gen-time {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--dim);
}

.followers-note {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--muted);
}

/* ── Stats grid ──────────────────────────────────────────────────── */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  margin-bottom: 20px;
}

.stat-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  padding: 14px 16px 12px;
  position: relative;
  overflow: hidden;
  transition: border-color 0.2s, background 0.2s;
}

.stat-card::after {
  content: '';
  position: absolute;
  bottom: 0; left: 0; right: 0;
  height: 2px;
  background: var(--border);
  transition: background 0.2s;
}

.stat-card:hover {
  background: var(--card-h);
  border-color: var(--border-h);
}

.stat-card:hover::after { background: var(--dim); }

.stat-amber::after  { background: rgba(245,166,35,0.5); }
.stat-cyan::after   { background: rgba(0,207,224,0.4); }

.stat-wide { grid-column: span 2; }

.stat-n {
  font-family: var(--display);
  font-size: 32px;
  letter-spacing: 0.5px;
  line-height: 1;
  color: var(--text);
  margin-bottom: 4px;
}

.stat-n--sm {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0;
  line-height: 1.4;
  color: var(--muted);
  font-weight: 400;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-label {
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 1.5px;
  color: var(--muted);
  text-transform: uppercase;
  margin-bottom: 2px;
}

.stat-sub {
  font-size: 10.5px;
  color: var(--dim);
  font-family: var(--mono);
}

.stat-amber .stat-n { color: var(--amber); }
.stat-cyan  .stat-n { color: var(--cyan); }

/* ── Chart ───────────────────────────────────────────────────────── */
.section-label {
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 2px;
  color: var(--muted);
  text-transform: uppercase;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.section-label::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border);
}

.chart-section { margin-bottom: 8px; }

.chart-wrap {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  padding: 16px 16px 6px;
}

/* ── Filter bar ──────────────────────────────────────────────────── */
.filter-bar {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(5,8,15,0.88);
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
  border-bottom: 1px solid var(--border);
  padding: 8px 28px;
}

.filter-inner {
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.search-wrap {
  position: relative;
  flex: 1;
  min-width: 160px;
  max-width: 300px;
}

.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--dim);
  font-size: 12px;
  font-family: var(--mono);
  pointer-events: none;
}

#search {
  width: 100%;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  font-size: 12px;
  font-family: var(--mono);
  padding: 6px 10px 6px 28px;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
  letter-spacing: 0.3px;
}

#search::placeholder { color: var(--dim); }

#search:focus {
  border-color: var(--amber);
  box-shadow: 0 0 0 2px rgba(245,166,35,0.1);
}

.filter-tabs {
  display: flex;
  gap: 2px;
}

.filter-tab {
  background: none;
  border: 1px solid transparent;
  color: var(--muted);
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 1px;
  text-transform: uppercase;
  padding: 5px 10px;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.15s;
}

.filter-tab:hover {
  color: var(--text);
  border-color: var(--border);
}

.filter-tab.active {
  color: var(--amber);
  border-color: rgba(245,166,35,0.4);
  background: rgba(245,166,35,0.07);
}

#sort-select {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--muted);
  font-size: 10px;
  font-family: var(--mono);
  letter-spacing: 0.5px;
  padding: 5px 24px 5px 10px;
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%233a5068'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  text-transform: uppercase;
}

#sort-select:focus { border-color: var(--amber); }
#sort-select option { background: #0c1220; }

.sep {
  width: 1px;
  height: 16px;
  background: var(--border);
  flex-shrink: 0;
}

.count-badge {
  margin-left: auto;
  font-family: var(--mono);
  font-size: 10px;
  color: var(--dim);
  letter-spacing: 0.5px;
  white-space: nowrap;
}

/* ── Content ─────────────────────────────────────────────────────── */
.content {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px 28px 64px;
}

/* ── Tweet cards ─────────────────────────────────────────────────── */
.tweet-list { display: flex; flex-direction: column; }

.tweet-card {
  border-bottom: 1px solid var(--border);
  padding: 16px 0 16px 20px;
  position: relative;
  transition: background 0.12s;
  cursor: default;
}

.tweet-card::before {
  content: '';
  position: absolute;
  left: 0; top: 16px; bottom: 16px;
  width: 2px;
  border-radius: 2px;
  background: var(--border);
  transition: background 0.15s, box-shadow 0.15s;
}

.tweet-card:hover { background: rgba(13,22,40,0.5); }

.tweet-card[data-type="tweet"]:hover::before,
.tweet-card[data-type="tweet"] .tweet-metrics:hover ~ *,
.tweet-card[data-type="tweet"]::before { background: rgba(245,166,35,0.5); }

.tweet-card[data-type="tweet"]:hover::before {
  background: var(--amber);
  box-shadow: 0 0 8px rgba(245,166,35,0.6);
}

.tweet-card[data-type="retweet"]::before { background: rgba(0,212,160,0.4); }
.tweet-card[data-type="retweet"]:hover::before {
  background: var(--green);
  box-shadow: 0 0 8px rgba(0,212,160,0.5);
}

.tweet-card[data-type="reply"]::before { background: rgba(0,207,224,0.35); }
.tweet-card[data-type="reply"]:hover::before {
  background: var(--cyan);
  box-shadow: 0 0 8px rgba(0,207,224,0.45);
}

.tweet-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.type-tag {
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 2px;
  flex-shrink: 0;
}

.type-tweet   { color: var(--amber); background: rgba(245,166,35,0.1); }
.type-retweet { color: var(--green); background: rgba(0,212,160,0.1); }
.type-reply   { color: var(--cyan);  background: rgba(0,207,224,0.1); }

.tweet-date {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--dim);
  margin-left: auto;
}

.tweet-text {
  font-size: 13.5px;
  line-height: 1.65;
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
  margin-bottom: 12px;
  font-weight: 300;
}

.tweet-text a {
  color: var(--cyan);
  text-decoration: none;
  opacity: 0.85;
  transition: opacity 0.15s;
}

.tweet-text a:hover { opacity: 1; text-decoration: underline; }

.tweet-metrics {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
}

.metric {
  display: flex;
  align-items: center;
  gap: 5px;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--dim);
  transition: color 0.12s;
}

.metric:hover { color: var(--muted); }

.mi { font-size: 11px; }
.metric-reply   .mi { color: var(--cyan); }
.metric-rt      .mi { color: var(--green); }
.metric-like    .mi { color: #f5577a; }
.metric-view    .mi { color: var(--muted); }

.tweet-link {
  margin-left: auto;
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--dim);
  text-decoration: none;
  padding: 3px 8px;
  border: 1px solid var(--border);
  border-radius: 2px;
  transition: all 0.15s;
}

.tweet-link:hover {
  color: var(--amber);
  border-color: rgba(245,166,35,0.4);
  background: rgba(245,166,35,0.05);
}

/* ── Empty state ─────────────────────────────────────────────────── */
.empty-state {
  padding: 80px 0;
  text-align: center;
}

.empty-state-glyph {
  font-family: var(--display);
  font-size: 72px;
  color: var(--border);
  line-height: 1;
  margin-bottom: 16px;
}

.empty-state-text {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--dim);
}

/* ── Pagination ──────────────────────────────────────────────────── */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding-top: 28px;
  flex-wrap: wrap;
}

.page-btn {
  background: var(--card);
  border: 1px solid var(--border);
  color: var(--muted);
  font-family: var(--mono);
  font-size: 11px;
  padding: 6px 11px;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.15s;
  min-width: 34px;
  text-align: center;
  letter-spacing: 0.3px;
}

.page-btn:hover      { border-color: var(--amber); color: var(--amber); }
.page-btn.active     { background: var(--amber); border-color: var(--amber); color: #000; font-weight: 700; }
.page-btn:disabled   { opacity: 0.25; cursor: default; pointer-events: none; }
.page-ellipsis       { font-family: var(--mono); color: var(--dim); font-size: 12px; padding: 0 2px; }

/* ── Scrollbar ───────────────────────────────────────────────────── */
::-webkit-scrollbar       { width: 4px; background: var(--void); }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
::-webkit-scrollbar-thumb:hover { background: var(--dim); }

/* ── Keyboard hint ───────────────────────────────────────────────── */
.kbd-hint {
  position: fixed;
  bottom: 18px;
  right: 20px;
  font-family: var(--mono);
  font-size: 9.5px;
  color: var(--dim);
  display: flex;
  gap: 8px;
  align-items: center;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s;
}

body:not(:hover) .kbd-hint { opacity: 0; }
body:hover .kbd-hint { opacity: 0.6; }

kbd {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 1px 5px;
  font-size: 9px;
  letter-spacing: 0.5px;
}

/* ── Responsive ──────────────────────────────────────────────────── */
@media (max-width: 640px) {
  .header, .filter-bar, .content { padding-left: 16px; padding-right: 16px; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .stat-wide  { grid-column: span 2; }
  .profile-name { font-size: 44px; }
  .header-meta { display: none; }
}
`;

// ── JS ────────────────────────────────────────────────────────────────────────

const JS = `
  const PER   = 25;
  let filtered = [], page = 1, type = 'all', sort = 'newest', q = '';

  const fmtN = n => {
    if (!n && n !== 0) return '0';
    if (n >= 1e6) return (n/1e6).toFixed(1)+'M';
    if (n >= 1e3) return (n/1e3).toFixed(1)+'K';
    return String(n);
  };

  const esc = s => s
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const linkify = text => esc(text)
    .replace(/(https?:\\/\\/[^\\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/(@[A-Za-z0-9_]+)/g, '<a href="https://x.com/$1" target="_blank" rel="noopener">$1</a>')
    .replace(/(#[A-Za-z0-9_\\u4e00-\\u9fff]+)/g, '<a href="https://x.com/hashtag/$1" target="_blank" rel="noopener">$1</a>');

  const fmtDate = iso => {
    if (!iso) return '—';
    const d = new Date(iso), p = n => String(n).padStart(2,'0');
    return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())
           +' '+p(d.getHours())+':'+p(d.getMinutes());
  };

  function applyFilters() {
    let data = [...TWEETS];
    if (type === 'tweet')   data = data.filter(t => !t.is_retweet && !t.is_reply);
    if (type === 'retweet') data = data.filter(t =>  t.is_retweet);
    if (type === 'reply')   data = data.filter(t =>  t.is_reply && !t.is_retweet);
    if (q) {
      const lq = q.toLowerCase();
      data = data.filter(t => (t.text||'').toLowerCase().includes(lq));
    }
    if (sort === 'newest')   data.sort((a,b) => new Date(b.created_at)-new Date(a.created_at));
    if (sort === 'oldest')   data.sort((a,b) => new Date(a.created_at)-new Date(b.created_at));
    if (sort === 'likes')    data.sort((a,b) => (b.metrics?.likes??0)-(a.metrics?.likes??0));
    if (sort === 'retweets') data.sort((a,b) => (b.metrics?.retweets??0)-(a.metrics?.retweets??0));
    if (sort === 'views')    data.sort((a,b) => (b.metrics?.views??0)-(a.metrics?.views??0));
    filtered = data;
  }

  function card(t) {
    const tp  = t.is_retweet ? 'retweet' : t.is_reply ? 'reply' : 'tweet';
    const lbl = tp.charAt(0).toUpperCase()+tp.slice(1);
    const m   = t.metrics ?? {};
    return \`<div class="tweet-card" data-type="\${tp}">
      <div class="tweet-header">
        <span class="type-tag type-\${tp}">\${lbl}</span>
        <span class="tweet-date">\${fmtDate(t.created_at)}</span>
      </div>
      <div class="tweet-text">\${linkify(t.text||'')}</div>
      <div class="tweet-metrics">
        <span class="metric metric-reply"><span class="mi">↩</span>\${fmtN(m.replies)}</span>
        <span class="metric metric-rt"   ><span class="mi">↺</span>\${fmtN(m.retweets)}</span>
        <span class="metric metric-like" ><span class="mi">♥</span>\${fmtN(m.likes)}</span>
        <span class="metric metric-view" ><span class="mi">◎</span>\${fmtN(m.views)}</span>
        <a class="tweet-link" href="\${t.url}" target="_blank" rel="noopener">open ↗</a>
      </div>
    </div>\`;
  }

  function pageRange(cur, total) {
    if (total <= 7) return Array.from({length:total},(_,i)=>i+1);
    if (cur <= 4)   return [1,2,3,4,5,'…',total];
    if (cur >= total-3) return [1,'…',total-4,total-3,total-2,total-1,total];
    return [1,'…',cur-1,cur,cur+1,'…',total];
  }

  function render() {
    const list  = document.getElementById('tweet-list');
    const pag   = document.getElementById('pagination');
    const cnt   = document.getElementById('count-label');
    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total/PER));
    page = Math.min(page, pages);

    cnt.textContent = total.toLocaleString() + ' posts';

    const slice = filtered.slice((page-1)*PER, page*PER);

    if (!slice.length) {
      list.innerHTML = \`<div class="empty-state">
        <div class="empty-state-glyph">∅</div>
        <div class="empty-state-text">No results match</div>
      </div>\`;
    } else {
      list.innerHTML = '<div class="tweet-list">'+slice.map(card).join('')+'</div>';
    }

    if (pages <= 1) { pag.innerHTML = ''; return; }

    const btn = (txt, pg, dis, act) =>
      \`<button class="page-btn\${act?' active':''}" \${dis?'disabled':''} onclick="go(\${pg})">\${txt}</button>\`;

    let html = btn('←', page-1, page===1, false);
    pageRange(page, pages).forEach(p => {
      html += p === '…'
        ? '<span class="page-ellipsis">…</span>'
        : btn(p, p, false, p === page);
    });
    html += btn('→', page+1, page===pages, false);
    pag.innerHTML = '<div class="pagination">'+html+'</div>';
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function go(n) { page = n; render(); }
  function refresh() { applyFilters(); page = 1; render(); }

  document.getElementById('search').addEventListener('input', e => { q = e.target.value.trim(); refresh(); });

  document.querySelectorAll('.filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      type = btn.dataset.filter;
      refresh();
    });
  });

  document.getElementById('sort-select').addEventListener('change', e => { sort = e.target.value; refresh(); });

  document.addEventListener('keydown', e => {
    const s = document.getElementById('search');
    if (e.key === '/' && document.activeElement !== s) { e.preventDefault(); s.focus(); return; }
    if (e.key === 'Escape') { s.blur(); s.value = ''; q = ''; refresh(); return; }
    if (document.activeElement === s) return;
    if (e.key === 'ArrowRight') { const pg = Math.ceil(filtered.length/PER); if (page<pg){page++;render();} }
    if (e.key === 'ArrowLeft')  { if (page>1){page--;render();} }
  });

  refresh();
`;

// ── HTML assembler ────────────────────────────────────────────────────────────

export function generateReport(tweets, username) {
  if (!tweets.length) return null;

  const author  = tweets.find(t => t.author?.username)?.author ?? {};
  const handle  = author.username || username;
  const name    = author.name     || handle;
  const follows = author.followers ? fmt(author.followers) + ' followers' : '';
  const genTime = new Date().toISOString().slice(0,19).replace('T',' ') + ' UTC';

  const statsHTML = buildStats(tweets);
  const chartHTML = buildActivityChart(tweets);
  const data      = JSON.stringify(tweets);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>@${handle} — Archive</title>
  <style>${CSS}</style>
</head>
<body>

  <header class="header">
    <div class="header-inner">
      <div class="header-top animate">
        <div class="profile-block">
          <div class="profile-eyebrow">Tweet Archive</div>
          <h1 class="profile-name">${name}</h1>
          <div class="profile-handle">@<span>${handle}</span>${follows ? ` · ${follows}` : ''}</div>
        </div>
        <div class="header-meta">
          <div class="archive-badge">Live Data</div>
          <div class="gen-time">${genTime}</div>
          ${follows ? `<div class="followers-note">${follows}</div>` : ''}
        </div>
      </div>
      <div class="animate delay-1">${statsHTML}</div>
      <div class="animate delay-2">${chartHTML}</div>
    </div>
  </header>

  <div class="filter-bar">
    <div class="filter-inner">
      <div class="search-wrap">
        <span class="search-icon">/</span>
        <input id="search" type="search" placeholder="Search posts…" autocomplete="off" spellcheck="false">
      </div>
      <div class="sep"></div>
      <div class="filter-tabs">
        <button class="filter-tab active" data-filter="all">All</button>
        <button class="filter-tab" data-filter="tweet">Posts</button>
        <button class="filter-tab" data-filter="retweet">RT</button>
        <button class="filter-tab" data-filter="reply">Replies</button>
      </div>
      <div class="sep"></div>
      <select id="sort-select">
        <option value="newest">Newest</option>
        <option value="oldest">Oldest</option>
        <option value="likes">Top liked</option>
        <option value="retweets">Top RT</option>
        <option value="views">Top views</option>
      </select>
      <span class="count-badge" id="count-label">— posts</span>
    </div>
  </div>

  <div class="content animate delay-3">
    <div id="tweet-list"></div>
    <div id="pagination"></div>
  </div>

  <div class="kbd-hint">
    <kbd>/</kbd> search &nbsp;
    <kbd>←</kbd><kbd>→</kbd> pages &nbsp;
    <kbd>Esc</kbd> clear
  </div>

  <script>const TWEETS = ${data};</script>
  <script>${JS}</script>
</body>
</html>`;
}
