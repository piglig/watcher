/**
 * xai-client.js — Thin REST wrapper for xAI Batch API.
 *
 * xAI's Batch API diverges from OpenAI: results are retrieved via paginated
 * GET /v1/batches/{id}/results (no output_file_id download), and inline
 * `batch_requests` are accepted at creation time. We hit raw REST with
 * Node 18+'s fetch to avoid bending the openai SDK around these differences.
 *
 * Docs: https://docs.x.ai/developers/advanced-api-usage/batch-api
 */

import pRetry, { AbortError } from 'p-retry';

const BASE_URL = 'https://api.x.ai/v1';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function xaiFetch(apiKey, path, init = {}) {
  return pRetry(async () => {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });

    if (res.status === 429) {
      const wait = parseInt(res.headers.get('retry-after') ?? '30', 10) * 1000;
      console.warn(`[xai] 429 — waiting ${Math.ceil(wait / 1000)}s...`);
      await sleep(wait);
      throw new Error('xai: 429 rate-limited');                          // → retry
    }

    if (res.ok) return res.json();

    const body = await res.text().catch(() => '');
    const msg  = `xAI ${init.method ?? 'GET'} ${path} failed ${res.status}: ${body.slice(0, 500)}`;
    // 4xx (other than 429) means malformed request — retrying won't help.
    if (res.status >= 400 && res.status < 500) throw new AbortError(msg);
    throw new Error(msg);                                                 // 5xx → retry
  }, { retries: 4, factor: 2, minTimeout: 1500, maxTimeout: 30_000 });
}

/**
 * Step 1 of the xAI Batch flow: create an empty batch. Inline batch_requests
 * are NOT accepted here — they must be added via addRequests() afterwards.
 */
export function createBatch({ apiKey, name }) {
  return xaiFetch(apiKey, '/batches', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

/**
 * Step 2: attach requests to a created batch. Processing starts automatically
 * once requests land. Can be called repeatedly to grow a batch.
 */
export function addRequests({ apiKey, batchId, batchRequests }) {
  return xaiFetch(apiKey, `/batches/${batchId}/requests`, {
    method: 'POST',
    body: JSON.stringify({ batch_requests: batchRequests }),
  });
}

export function getBatch({ apiKey, batchId }) {
  return xaiFetch(apiKey, `/batches/${batchId}`);
}

/**
 * Cancel a batch. xAI uses Google-style RPC suffix `:cancel`, not `/cancel`.
 * Already-finished requests stay available; pending work is dropped.
 */
export function cancelBatch({ apiKey, batchId }) {
  return xaiFetch(apiKey, `/batches/${batchId}:cancel`, { method: 'POST' });
}

export function listResults({ apiKey, batchId, limit = 100, paginationToken }) {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (paginationToken) qs.set('pagination_token', paginationToken);
  return xaiFetch(apiKey, `/batches/${batchId}/results?${qs}`);
}

export async function getAllResults({ apiKey, batchId }) {
  const all = [];
  let token;
  for (;;) {
    const page = await listResults({ apiKey, batchId, paginationToken: token });
    all.push(...page.results);
    token = page.pagination_token;
    if (!token) break;
  }
  return all;
}
