/**
 * batch.js — Build & submit OSINT batches to xAI Grok 4.3.
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { buildPrompt } from './prompt.js';
import { makeSlugger, writeResults } from './output.js';
import { createBatch, addRequests, getBatch, getAllResults } from './xai-client.js';
import { saveBatch, updateBatch } from '../shared/batch-store.js';

export const DEFAULT_MODEL = 'grok-4.3';

/**
 * @param {{name:string, seedUrl:string}[]} targets
 * @returns {{ batchRequests:object[], targetsMap:Record<string,{name,seed_url}> }}
 */
export function buildBatchRequests(targets, model = DEFAULT_MODEL) {
  const slug = makeSlugger();
  const targetsMap    = {};
  const batchRequests = [];
  const today         = new Date().toISOString().slice(0, 10);

  for (const { name, seedUrl } of targets) {
    if (!name || !seedUrl) continue;
    const id = slug(name);
    targetsMap[id] = { name, seed_url: seedUrl };
    batchRequests.push({
      batch_request_id: id,
      batch_request: {
        responses: {
          model,
          input: [{ role: 'user', content: buildPrompt(name, seedUrl, today) }],
          tools: [{ type: 'web_search' }, { type: 'x_search' }],
          reasoning_effort: 'medium',
          temperature: 0.15,
          response_format: { type: 'json_object' },
        },
      },
    });
  }
  return { batchRequests, targetsMap };
}

/**
 * Submit a new OSINT batch. Returns { batchId, count }.
 */
export async function submitBatch(targets, opts = {}) {
  const {
    apiKey = process.env.XAI_API_KEY,
    model  = DEFAULT_MODEL,
    outDir,
  } = opts;

  if (!apiKey) throw new Error('XAI_API_KEY required. Set env var or fill it in Settings.');
  if (!outDir) throw new Error('outDir required for OSINT batch');
  if (!targets?.length) throw new Error('No targets provided');

  mkdirSync(outDir, { recursive: true });

  const { batchRequests, targetsMap } = buildBatchRequests(targets, model);
  if (!batchRequests.length) throw new Error('All targets were invalid (missing name or seedUrl)');

  writeFileSync(
    join(outDir, '_targets.json'),
    JSON.stringify(targetsMap, null, 2),
    'utf-8',
  );

  const created = await createBatch({
    apiKey,
    name: `osint-${Date.now()}`,
  });
  const batchId = created.id ?? created.batch_id;
  if (!batchId) throw new Error(`Unexpected xAI create response: ${JSON.stringify(created).slice(0, 300)}`);

  await addRequests({ apiKey, batchId, batchRequests });

  saveBatch({
    id:           batchId,
    kind:         'osint',
    model,
    post_count:   batchRequests.length,
    target_count: batchRequests.length,
    out_dir:      outDir,
  });

  return { batchId, count: batchRequests.length, targetsMap };
}

function summarizeStatus(batch) {
  const s = batch.state;
  return {
    status:    batch.cancel_time ? 'cancelled' : 'pending',
    completed: s.num_success,
    total:     s.num_requests,
    progress:  `${s.num_success}/${s.num_requests}`,
  };
}

function isDone(batch) {
  return batch.state.num_pending === 0;
}

/**
 * Poll once (default) or wait until terminal. When complete, fetches all
 * results, writes per-KOL JSON files to outDir, marks the batch record.
 */
export async function fetchBatchResults(batchId, opts = {}) {
  const {
    apiKey = process.env.XAI_API_KEY,
    outDir,
    targetsMap = null,
    wait = false,
  } = opts;

  if (!apiKey) throw new Error('XAI_API_KEY required');
  if (!outDir) throw new Error('outDir required');

  while (true) {
    const batch = await getBatch({ apiKey, batchId });

    if (isDone(batch)) {
      const results = await getAllResults({ apiKey, batchId });
      const map = targetsMap ?? readTargetsMap(outDir);
      const summary = writeResults(results, outDir, map);
      const finalStatus = batch.cancel_time ? 'cancelled' : 'completed';
      updateBatch(batchId, { status: finalStatus, completed_at: new Date().toISOString() });
      return { status: finalStatus, summary, results };
    }

    if (!wait) return summarizeStatus(batch);

    await new Promise(r => setTimeout(r, 30_000));
  }
}

function readTargetsMap(outDir) {
  try {
    const p = join(outDir, '_targets.json');
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf-8'));
  } catch {}
  return {};
}
