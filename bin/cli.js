#!/usr/bin/env node
/**
 * sns-audit CLI — Unified entry point for all platforms
 *
 * Usage:
 *   sns-audit twitter <username...> [options]
 *   sns-audit tiktok  <username...> [options]
 *   sns-audit reddit  <target...>   [options]   (r/sub or u/user)
 *   sns-audit threads <username...> [options]
 *   sns-audit pixiv   <target...>   [options]
 *   sns-audit naver   <url...>      [options]
 *   sns-audit youtube    <target...>   [options]
 *   sns-audit instagram  <username...> [options]
 *   sns-audit twitch     <login...>   [options]
 *   sns-audit classify               [options]
 */

import { program } from 'commander';
import { writeFileSync, mkdirSync, readFileSync, statSync } from 'fs';
import { resolve, join } from 'path';
import { globSync } from 'glob';

import { REGISTRY, generateReport } from '../src/platforms/registry.js';
import { scrapeToJSON }              from '../src/platforms/scrape-output.js';

import { submitBatch, fetchBatchResults, aggregateUserRisk, inferProvider, defaultModelForProvider, apiKeyForProvider, envNameForProvider, AI_PROVIDERS } from '../src/classifier/index.js';
import { applyRulesAll }            from '../src/classifier/index.js';
import { printClassifierStats, toClassifierJSON, toUserRiskCSV, toFlaggedPostsCSV } from '../src/classifier/index.js';
import { normalizePosts, mergeAndNormalize } from '../src/shared/normalize.js';
import { saveBatch, updateBatch, listBatches, findLastPending } from '../src/shared/batch-store.js';

import { resolveOutputPath, writeOutput, resolveFormat } from '../src/shared/writer.js';
import { createPinoLogger } from '../src/shared/logger.js';

// One structured (pino) logger for the whole CLI process, built lazily on first
// use. Library scrapers/classifier receive this via `opts.logger` so their
// progress/error output is structured rather than raw console writes.
let _cliLogger = null;
async function cliLogger(debug = false) {
  if (!_cliLogger) _cliLogger = await createPinoLogger({ debug });
  return _cliLogger;
}

// ── Shared option definitions ─────────────────────────────────────────────────

function addCommonScrapeOptions(cmd) {
  return cmd
    .option('--max <n>',       'Max items per target (default: unlimited)', '1000000')
    .option('--since <date>',  'YYYY-MM-DD lower bound')
    .option('--until <date>',  'YYYY-MM-DD upper bound')
    .option('--keyword <text>','Filter by keyword')
    .option('--out <path>',    'Output directory (one JSON file per target)')
    .option('--debug',         'Verbose logging');
}

function addBrowserOptions(cmd) {
  return cmd
    .option('--headed',          'Run with visible browser (required for first login)')
    .option('--reset-session',   'Clear saved session and force re-login');
}

// ── Registry-driven scrape action ──────────────────────────────────────────────
//
// Every platform scrapes, then writes the uniform { profile?, posts } JSON via
// scrapeToJSON. `mapOpts(opts)` injects per-command flags (e.g. --no-replies);
// `after(key, value, opts)` runs an extra side-effect per result (twitter --report).

function makeScrapeAction(platform, mapOpts = () => ({}), after = null) {
  const def = REGISTRY[platform];
  return async (targets, opts) => {
    const base = {
      max:    parseInt(opts.max, 10),
      since:  opts.since, until: opts.until, keyword: opts.keyword,
      headed: opts.headed, resetSession: opts.resetSession,
      debug:  opts.debug, logger: await cliLogger(opts.debug),
    };
    const scrapeOpts = { ...base, ...def.buildOpts(opts, process.env), ...mapOpts(opts) };
    const tgts = def.parseTarget ? targets.map(t => def.parseTarget(t) ?? t) : targets;

    let results;
    try { results = await def.scrape(tgts, scrapeOpts); }
    catch (err) { console.error(`[ERROR] ${err.message}`); process.exit(1); }

    for (const [key, value] of Object.entries(results)) {
      const { handle, profile, items } = def.extract(key, value);
      if (!items.length) { console.log(`No items for ${handle}.`); continue; }
      const outFile = resolveOutputPath(opts.out, handle, 'json');
      if (outFile) {
        writeOutput(outFile, scrapeToJSON(profile, items));
        console.log(`Saved ${items.length} → ${outFile}`);
      } else {
        console.log('  Use --out <path> to save results.');
      }
      if (after) after(key, value, opts);
    }
  };
}

