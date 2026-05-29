/**
 * batch.js — Build & submit OSINT batches to xAI Grok 4.3.
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { buildPrompt } from './prompt.js';
import { makeSlugger, writeResults } from './output.js';
import { createBatch, addRequests, getBatch, getAllResults } from './xai-client.js';
import { saveBatch, updateBatch } from '../shared/batch-store.js';
import { extractBioLinks, renderBioExtract } from './bio-extractor.js';
import { createLogger } from '../shared/logger.js';

export const DEFAULT_MODEL = 'grok-4.3';

// Cap concurrent pre-extract fetches so a 100-KOL batch doesn't open 100 sockets.
const PREEXTRACT_CONCURRENCY = 6;

async function mapWithConcurrency(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * @param {{name:string, seedUrl:string}[]} targets
 * @returns {Promise<{ batchRequests:object[], targetsMap:Record<string,{name,seed_url}> }>}
 */
export async function buildBatchRequests(targets, model = DEFAULT_MODEL, log = createLogger()) {
  const slug = makeSlugger();
  const targetsMap    = {};
  const batchRequests = [];
  const today         = new Date().toISOString().slice(0, 10);

  const valid = targets.filter(t => t?.name && t?.seedUrl);
  if (!valid.length) return { batchRequests, targetsMap };

  log.log(`  Pre-extracting bio links from ${valid.length} seed URL(s)...`);
  const extracts = await mapWithConcurrency(valid, PREEXTRACT_CONCURRENCY, async ({ seedUrl }) => {
    try { return await extractBioLinks(seedUrl); }
    catch (e) {
      log.warn(`[osint] Pre-extract failed for ${seedUrl}: ${e.message ?? e}`);
      return null;
    }
  });
  const hitCount = extracts.filter(Boolean).length;
  log.log(`  Pre-extract: ${hitCount}/${valid.length} seeds yielded structured bio data`);

  valid.forEach(({ name, seedUrl }, idx) => {
    const id = slug(name);
    targetsMap[id] = { name, seed_url: seedUrl };
    const bioBlock = renderBioExtract(extracts[idx]);
    batchRequests.push({
      batch_request_id: id,
      batch_request: {
        responses: {
          model,
          input: [{ role: 'user', content: buildPrompt(name, seedUrl, today, bioBlock) }],
          tools: [{ type: 'web_search' }, { type: 'x_search' }],
          reasoning_effort: 'medium',
          temperature: 0.15,
          response_format: { type: 'json_object' },
        },
      },
    });
  });
  return { batchRequests, targetsMap };
}

/**
 * Submit a new OSINT batch. Returns { batchId, count }.
 */
export async function submitBatch(targets, opts = {}) {
  const {
    apiKey = process.env.XAI_API_KEY,
    model  = DEFAULT_MODEL,
    outDir,        // fixed dir (standalone OSINT)
    outDirFor,     // (batchId) => path (workflows want batchId-named dir)
    subjectOutDir, // user-facing root for promote-to-subject (persisted on the record)
    logger = null,
  } = opts;
  const log = createLogger(logger);

  if (!apiKey) throw new Error('XAI_API_KEY required. Set env var or fill it in Settings.');
  if (!outDir && !outDirFor) throw new Error('outDir or outDirFor required for OSINT batch');
  if (!targets?.length) throw new Error('No targets provided');

  const { batchRequests, targetsMap } = await buildBatchRequests(targets, model, log);
  if (!batchRequests.length) throw new Error('All targets were invalid (missing name or seedUrl)');

  // Create batch first — gives us batchId before we touch disk.
  const created = await createBatch({ apiKey, name: `osint-${Date.now()}` });
  const batchId = created.id ?? created.batch_id;
  if (!batchId) throw new Error(`Unexpected xAI create response: ${JSON.stringify(created).slice(0, 300)}`);

  const resolvedDir = outDir ?? outDirFor(batchId);
  mkdirSync(resolvedDir, { recursive: true });

  writeFileSync(
    join(resolvedDir, '_targets.json'),
    JSON.stringify(targetsMap, null, 2),
    'utf-8',
  );

  await addRequests({ apiKey, batchId, batchRequests });

  saveBatch({
    id:              batchId,
    kind:            'osint',
    model,
    post_count:      batchRequests.length,
    target_count:    batchRequests.length,
    out_dir:         resolvedDir,     // staging dir holding raw results
    subject_out_dir: subjectOutDir,   // user-facing root (may be undefined for workflow flow)
  });

  return { batchId, count: batchRequests.length, targetsMap, outDir: resolvedDir };
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
    logger = null,
  } = opts;
  const log = createLogger(logger);

  if (!apiKey) throw new Error('XAI_API_KEY required');
  if (!outDir) throw new Error('outDir required');

  while (true) {
    const batch = await getBatch({ apiKey, batchId });

    if (isDone(batch)) {
      const results = await getAllResults({ apiKey, batchId });
      const map = targetsMap ?? readTargetsMap(outDir, log);
      const summary = writeResults(results, outDir, map);
      const finalStatus = batch.cancel_time ? 'cancelled' : 'completed';
      updateBatch(batchId, { status: finalStatus, completed_at: new Date().toISOString() });
      return { status: finalStatus, summary, results };
    }

    if (!wait) return summarizeStatus(batch);

    await new Promise(r => setTimeout(r, 30_000));
  }
}

function readTargetsMap(outDir, log = createLogger()) {
  try {
    const p = join(outDir, '_targets.json');
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf-8'));
  } catch (e) {
    log.warn('[osint] _targets.json unreadable:', e.message ?? e);
  }
  return {};
}
