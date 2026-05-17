/**
 * batch-store.js — Persistent store for OpenAI Batch API jobs
 *
 * Saves to ~/.sns-audit/batches.json so users can track pending batches
 * across terminal sessions and resume them by ID.
 */

import { homedir }    from 'os';
import { join }       from 'path';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';

const STORE_DIR  = join(homedir(), '.sns-audit');
const STORE_FILE = join(STORE_DIR, 'batches.json');

function load() {
  try {
    if (!existsSync(STORE_FILE)) return [];
    return JSON.parse(readFileSync(STORE_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function persist(records) {
  mkdirSync(STORE_DIR, { recursive: true });
  writeFileSync(STORE_FILE, JSON.stringify(records, null, 2), 'utf-8');
}

/**
 * Save a new batch record.
 * @param {{ id, model, post_count, input_files, out_dir }} record
 */
export function saveBatch(record) {
  const records = load();
  records.push({
    status:     'pending',
    created_at: new Date().toISOString(),
    ...record,
  });
  persist(records);
}

/**
 * Update fields on an existing batch record (e.g., set status to 'completed').
 */
export function updateBatch(batchId, updates) {
  const records = load();
  const idx = records.findLastIndex(r => r.id === batchId);
  if (idx >= 0) records[idx] = { ...records[idx], ...updates };
  persist(records);
}

/** Return all saved batch records, newest-first. */
export function listBatches() {
  return load().slice().reverse();
}

/**
 * Find the most recently submitted batch that is still pending.
 * Returns null if none found.
 */
export function findLastPending() {
  return load().slice().reverse().find(r => r.status === 'pending') ?? null;
}

/** Delete all records for a given batch ID. */
export function deleteBatch(batchId) {
  persist(load().filter(r => r.id !== batchId));
}
