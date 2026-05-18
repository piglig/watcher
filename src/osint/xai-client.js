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

const BASE_URL = 'https://api.x.ai/v1';

async function xaiFetch(apiKey, path, init = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`xAI ${init.method ?? 'GET'} ${path} failed ${res.status}: ${body.slice(0, 500)}`);
  }
  return res.json();
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
