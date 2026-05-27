/**
 * output.js — CSV input parsing & per-KOL JSON writing for OSINT batches.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
import { makeSlugger as makeSluggerBase } from '../shared/paths.js';

// ── CSV parsing ───────────────────────────────────────────────────────────────

/**
 * Parse a CSV/TSV file with `name, seedUrl` columns.
 *
 * Delimiter is auto-detected (CSV / TSV / `;` / `|`), header row dropped when
 * the first cells look like column names, and a row is kept only when its
 * second cell looks URL-ish — that filter drops Excel-style "row count"
 * preambles like `64\n` that some users prepend.
 */
export function parseCSV(path) {
  let raw = readFileSync(path, 'utf-8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);   // strip BOM

  const { data } = Papa.parse(raw, {
    skipEmptyLines: 'greedy',
    delimitersToGuess: [',', '\t', ';', '|'],
  });

  const isHeader = (cells) => {
    const lower = cells.map(c => String(c ?? '').trim().toLowerCase());
    return lower.includes('name')
        || lower.some(c => c.includes('seed') || c.includes('url'));
  };
  const rows = data.length && isHeader(data[0]) ? data.slice(1) : data;

  const looksLikeUrl = (s) => /^(https?:\/\/|www\.)/i.test(s);

  const out = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const name    = String(row[0] ?? '').trim();
    const seedUrl = String(row[1] ?? '').trim();
    if (!name || !looksLikeUrl(seedUrl)) continue;
    out.push({ name, seedUrl });
  }
  return out;
}

// ── Slugging with collision handling ──────────────────────────────────────────

/** OSINT result slugger: drops `_`, caps at 60 chars, falls back to `kol`. */
export const makeSlugger = () => makeSluggerBase({ fallback: 'kol' });

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
