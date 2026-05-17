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
 *   sns-audit youtube <target...>   [options]
 *   sns-audit classify              [options]
 */

import { program } from 'commander';
import { writeFileSync, mkdirSync, readFileSync, statSync } from 'fs';
import { resolve, join } from 'path';
import { globSync } from 'glob';

import { scrapeTwitter }            from '../src/platforms/twitter/index.js';
import { toJSON, toCSV, generateReport } from '../src/platforms/twitter/index.js';
import { printStats }               from '../src/platforms/twitter/output.js';

import { scrapeTikTok, parseTikTokUser }   from '../src/platforms/tiktok/index.js';
import { printTikTokStats, toTikTokJSON, toTikTokCSV, toTikTokCommentsCSV } from '../src/platforms/tiktok/index.js';

import { scrapeArctic, scrapeReddit }      from '../src/platforms/reddit/index.js';
import { printRedditStats, toRedditJSON, toRedditCSV } from '../src/platforms/reddit/index.js';

import { scrapeThreads, parseThreadsUsername } from '../src/platforms/threads/index.js';
import { printThreadsStats, toThreadsJSON, toThreadsCSV } from '../src/platforms/threads/index.js';

import { scrapePixiv, parsePixivUser }     from '../src/platforms/pixiv/index.js';
import { printPixivStats, toPixivJSON, toPixivCSV } from '../src/platforms/pixiv/index.js';

import { scrapeNaver, parseNaverCafe }     from '../src/platforms/naver/index.js';
import { printNaverStats, toNaverJSON, toNaverCSV } from '../src/platforms/naver/index.js';

import { scrapeYouTube, parseYouTubeChannel } from '../src/platforms/youtube/index.js';
import { printYouTubeStats, toYouTubeJSON, toYouTubeCSV } from '../src/platforms/youtube/index.js';

import { submitBatch, fetchBatchResults, aggregateUserRisk } from '../src/classifier/index.js';
import { applyRulesAll }            from '../src/classifier/index.js';
import { printClassifierStats, toClassifierJSON, toUserRiskCSV, toFlaggedPostsCSV } from '../src/classifier/index.js';
import { normalizePosts, mergeAndNormalize } from '../src/shared/normalize.js';
import { saveBatch, updateBatch, listBatches, findLastPending } from '../src/shared/batch-store.js';

import { resolveOutputPath, writeOutput, resolveFormat } from '../src/shared/writer.js';

// ── Shared option definitions ─────────────────────────────────────────────────

function addCommonScrapeOptions(cmd) {
  return cmd
    .option('--max <n>',       'Max items per target', '200')
    .option('--since <date>',  'YYYY-MM-DD lower bound')
    .option('--until <date>',  'YYYY-MM-DD upper bound')
    .option('--keyword <text>','Filter by keyword')
    .option('--out <path>',    'Output file or directory')
    .option('--format <fmt>',  'json | csv')
    .option('--debug',         'Verbose logging');
}

function addBrowserOptions(cmd) {
  return cmd
    .option('--headed',          'Run with visible browser (required for first login)')
    .option('--reset-session',   'Clear saved session and force re-login');
}

// ── twitter ───────────────────────────────────────────────────────────────────

const twitterCmd = program.command('twitter <username...>')
  .description('Scrape Twitter/X user tweets');

