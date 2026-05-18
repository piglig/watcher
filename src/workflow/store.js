/**
 * store.js — Persistent state for KOL investigation workflows.
 *
 * Each workflow ties together one OSINT batch, one scrape session, and one
 * classify batch for a single KOL, producing a Markdown report at the end.
 *
 * State machine:
 *   osint_pending → osint_done → scraping → scrape_done
 *                                → classify_pending → classify_done → report_done
 *   (any) → error
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const STORE_DIR  = join(homedir(), '.sns-audit');
const STORE_FILE = join(STORE_DIR, 'workflows.json');

export const STATES = [
  'osint_pending',
  'osint_done',
  'scraping',
  'scrape_done',
  'classify_pending',
  'classify_done',
  'report_done',
  'error',
];

export const STATE_LABELS = {
  osint_pending:    'OSINT 等待中',
  osint_done:       'OSINT 完成，待采集',
  scraping:         '采集进行中',
  scrape_done:      '采集完成，待分类',
  classify_pending: '分类等待中',
  classify_done:    '分类完成，待报告',
  report_done:      '已完成',
  error:            '出错',
};

function load() {
  try {
    if (!existsSync(STORE_FILE)) return [];
    return JSON.parse(readFileSync(STORE_FILE, 'utf-8'));
  } catch { return []; }
}

function persist(records) {
  mkdirSync(STORE_DIR, { recursive: true });
  writeFileSync(STORE_FILE, JSON.stringify(records, null, 2), 'utf-8');
}

function newId() {
  return 'wf_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

export function createWorkflow({ kolName, seedUrl, outDir }) {
  const records = load();
  const now = new Date().toISOString();
  const rec = {
    id:         newId(),
    created_at: now,
    updated_at: now,
    state:      'osint_pending',
    kol:        { name: kolName, seed_url: seedUrl },
    out_dir:    outDir,
    osint:      {},
    scrape:     {},
    classify:   {},
    report:     {},
  };
  records.push(rec);
  persist(records);
  return rec;
}

export function listWorkflows() {
  return load().slice().reverse();   // newest first
}

export function getWorkflow(id) {
  return load().find(r => r.id === id) ?? null;
}

export function updateWorkflow(id, patch) {
  const records = load();
  const idx = records.findIndex(r => r.id === id);
  if (idx < 0) return null;
  records[idx] = { ...records[idx], ...patch, updated_at: new Date().toISOString() };
  persist(records);
  return records[idx];
}

/** Merge a nested stage object (osint / scrape / classify / report). */
export function updateStage(id, stageKey, patch) {
  const wf = getWorkflow(id);
  if (!wf) return null;
  return updateWorkflow(id, { [stageKey]: { ...wf[stageKey], ...patch } });
}

export function deleteWorkflow(id) {
  persist(load().filter(r => r.id !== id));
}
