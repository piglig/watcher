/**
 * report-kit.js — Shared HTML primitives for moderation / OSINT reports.
 *
 * Centralizes:
 *   - HTML escape
 *   - Material-design base CSS (root vars, layout, tables, badges, buttons)
 *   - Rich copy-as-TSV script (clipboard plain + HTML, rowspan-aware, hidden-row-aware)
 *   - htmlShell() for assembling a full document
 *
 * Each report file adds its own report-specific CSS via `extraCss`.
 */

/** HTML-escape a string for safe interpolation into element bodies/attributes. */
export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Shorthand alias used in template-string-heavy callsites. */
export const h = escapeHtml;

// ── Base CSS — shared by all moderation/OSINT reports ────────────────────────

export const BASE_CSS = `
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
.num{font-variant-numeric:tabular-nums;text-align:right}
.truncate{max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.btn-copy{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;background:var(--primary);color:#fff;border:none;border-radius:4px;font-size:13px;cursor:pointer;transition:background .15s;white-space:nowrap}
.btn-copy:hover{background:#1557b0}
.btn-copy.copied{background:var(--ok)}
.empty{padding:40px 20px;text-align:center;color:var(--gray);font-size:13px}
.section-note{font-size:12px;color:var(--gray);margin-top:8px}
@media print{body{background:#fff}.btn-copy{display:none}.section{border:1px solid #ccc;break-inside:avoid}}
`.trim();

// ── copyTSV: clipboard plain + HTML, rowspan-aware, hidden-row-aware ─────────
//
// Per-element opt-outs:
//   - .nocopy / [data-copy="skip"]  → excluded from both TSV and HTML
//
// Per-button opt-ins (set as attributes on the .btn-copy button):
//   - data-skip-header               → skip the <thead> row entirely