addCommonScrapeOptions(twitterCmd);
addBrowserOptions(twitterCmd);
twitterCmd
  .option('--no-retweets', 'Exclude retweets')
  .option('--no-replies',  'Exclude replies')
  .option('--report',      'Generate HTML report')
  .action(async (usernames, opts) => {
    const format = resolveFormat(opts.format, opts.out);
    const max    = parseInt(opts.max, 10);

    let results;
    try {
      results = await scrapeTwitter(usernames, {
        max, headed: opts.headed, debug: opts.debug,
        noRetweets: !opts.retweets, noReplies: !opts.replies,
        since: opts.since, until: opts.until, keyword: opts.keyword,
        resetSession: opts.resetSession, logger: console,
      });
    } catch (err) {
      console.error(`[ERROR] ${err.message}`);
      process.exit(1);
    }

    for (const username of Object.keys(results)) {
      const tweets  = results[username] ?? [];
      if (!tweets.length) { console.log(`No tweets for @${username}.`); continue; }

      printStats(tweets);
      const first   = tweets[0];
      const profile = first?.author
        ? { username: first.author.username, name: first.author.name,
            id: first.author.id, verified: first.author.verified,
            followers: first.author.followers, platform: 'twitter' }
        : null;

      const content = format === 'csv' ? toCSV(tweets) : toJSON(profile, tweets);
      const outFile = resolveOutputPath(opts.out, username, format);
      if (outFile) { writeOutput(outFile, content); console.log(`Saved ${tweets.length} tweets → ${outFile}`); }
      else { console.log('  Use --out <path> to save results.'); }

      if (opts.report) {
        const html     = generateReport(tweets, username);
        const dir      = opts.out ? resolve(opts.out) : resolve('.');
        mkdirSync(dir, { recursive: true });
        const repPath  = join(dir, `${username}_report.html`);
        writeOutput(repPath, html);
        console.log(`Report → ${repPath}`);
      }
    }
  });

// ── tiktok ────────────────────────────────────────────────────────────────────

const tiktokCmd = program.command('tiktok <username...>')
  .description('Scrape TikTok user videos (and optionally comments)');

addCommonScrapeOptions(tiktokCmd);
addBrowserOptions(tiktokCmd);
tiktokCmd
  .option('--comments <n>', 'Fetch up to N comments per video (default: 0)', '0')
  .action(async (usernames, opts) => {
    const format      = resolveFormat(opts.format, opts.out);
    const max         = parseInt(opts.max, 10);
    const maxComments = parseInt(opts.comments, 10);

    let results;
    try {
      results = await scrapeTikTok(usernames.map(u => parseTikTokUser(u) ?? u), {
        max, maxComments, headed: opts.headed, debug: opts.debug,
        since: opts.since, until: opts.until, keyword: opts.keyword,
        resetSession: opts.resetSession,
      });
    } catch (err) {
      console.error(`[ERROR] ${err.message}`);
      process.exit(1);
    }

    for (const [username, { profile, videos }] of Object.entries(results)) {
      if (!videos.length) { console.log(`No videos for @${username}.`); continue; }
      printTikTokStats(profile, videos);
      const outFile = resolveOutputPath(opts.out, username, format);
      if (outFile) {
        writeOutput(outFile, format === 'csv' ? toTikTokCSV(videos) : toTikTokJSON(profile, videos));
        console.log(`Saved ${videos.length} videos → ${outFile}`);
        if (format === 'csv' && maxComments > 0) {
          const cmtFile = outFile.replace(/\.csv$/, '_comments.csv');
          writeOutput(cmtFile, toTikTokCommentsCSV(videos));
          console.log(`Comments → ${cmtFile}`);
        }
      } else { console.log('  Use --out <path> to save results.'); }
    }
  });

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
  .action(async (targets, opts) => {
    const format  = resolveFormat(opts.format, opts.out);
    const max     = parseInt(opts.max, 10);
    const scraperFn = opts.source === 'reddit' ? scrapeReddit : scrapeArctic;

    let results;
    try {
      results = await scraperFn(targets, {
        max, since: opts.since, until: opts.until, keyword: opts.keyword,
        noPosts: !opts.posts, noComments: !opts.comments,
        sort: opts.sort, time: opts.time, debug: opts.debug,
      });
    } catch (err) {
      console.error(`[ERROR] ${err.message}`);
      process.exit(1);
    }

    for (const [target, items] of Object.entries(results)) {
      if (!items.length) { console.log(`No results for ${target}.`); continue; }
      printRedditStats(items);
      const outFile = resolveOutputPath(opts.out, target.replace('/', '_'), format);
      if (outFile) {
        writeOutput(outFile, format === 'csv' ? toRedditCSV(items) : toRedditJSON(items));
        console.log(`Saved ${items.length} items → ${outFile}`);
      } else { console.log('  Use --out <path> to save results.'); }
    }
  });