// ── twitter ───────────────────────────────────────────────────────────────────

// ── twitter ───────────────────────────────────────────────────────────────────

const twitterCmd = program.command('twitter <username...>')
  .description('Scrape Twitter/X user tweets');
addCommonScrapeOptions(twitterCmd);
addBrowserOptions(twitterCmd);
twitterCmd
  .option('--no-retweets', 'Exclude retweets')
  .option('--no-replies',  'Exclude replies')
  .option('--report',      'Generate HTML report')
  .action(makeScrapeAction(
    'twitter',
    o => ({ noRetweets: !o.retweets, noReplies: !o.replies }),
    (key, tweets, opts) => {
      if (!opts.report) return;
      const dir = opts.out ? resolve(opts.out) : resolve('.');
      mkdirSync(dir, { recursive: true });
      const repPath = join(dir, `${key}_report.html`);
      writeOutput(repPath, generateReport(tweets, key));
      console.log(`Report → ${repPath}`);
    },
  ));

// ── tiktok ────────────────────────────────────────────────────────────────────

const tiktokCmd = program.command('tiktok <username...>')
  .description('Scrape TikTok user videos (and optionally comments)');
addCommonScrapeOptions(tiktokCmd);
addBrowserOptions(tiktokCmd);
tiktokCmd
  .option('--comments <n>', 'Fetch up to N comments per video (default: 0)', '0')
  .action(makeScrapeAction('tiktok', o => ({ maxComments: parseInt(o.comments, 10) })));

// ── reddit ────────────────────────────────────────────────────────────────────

const redditCmd = program.command('reddit <target...>')
  .description('Scrape Reddit users or subreddits (r/sub or u/user)');
addCommonScrapeOptions(redditCmd);
redditCmd
  .option('--source <s>',  'arctic (full history) | reddit (recent)', 'arctic')
  .option('--no-posts',    'Skip posts')
  .option('--no-comments', 'Skip comments')
  .option('--sort <s>',    'hot | new | top | rising | controversial (reddit source only)')
  .option('--time <t>',    'hour | day | week | month | year | all (reddit source only)', 'all')
  .action(makeScrapeAction('reddit', o => ({
    redditSource: o.source ?? 'arctic',
    noPosts: !o.posts, noComments: !o.comments, sort: o.sort, time: o.time,
  })));

// ── threads ───────────────────────────────────────────────────────────────────

const threadsCmd = program.command('threads <username...>')
  .description('Scrape Threads user posts');
addCommonScrapeOptions(threadsCmd);
addBrowserOptions(threadsCmd);
threadsCmd
  .option('--no-replies',  'Exclude replies')
  .option('--no-reposts',  'Exclude reposts')
  .action(makeScrapeAction('threads', o => ({ noReplies: !o.replies, noReposts: !o.reposts })));

// ── pixiv ─────────────────────────────────────────────────────────────────────

const pixivCmd = program.command('pixiv <target...>')
  .description('Scrape Pixiv user artworks');
addCommonScrapeOptions(pixivCmd);
addBrowserOptions(pixivCmd);
pixivCmd
  .option('--no-r18',   'Exclude R18/R18-G content')
  .option('--only-r18', 'Only include R18/R18-G content')
  .action(makeScrapeAction('pixiv', o => ({ noR18: !o.r18, onlyR18: o.onlyR18 })));

// ── naver ─────────────────────────────────────────────────────────────────────

const naverCmd = program.command('naver <url...>')
  .description('Scrape Naver Café posts');
addCommonScrapeOptions(naverCmd);
addBrowserOptions(naverCmd);
naverCmd.action(makeScrapeAction('naver'));

// ── youtube ───────────────────────────────────────────────────────────────────

const youtubeCmd = program.command('youtube <target...>')
  .description('Scrape YouTube channel videos via Data API v3');
