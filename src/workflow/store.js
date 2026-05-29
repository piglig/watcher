/**
 * store.js — Persistent state for KOL investigation workflows.
 *
 * Each workflow ties together one OSINT batch, one scrape session, and one
 * classify batch for a single KOL, producing a Markdown report at the end.
 *
 * State machine:
 *   osint_pending → osint_done → scraping → scrape_done
 *                              → classify_pending → classify_done → report_done
 *   (any) → error
 */

import { createRecordStore, makeId } from '../shared/json-store.js';

export const WORKFLOW_STATE = Object.freeze({
  OSINT_PENDING:    'osint_pending',
  OSINT_DONE:       'osint_done',
  SCRAPING:         'scraping',
  SCRAPE_DONE:      'scrape_done',
  CLASSIFY_PENDING: 'classify_pending',
  CLASSIFY_DONE:    'classify_done',
  REPORT_DONE:      'report_done',
  ERROR:            'error',
});

/** Ordered list — for iteration / validation. */
export const STATES = Object.values(WORKFLOW_STATE);

export const STATE_LABELS = {
  [WORKFLOW_STATE.OSINT_PENDING]:    'OSINT 等待中',
  [WORKFLOW_STATE.OSINT_DONE]:       'OSINT 完成，待采集',
  [WORKFLOW_STATE.SCRAPING]:         '采集进行中',
  [WORKFLOW_STATE.SCRAPE_DONE]:      '采集完成，待分类',
  [WORKFLOW_STATE.CLASSIFY_PENDING]: '分类等待中',
  [WORKFLOW_STATE.CLASSIFY_DONE]:    '分类完成，待报告',
  [WORKFLOW_STATE.REPORT_DONE]:      '已完成',
  [WORKFLOW_STATE.ERROR]:            '出错',
};

const store = createRecordStore('workflows.json');

export function newWorkflowId() {
  return makeId('wf');
}

export function createWorkflow({ id, kolId, kolName, seedUrl, outDir }) {
  if (!kolId) throw new Error('createWorkflow: kolId is required');
  const now = new Date().toISOString();
  return store.add({
    id:         id ?? newWorkflowId(),
    kol_id:     kolId,             // canonical — equals the OSINT slug
    created_at: now,
    updated_at: now,
    state:      WORKFLOW_STATE.OSINT_PENDING,
    kol:        { name: kolName, seed_url: seedUrl },
    out_dir:    outDir,            // = kolDir(outRoot, kolId)
    osint:      {},
    scrape:     {},
    classify:   {},
    report:     {},
  });
}

export function listWorkflows()    { return store.list(); }
export function getWorkflow(id)    { return store.get(id); }

/**
 * Workflows that still need driving — everything except the two terminal
 * states. The App-level daemon walks these each tick so a multi-KOL batch
 * advances on its own instead of stranding every workflow but the one the
 * user happens to open in WorkflowRun.
 */
export function listActiveWorkflows() {
  return store.list().filter(w =>
    w.state !== WORKFLOW_STATE.REPORT_DONE && w.state !== WORKFLOW_STATE.ERROR,
  );
}
export function updateWorkflow(id, patch) { return store.update(id, patch); }
export function deleteWorkflow(id) { store.remove(id); }

/** Merge a nested stage object (osint / scrape / classify / report). */
export function updateStage(id, stageKey, patch) {
  const wf = store.get(id);
  if (!wf) return null;
  return store.update(id, { [stageKey]: { ...wf[stageKey], ...patch } });
}