// ── threads ───────────────────────────────────────────────────────────────────

const threadsCmd = program.command('threads <username...>')
  .description('Scrape Threads user posts');

addCommonScrapeOptions(threadsCmd);
addBrowserOptions(threadsCmd);
threadsCmd
  .option('--no-replies',  'Exclude replies')
  .option('--no-reposts',  'Exclude reposts')
  .action(async (usernames, opts) => {
    const format = resolveFormat(opts.format, opts.out);
    const max    = parseInt(opts.max, 10);

    let results;
    try {
      results = await scrapeThreads(usernames, {
        max, headed: opts.headed, debug: opts.debug,
        since: opts.since, until: opts.until, keyword: opts.keyword,
        noReplies: !opts.replies, noReposts: !opts.reposts,
        resetSession: opts.resetSession,
      });
    } catch (err) {
      console.error(`[ERROR] ${err.message}`);
      process.exit(1);
    }

    for (const [username, threads] of Object.entries(results)) {
      if (!threads.length) { console.log(`No threads for @${username}.`); continue; }
      printThreadsStats(threads);
      const outFile = resolveOutputPath(opts.out, username, format);
      if (outFile) {
        writeOutput(outFile, format === 'csv' ? toThreadsCSV(threads) : toThreadsJSON(threads));
        console.log(`Saved ${threads.length} posts → ${outFile}`);
      } else { console.log('  Use --out <path> to save results.'); }
    }
  });

// ── pixiv ─────────────────────────────────────────────────────────────────────

const pixivCmd = program.command('pixiv <target...>')
  .description('Scrape Pixiv user artworks');

addCommonScrapeOptions(pixivCmd);
addBrowserOptions(pixivCmd);
pixivCmd
  .option('--no-r18',   'Exclude R18/R18-G content')
  .option('--only-r18', 'Only include R18/R18-G content')
  .action(async (targets, opts) => {
    const format = resolveFormat(opts.format, opts.out);
    const max    = parseInt(opts.max, 10);

    let results;
    try {
      results = await scrapePixiv(targets, {
        max, headed: opts.headed, debug: opts.debug,
        since: opts.since, until: opts.until, keyword: opts.keyword,
        noR18: !opts.r18, onlyR18: opts.onlyR18,
        resetSession: opts.resetSession,
      });
    } catch (err) {
      console.error(`[ERROR] ${err.message}`);
      process.exit(1);
    }

    for (const [target, { profile, artworks }] of Object.entries(results)) {
      if (!artworks.length) { console.log(`No artworks for ${target}.`); continue; }
      printPixivStats(artworks);
      const outFile = resolveOutputPath(opts.out, target, format);
      if (outFile) {
        writeOutput(outFile, format === 'csv' ? toPixivCSV(artworks) : toPixivJSON(profile, artworks));
        console.log(`Saved ${artworks.length} artworks → ${outFile}`);
      } else { console.log('  Use --out <path> to save results.'); }
    }
  });

// ── naver ─────────────────────────────────────────────────────────────────────

const naverCmd = program.command('naver <url...>')
  .description('Scrape Naver Café posts');

addCommonScrapeOptions(naverCmd);
addBrowserOptions(naverCmd);
naverCmd.action(async (urls, opts) => {
  const format = resolveFormat(opts.format, opts.out);
  const max    = parseInt(opts.max, 10);

  let results;
  try {
    results = await scrapeNaver(urls, {
      max, headed: opts.headed, debug: opts.debug,
      since: opts.since, until: opts.until, keyword: opts.keyword,
      resetSession: opts.resetSession,
    });
  } catch (err) {
    console.error(`[ERROR] ${err.message}`);
    process.exit(1);
  }

  for (const [url, { cafe, posts }] of Object.entries(results)) {
    const name = cafe?.name ?? url.replace(/[^a-z0-9]/gi, '_');
    if (!posts.length) { console.log(`No posts for ${name}.`); continue; }
    printNaverStats(posts);
    const outFile = resolveOutputPath(opts.out, name, format);
    if (outFile) {
      writeOutput(outFile, format === 'csv' ? toNaverCSV(posts) : toNaverJSON(cafe, posts));
      console.log(`Saved ${posts.length} posts → ${outFile}`);
    } else { console.log('  Use --out <path> to save results.'); }
  }
});

