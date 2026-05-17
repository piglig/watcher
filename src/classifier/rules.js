/**
 * rules.js — Keyword/regex rule engine for pre-filtering
 *
 * High-confidence patterns (score=3) skip LLM entirely.
 * Whitelisted posts (obviously safe) also skip LLM.
 * Everything else is routed to LLM for nuanced judgment.
 */

import { CATEGORIES } from './classifier.js';

// Each rule: { pattern: RegExp, score: 0–3, reason: string }
const RULE_SET = {
  crime: [
    // ── Death threats ──────────────────────────────────────────────
    { pattern: /(?:殺す|殺してやる|ぶっ殺す|殺すぞ|殺すからな)/, score: 3,
      reason: 'Direct death threat (Japanese)' },
    // 死ね: exclude quoted/reflected uses ("said die to me", "feel like dying")
    { pattern: /死ね(?!と言|って言|と感|と思|まし|ませ)/, score: 3,
      reason: 'Death directive not in quoted context (Japanese)' },
    { pattern: /(?:죽여버릴|죽여버리겠|죽여줄게|죽여버려|죽이겠다)/, score: 3,
      reason: 'Direct death threat (Korean)' },
    { pattern: /\bi(?:'ll| will| am going to) (?:kill|murder|hurt|destroy) (?:you|them|him|her|all of you)\b/i, score: 3,
      reason: 'Direct death/harm threat (English)' },

    // ── Doxxing ───────────────────────────────────────────────────
    { pattern: /(?:住所|電話番号|個人情報|本名|実名).*(?:晒す|晒した|晒し|公開する|公開した|拡散)/, score: 3,
      reason: 'Doxxing: personal info exposure (Japanese)' },
    { pattern: /(?:신상|개인정보|주소|전화번호|본명).*(?:털었|털어|공개|유포|올렸)/, score: 3,
      reason: 'Doxxing: personal info exposure (Korean)' },
    { pattern: /\bi know where you (?:live|sleep|work)\b/i, score: 3,
      reason: 'Doxxing threat (English)' },
    { pattern: /\bposting (?:your|their|his|her) (?:address|dox|personal info)\b/i, score: 3,
      reason: 'Doxxing action (English)' },

    // ── Self-harm (score 2 — LLM still runs for context) ─────────
    { pattern: /(?:自殺|自傷|リスカ|首吊り|飛び降り).*(?:しよう|します|した|する気)/, score: 2,
      reason: 'Self-harm intent expression (Japanese)' },
    { pattern: /(?:자살할|자해할|죽고싶다|사라지고싶다|없어지고싶다)/, score: 2,
      reason: 'Self-harm ideation (Korean)' },
    { pattern: /\b(?:want to (?:kill|hurt) myself|going to (?:end it all|commit suicide))\b/i, score: 2,
      reason: 'Self-harm ideation (English)' },
  ],

  r18: [
    // ── Explicit (score 3) ────────────────────────────────────────
    { pattern: /(?:無修正|生ハメ|中出し|フェラチオ|クンニリングス|輪姦|レイプ動画|ハメ撮り)/, score: 3,
      reason: 'Explicit sexual content (Japanese)' },
    { pattern: /(?:포르노|야동|야설|강간영상|성인영상|자위영상|야한영상)/, score: 3,
      reason: 'Explicit sexual content (Korean)' },
    { pattern: /\b(?:porn(?:ography)?|sex tape|rape video|masturbat(?:ion|ing)|cumshot|creampie)\b/i, score: 3,
      reason: 'Explicit sexual content (English)' },

    // ── Adult labels / mild (score 2 — LLM adds context) ─────────
    { pattern: /\b(?:porn|hentai|xxx)\b/i, score: 2,
      reason: 'Adult content keyword (English)' },
    { pattern: /(?:R-?18|18禁|成人指定|アダルト作品)/, score: 2,
      reason: 'Adult content label detected' },
    { pattern: /(?:성인물|성인컨텐츠|야한)/, score: 2,
      reason: 'Adult content label (Korean)' },
  ],

  race_discrimination: [
    // ── Slurs (score 3) ───────────────────────────────────────────
    { pattern: /(?:チョン|チョンコ|シナ人|ジャップ|外国人.*出て行け|黒人.*劣)/, score: 3,
      reason: 'Racial slur or ethnic hate (Japanese)' },
    { pattern: /(?:쪽바리|짱깨|양키새끼)/, score: 3,
      reason: 'Racial slur (Korean)' },
    { pattern: /\b(?:nigg[ae]r|ch[i*]nk|sp[i*]c|g[o*]ok|k[i*]ke|wetback|sand ?nigger)\b/i, score: 3,
      reason: 'Racial slur (English)' },
  ],

  politics: [
    // ── Violent incitement (score 3) ──────────────────────────────
    { pattern: /(?:今すぐ革命|政府を打倒|クーデター|政権転覆|武装蜂起)/, score: 3,
      reason: 'Violent political incitement (Japanese)' },
    { pattern: /(?:혁명을 일으키자|정부를 타도|쿠데타|정권 전복|무장 봉기)/, score: 3,
      reason: 'Violent political incitement (Korean)' },
    { pattern: /\b(?:overthrow the government|start the revolution now|take up arms against|armed uprising against)\b/i, score: 3,
      reason: 'Violent political incitement (English)' },
  ],

  religion: [
    // ── Incitement against religious groups (score 3) ─────────────
    { pattern: /(?:(?:キリスト|イスラム|ユダヤ|仏教)(?:徒|教徒).*(?:殺せ|死ね|滅びろ|消えろ))/, score: 3,
      reason: 'Religious hate/incitement (Japanese)' },
    { pattern: /\b(?:kill all (?:muslims|christians|jews|infidels)|(?:muslims|jews|christians) must die)\b/i, score: 3,
      reason: 'Religious extremism / kill-group incitement (English)' },
  ],
};

// Whitelist: clearly safe short posts — skip LLM, return all zeros
const WHITELIST_PATTERNS = [
  /^[\s！!。.…~〜ー]*(?:ありがとう|おはよう|おやすみ|いただきます|お疲れ様|こんにちは|こんばんは)[\s！!。.…~〜]*$/u,
  /^[\s!.]*(?:감사합니다|안녕하세요|안녕히 주무세요|좋은 아침|감사해요|고마워)[\s!.]*$/u,
  /^[\s!.,]*(?:good (?:morning|night|evening|day)|thank(?:s| you)|congrats?(?:ulations)?|happy birthday|welcome back)[\s!.,]*$/iu,
];

/**
 * Apply rule engine to a single post text.
 * Returns a result object if post can skip LLM; null if LLM is needed.
 */
function applyRules(text) {
  if (!text || !text.trim()) return null;

  // Whitelist: obviously safe short messages
  if (text.length <= 60) {
    for (const pat of WHITELIST_PATTERNS) {
      if (pat.test(text.trim())) {
        return {
          scores:  Object.fromEntries(CATEGORIES.map(c => [c, 0])),
          reasons: {},
          source:  'whitelist',
        };
      }
    }
  }

  const scores  = Object.fromEntries(CATEGORIES.map(c => [c, 0]));
  const reasons = {};
  let hasScore3 = false;

  for (const [category, rules] of Object.entries(RULE_SET)) {
    let maxScore  = 0;
    let topReason = null;
    for (const rule of rules) {
      if (rule.pattern.test(text) && rule.score > maxScore) {
        maxScore  = rule.score;
        topReason = rule.reason;
      }
    }
    if (maxScore > 0) {
      scores[category]  = maxScore;
      reasons[category] = topReason;
      if (maxScore === 3) hasScore3 = true;
    }
  }

  // Only skip LLM for score=3 (high-confidence) hits.
  // score=2 still needs LLM for context and nuance.
  return hasScore3 ? { scores, reasons, source: 'rules' } : null;
}

/**
 * Run the rule engine against all posts.
 * @param {object[]} posts
 * @returns {Map<string, { scores, reasons, source }>}
 *   Only posts that can skip LLM are in the returned map.
 */
export function applyRulesAll(posts) {
  const results = new Map();
  for (const post of posts) {
    const text   = (post.text ?? '').slice(0, 1500);
    const result = applyRules(text);
    if (result) results.set(String(post.id), result);
  }
  return results;
}