export const COPY_TSV_SCRIPT = `
<script>
function cellPlainText(c) {
  const dv = c.getAttribute('data-value');
  if (dv !== null) return dv.trim().replace(/\\t|\\n|\\r/g,' ');
  // Clone and strip no-copy descendants before reading textContent so badges
  // / decorative tags marked .nocopy don't leak into the spreadsheet.
  const clone = c.cloneNode(true);
  for (const n of Array.from(clone.querySelectorAll('.nocopy, [data-copy="skip"]'))) n.remove();
  return clone.textContent.trim().replace(/\\t|\\n|\\r/g,' ');
}

function selectRows(table, opts) {
  const sel = opts.skipHeader ? 'tbody tr' : 'tr';
  return Array.from(table.querySelectorAll(sel)).filter(r => r.style.display !== 'none');
}

function buildTSV(table, opts) {
  const rows = selectRows(table, opts);
  const spanCache = [];
  const matrix = rows.map(row => {
    const out = [];
    let col = 0;
    while (spanCache[col]?.rowsLeft > 0) {
      out[col] = spanCache[col].value;
      spanCache[col].rowsLeft -= 1;
      col += 1;
    }
    for (const c of Array.from(row.querySelectorAll('th,td'))) {
      while (out[col] !== undefined) col += 1;
      const v = cellPlainText(c);
      out[col] = v;
      const rowspan = Number(c.getAttribute('rowspan') ?? 1);
      const colspan = Number(c.getAttribute('colspan') ?? 1);
      if (rowspan > 1) {
        for (let i = 0; i < colspan; i++) {
          spanCache[col + i] = { value: v, rowsLeft: rowspan - 1 };
        }
      }
      col += colspan;
    }
    return out;
  });
  const width = Math.max(...matrix.map(r => r.length));
  return matrix.map(row => Array.from({length: width}, (_, i) => row[i] ?? '').join('\\t')).join('\\n');
}

function buildHTML(table, opts) {
  const ALLOW = new Set(['A', 'B', 'STRONG', 'EM', 'I', 'U']);
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const isNoCopy = (el) =>
    el.classList?.contains('nocopy') || el.getAttribute?.('data-copy') === 'skip';

  function sanitize(node) {
    let out = '';
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        out += esc(child.textContent);
      } else if (child.nodeType === 1) {
        if (isNoCopy(child)) continue;
        const tag = child.tagName;
        const inner = sanitize(child);
        if (ALLOW.has(tag)) {
          if (tag === 'A') {
            const href = (child.getAttribute('href') || '').replace(/"/g,'&quot;');
            out += '<a href="' + href + '">' + inner + '</a>';
          } else {
            const t = tag.toLowerCase();
            out += '<' + t + '>' + inner + '</' + t + '>';
          }
        } else {
          out += inner;
        }
      }
    }
    return out.replace(/\\s+/g,' ').trim();
  }

  const rows = selectRows(table, opts).map(row => {
    const cells = Array.from(row.querySelectorAll('th,td')).map(c => {
      const tag = c.tagName.toLowerCase();
      const dv = c.getAttribute('data-value');
      const rs = Number(c.getAttribute('rowspan') ?? 1);
      const cs = Number(c.getAttribute('colspan') ?? 1);
      const attrs = (rs > 1 ? ' rowspan="' + rs + '"' : '') + (cs > 1 ? ' colspan="' + cs + '"' : '');
      const content = dv !== null ? esc(dv) : sanitize(c);
      return '<' + tag + attrs + '>' + content + '</' + tag + '>';
    }).join('');
    return '<tr>' + cells + '</tr>';
  }).join('');
  return '<table border="1">' + rows + '</table>';
}

function flashCopied(btn, msg) {
  const orig = btn.textContent;
  btn.textContent = msg || '\\u2713 已复制到剪贴板';
  btn.classList.add('copied');
  setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 2200);
}

async function copyTSV(tableId, btn) {
  const table = document.getElementById(tableId);
  const opts  = { skipHeader: btn?.hasAttribute('data-skip-header') };
  const tsv  = buildTSV(table, opts);
  const html = buildHTML(table, opts);
  try {
    await navigator.clipboard.write([new ClipboardItem({
      'text/plain': new Blob([tsv], { type: 'text/plain' }),
      'text/html':  new Blob([html], { type: 'text/html' }),
    })]);
  } catch {
    await navigator.clipboard.writeText(tsv);
  }
  flashCopied(btn);
}
</script>
`.trim();

// ── Reusable HTML fragments ──────────────────────────────────────────────────

/**
 * `<button class="btn-copy" onclick="copyTSV('${tableId}',this)">${label}</button>`
 *
 * @param {string} tableId
 * @param {string} [label]
 * @param {object} [opts]
 * @param {boolean} [opts.skipHeader]  Emit `data-skip-header` so copyTSV omits <thead>.
 */
export function copyButton(tableId, label = '复制为 TSV（Excel / Google Sheets）', opts = {}) {
  const attrs = opts.skipHeader ? ' data-skip-header' : '';
  return `<button class="btn-copy"${attrs} onclick="copyTSV('${escapeHtml(tableId)}',this)">${escapeHtml(label)}</button>`;
}

/** `<span class="badge badge-${variant}">${text}</span>` */
export function badge(text, variant) {
  return `<span class="badge badge-${escapeHtml(variant)}">${escapeHtml(text)}</span>`;
}

/**
 * Assemble a complete HTML document.
 *
 * @param {object} opts
 * @param {string} opts.title       <title>
 * @param {string} opts.body        HTML for <body> (excluding the closing scripts)
 * @param {string} [opts.extraCss]  Report-specific CSS, appended after BASE_CSS
 * @param {string} [opts.scripts]   Extra <script>...</script> appended after COPY_TSV_SCRIPT
 * @param {string} [opts.lang]      <html lang>; defaults to 'zh-CN'
 */
export function htmlShell({ title, body, extraCss = '', scripts = '', lang = 'zh-CN' }) {
  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<style>
${BASE_CSS}
${extraCss}
</style>
</head>
<body>
${body}
${COPY_TSV_SCRIPT}
${scripts}
</body>
</html>`;
}