// ── youtube ───────────────────────────────────────────────────────────────────

const youtubeCmd = program.command('youtube <target...>')
  .description('Scrape YouTube channel videos via Data API v3');

addCommonScrapeOptions(youtubeCmd);
youtubeCmd
  .option('--api-key <key>', 'YouTube Data API v3 key (or YOUTUBE_API_KEY env var)')
  .option('--comments <n>',  'Fetch up to N comments per video (default: 0)', '0')
  .action(async (targets, opts) => {
    const format      = resolveFormat(opts.format, opts.out);
    const max         = parseInt(opts.max, 10);
    const maxComments = parseInt(opts.comments, 10);
    const apiKey      = opts.apiKey ?? process.env.YOUTUBE_API_KEY;

    if (!apiKey) {
      console.error('[ERROR] YouTube API key required: --api-key or YOUTUBE_API_KEY env var');
      process.exit(1);
    }

    let results;
    try {
      results = await scrapeYouTube(targets, {
        max, maxComments, apiKey, debug: opts.debug,
        since: opts.since, until: opts.until, keyword: opts.keyword,
      });
    } catch (err) {
      console.error(`[ERROR] ${err.message}`);
      process.exit(1);
    }

    for (const [target, { profile, videos }] of Object.entries(results)) {
      if (!videos.length) { console.log(`No videos for ${target}.`); continue; }
      printYouTubeStats(profile, videos);
      const outFile = resolveOutputPath(opts.out, target, format);
      if (outFile) {
        writeOutput(outFile, format === 'csv' ? toYouTubeCSV(videos) : toYouTubeJSON(profile, videos));
        console.log(`Saved ${videos.length} videos → ${outFile}`);
      } else { console.log('  Use --out <path> to save results.'); }
    }
  });

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
  .description('Classify scraped content for risk using OpenAI Batch API')
  .option('--input <path>',    'JSON file, directory, or glob pattern of scraper output')
  .option('--api-key <key>',   'OpenAI API key (or OPENAI_API_KEY env var)')
  .option('--model <model>',   'OpenAI model', 'gpt-4o-mini')
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
    if (resolvedBatchId === 'last') {
      const pending = findLastPending();
      if (!pending) { console.error('[ERROR] No pending batch found.'); process.exit(1); }
      resolvedBatchId = pending.id;
      console.log(`  Resuming batch: ${resolvedBatchId}`);
    }

    // ── validate ───────────────────────────────────────────────────────────────
    if (!opts.input && !resolvedBatchId) {
      console.error('[ERROR] Provide --input <path> to submit a new batch, --batch-id to retrieve results, or --list-batches.');
      process.exit(1);
    }

    const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('[ERROR] OpenAI API key required: --api-key or OPENAI_API_KEY env var');
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
        const result = await fetchBatchResults(resolvedBatchId, { apiKey, wait: opts.wait, debug: opts.debug });
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
        const { batchId: newId } = await submitBatch(llmPosts, { apiKey, model: opts.model, debug: opts.debug });
        saveBatch({
          id:          newId,
          model:       opts.model,
          post_count:  llmPosts.length,
          input_files: opts.input,
          out:         opts.out ?? null,
        });
        console.log(`\n  Batch submitted: ${newId}`);
        console.log(`  Results are usually ready in 1–24 hours.`);
        console.log(`  Resume with: sns-audit classify --batch-id ${newId}${opts.input ? ` --input ${opts.input}` : ''}${opts.out ? ` --out ${opts.out}` : ''} --wait`);
        if (!opts.wait) process.exit(0);
        const result = await fetchBatchResults(newId, { apiKey, wait: true, debug: opts.debug });
        updateBatch(newId, { status: 'completed', completed_at: new Date().toISOString() });
        llmResults = result.results;
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
        writeOutput(outFile, toClassifierJSON(userRisks, results));
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
