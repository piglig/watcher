/**
 * rules.js — Multi-layer pre-LLM rule engine.
 *
 * Layers:
 *   1. Unicode normalization  — NFKC + leet + cjk fullwidth + space-padding
 *   2. Whitelist               — obviously safe → skip LLM with all-zero
 *   3. Pattern rules           — multi-language regex per category
 *   4. obscenity (English)     — sophisticated English profanity detection
 *   5. Structural signals      — caps spam, @-bombs, scam URLs
 *
 * Output contract:
 *   - Returns { scores, reasons, source } when post should skip LLM
 *   - Returns null when LLM is needed
 *   - "Skip LLM" rule: any category at score=3 OR whitelisted
 */

import { CATEGORIES } from './classifier.js';
import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from 'obscenity';

// ── 1. Normalization layer ───────────────────────────────────────────────────

// Common leetspeak substitutions used to evade keyword filters.
const LEET_MAP = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't',
  '@': 'a', '$': 's', '!': 'i', '|': 'i', '+': 't',
};

/**
 * Normalize text for matching: collapse evasion tactics so a single pattern
 * catches `kill`, `K!LL`, `k1ll`, `Ｋｉｌｌ`, `k i l l`, `k.i.l.l`.
 * Returns BOTH a normalized form (for matching) and the original (for display).
 */
export function normalizeForMatching(raw) {
  if (!raw) return '';
  let s = String(raw)
    .normalize('NFKC')                                          // fullwidth → halfwidth
    .toLowerCase();
  s = s.replace(/[0134578@$!|+]/g, c => LEET_MAP[c] ?? c);      // leet → letters

  // Collapse single-letter-space evasion ("k i l l" → "kill") only when we see
  // 4+ single letters separated by single spaces — preserves "i'll kill you".
  s = s.replace(/(?:\b[a-z]\s){3,}[a-z]\b/g, m => m.replace(/\s/g, ''));

  // Collapse same-word padding via punctuation ("k.i.l.l" / "k*i*l*l" → "kill").
  s = s.replace(/([a-z])[.\-_*]+(?=[a-z])/g, '$1');

  return s;
}

// ── 2. Whitelist (clearly-safe short messages) ───────────────────────────────

const WHITELIST_PATTERNS = [
  /^[\s！!。.…~〜ー]*(?:ありがとう|おはよう|おやすみ|いただきます|お疲れ様|お疲れさま|こんにちは|こんばんは|よろしくお願い)[\s！!。.…~〜]*$/u,
  /^[\s!.]*(?:감사합니다|안녕하세요|안녕히 주무세요|좋은 아침|감사해요|고마워|수고하셨습니다)[\s!.]*$/u,
  /^[\s!.,]*(?:good (?:morning|night|evening|day|luck)|thank(?:s| you)|congrats?(?:ulations)?|happy birthday|welcome back|welcome|hello|hi)[\s!.,]*$/iu,
  /^[\s\p{Emoji}!.,~❤️🎉✨]+$/u,                  // pure emoji/punctuation
  /^\d+[\s.,!]*$/,                                 // numbers only
];

function isWhitelisted(text) {
  if (text.length > 80) return false;              // longer than greeting
  const trimmed = text.trim();
  if (!trimmed) return true;
  for (const pat of WHITELIST_PATTERNS) {
    if (pat.test(trimmed)) return true;
  }
  return false;
}

// ── 3. Pattern rules ─────────────────────────────────────────────────────────

