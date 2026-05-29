/**
 * batch-store.js — Persistent store for OpenAI / Gemini / xAI Batch API jobs.
 *
 * Saves to ~/.sns-audit/batches.json so users can track pending batches
 * across terminal sessions and resume them by ID.
 */

import { createRecordStore } from './json-store.js';

export const BATCH_STATUS = Object.freeze({
  PENDING:   'pending',
  COMPLETED: 'completed',
  FAILED:    'failed',
});

// Promote status + kind to real columns: callers filter heavily by both
// (`kind === 'osint'`, `status === 'pending'`).
const store = createRecordStore('batches.json', {
  timestamps: false,
  columns: { status: 'TEXT', kind: 'TEXT' },
});

/**
 * Save a new batch record.
 * @param {{ id, model, post_count, input_files, out_dir }} record
 */
export function saveBatch(record) {
  return store.add({
    status:     BATCH_STATUS.PENDING,
    created_at: new Date().toISOString(),
    ...record,
  });
}

export function updateBatch(batchId, updates) {
  return store.update(batchId, updates);
}

export function listBatches() {
  return store.list();
}

/** Batches of a given kind ('osint', 'classify', ...). Indexed lookup. */
export function listBatchesByKind(kind) {
  return store.findWhere(`kind = ?`, kind);
}

/** Pending batches only (any kind). Indexed lookup. */
export function listPendingBatches() {
  return store.findWhere(`status = ?`, BATCH_STATUS.PENDING);
}

/** Most recently submitted batch still pending; null if none. */
export function findLastPending() {
  const recs = store.findWhere(`status = ?`, BATCH_STATUS.PENDING);
  return recs[0] ?? null;
}

export function deleteBatch(batchId) {
  store.remove(batchId);
}
