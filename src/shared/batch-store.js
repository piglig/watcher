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

const store = createRecordStore('batches.json', { timestamps: false });

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

/** Most recently submitted batch still pending; null if none. */
export function findLastPending() {
  return store.list().find(r => r.status === BATCH_STATUS.PENDING) ?? null;
}

export function deleteBatch(batchId) {
  store.remove(batchId);
}
