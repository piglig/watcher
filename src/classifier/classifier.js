/**
 * classifier.js — Batch content risk classifier via OpenAI Batch API
 * Supports Japanese, Korean, English social media posts.
 */

import { OpenAI }    from 'openai';
import { createReadStream, writeFileSync, unlinkSync } from 'fs';
import { resolve }   from 'path';

export const CATEGORIES = [
  'religion', 'politics', 'race_discrimination',
  'fandom_conflict', 'creative_risk', 'community_conflict',
  'crime', 'r18',
];

const SYSTEM_PROMPT = `You are a multilingual content risk classifier for social media posts by or about influencers in Japanese, Korean, and English.

Context awareness — apply before scoring:
- Academic citations, news quotes, and clearly labeled fiction do NOT count toward risk scores.
- Sarcastic criticism OF hate speech is not hate speech itself.
- Creator expressions of personal exhaustion or sadness ≠ self-harm incitement.
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
{"scores":{"religion":0,"politics":0,"race_discrimination":0,"fandom_conflict":1,"creative_risk":2,"community_conflict":1,"crime":0,"r18":0},"reasons":{"creative_risk":"Calling for organized protest against creator","fandom_conflict":"Bias accusation targeting shipping preference","community_conflict":"Mobilizing others against creator"}}`;

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

// After normalize.js, media is [{ type, url }] — no platform-specific shape.
function extractImageUrls(item, maxImages = 2) {
  return (item.media ?? []).map(m => m.url).filter(Boolean).slice(0, maxImages);
}

// Build OpenAI message content — text-only or multimodal (text + images)
function buildUserContent(item) {
  const text     = extractText(item);
  const imageUrls = extractImageUrls(item);

  if (!imageUrls.length) {
    return `Post: ${text}`;
  }

  const parts = [{ type: 'text', text: `Post: ${text}` }];
  for (const url of imageUrls) {
    parts.push({ type: 'image_url', image_url: { url, detail: 'low' } });
  }
  return parts;
}

// ── Batch API ─────────────────────────────────────────────────────────────────

export function buildBatchJSONL(posts, model = 'gpt-4o-mini') {
  const lines = [];
  const seenTexts = new Set();

  for (const post of posts) {
    const text = extractText(post);
    if (!text.trim() && !(post.media?.length)) continue;

    // Skip near-duplicate retweets (same first 80 chars, no unique media)
    const dedupKey = text.slice(0, 80);
    if (dedupKey.length > 10 && !post.media?.length) {
      if (seenTexts.has(dedupKey)) continue;
      seenTexts.add(dedupKey);
    }

    const content = buildUserContent(post);
    lines.push(JSON.stringify({
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
    }));
  }
  return lines.join('\n');
}

function parseResult(content) {
  try {
    const obj = JSON.parse(content);
    // Support new { scores, reasons } format and old flat format for resilience
    const rawScores = obj.scores ?? obj;
    const scores = Object.fromEntries(
      CATEGORIES.map(c => [c, Math.min(3, Math.max(0, Number(rawScores[c] ?? 0)))])
    );
    const reasons = (obj.reasons && typeof obj.reasons === 'object') ? obj.reasons : {};
    return { scores, reasons, source: 'llm' };
  } catch {
    return { scores: Object.fromEntries(CATEGORIES.map(c => [c, 0])), reasons: {}, source: 'llm' };
  }
}

function parseOutputJSONL(text) {
  const results = {};
  for (const line of text.split('\n').filter(Boolean)) {
    try {
      const obj     = JSON.parse(line);
      const content = obj.response?.body?.choices?.[0]?.message?.content ?? '{}';
      results[obj.custom_id] = parseResult(content);
    } catch {}
  }
  return results;
}

export async function submitBatch(posts, opts = {}) {
  const {
    apiKey = process.env.OPENAI_API_KEY,
    model  = 'gpt-4o-mini',
    debug  = false,
  } = opts;

  if (!apiKey) throw new Error('OPENAI_API_KEY required. Set env var or use --api-key.');

  const client  = new OpenAI({ apiKey });
  const dbg     = (...m) => debug && console.log('[DBG]', ...m);

  const jsonl   = buildBatchJSONL(posts, model);
  const count   = jsonl.split('\n').filter(Boolean).length;
  console.log(`  Preparing ${count} items for Batch API (model: ${model})...`);

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

export async function fetchBatchResults(batchId, opts = {}) {
  const {
    apiKey = process.env.OPENAI_API_KEY,
    wait   = false,
    debug  = false,
  } = opts;

  const client = new OpenAI({ apiKey });
  const dbg    = (...m) => debug && console.log('[DBG]', ...m);

  while (true) {
    const batch = await client.batches.retrieve(batchId);
    const { completed = 0, total = 0 } = batch.request_counts ?? {};
    dbg(`Batch ${batchId}: ${batch.status} (${completed}/${total})`);

    if (batch.status === 'completed') {
      const raw = await client.files.content(batch.output_file_id);
      return { status: 'completed', results: parseOutputJSONL(await raw.text()) };
    }

    if (['failed', 'expired', 'cancelled'].includes(batch.status)) {
      throw new Error(`Batch ${batchId} ended with status: ${batch.status}`);
    }

    if (!wait) return { status: batch.status, progress: `${completed}/${total}` };

    process.stdout.write(`\r  Waiting: ${batch.status} (${completed}/${total})...`);
    await new Promise(r => setTimeout(r, 30_000));
  }
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
