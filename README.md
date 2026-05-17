# sns-audit

Social media content audit and risk classification tool for influencer background checks.

Scrapes posts from 7 platforms, runs a keyword rule engine as a pre-filter, then submits borderline content to OpenAI's Batch API for nuanced multilingual classification across 8 risk dimensions (Japanese · Korean · English).

---

## Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [CLI Usage](#cli-usage)
  - [twitter](#twitter)
  - [tiktok](#tiktok)
  - [reddit](#reddit)
  - [threads](#threads)
  - [pixiv](#pixiv)
  - [naver](#naver)
  - [youtube](#youtube)
  - [classify](#classify)
- [Programmatic API](#programmatic-api)
- [Classification](#classification)
- [Data Normalization](#data-normalization)
- [Output Formats](#output-formats)

---

## Requirements

| Requirement | Purpose |
|-------------|---------|
| Node.js ≥ 18 | Runtime |
| **OpenAI API key** | `classify` command — LLM batch scoring |
| **YouTube Data API v3 key** | `youtube` command |
| **CloakBrowser** session | Twitter, TikTok, Pixiv, Threads, Naver — first run requires `--headed` login |

Set API keys via environment variables to avoid passing them on the command line:

```bash
export OPENAI_API_KEY=sk-...
export YOUTUBE_API_KEY=AIza...
```

---

## Installation

```bash
npm install
npm link          # makes `sns-audit` available globally
```

---

## CLI Usage

All scrape commands share a common set of options:

```
--max <n>         Max items per target          (default: 200)
--since <date>    YYYY-MM-DD lower bound
--until <date>    YYYY-MM-DD upper bound
--keyword <text>  Filter by keyword
--out <path>      Output file or directory
--format <fmt>    json | csv
--debug           Verbose logging
```

Browser-based platforms (Twitter, TikTok, Pixiv, Threads, Naver) additionally accept:

```
--headed          Run with visible browser — required for first-time login
--reset-session   Clear saved session and force re-login
```

---

### twitter

Scrapes tweets and replies. Runs two parallel tabs (Tweets + Tweets & Replies) per user.

```bash
sns-audit twitter <username...> [options]
```

| Option | Description |
|--------|-------------|
| `--no-retweets` | Exclude retweets |
| `--no-replies` | Exclude replies |
| `--report` | Generate an HTML report alongside JSON/CSV |

**Session:** saved to `.session-twitter/`

**Examples:**

```bash
# First login (opens browser)
sns-audit twitter elonmusk --headed --out out/ --max 500

# Subsequent runs (headless)
sns-audit twitter elonmusk Naval --out out/ --since 2024-01-01

# CSV, no retweets
sns-audit twitter elonmusk --format csv --no-retweets --out out/
```

---

### tiktok

Scrapes videos and optionally fetches top comments per video.

```bash
sns-audit tiktok <username...> [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--comments <n>` | `0` | Fetch up to N comments per video |

**Session:** saved to `.session-tiktok/`

**Examples:**

```bash
sns-audit tiktok @charlidamelio --headed --out out/
sns-audit tiktok charlidamelio --comments 100 --out out/
```

---

### reddit

Scrapes subreddits and user histories. Defaults to the Arctic Shift API for full post history; switch to `--source reddit` for recent posts with sorting.

```bash
sns-audit reddit <target...> [options]
```

Targets are prefixed: `r/subreddit` or `u/username`.

| Option | Default | Description |
|--------|---------|-------------|
| `--source <s>` | `arctic` | `arctic` (full history) or `reddit` (recent, sorted) |
| `--no-posts` | — | Skip posts |
| `--no-comments` | — | Skip comments |
| `--sort <s>` | — | `hot \| new \| top \| rising \| controversial` (reddit source only) |
| `--time <t>` | `all` | `hour \| day \| week \| month \| year \| all` (reddit source only) |

**Auth:** None — public APIs. No login required.

**Examples:**

```bash
# Full history of a user via Arctic Shift
sns-audit reddit u/spez --out out/

# Recent hot posts from a subreddit
sns-audit reddit r/worldnews --source reddit --sort hot --max 100 --out out/

# Multiple targets
sns-audit reddit u/spez r/announcements --out out/
```

---

### threads

Scrapes posts from Threads (Meta). Requires an Instagram/Meta login.

```bash
sns-audit threads <username...> [options]
```

| Option | Description |
|--------|-------------|
| `--no-replies` | Exclude replies |
| `--no-reposts` | Exclude reposts |

**Session:** saved to `.session-threads/`

```bash
sns-audit threads zuck --headed --out out/
```

---

### pixiv

Scrapes artwork metadata from Pixiv. Image files are not downloaded (full-res requires authentication at fetch time). R18/R18-G content requires your account's content settings to be enabled.

```bash
sns-audit pixiv <target...> [options]
```

Targets can be a numeric user ID (`12345678`) or a full profile URL.

| Option | Description |
|--------|-------------|
| `--no-r18` | Exclude R18 and R18-G artworks |
| `--only-r18` | Include only R18/R18-G artworks |

**Session:** saved to `.session-pixiv/`

```bash
sns-audit pixiv 12345678 --headed --out out/
sns-audit pixiv https://www.pixiv.net/en/users/12345678 --no-r18 --out out/
```

---

### naver

Scrapes posts from Naver Café communities.

```bash
sns-audit naver <url...> [options]
```

**Session:** saved to `.session-naver/`

```bash
sns-audit naver https://cafe.naver.com/mycafe --headed --out out/
```

---

### youtube

Scrapes channel metadata and video details via the YouTube Data API v3. No browser required.

```bash
sns-audit youtube <target...> [options]
```

Targets can be a channel URL, `@handle`, or `UC...` channel ID.

| Option | Default | Description |
|--------|---------|-------------|
| `--api-key <key>` | `YOUTUBE_API_KEY` | YouTube Data API v3 key |
| `--comments <n>` | `0` | Fetch up to N comments per video |

```bash
sns-audit youtube @MrBeast --out out/
sns-audit youtube UC-lHJZR3Gqxm24_Vd_AJ5Yw --max 50 --out out/
```

---

### classify

Classifies scraped content for risk using OpenAI's Batch API. The workflow is asynchronous: submit a batch, wait 1–24 hours, then retrieve results.

```bash
sns-audit classify [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--input <path>` | — | JSON file, directory, or glob (e.g. `out/*.json`) |
| `--api-key <key>` | `OPENAI_API_KEY` | OpenAI API key |
| `--model <model>` | `gpt-4o-mini` | OpenAI model |
| `--batch-id <id>` | — | Resume an existing batch; use `last` for most recent pending |
| `--wait` | — | Poll until batch completes (blocks) |
| `--comments` | — | Also classify comment items |
| `--out <dir>` | — | Output directory |
| `--format <fmt>` | `json` | `json` or `csv` |
| `--list-batches` | — | Show all saved batch jobs and exit |
| `--debug` | — | Verbose logging |

**Typical workflow:**

```bash
# Step 1: scrape
sns-audit twitter elonmusk --out out/ --max 500

# Step 2: submit batch (accepts a single file, directory, or glob)
sns-audit classify --input out/elonmusk.json --out results/

# ...wait 1-24 hours...

# Step 3: retrieve results (use the batch ID printed in Step 2)
sns-audit classify --batch-id batch_abc123 --input out/elonmusk.json --out results/ --wait

# Shorthand: resume the most recent pending batch
sns-audit classify --batch-id last --input out/elonmusk.json --out results/ --wait

# Classify multiple files at once
sns-audit classify --input out/ --out results/
sns-audit classify --input "out/*.json" --out results/

# List all past batch jobs
sns-audit classify --list-batches
```

Batch job state is persisted to `~/.sns-audit/batches.json` and survives terminal restarts.

---

## Programmatic API

Install as a dependency, then import by platform or from the main entry:

```js
import {
  // Twitter
  scrapeTwitter, scrapeTwitterUser, parseTwitterUsername,
  toTwitterJSON, toTwitterCSV, generateTwitterReport,

  // TikTok
  scrapeTikTok, scrapeTikTokUser, parseTikTokUser,
  toTikTokJSON, toTikTokCSV, toTikTokCommentsCSV,

  // Reddit
  scrapeReddit, scrapeArctic,
  toRedditJSON, toRedditCSV,

  // Threads
  scrapeThreads, scrapeThreadsUser,
  toThreadsJSON, toThreadsCSV,

  // Pixiv
  scrapePixiv, scrapePixivUser,
  toPixivJSON, toPixivCSV,

  // Naver
  scrapeNaver, scrapeNaverCafe,
  toNaverJSON, toNaverCSV,

  // YouTube
  scrapeYouTube, scrapeYouTubeChannel, parseYouTubeChannel,
  toYouTubeJSON, toYouTubeCSV,

  // Classifier
  CATEGORIES,
  submitBatch, fetchBatchResults, aggregateUserRisk,
  applyRulesAll,
  toClassifierJSON, toUserRiskCSV, toFlaggedPostsCSV,

  // Normalization
  normalizePost, normalizePosts, extractPosts, mergeAndNormalize,
} from 'sns-audit';
```

Or import only what you need via sub-path:

```js
import { scrapeTwitter } from 'sns-audit/twitter';
import { submitBatch }   from 'sns-audit/classify';
```

**End-to-end example:**

```js
import {
  scrapeTwitter,
  normalizePosts, mergeAndNormalize,
  applyRulesAll,
  submitBatch, fetchBatchResults,
  aggregateUserRisk,
} from 'sns-audit';

// 1. Scrape
const raw = await scrapeTwitter(['elonmusk', 'naval'], {
  max: 300,
  since: '2024-01-01',
  headed: false,            // session must already exist
});

// 2. Normalize across platforms (accepts multiple JSON blobs)
const posts = mergeAndNormalize(Object.values(raw));

// 3. Rule-engine pre-filter (high-confidence patterns skip LLM)
const ruleResults = applyRulesAll(posts);
const llmPosts    = posts.filter(p => !ruleResults.has(String(p.id)));

// 4. Submit to OpenAI Batch API
const { batchId } = await submitBatch(llmPosts, {
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o-mini',
});
console.log('Batch submitted:', batchId);

// 5. Retrieve (call later, or pass wait: true to block)
const { results: llmResults } = await fetchBatchResults(batchId, {
  apiKey: process.env.OPENAI_API_KEY,
  wait: true,
});

// 6. Aggregate
const allResults = { ...Object.fromEntries(ruleResults), ...llmResults };
const userRisks  = aggregateUserRisk(posts, allResults);

// userRisks is sorted by risk_score descending
for (const user of userRisks) {
  console.log(user.username, user.risk_level, user.risk_score);
}
```

---

## Classification

### Risk dimensions

Each post is scored 0–3 across 8 dimensions:

| Dimension | Description |
|-----------|-------------|
| `religion` | Religious extremism, blasphemy, sect incitement |
| `politics` | Political propaganda, regime attacks, voter manipulation |
| `race_discrimination` | Racial slurs, ethnic hate, xenophobia |
| `fandom_conflict` | Idol/anime/game fan wars, coordinated attacks on creators |
| `creative_risk` | R18 doujin/fan-fiction terms, creator harassment, toxic ship wars |
| `community_conflict` | Subtle mockery, passive-aggression, community infighting |
| `crime` | Threats, doxxing, self-harm incitement, undisclosed paid promotion (ステマ/뒷광고) |
| `r18` | Explicit sexual content |

Score scale: `0` = none · `1` = mild · `2` = moderate · `3` = severe

### Rule engine

Before any LLM call, every post is evaluated by a regex rule engine (`applyRulesAll`):

- **Score 3 match** → post is flagged and **skipped by LLM** (saves cost, latency)
- **Score 2 match** → post is still sent to LLM for contextual judgment
- **Whitelist match** (e.g., short greetings like ありがとう, 감사합니다, thank you) → all-zero scores, **skipped by LLM**
- **No match** → sent to LLM

Rules cover death threats, doxxing, racial slurs, and explicit content in Japanese, Korean, and English.

### User risk aggregation

`aggregateUserRisk(posts, results)` returns an array sorted by `risk_score` (0–100):

```js
{
  author_id:          string,
  username:           string,
  risk_level:         'low' | 'medium' | 'high' | 'critical',
  risk_score:         number,       // 0–100
  post_count:         number,
  flagged_post_count: number,       // posts with max score ≥ 2
  severe_post_count:  number,       // posts with max score = 3
  top_categories:     string[],     // up to 3 highest-scoring categories
  category_averages:  { [category]: number },
  flagged_posts:      [...],        // top 10 posts with reasons
}
```

Each flagged post includes `source: 'rules' | 'llm'` so you can see which engine caught it, plus a `reasons` map with a ≤10-word English explanation per non-zero category.

### Batch API cost

Using `gpt-4o-mini` at Batch API pricing (50% discount vs. synchronous):

| Posts | Estimated cost |
|-------|---------------|
| 500   | ~$0.04        |
| 5,000 | ~$0.40        |
| 50,000 | ~$4.00       |

Costs vary with text length and image count. The rule engine typically filters 10–30% of posts before they reach the LLM, further reducing cost.

---

## Data Normalization

All scrapers output platform-specific shapes. `normalizePosts` / `mergeAndNormalize` convert any format to a common schema before classification:

```js
{
  id:         string,
  platform:   'twitter' | 'tiktok' | 'reddit' | 'threads' | 'pixiv' | 'naver_cafe' | 'youtube',
  url:        string,
  text:       string,       // title + body + transcript, pre-joined and URL-stripped
  created_at: string | null,
  author:     { id, username, name },
  media:      [{ type: 'photo' | 'video', url: string }],
  type:       string,       // 'tweet' | 'video' | 'post' | 'comment' | 'artwork' ...
  rt_from:    { tweet_id, username } | null,
  tags:       string[],
  is_r18:     boolean,
  // ...original platform fields preserved
}
```

`text` construction per platform:

| Platform | `text` source |
|----------|--------------|
| Twitter | `tweet.text` |
| TikTok | `video.description` |
| Reddit | `post.title + '\n' + post.text` |
| Threads | `thread.text` |
| Pixiv | `artwork.title + '\n' + artwork.caption + '\n' + tags.join(' ')` |
| Naver | `post.title + '\n' + post.text` |
| YouTube | `video.title + '\n' + video.description + '\n' + video.transcript` |

---

## Output Formats

### Scraper output (JSON)

| Platform | Structure |
|----------|-----------|
| Twitter | `{ profile, tweets }` |
| TikTok | `{ profile, videos }` |
| YouTube | `{ profile, videos }` |
| Naver | `{ cafe, posts }` |
| Reddit | `[...posts]` |
| Threads | `[...threads]` |
| Pixiv | `[...artworks]` |

### Classifier output

**JSON** (`classifier_results.json`):
```json
{
  "user_risks": [...],
  "post_results": { "<post_id>": { "scores": {...}, "reasons": {...}, "source": "llm" } }
}
```

**CSV** (two files):
- `user_risks.csv` — one row per user, aggregate scores and risk level
- `flagged_posts.csv` — one row per flagged post with scores, text excerpt, and reasons