addCommonScrapeOptions(youtubeCmd);
youtubeCmd
  .option('--api-key <key>', 'YouTube Data API v3 key (or YOUTUBE_API_KEY env var)')
  .option('--comments <n>',  'Fetch up to N comments per video (default: 0)', '0')
  .action(async (targets, opts) => {
    const apiKey = opts.apiKey ?? process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      console.error('[ERROR] YouTube API key required: --api-key or YOUTUBE_API_KEY env var');
      process.exit(1);
    }
    return makeScrapeAction('youtube', o => ({ maxComments: parseInt(o.comments, 10) }))(targets, opts);
  });

// ── instagram ─────────────────────────────────────────────────────────────────

const instagramCmd = program.command('instagram <username...>')
  .description('Scrape Instagram user posts and reels');
addCommonScrapeOptions(instagramCmd);
addBrowserOptions(instagramCmd);
instagramCmd
  .option('--no-reels', 'Skip the Reels tab')
  .action(makeScrapeAction('instagram', o => ({ reels: o.reels !== false })));

// ── twitch ────────────────────────────────────────────────────────────────────

const twitchCmd = program.command('twitch <login...>')
  .description('Scrape Twitch channel VODs and Clips via Helix API');
addCommonScrapeOptions(twitchCmd);
twitchCmd
  .option('--client-id <id>',      'Twitch Client-ID (or TWITCH_CLIENT_ID env var)')
  .option('--client-secret <sec>', 'Twitch Client-Secret (or TWITCH_CLIENT_SECRET env var)')
  .option('--max-vods <n>',        'Max VODs per channel (default: same as --max)')
  .option('--max-clips <n>',       'Max Clips per channel (default: same as --max)')
  .option('--vod-type <t>',        'VOD type: all | archive | highlight | upload', 'all')
  .option('--no-vods',             'Skip VODs')
  .option('--no-clips',            'Skip Clips')
  .action(makeScrapeAction('twitch', o => {
    const max = parseInt(o.max, 10);
    return {
      // scrapeTwitch reads clientId/clientSecret directly (env fallback inside).
      // mapOpts is spread after buildOpts, so commander's values win when given.
      ...(o.clientId     ? { clientId:     o.clientId }     : {}),
      ...(o.clientSecret ? { clientSecret: o.clientSecret } : {}),
      maxVods:  o.vods  === false ? 0 : parseInt(o.maxVods  ?? max, 10),
      maxClips: o.clips === false ? 0 : parseInt(o.maxClips ?? max, 10),
      vodType:  o.vodType,
    };
  }));

// ── classify ──────────────────────────────────────────────────────────────────

/**
 * Resolve --input to a list of absolute file paths.
 * Accepts: single file, directory (all *.json inside), or glob pattern.
 */
function resolveInputFiles(input) {
  const abs = resolve(input);
  let stat;
  try { stat = statSync(abs); } catch { /* not a real path — try glob */ }

  if (stat?.isDirectory()) {
    const files = globSync('*.json', { cwd: abs, absolute: true });
    if (!files.length) throw new Error(`No JSON files found in directory: ${abs}`);
    return files.sort();
  }

  if (stat?.isFile()) return [abs];

  // Glob pattern (contains * or ?)
  const files = globSync(input, { absolute: true });
  if (!files.length) throw new Error(`No files matched: ${input}`);
  return files.sort();
}

