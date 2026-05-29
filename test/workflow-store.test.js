import { describe, it, expect } from 'vitest';
import { SQLITE_OK } from './helpers/sqlite-available.js';

// workflow/store.js opens the native SQLite DB at import time, so the whole
// module is gated on the binary loading. Skip (not fail) otherwise.
const describeDb = SQLITE_OK ? describe : describe.skip;

const {
  WORKFLOW_STATE,
  STATES,
  STATE_LABELS,
  newWorkflowId,
  createWorkflow,
  getWorkflow,
  updateWorkflow,
  updateStage,
  deleteWorkflow,
} = SQLITE_OK ? await import('../src/workflow/store.js') : {};

describeDb('WORKFLOW_STATE machine constants', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(WORKFLOW_STATE)).toBe(true);
  });

  it('STATES lists every state value', () => {
    expect(STATES).toEqual(Object.values(WORKFLOW_STATE));
    expect(STATES).toContain('osint_pending');
    expect(STATES).toContain('report_done');
    expect(STATES).toContain('error');
  });

  it('every state has a human label', () => {
    for (const s of STATES) {
      expect(typeof STATE_LABELS[s]).toBe('string');
      expect(STATE_LABELS[s].length).toBeGreaterThan(0);
    }
  });
});

describeDb('newWorkflowId', () => {
  it('produces unique, prefixed ids', () => {
    const a = newWorkflowId();
    const b = newWorkflowId();
    expect(a).toMatch(/^wf/);
    expect(a).not.toBe(b);
  });
});

describeDb('createWorkflow', () => {
  it('requires a kolId', () => {
    expect(() => createWorkflow({ kolName: 'x' })).toThrow(/kolId is required/);
  });

  it('starts a new workflow in OSINT_PENDING with empty stage objects', () => {
    const wf = createWorkflow({ kolId: 'kol-a', kolName: 'KOL A', seedUrl: 'http://x', outDir: '/tmp/x' });
    expect(wf.state).toBe(WORKFLOW_STATE.OSINT_PENDING);
    expect(wf.kol_id).toBe('kol-a');
    expect(wf.kol).toMatchObject({ name: 'KOL A', seed_url: 'http://x' });
    expect(wf.osint).toEqual({});
    expect(wf.scrape).toEqual({});
    expect(wf.classify).toEqual({});
    expect(wf.report).toEqual({});
    // Persisted and retrievable.
    expect(getWorkflow(wf.id)).toMatchObject({ id: wf.id, state: WORKFLOW_STATE.OSINT_PENDING });
    deleteWorkflow(wf.id);
  });
});

describeDb('updateWorkflow / updateStage', () => {
  it('transitions state via updateWorkflow', () => {
    const wf = createWorkflow({ kolId: 'kol-b' });
    updateWorkflow(wf.id, { state: WORKFLOW_STATE.SCRAPING });
    expect(getWorkflow(wf.id).state).toBe(WORKFLOW_STATE.SCRAPING);
    deleteWorkflow(wf.id);
  });

  it('updateStage merges into a nested stage object without clobbering siblings', () => {
    const wf = createWorkflow({ kolId: 'kol-c' });
    updateStage(wf.id, 'osint', { batch_id: 'b1' });
    updateStage(wf.id, 'osint', { slug: 's1' });
    expect(getWorkflow(wf.id).osint).toEqual({ batch_id: 'b1', slug: 's1' });
    deleteWorkflow(wf.id);
  });

  it('updateStage returns null for an unknown workflow', () => {
    expect(updateStage('does-not-exist', 'osint', { x: 1 })).toBeNull();
  });
});