// Each rule: { pattern: RegExp (tested against NORMALIZED text), score, reason }
const RULE_SET = {
  // ─────────────────────────────────────────────────────────────────────────
  crime: [
    // Death/violence threats — JP
    { pattern: /(?:殺す|殺してやる|ぶっ殺す|殺すぞ|殺すからな|刺してやる|刺すぞ)/u, score: 3, reason: 'Direct death/violence threat (Japanese)' },
    { pattern: /死ね(?!と言|って言|と感|と思|まし|ませ)/u,                          score: 3, reason: 'Death directive (Japanese)' },
    // Death/violence threats — KO
    { pattern: /(?:죽여버릴|죽여버리겠|죽여줄게|죽여버려|죽이겠다|찔러버려|찔러줄게)/u, score: 3, reason: 'Direct death/violence threat (Korean)' },
    // Death/violence threats — EN
    { pattern: /\bi(?:'ll| will| am going to| gonna) (?:kill|murder|hurt|stab|shoot|destroy) (?:you|them|him|her|all of you|y'all)\b/i, score: 3, reason: 'Direct threat (English)' },
    { pattern: /\b(?:you|they|he|she|y'all) (?:deserve to die|should die|need to die)\b/i, score: 3, reason: 'Death-wish directive (English)' },

    // Doxxing — JP
    { pattern: /(?:住所|電話番号|個人情報|本名|実名).*(?:晒す|晒した|晒し|公開する|公開した|拡散|流す)/u, score: 3, reason: 'Doxxing (Japanese)' },
    // Doxxing — KO
    { pattern: /(?:신상|개인정보|주소|전화번호|본명).*(?:털었|털어|공개|유포|올렸|뿌렸)/u, score: 3, reason: 'Doxxing (Korean)' },
    // Doxxing — EN
    { pattern: /\bi know where you (?:live|sleep|work|go to school)\b/i, score: 3, reason: 'Doxxing threat (English)' },
    { pattern: /\b(?:posting|leaking|dropping|sharing) (?:your|their|his|her) (?:address|dox|personal info|home address|phone number|real name)\b/i, score: 3, reason: 'Doxxing action (English)' },

    // Self-harm (score 2 — context matters, keep LLM)
    { pattern: /(?:自殺|自傷|リスカ|首吊り|飛び降り).*(?:しよう|します|した|する気|するわ)/u, score: 2, reason: 'Self-harm intent (Japanese)' },
    { pattern: /(?:자살할|자해할|죽고싶다|사라지고싶다|없어지고싶다|뛰어내릴)/u,             score: 2, reason: 'Self-harm ideation (Korean)' },
    { pattern: /\b(?:want to (?:kill|hurt|end) (?:myself|my life)|going to (?:end it all|commit suicide)|kms\b|kys\b)/i, score: 2, reason: 'Self-harm/violence ideation (English)' },

    // Undisclosed paid promotion — JP/KO/EN
    { pattern: /(?:ステマ|ステルスマーケティング|案件隠し)/u,                            score: 2, reason: 'Undisclosed paid promotion (Japanese)' },
    { pattern: /(?:뒷광고|몰래\s*광고)/u,                                                  score: 2, reason: 'Undisclosed paid promotion (Korean)' },
  ],

  // ─────────────────────────────────────────────────────────────────────────
  r18: [
    // Explicit — JP
    { pattern: /(?:無修正|生ハメ|中出し|フェラチオ|クンニリングス|輪姦|レイプ動画|ハメ撮り|ピストン|アナル舐め)/u, score: 3, reason: 'Explicit sexual content (Japanese)' },
    // Explicit — KO
    { pattern: /(?:포르노|야동|야설|강간영상|성인영상|자위영상|야한영상|섹스영상)/u, score: 3, reason: 'Explicit sexual content (Korean)' },
    // Explicit (production terms) — EN — bare "porn" lives in score-2 below.
    { pattern: /\b(?:pornography|sex tape|rape video|masturbat(?:ion|ing|e)|cumshot|creampie|gangbang|bukkake|deepthroat)\b/i, score: 3, reason: 'Explicit sexual content (English)' },

    // Adult labels — JP/KO/EN
    { pattern: /\b(?:porn|hentai|xxx|nsfw|onlyfans)\b/i,             score: 2, reason: 'Adult content keyword (English)' },
    { pattern: /(?:r-?18|18禁|成人指定|アダルト作品|エロ動画|エロ漫画)/u, score: 2, reason: 'Adult content label (Japanese)' },
    { pattern: /(?:성인물|성인컨텐츠|야한|19금)/u,                     score: 2, reason: 'Adult content label (Korean)' },
  ],

  // ─────────────────────────────────────────────────────────────────────────
  race_discrimination: [
    // Slurs — JP
    { pattern: /(?:チョン|チョンコ|シナ人|ジャップ|外国人.*出て行け|黒人.*劣)/u, score: 3, reason: 'Racial slur or ethnic hate (Japanese)' },
    // Slurs — KO
    { pattern: /(?:쪽바리|짱깨|양키새끼|짱개)/u,                                  score: 3, reason: 'Racial slur (Korean)' },
    // EN slurs handled by obscenity library (more accurate); keep one fallback
    { pattern: /\b(?:sand ?nigger|towelhead)\b/i,                                  score: 3, reason: 'Racial/ethnic slur (English)' },
  ],

  // ─────────────────────────────────────────────────────────────────────────
  politics: [
    // Violent incitement — JP
    { pattern: /(?:今すぐ革命|政府を打倒|クーデター|政権転覆|武装蜂起|テロを起こせ)/u, score: 3, reason: 'Violent political incitement (Japanese)' },
    // Violent incitement — KO
    { pattern: /(?:혁명을 일으키자|정부를 타도|쿠데타|정권 전복|무장 봉기|테러를 일으켜)/u, score: 3, reason: 'Violent political incitement (Korean)' },
    // Violent incitement — EN
    { pattern: /\b(?:overthrow the government|start the revolution now|take up arms against|armed uprising against|civil war is needed)\b/i, score: 3, reason: 'Violent political incitement (English)' },
  ],

  // ─────────────────────────────────────────────────────────────────────────
  religion: [
    { pattern: /(?:(?:キリスト|イスラム|ユダヤ|仏教)(?:徒|教徒).*(?:殺せ|死ね|滅びろ|消えろ))/u, score: 3, reason: 'Religious hate/incitement (Japanese)' },
    { pattern: /\b(?:kill all (?:muslims|christians|jews|hindus|infidels)|(?:muslims|jews|christians|hindus) must die|holy war on (?:muslims|jews|christians|hindus))\b/i, score: 3, reason: 'Religious extremism (English)' },
  ],

  // ─────────────────────────────────────────────────────────────────────────
  // NEW: fandom_conflict — coordinated fan-war / attacks on creators
  fandom_conflict: [
    // JP — coordinated harassment / 凸/ 民度
    { pattern: /(?:アンチスレ|信者ヤバい|アイドル詐欺|匂わせ|不倫疑惑).*(?:凸|凸って|拡散希望)/u, score: 3, reason: 'Coordinated fan attack call (Japanese)' },
    { pattern: /(?:推し変|箱推し卒業|害悪ファン|地雷オタ|害悪オタ)/u, score: 2, reason: 'Fan-war negativity (Japanese)' },
    // KO — 탈덕 + attack / 음원 사재기 / 사생팬
    { pattern: /(?:탈덕|입덕취소).*(?:이유|폭로|증거)/u, score: 2, reason: 'Public fan exit with grievance (Korean)' },
    { pattern: /(?:음원\s*사재기|차트조작|투표조작)/u,    score: 3, reason: 'Chart manipulation accusation (Korean)' },
    { pattern: /(?:사생팬|스토커팬)/u,                       score: 2, reason: 'Stalker-fan term (Korean)' },
    // EN — call to "cancel" / brigade
    { pattern: /\b(?:cancel(?:ed|ling) (?:him|her|them)|drag (?:him|her|them) for filth|mass report(?:ing)? (?:his|her|their) account)\b/i, score: 3, reason: 'Coordinated cancel/brigade call (English)' },
    { pattern: /\b(?:stan war|fandom war|fan war|antis are right)\b/i, score: 2, reason: 'Fan-war framing (English)' },
  ],

  // ─────────────────────────────────────────────────────────────────────────
  // NEW: creative_risk — R18 doujin / ship-war / protest against author
  creative_risk: [
    // JP — 同人 doujin attack patterns
    { pattern: /(?:作者に抗議|作者を叩こう|作者凸|公式に通報しよう).*?(?:理由|不適切|やめ)/u, score: 3, reason: 'Organized protest against creator (Japanese)' },
    { pattern: /(?:腐\s*ホモ|地雷CP|逆カプ地雷|捏造CP).*(?:嫌い|許さない|消えろ|滅び)/u, score: 2, reason: 'Ship-war hostility (Japanese)' },
    { pattern: /(?:R-?18\s*同人|薄い本|エロ二次|無断転載|公式ガイドライン違反)/u, score: 2, reason: 'R18 doujin / unauthorized repost term (Japanese)' },
    // KO — 동인 + 작가 attack
    { pattern: /(?:작가).*(?:공격|매장|손절|항의문)/u, score: 3, reason: 'Organized attack on creator (Korean)' },
    { pattern: /(?:역커플|악성팬|커플전쟁|반동인)/u,    score: 2, reason: 'Ship-war / fandom hostility (Korean)' },
    // EN
    { pattern: /\b(?:report (?:the )?(?:author|artist|writer) (?:to|for)|witch ?hunt (?:the |this )?(?:author|artist|creator))\b/i, score: 3, reason: 'Targeted attack on creator (English)' },
    { pattern: /\b(?:ship war|anti ship(?:per)?|proship(?:per)? bad|fic stealing)\b/i, score: 2, reason: 'Ship-war / fandom hostility (English)' },
  ],

  // ─────────────────────────────────────────────────────────────────────────
  // NEW: community_conflict — sarcastic / passive-aggressive markers
  community_conflict: [
    // JP — trailing 笑/ｗ/草 after negative sentiment is heavy passive-aggression
    { pattern: /(?:民度|察して|お察し).*(?:低い|レベル|程度)/u, score: 2, reason: 'Civility-shaming framing (Japanese)' },
    { pattern: /(?:まあいいや|どうでもいいけど|別にいいんだけど).*[ｗw草笑]/u, score: 2, reason: 'Passive-aggressive dismissal + mocking suffix (Japanese)' },
    { pattern: /(?:わざわざ|あえて|あえてだけど)\s*.*(?:すごい|偉い)[ｗw草笑]/u, score: 2, reason: 'Sarcastic praise with mocking suffix (Japanese)' },
    // KO — 비꼬는 표현
    { pattern: /(?:잘\s*하시네요|대단하시네요|역시\s*다르시네요).*[ㅋㅎ]{2,}/u, score: 2, reason: 'Sarcastic praise + mocking laughter (Korean)' },
    { pattern: /(?:인성|매너).*(?:쓰레기|바닥|밑바닥)/u, score: 2, reason: 'Character attack via civility framing (Korean)' },
    // EN — sarcasm markers
    { pattern: /\b(?:bless your heart|how original|so brave|wow such (?:original|brave|smart))\b/i, score: 1, reason: 'Sarcastic dismissal (English)' },
    { pattern: /\b(?:imagine being (?:this|that) (?:dumb|stupid|delusional)|the audacity of (?:this|him|her|them))\b/i, score: 2, reason: 'Hostile community framing (English)' },
  ],
};

// ── 4. obscenity library wrapper (English profanity) ─────────────────────────

const obscenityMatcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

/**
 * Categorize obscenity matches into our existing risk dimensions.
 * Slurs → race_discrimination (score 3); sexual terms → r18 (score 2);
 * generic profanity → community_conflict (score 1).
 */
function obscenityScores(text) {
  const matches = obscenityMatcher.getAllMatches(text, true);
  if (!matches.length) return {};

  let hasSlur = false, hasSexual = false, hasGeneric = false;
  for (const m of matches) {
    const span = text.slice(m.startIndex, m.endIndex + 1);
    if (/(nig|chink|spic|gook|kike|wetback|tranny|fag)/i.test(span))             hasSlur = true;
    else if (/(porn|sex|fuck|cunt|cock|pussy|dick|tits|jerk)/i.test(span))       hasSexual = true;
    else                                                                          hasGeneric = true;
  }

  const out = {};
  if (hasSlur)    out.race_discrimination = { score: 3, reason: 'English slur (obscenity)' };
  if (hasSexual)  out.r18                 = { score: 2, reason: 'English sexual term (obscenity)' };
  if (hasGeneric) out.community_conflict  = { score: 1, reason: 'Generic profanity (obscenity)' };
  return out;
}

// ── 5. Structural signals ────────────────────────────────────────────────────

function structuralSignals(text) {
  const out = {};

  // ALL CAPS + multiple exclamation marks → ranting / hostile shouting
  const letters = text.replace(/[^A-Za-z]/g, '');
  const upper   = text.replace(/[^A-Z]/g, '');
  const exclam  = (text.match(/!/g) ?? []).length;
  if (letters.length >= 20 && upper.length / letters.length >= 0.7 && exclam >= 3) {
    out.community_conflict = { score: 1, reason: 'ALL-CAPS shouting + ≥3 exclamation marks' };
  }

  // @-mention bomb — likely coordinated harassment / brigading
  const mentions = (text.match(/@[\w.\-]+/g) ?? []).length;
  if (mentions >= 8) {
    out.community_conflict = { score: 2, reason: `Excessive @-mentions (${mentions}) — possible coordinated attack` };
  }

  // Known scam/phishing/giveaway domains (basic curated list)
  const SCAM_DOMAINS = [
    'bit.ly/free', 'tinyurl.com/free', 'giveaway-now', 'free-nft', 'claim-airdrop',
    'crypto-airdrop', 'metamask-verify', 'discord-nitro-gen', 'steam-giveaway-now',
    'roblox-rbx-free', 'free-robux-now', 't.me/+free',
  ];
  const lower = text.toLowerCase();
  const hitDomain = SCAM_DOMAINS.find(d => lower.includes(d));
  if (hitDomain) {
    out.crime = { score: 2, reason: `Suspicious giveaway/scam URL (${hitDomain})` };
  }

  return out;
}

// ── Engine entry points ─────────────────────────────────────────────────────

/** Apply rule engine to a single post text. */
function applyRules(text) {
  if (!text || !text.trim()) return null;
  if (isWhitelisted(text)) {
    return {
      scores:  Object.fromEntries(CATEGORIES.map(c => [c, 0])),
      reasons: {},
      source:  'whitelist',
    };
  }

  const normalized = normalizeForMatching(text);
  const scores  = Object.fromEntries(CATEGORIES.map(c => [c, 0]));
  const reasons = {};

  const apply = (cat, score, reason) => {
    if (score > scores[cat]) { scores[cat] = score; reasons[cat] = reason; }
  };

  // 3. Pattern rules
  for (const [cat, rules] of Object.entries(RULE_SET)) {
    for (const r of rules) {
      if (r.pattern.test(normalized)) apply(cat, r.score, r.reason);
    }
  }

  // 4. obscenity (English)
  for (const [cat, hit] of Object.entries(obscenityScores(text))) {
    apply(cat, hit.score, hit.reason);
  }

  // 5. Structural signals (use original text — case matters here)
  for (const [cat, hit] of Object.entries(structuralSignals(text))) {
    apply(cat, hit.score, hit.reason);
  }

  // Skip LLM only on score=3 hits. Score=2/1 still goes to LLM for nuance.
  const hasScore3 = Object.values(scores).some(v => v === 3);
  return hasScore3 ? { scores, reasons, source: 'rules' } : null;
}

/**
 * Run the rule engine against all posts.
 * @param {object[]} posts
 * @returns {Map<string, { scores, reasons, source }>}
 */
export function applyRulesAll(posts) {
  const results = new Map();

  // Cross-post pass: cluster posts by identical normalized text. A cluster
  // of ≥3 is treated as ONE coordinated/spam event attributed to a single
  // representative post (earliest by created_at); siblings receive no
  // cross-post escalation. This keeps user-level severe/flag counts honest
  // when the same content is reposted many times.
  //
  // Posts where `text` is inherited platform metadata (Twitch clip titles,
  // YouTube video titles, etc.) are excluded — sharing a title across N
  // items of one stream/series is structural, not coordinated brigading.
  const clusters = new Map();   // key → post[]
  for (const p of posts) {
    if (!p.is_authored_text) continue;
    const key = String(p.text ?? '').trim().slice(0, 120);
    if (key.length < 20) continue;
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push(p);
  }

  const spamRep    = new Map();   // representative post.id → { count }
  const siblingIds = new Set();   // sibling post.id (cluster members other than rep)
  for (const group of clusters.values()) {
    if (group.length < 3) continue;
    const rep = group.reduce((a, b) =>
      (a.created_at ?? '') <= (b.created_at ?? '') ? a : b
    );
    const repId = String(rep.id);
    spamRep.set(repId, { count: group.length });
    for (const p of group) {
      const pid = String(p.id);
      if (pid !== repId) siblingIds.add(pid);
    }
  }

  for (const post of posts) {
    const text = (post.text ?? '').slice(0, 1500);
    const result = applyRules(text);

    const rep = spamRep.get(String(post.id));

    // Cross-post + structural signal compound escalation, applied ONLY to
    // the cluster representative:
    //   identical repeated text + scam URL  → high-confidence scam (crime=3)
    //   identical repeated text + ALL-CAPS  → high-confidence brigade (community_conflict=3)
    if (rep) {
      const struct = structuralSignals(text);
      const r = result ?? {
        scores:  Object.fromEntries(CATEGORIES.map(c => [c, 0])),
        reasons: {},
        source:  'rules',
      };
      const count = rep.count;
      if (struct.crime?.score === 2) {
        r.scores.crime  = 3;
        r.reasons.crime = `${struct.crime.reason} + identical text ${count}× across scrape`;
      }
      if (struct.community_conflict?.score === 1) {
        r.scores.community_conflict  = 3;
        r.reasons.community_conflict = `Coordinated shouting (${count}× identical, ALL-CAPS)`;
      }
      if (r.scores.community_conflict < 2) {
        r.scores.community_conflict  = 2;
        r.reasons.community_conflict = `Identical text repeated ${count}× across scrape`;
      }
      if (Object.values(r.scores).some(v => v === 3)) {
        results.set(String(post.id), r);
      }
    } else if (result) {
      results.set(String(post.id), result);
    } else if (siblingIds.has(String(post.id))) {
      // Sibling of a dup cluster representative: own text triggered no
      // individual rule. Short-circuit with an all-zero result so it
      // bypasses the LLM (cluster signal is already on the rep) while
      // still being counted in post_count by aggregateUserRisk.
      results.set(String(post.id), {
        scores:  Object.fromEntries(CATEGORIES.map(c => [c, 0])),
        reasons: {},
        source:  'duplicate',
      });
    }
  }
  return results;
}