program.command('classify')
  .description('Classify scraped content for risk using OpenAI, Gemini, or DeepSeek')
  .option('--input <path>',    'JSON file, directory, or glob pattern of scraper output')
  .option('--api-key <key>',   'AI provider API key')
  .option('--provider <name>', 'openai | gemini | deepseek')
  .option('--model <model>',   'AI model')
  .option('--batch-id <id>',   'Resume an existing batch by ID (use "last" for most recent pending)')
  .option('--wait',            'Poll until batch completes')
  .option('--comments',        'Also classify comments')
  .option('--out <dir>',       'Output directory')
  .option('--format <fmt>',    'json | csv', 'json')
  .option('--list-batches',    'Show all saved batch jobs and exit')
  .option('--debug',           'Verbose logging')
  .action(async (opts) => {
    // ── list-batches ───────────────────────────────────────────────────────────
    if (opts.listBatches) {
      const batches = listBatches();
      if (!batches.length) { console.log('No saved batches.'); return; }
      console.log('Saved batch jobs (newest first):');
      console.log('─'.repeat(72));
      for (const b of batches) {
        const age  = Math.round((Date.now() - new Date(b.created_at)) / 3_600_000);
        const line = `[${b.status.toUpperCase().padEnd(9)}] ${b.id}  ${b.post_count} posts  ${age}h ago`;
        console.log(`  ${line}`);
        if (b.status === 'pending') {
          console.log(`             → sns-audit classify --batch-id ${b.id}${b.out ? ` --out ${b.out}` : ''}`);
        }
      }
      return;
    }

    // ── resolve batch ID ───────────────────────────────────────────────────────
    let resolvedBatchId = opts.batchId;
    let resolvedBatchRecord = null;
    if (resolvedBatchId === 'last') {
      const pending = findLastPending();
      if (!pending) { console.error('[ERROR] No pending batch found.'); process.exit(1); }
      resolvedBatchId = pending.id;
      resolvedBatchRecord = pending;
      console.log(`  Resuming batch: ${resolvedBatchId}`);
    }

    // ── validate ───────────────────────────────────────────────────────────────
    if (!opts.input && !resolvedBatchId) {
      console.error('[ERROR] Provide --input <path> to submit a new batch, --batch-id to retrieve results, or --list-batches.');
      process.exit(1);
    }

    const provider = inferProvider(opts.model ?? resolvedBatchRecord?.model, opts.provider ?? resolvedBatchRecord?.provider);
    const model = opts.model ?? resolvedBatchRecord?.model ?? defaultModelForProvider(provider);
    const apiKey = opts.apiKey ?? apiKeyForProvider(provider);
    if (!apiKey) {
      const envName = envNameForProvider(provider);
      console.error(`[ERROR] ${envName} required: --api-key or ${envName} env var`);
      process.exit(1);
    }

    // ── load & normalize posts ─────────────────────────────────────────────────
    let posts = [];
    if (opts.input) {
      let inputFiles;
      try {
        inputFiles = resolveInputFiles(opts.input);
      } catch (e) {
        console.error(`[ERROR] ${e.message}`);
        process.exit(1);
      }

      console.log(`  Loading ${inputFiles.length} file(s)…`);
      const dataObjects = [];
      for (const file of inputFiles) {
        try {
          dataObjects.push(JSON.parse(readFileSync(file, 'utf-8')));
        } catch (e) {
          console.error(`[ERROR] Failed to read ${file}: ${e.message}`);
          process.exit(1);
        }
      }

      posts = mergeAndNormalize(dataObjects, { includeComments: opts.comments });
      const withImages = posts.filter(p => p.media?.length).length;
      console.log(`  Loaded ${posts.length} items${withImages ? ` (${withImages} with images)` : ''}`);
      if (!posts.length) { console.log('  No posts found.'); process.exit(0); }
    }

    // ── rule engine pre-filter ─────────────────────────────────────────────────
    const ruleResults = posts.length ? applyRulesAll(posts) : new Map();
    if (ruleResults.size > 0) {
      const flagged     = [...ruleResults.values()].filter(r => r.source === 'rules').length;
      const whitelisted = [...ruleResults.values()].filter(r => r.source === 'whitelist').length;
      const llmCount    = posts.length - ruleResults.size;
      console.log(`  Rule engine: ${flagged} flagged, ${whitelisted} safe → ${llmCount} sent to LLM`);
    }
    const llmPosts = posts.filter(p => !ruleResults.has(String(p.id)));

    // ── LLM batch ──────────────────────────────────────────────────────────────
    let llmResults = {};

    try {
      if (resolvedBatchId) {
        const result = await fetchBatchResults(resolvedBatchId, { apiKey, provider, model, wait: opts.wait, debug: opts.debug, logger: await cliLogger(opts.debug) });
        if (result.status !== 'completed') {
          console.log(`\n  Batch not yet complete: ${result.status}`);
          console.log(`  Re-run with --wait to poll, or check back later.`);
          console.log(`  → sns-audit classify --batch-id ${resolvedBatchId}${opts.out ? ` --out ${opts.out}` : ''} --wait`);
          process.exit(0);
        }
        updateBatch(resolvedBatchId, { status: 'completed', completed_at: new Date().toISOString() });
        llmResults = result.results;

        // If posts weren't loaded from --input, we can't aggregate — just report retrieval
        if (!posts.length) {
          console.log(`  Retrieved ${Object.keys(llmResults).length} results for batch ${resolvedBatchId}.`);
          console.log('  Re-run with --input to merge results with original posts and generate reports.');
          process.exit(0);
        }
      } else if (llmPosts.length > 0) {
        const { batchId: newId } = await submitBatch(llmPosts, { apiKey, provider, model, debug: opts.debug, logger: await cliLogger(opts.debug) });
        saveBatch({
          id:          newId,
          provider,
          model,
          post_count:  llmPosts.length,
          input_files: opts.input,
          out:         opts.out ?? null,
        });
        if (provider === AI_PROVIDERS.DEEPSEEK) {
          updateBatch(newId, { status: 'completed', completed_at: new Date().toISOString() });
          const result = await fetchBatchResults(newId, { apiKey, provider, model, wait: false, debug: opts.debug, logger: await cliLogger(opts.debug) });
          llmResults = result.results;
        } else {
        console.log(`\n  Batch submitted: ${newId}`);
        console.log(`  Results are usually ready in 1–24 hours.`);
        console.log(`  Resume with: sns-audit classify --batch-id ${newId}${opts.input ? ` --input ${opts.input}` : ''}${opts.out ? ` --out ${opts.out}` : ''} --wait`);
        if (!opts.wait) process.exit(0);
        const result = await fetchBatchResults(newId, { apiKey, provider, model, wait: true, debug: opts.debug, logger: await cliLogger(opts.debug) });
        updateBatch(newId, { status: 'completed', completed_at: new Date().toISOString() });
        llmResults = result.results;
        }
      } else {
        console.log('  All posts handled by rule engine — no LLM batch needed.');
      }
    } catch (err) {
      console.error(`[ERROR] ${err.message}`);
      process.exit(1);
    }

    // ── aggregate & output ─────────────────────────────────────────────────────
    const results   = { ...Object.fromEntries(ruleResults), ...llmResults };
    const scored    = Object.keys(results).length;
    const withImages = posts.filter(p => p.media?.length).length;
    console.log(`\n  Scored ${scored}/${posts.length} items (${Object.keys(llmResults).length} via LLM, ${ruleResults.size} via rules)`);

    const userRisks = aggregateUserRisk(posts, results);
    printClassifierStats(userRisks, { withImages, totalPosts: posts.length });

    if (opts.out) {
      mkdirSync(resolve(opts.out), { recursive: true });
      const fmt = resolveFormat(opts.format, null);
      if (fmt === 'csv') {
        const userFile = join(resolve(opts.out), 'user_risks.csv');
        const flagFile = join(resolve(opts.out), 'flagged_posts.csv');
        writeOutput(userFile, toUserRiskCSV(userRisks));
        writeOutput(flagFile, toFlaggedPostsCSV(userRisks));
        console.log(`  Saved user risks    → ${userFile}`);
        console.log(`  Saved flagged posts → ${flagFile}`);
      } else {
        const outFile = join(resolve(opts.out), 'classifier_results.json');
        const ruleFlagged = [...ruleResults.values()].filter(r => r.source === 'rules').length;
        const whitelisted = [...ruleResults.values()].filter(r => r.source === 'whitelist').length;
        const sourceStats = {
          total:     posts.length,
          rules:     ruleFlagged,
          whitelist: whitelisted,
          llm:       posts.length - ruleResults.size,
        };
        writeOutput(outFile, toClassifierJSON(userRisks, results, sourceStats));
        console.log(`  Saved → ${outFile}`);
      }
    } else {
      console.log('  Use --out <dir> to save results.');
    }
  });

// ── Run ───────────────────────────────────────────────────────────────────────

program
  .name('sns-audit')
  .description('Social media content audit and risk classification tool')
  .version('2.0.0');

program.parse();
