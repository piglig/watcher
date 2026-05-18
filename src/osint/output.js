/**
 * output.js — CSV input parsing & per-KOL JSON writing for OSINT batches.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// ── CSV parsing ───────────────────────────────────────────────────────────────

function parseCSVLine(line) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { cur += ch; }
    } else {
      if (ch === ',') { cells.push(cur); cur = ''; }
      else if (ch === '"') { inQuotes = true; }
      else { cur += ch; }
    }
  }
  cells.push(cur);
  return cells.map(s => s.trim());
}

export function parseCSV(path) {
  let raw = readFileSync(path, 'utf-8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);   // strip BOM
  const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (!lines.length) return [];

  const firstCells = parseCSVLine(lines[0]).map(s => s.toLowerCase());
  const isHeader =
    firstCells.includes('name') || firstCells.some(c => c.includes('seed') || c.includes('url'));
  const rows = isHeader ? lines.slice(1) : lines;

  const out = [];
  for (const line of rows) {
    const cells = parseCSVLine(line);
    if (cells.length < 2) continue;
    const name = cells[0];
    const seedUrl = cells[1];
    if (!name || !seedUrl) continue;
    out.push({ name, seedUrl });
  }
  return out;
}

// ── Slugging with collision handling ──────────────────────────────────────────

export function makeSlugger() {
  const seen = new Map();
  return function slug(name) {
    let base = String(name).toLowerCase()
      .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    if (!base) base = 'kol';
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };
}

// ── Result content extraction ─────────────────────────────────────────────────

/**
 * xAI batch chat result envelope:
 *   result.batch_result.response.chat_get_completion.choices[N].message.content
 * Intermediate choices hold tool-call rounds with empty content; the final
 * answer is the last assistant message with non-empty content.
 */
export function extractTextContent(result) {
  const choices = result.batch_result.response.chat_get_completion.choices;
  for (let i = choices.length - 1; i >= 0; i--) {
    const m = choices[i].message;
    if (m.role === 'assistant' && typeof m.content === 'string' && m.content.trim()) {
      return m.content;
    }
  }
  return '';
}

// ── Writing per-KOL files + summary ───────────────────────────────────────────

export function writeResults(rawResults, outDir, targetsMap) {
  mkdirSync(outDir, { recursive: true });

  const items = [];
  let success = 0;
  let failed  = 0;

  for (const r of rawResults) {
    const slug   = r.batch_request_id;
    const target = targetsMap[slug] ?? { name: slug };
    const item   = { slug, name: target.name, status: 'ok', file: null, error: null };

    try {
      if (r.error_message) throw new Error(r.error_message);
      const json = JSON.parse(extractTextContent(r));
      const file = join(outDir, `${slug}.json`);
      writeFileSync(file, JSON.stringify(json, null, 2), 'utf-8');
      item.file = file;
      success++;
    } catch (e) {
      item.status = 'error';
      item.error  = String(e?.message ?? e);
      failed++;
    }
    items.push(item);
  }

  const summary = {
    total: rawResults.length,
    success,
    failed,
    generated_at: new Date().toISOString(),
    items,
  };
  writeFileSync(join(outDir, '_summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
  return summary;
}
