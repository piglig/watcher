/**
 * classifier.js — Batch content risk classifier via OpenAI/Gemini Batch API
 * Supports Japanese, Korean, English social media posts.
 */

import { OpenAI }    from 'openai';
import { GoogleGenAI } from '@google/genai';
import { createReadStream, writeFileSync, unlinkSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, join }   from 'path';
import { INTERNAL_DIR } from '../shared/paths.js';

export const CATEGORIES = [
  'religion', 'politics', 'race_discrimination',
  'fandom_conflict', 'creative_risk', 'community_conflict',
  'crime', 'r18',
];

import { AI_PROVIDERS, apiKeyForProvider, envNameForProvider, inferProvider } from '../shared/ai-provider.js';
export { AI_PROVIDERS, apiKeyForProvider, envNameForProvider, inferProvider };

export const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini';
export const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash';

export const CLASSIFY_MODEL_ITEMS = [
  { provider: AI_PROVIDERS.GEMINI, model: DEFAULT_GEMINI_MODEL, label: 'Gemini 3.1 Flash-Lite 批量高吞吐（推荐）' },
  { provider: AI_PROVIDERS.GEMINI, model: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite 兼容低成本' },
  { provider: AI_PROVIDERS.DEEPSEEK, model: DEFAULT_DEEPSEEK_MODEL, label: 'DeepSeek V4 Flash 文本审查（海外可用；不识图）' },
  { provider: AI_PROVIDERS.DEEPSEEK, model: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro   文本高精度（不识图）' },
  { provider: AI_PROVIDERS.OPENAI, model: DEFAULT_OPENAI_MODEL, label: 'OpenAI gpt-4.1-mini   兼容现有流程' },
  { provider: AI_PROVIDERS.OPENAI, model: 'gpt-4.1', label: 'OpenAI gpt-4.1        高精度' },
  { provider: AI_PROVIDERS.OPENAI, model: 'gpt-4o-mini', label: 'OpenAI gpt-4o-mini    备用' },
];

export function defaultModelForProvider(provider) {
  if (provider === AI_PROVIDERS.GEMINI) return DEFAULT_GEMINI_MODEL;
  if (provider === AI_PROVIDERS.DEEPSEEK) return DEFAULT_DEEPSEEK_MODEL;
  return DEFAULT_OPENAI_MODEL;
}

const SYSTEM_PROMPT = `You are a multilingual content risk classifier for social media posts by or about influencers. Primary languages are Japanese, Korean, and English, but apply the same standards consistently to any other language you encounter (French, Spanish, Chinese, etc.) — do not over-score simply because a post is in an unfamiliar language.

Context awareness — apply before scoring:
- Academic citations, news quotes, and clearly labeled fiction do NOT count toward risk scores.
- Sarcastic criticism OF hate speech is not hate speech itself.
- Creator expressions of personal exhaustion or sadness ≠ self-harm incitement.
- Hobby / fandom community activities are NOT political or harmful: book & manga recommendations, reading challenges (#VendrediLecture, #BookTok, #読了, #독서), fan polls/votes/duels/brackets/tournaments for fictional characters, ships, songs, or creative works. Words like "vote", "voter", "duel", "battle", "war" in such contexts are entertainment, not political incitement or violence.
- Score based on likely real-world impact, not surface vocabulary alone.

Score each dimension 0–3:
  0 = none  1 = mild  2 = moderate  3 = severe

Dimensions:
  religion           – religious extremism, blasphemy, sect incitement
  politics           – political propaganda, regime attacks, voter manipulation
  race_discrimination – racial slurs, ethnic hate, xenophobia, nationality attacks
  fandom_conflict    – idol/anime/game fan wars, defamation, coordinated attacks on creators; Korean-specific: 음원 사재기 accusations, 사생팬 content, 탈덕 combined with attacks
  creative_risk      – R18 doujin/fan-fiction terms, creator harassment, toxic ship wars
  community_conflict – passive-aggression, subtle mockery, community infighting; Japanese-specific: 「民度」「察して」「お察し」trailing criticism 「…まあいいや」sarcastic 「(笑)」「ｗ」「草」after negative statements
  crime              – threats, doxxing, self-harm incitement (3=direct incitement / 2=explicit ideation / 1=vague distress), undisclosed paid promotion (ステマ/뒷광고), scam referrals
  r18                – explicit sexual content

If images are attached, analyze them as well — hate symbols, explicit content, political propaganda count toward relevant dimensions.

Return ONLY valid JSON. For every non-zero score include a brief English phrase (≤10 words) in "reasons":
{"scores":{"religion":0,"politics":0,"race_discrimination":0,"fandom_conflict":0,"creative_risk":0,"community_conflict":0,"crime":0,"r18":0},"reasons":{}}

Examples:
Post: "あの人の歌声、独特だよね（笑）もっと頑張れば？"
{"scores":{"religion":0,"politics":0,"race_discrimination":0,"fandom_conflict":2,"creative_risk":0,"community_conflict":1,"crime":0,"r18":0},"reasons":{"fandom_conflict":"Sarcastic dismissal of creator's singing ability","community_conflict":"Backhanded encouragement with （笑） mockery"}}

Post: "그 팬덤은 항상 저래. 진짜 민폐임ㅋㅋ 탈덕각"
{"scores":{"religion":0,"politics":0,"race_discrimination":0,"fandom_conflict":3,"creative_risk":0,"community_conflict":2,"crime":0,"r18":0},"reasons":{"fandom_conflict":"Broad attack labeling entire fandom as nuisance","community_conflict":"Dismissive mocking tone implying mass exit"}}

Post: "あのSSは完全にNL推しへの当て馬だろ、作者に抗議しよう"
{"scores":{"religion":0,"politics":0,"race_discrimination":0,"fandom_conflict":1,"creative_risk":2,"community_conflict":1,"crime":0,"r18":0},"reasons":{"creative_risk":"Calling for organized protest against creator","fandom_conflict":"Bias accusation targeting shipping preference","community_conflict":"Mobilizing others against creator"}}

Post: "Et vous les gens? Qu'est ce que vous lisez de beau comme #manga en ce #VendrediLecture ? (PS : n'oubliez pas de venir voter pour les duels 😜)"
{"scores":{"religion":0,"politics":0,"race_discrimination":0,"fandom_conflict":0,"creative_risk":0,"community_conflict":0,"crime":0,"r18":0},"reasons":{}}`;

const DEEPSEEK_SYSTEM_PROMPT = SYSTEM_PROMPT.replace(
  'If images are attached, analyze them as well — hate symbols, explicit content, political propaganda count toward relevant dimensions.',
  'DeepSeek API is text-only in this app. Do NOT infer unseen image content. If image URLs, alt text, captions, or OCR text are provided in the user message, use only that textual metadata.'
);

// ── Input normalization ───────────────────────────────────────────────────────

function cleanText(text) {
  return text
    .replace(/https?:\/\/\S+/g, '')   // URLs carry no semantic value for classification
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// After normalize.js pre-processing, all posts have a `text` field.
// YouTube gets a 2000-char budget (title + description + transcript).
export function extractText(item) {
  const limit = item.platform === 'youtube' ? 2000 : 1500;
  return cleanText(item.text ?? '').slice(0, limit);
}

// After normalize.js, media is [{ type, url, local_path? }] — no platform-specific shape.
// Image-bearing media entries the vision-model branch should embed. Excludes
// videos (the classifier never inlines them) and entries with neither a local
// cache nor a remote url.
function extractImageMedia(item, maxImages = 2) {
  return (item.media ?? [])
    .filter(m => m && (m.local_path || m.url) && (!m.type || m.type === 'photo' || m.type === 'image'))
    .slice(0, maxImages);
}

// Resolve a media entry into an OpenAI-compatible `image_url.url`. Prefers
// the locally-cached file as a base64 data URI — that avoids OpenAI's batch
// processor having to fetch a CDN URL that may have already expired by the
// time the batch reaches the head of the queue. Falls back to the original
// URL only if no local copy exists.
function resolveImageUrl(m) {
  if (m.local_path && existsSync(m.local_path)) {
    try {
      const b64 = readFileSync(m.local_path).toString('base64');
      return `data:image/jpeg;base64,${b64}`;
    } catch { /* fall through */ }
  }
  return m.url || null;
}

function extractImageMetadata(item, maxImages = 2) {
  return (item.media ?? [])
    .filter(m => m?.url || m?.alt || m?.caption || m?.ocr_text)
    .slice(0, maxImages)
    .map((m, i) => ({
      index: i + 1,
      url: m.url ?? '',
      alt: m.alt ?? '',
      caption: m.caption ?? '',
      ocr_text: m.ocr_text ?? '',
    }));
}

// Build OpenAI message content — text-only or multimodal (text + images).
function buildOpenAIUserContent(item) {
  const text  = extractText(item);
  const media = extractImageMedia(item);

  if (!media.length) return `Post: ${text}`;

  const parts = [{ type: 'text', text: `Post: ${text}` }];
  for (const m of media) {
    const url = resolveImageUrl(m);
    if (!url) continue;
    parts.push({ type: 'image_url', image_url: { url, detail: 'low' } });
  }
  // If every image resolved to nothing (rare — local missing AND no url), fall
  // back to a text-only request rather than an empty multimodal one.
  return parts.length > 1 ? parts : `Post: ${text}`;
}

function buildGeminiUserText(item) {
  const text = extractText(item);
  return `Post: ${text}`;
}

function buildDeepSeekUserText(item) {
  const text = extractText(item);
  const images = extractImageMetadata(item);
  if (!images.length) return `Post: ${text}`;
  const lines = [`Post: ${text}`, '', 'Attached image metadata (text-only, no visual recognition):'];
  for (const img of images) {
    const fields = [
      `#${img.index}`,
      img.alt ? `alt=${img.alt}` : '',
      img.caption ? `caption=${img.caption}` : '',
      img.ocr_text ? `ocr=${img.ocr_text}` : '',
      img.url ? `url=${img.url}` : '',
    ].filter(Boolean);
    lines.push(`- ${fields.join(' | ')}`);
  }
  return lines.join('\n');
}

function guessImageMimeType(url) {
  const clean = String(url).split('?')[0].toLowerCase();
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

function buildGeminiParts(post) {
  const parts = [{ text: buildGeminiUserText(post) }];
  for (const m of extractImageMedia(post)) {
    // Prefer the locally-cached JPEG (inline_data) — same rationale as the
    // OpenAI path: avoids Gemini fetching a CDN URL whose signed token may
    // already be dead by the time the batch is dispatched.
    if (m.local_path && existsSync(m.local_path)) {
      try {
        parts.push({
          inline_data: {
            mime_type: 'image/jpeg',
            data:      readFileSync(m.local_path).toString('base64'),
          },
        });
        continue;
      } catch { /* fall through to URL */ }
    }
    if (m.url) {
      parts.push({
        file_data: { file_uri: m.url, mime_type: guessImageMimeType(m.url) },
      });
    }
  }
  return parts;
}

// ── Batch chunking ────────────────────────────────────────────────────────────

// OpenAI enforces a per-org "enqueued tokens" cap (2M for gpt-4.1-mini).
// We pack chunks by estimated token budget rather than post count, because
// per-post token cost varies wildly by language (JP/KO ≈ 1.0-1.5 tok/char vs
// EN ≈ 0.3 tok/char). 1.4M leaves safe headroom under the 2M limit.
export const MAX_POSTS_PER_BATCH    = 1000;     // hard ceiling regardless of tokens
export const TOKEN_BUDGET_PER_BATCH = 1_400_000;

// Per-request overhead: system prompt + reserved max_tokens for the response.
// SYSTEM_PROMPT above is ~3KB → roughly 750 tokens. max_tokens=300 is reserved.
const PER_POST_OVERHEAD = 750 + 300;
// Conservative tokens-per-char for mixed CJK/EN content (CJK BPE worst case).
const TOKENS_PER_CHAR   = 0.75;

function estimateTokens(post) {
  const text       = String(post.text ?? '').slice(0, 1500);
  const imageCount = Math.min(post.media?.length ?? 0, 2);
  return PER_POST_OVERHEAD
       + Math.ceil(text.length * TOKENS_PER_CHAR)
       + imageCount * 85;  // detail:'low' = ~85 tokens per image
}

export function chunkPosts(posts) {
  const chunks = [];
  let current  = [];
  let tokens   = 0;

  for (const post of posts) {
    const t = estimateTokens(post);
    const wouldOverflow =
      current.length > 0 &&
      (tokens + t > TOKEN_BUDGET_PER_BATCH || current.length >= MAX_POSTS_PER_BATCH);
    if (wouldOverflow) {
      chunks.push(current);
      current = [];
      tokens  = 0;
    }
    current.push(post);
    tokens += t;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

// ── Batch API ─────────────────────────────────────────────────────────────────

function collectBatchInputs(posts, buildLine) {
  const lines = [];
  const seenTexts = new Set();
  const seenIds = new Set();

  for (const post of posts) {
    const text = extractText(post);
    if (!text.trim() && !(post.media?.length)) continue;

    // custom_id must be unique per batch request
    const id = String(post.id);
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    // Skip near-duplicate retweets (same first 80 chars, no unique media)
    const dedupKey = text.slice(0, 80);
    if (dedupKey.length > 10 && !post.media?.length) {
      if (seenTexts.has(dedupKey)) continue;
      seenTexts.add(dedupKey);
    }

    lines.push(buildLine(post));
  }
  return lines.join('\n');
}

export function buildBatchJSONL(posts, model = DEFAULT_OPENAI_MODEL) {
  return collectBatchInputs(posts, post => {
    const content = buildOpenAIUserContent(post);
    return JSON.stringify({
      custom_id: String(post.id),
      method:    'POST',
      url:       '/v1/chat/completions',
      body: {
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content },
        ],
        response_format: { type: 'json_object' },
        max_tokens:  300,
        temperature: 0,
      },
    });
  });
}

export function buildGeminiBatchJSONL(posts) {
  const lines = [];
  const seenTexts = new Set();
  const seenIds = new Set();

  for (const post of posts) {
    const text = extractText(post);
    if (!text.trim() && !(post.media?.length)) continue;

    const id = String(post.id);
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const dedupKey = text.slice(0, 80);
    if (dedupKey.length > 10 && !post.media?.length) {
      if (seenTexts.has(dedupKey)) continue;
      seenTexts.add(dedupKey);
    }

    lines.push(JSON.stringify({
      key: id,
      request: {
        contents: [
          {
            role: 'user',
            parts: buildGeminiParts(post),
          },
        ],
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generation_config: {
          response_mime_type: 'application/json',
          max_output_tokens: 300,
          temperature: 0,
          thinking_config: { thinking_budget: 0 },
        },
      },
    }));
  }

  return lines.join('\n');
}

function parseResult(content) {
  try {
    const obj = JSON.parse(content);
    const scores = Object.fromEntries(
      CATEGORIES.map(c => [c, Math.min(3, Math.max(0, Number(obj.scores[c] ?? 0)))])
    );
    const reasons = obj.reasons ?? {};
    return { scores, reasons, source: 'llm' };
  } catch {
    return { scores: Object.fromEntries(CATEGORIES.map(c => [c, 0])), reasons: {}, source: 'llm' };
  }
}

function parseOpenAIOutputJSONL(text) {
  const results = {};
  const errors  = [];
  for (const line of text.split('\n').filter(Boolean)) {
    try {
      const obj = JSON.parse(line);
      // Per-request failures land in the output file with `error` set (or a
      // non-2xx status_code with no choices). Don't fabricate all-zero scores
      // for them — collect for the caller to log and aggregate as missing.
      const reqErr = obj.error
        ?? (obj.response?.status_code && obj.response.status_code >= 400 ? obj.response.body?.error : null);
      const content = obj.response?.body?.choices?.[0]?.message?.content;
      if (reqErr || !content) {
        errors.push({
          custom_id: obj.custom_id,
          code:      reqErr?.code    ?? obj.response?.status_code ?? 'no_content',
          message:   reqErr?.message ?? '(no choices in response)',
        });
        continue;
      }
      results[obj.custom_id] = parseResult(content);
    } catch (e) { console.warn('[classify] OpenAI line skipped:', e.message ?? e); }
  }
  return { results, errors };
}

function parseOpenAIErrorJSONL(text) {
  const errors = [];
  for (const line of text.split('\n').filter(Boolean)) {
    try {
      const obj = JSON.parse(line);
      errors.push({
        custom_id: obj.custom_id,
        code:      obj.error?.code    ?? 'unknown',
        message:   obj.error?.message ?? '(no message)',
      });
    } catch (e) { console.warn('[classify] OpenAI error-line skipped:', e.message ?? e); }
  }
  return errors;
}

function extractGeminiText(response) {
  if (!response) return '{}';
  if (typeof response.text === 'string') return response.text;
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  return parts.map(p => p.text ?? '').join('').trim() || '{}';
}

function parseGeminiOutputJSONL(text) {
  const results = {};
  for (const line of text.split('\n').filter(Boolean)) {
    try {
      const obj = JSON.parse(line);
      if (obj.error) {
        // Skip errored items — writing all-zero scores would falsely report
        // "safe" content (e.g. when a 429/credit-depleted error fails every
        // request). Aggregation will ignore missing ids.
        console.warn(`[classify] Gemini item ${obj.key} skipped: ${obj.error.message ?? obj.error.code ?? 'unknown error'}`);
        continue;
      }
      results[obj.key] = parseResult(extractGeminiText(obj.response));
    } catch (e) { console.warn('[classify] Gemini line parse failed:', e.message ?? e); }
  }
  return results;
}

function deepSeekResultsDir() {
  const dir = join(INTERNAL_DIR, 'deepseek_results');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function deepSeekResultFile(batchId) {
  return join(deepSeekResultsDir(), `${batchId}.json`);
}

/**
 * Bounded-concurrency map. Calls `onItemDone(doneCount, total)` after each item
 * resolves so callers can surface live progress. Aborts cooperatively when
 * `signal` fires — in-flight `fn` calls are expected to honor the same signal
 * themselves; this loop just stops dispatching new work.
 */
async function mapWithConcurrency(items, limit, fn, { signal, onItemDone } = {}) {
  const results = new Array(items.length);
  let next = 0;
  let done = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      if (signal?.aborted) throw signal.reason ?? new Error('aborted');
      const idx = next++;
      results[idx] = await fn(items[idx], idx);
      done += 1;
      onItemDone?.(done, items.length);
    }
  });
  await Promise.all(workers);
  return results;
}

function normalizeGeminiProgress(batch) {
  const stats = batch.completionStats ?? {};
  const completed = Number(stats.successfulCount ?? stats.succeededCount ?? 0);
  const failed = Number(stats.failedCount ?? 0);
  const total = Number(stats.incompleteCount ?? 0) + completed + failed;
  return total > 0 ? `${completed + failed}/${total}` : batch.state ?? 'pending';
}

async function submitOpenAIBatch(posts, { apiKey, model, debug }) {
  const {
    client = new OpenAI({ apiKey }),
  } = {};
  const dbg     = (...m) => debug && console.log('[DBG]', ...m);

  const jsonl   = buildBatchJSONL(posts, model);
  const count   = jsonl.split('\n').filter(Boolean).length;
  console.log(`  Preparing ${count} items for OpenAI Batch API (model: ${model})...`);

  const tmpPath = resolve(`.tmp-classify-${Date.now()}.jsonl`);
  writeFileSync(tmpPath, jsonl, 'utf-8');

  try {
    const file = await client.files.create({
      file:    createReadStream(tmpPath),
      purpose: 'batch',
    });
    dbg(`File uploaded: ${file.id}`);

    const batch = await client.batches.create({
      input_file_id:     file.id,
      endpoint:          '/v1/chat/completions',
      completion_window: '24h',
    });

    console.log(`  Batch submitted: ${batch.id}`);
    console.log(`  Retrieve later: node classify.js --batch-id ${batch.id} --input <file> --out <dir>`);
    console.log(`  (Rule-engine pre-filtered ${posts.length - count} posts; only ${count} sent to LLM)`);
    return { batchId: batch.id, count };
  } finally {
    unlinkSync(tmpPath);
  }
}

async function submitGeminiBatch(posts, { apiKey, model, debug }) {
  const ai = new GoogleGenAI({ apiKey });
  const dbg = (...m) => debug && console.log('[DBG]', ...m);

  const jsonl = buildGeminiBatchJSONL(posts);
  const count = jsonl.split('\n').filter(Boolean).length;
  console.log(`  Preparing ${count} items for Gemini Batch API (model: ${model})...`);

  const tmpPath = resolve(`.tmp-classify-gemini-${Date.now()}.jsonl`);
  writeFileSync(tmpPath, jsonl, 'utf-8');

  try {
    const uploadedFile = await ai.files.upload({
      file: tmpPath,
      config: { mimeType: 'jsonl' },
    });
    dbg(`Gemini file uploaded: ${uploadedFile.name}`);

    const batch = await ai.batches.create({
      model,
      src: uploadedFile.name,
      config: { displayName: `sns-audit-classify-${Date.now()}` },
    });

    console.log(`  Gemini batch submitted: ${batch.name}`);
    console.log(`  (Rule-engine pre-filtered ${posts.length - count} posts; only ${count} sent to LLM)`);
    return { batchId: batch.name, count };
  } finally {
    unlinkSync(tmpPath);
  }
}

async function submitDeepSeekBatch(posts, { apiKey, model, debug, signal, onProgress }) {
  const client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' });
  const dbg = (...m) => debug && console.log('[DBG]', ...m);
  const inputs = [];
  const seenTexts = new Set();
  const seenIds = new Set();

  for (const post of posts) {
    const text = extractText(post);
    if (!text.trim() && !(post.media?.length)) continue;
    const id = String(post.id);
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    const dedupKey = text.slice(0, 80);
    if (dedupKey.length > 10 && !post.media?.length) {
      if (seenTexts.has(dedupKey)) continue;
      seenTexts.add(dedupKey);
    }
    inputs.push(post);
  }

  console.log(`  Preparing ${inputs.length} items for DeepSeek Chat API (model: ${model}, text-only)...`);
  const batchId = `deepseek_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const results = {};

  await mapWithConcurrency(
    inputs,
    3,
    async (post, idx) => {
      dbg(`DeepSeek classify ${idx + 1}/${inputs.length}: ${post.id}`);
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: DEEPSEEK_SYSTEM_PROMPT },
          { role: 'user', content: buildDeepSeekUserText(post) },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 300,
        temperature: 0,
        stream: false,
      }, { signal });
      results[String(post.id)] = parseResult(response.choices?.[0]?.message?.content ?? '{}');
    },
    { signal, onItemDone: onProgress },
  );

  writeFileSync(deepSeekResultFile(batchId), JSON.stringify({ status: 'completed', results }, null, 2), 'utf-8');
  console.log(`  DeepSeek classification completed locally: ${batchId}`);
  return { batchId, count: inputs.length };
}

export async function submitBatch(posts, opts = {}) {
  const {
    provider = inferProvider(opts.model),
    model = defaultModelForProvider(provider),
    apiKey = apiKeyForProvider(provider),
    debug = false,
    signal,
    onProgress,
  } = opts;

  if (provider === AI_PROVIDERS.GEMINI) {
    if (!apiKey) throw new Error('GEMINI_API_KEY required. Set env var or configure it in settings.');
    return submitGeminiBatch(posts, { apiKey, model, debug });
  }

  if (provider === AI_PROVIDERS.DEEPSEEK) {
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY required. Set env var or configure it in settings.');
    return submitDeepSeekBatch(posts, { apiKey, model, debug, signal, onProgress });
  }

  if (!apiKey) throw new Error('OPENAI_API_KEY required. Set env var or configure it in settings.');
  return submitOpenAIBatch(posts, { apiKey, model, debug });
}

async function fetchOpenAIResults(batchId, { apiKey, wait, debug }) {
  const client = new OpenAI({ apiKey });
  const dbg    = (...m) => debug && console.log('[DBG]', ...m);

  while (true) {
    const batch = await client.batches.retrieve(batchId);
    const { completed = 0, total = 0 } = batch.request_counts ?? {};
    dbg(`Batch ${batchId}: ${batch.status} (${completed}/${total})`);

    if (batch.status === 'completed') {
      const raw = await client.files.content(batch.output_file_id);
      const { results, errors: outputErrors } = parseOpenAIOutputJSONL(await raw.text());

      // Per-request failures (image fetch 4xx, content policy, etc.) land in
      // a separate error_file. Without reading it those posts are silently
      // dropped — which previously made e.g. Instagram look "not classified".
      const fileErrors = [];
      if (batch.error_file_id) {
        try {
          const errRaw = await client.files.content(batch.error_file_id);
          fileErrors.push(...parseOpenAIErrorJSONL(await errRaw.text()));
        } catch (e) {
          console.warn(`[classify] failed to read error_file ${batch.error_file_id}:`, e.message ?? e);
        }
      }

      const errors = [...outputErrors, ...fileErrors];
      return { status: 'completed', results, errors };
    }

    if (['failed', 'expired', 'cancelled'].includes(batch.status)) {
      throw new Error(`Batch ${batchId} ended with status: ${batch.status}`);
    }

    if (!wait) return { status: batch.status, progress: `${completed}/${total}` };

    process.stdout.write(`\r  Waiting: ${batch.status} (${completed}/${total})...`);
    await new Promise(r => setTimeout(r, 30_000));
  }
}

async function fetchGeminiResults(batchId, { apiKey, wait, debug }) {
  const ai = new GoogleGenAI({ apiKey });
  const dbg = (...m) => debug && console.log('[DBG]', ...m);

  while (true) {
    const batch = await ai.batches.get({ name: batchId });
    dbg(`Gemini batch ${batchId}: ${batch.state}`);

    if (batch.state === 'JOB_STATE_SUCCEEDED') {
      if (batch.dest?.fileName) {
        const outPath = resolve(`.tmp-classify-gemini-result-${Date.now()}.jsonl`);
        await ai.files.download({ file: batch.dest.fileName, downloadPath: outPath });
        try {
          return { status: 'completed', results: parseGeminiOutputJSONL(readFileSync(outPath, 'utf-8')) };
        } finally {
          unlinkSync(outPath);
        }
      }
      const results = {};
      for (const item of batch.dest?.inlinedResponses ?? []) {
        const key = item.metadata?.key;
        if (key) results[key] = parseResult(extractGeminiText(item.response));
      }
      return { status: 'completed', results };
    }

    if (['JOB_STATE_FAILED', 'JOB_STATE_CANCELLED', 'JOB_STATE_EXPIRED'].includes(batch.state)) {
      const detail = batch.error?.message ? `: ${batch.error.message}` : '';
      throw new Error(`Gemini batch ${batchId} ended with status: ${batch.state}${detail}`);
    }

    if (!wait) return { status: batch.state ?? 'pending', progress: normalizeGeminiProgress(batch) };

    process.stdout.write(`\r  Waiting: ${batch.state} (${normalizeGeminiProgress(batch)})...`);
    await new Promise(r => setTimeout(r, 30_000));
  }
}

async function fetchDeepSeekResults(batchId) {
  let raw;
  try {
    raw = readFileSync(deepSeekResultFile(batchId), 'utf-8');
  } catch {
    return { status: 'pending', progress: '0/1' };
  }
  const obj = JSON.parse(raw);
  return { status: obj.status ?? 'completed', results: obj.results ?? {} };
}

export async function fetchBatchResults(batchId, opts = {}) {
  const {
    provider = inferProvider(opts.model),
    apiKey = apiKeyForProvider(provider),
    wait = false,
    debug = false,
  } = opts;

  if (provider === AI_PROVIDERS.GEMINI) {
    if (!apiKey) throw new Error('GEMINI_API_KEY required. Set env var or configure it in settings.');
    return fetchGeminiResults(batchId, { apiKey, wait, debug });
  }

  if (provider === AI_PROVIDERS.DEEPSEEK) {
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY required. Set env var or configure it in settings.');
    return fetchDeepSeekResults(batchId);
  }

  if (!apiKey) throw new Error('OPENAI_API_KEY required. Set env var or configure it in settings.');
  return fetchOpenAIResults(batchId, { apiKey, wait, debug });
}

// ── User risk aggregation ─────────────────────────────────────────────────────

/**
 * @param {object[]} posts
 * @param {Object.<string, { scores: object, reasons: object, source: string }>} results
 */
export function aggregateUserRisk(posts, results) {
  const users = new Map();

  for (const post of posts) {
    const result = results[String(post.id)];
    if (!result) continue;

    const { scores: score, reasons = {}, source = 'llm' } = result;

    const authorId = String(post.author?.id ?? post.author?.username ?? 'unknown');
    const username = post.author?.username ?? post.author?.handle ?? authorId;

    if (!users.has(authorId)) {
      users.set(authorId, {
        author_id:     authorId,
        username,
        post_count:    0,
        category_sums: Object.fromEntries(CATEGORIES.map(c => [c, 0])),
        flagged:       [],
        severe_count:  0,
      });
    }

    const u = users.get(authorId);
    u.post_count++;
    for (const c of CATEGORIES) u.category_sums[c] += score[c];

    const maxScore = Math.max(...Object.values(score));
    if (maxScore >= 2) {
      u.flagged.push({
        id:         post.id,
        url:        post.url ?? '',
        created_at: post.created_at ?? '',
        type:       post.type ?? 'tweet',
        rt_from:    post.rt_from ?? null,   // { tweet_id, username } for retweets
        text:       extractText(post).slice(0, 300),
        score,
        reasons,
        source,
      });
    }
    if (maxScore === 3) u.severe_count++;
  }

  return Array.from(users.values()).map(u => {
    const n        = u.post_count || 1;
    const catAvgs  = Object.fromEntries(CATEGORIES.map(c => [c, u.category_sums[c] / n]));
    const maxCat   = Math.max(...Object.values(catAvgs));
    const overall  = Object.values(catAvgs).reduce((s, v) => s + v, 0) / CATEGORIES.length;

    // Risk score: max-category dominates, boosted by severe and flagged rate
    const base          = (maxCat * 0.6 + overall * 0.4) / 3 * 100;
    const severityBonus = Math.min(20, u.severe_count * 3);
    const flagBonus     = Math.min(10, (u.flagged.length / n) * 30);
    const riskScore     = Math.min(100, Math.round(base + severityBonus + flagBonus));

    const riskLevel =
      riskScore >= 75 ? 'critical' :
      riskScore >= 50 ? 'high'     :
      riskScore >= 25 ? 'medium'   : 'low';

    const topCategories = CATEGORIES
      .map(c => ({ c, v: u.category_sums[c] }))
      .filter(x => x.v > 0)
      .sort((a, b) => b.v - a.v)
      .slice(0, 3)
      .map(x => x.c);

    return {
      author_id:          u.author_id,
      username:           u.username,
      post_count:         u.post_count,
      flagged_post_count: u.flagged.length,
      severe_post_count:  u.severe_count,
      risk_score:         riskScore,
      risk_level:         riskLevel,
      top_categories:     topCategories,
      category_averages:  Object.fromEntries(
        CATEGORIES.map(c => [c, Math.round(catAvgs[c] * 100) / 100])
      ),
      flagged_posts: u.flagged.slice(0, 10),
    };
  }).sort((a, b) => b.risk_score - a.risk_score);
}
