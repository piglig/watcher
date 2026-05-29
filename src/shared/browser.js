/**
 * browser.js — P0
 * CloakBrowser 启动、持久 session 管理、登录流程、session 失效检测
 */

import { launchContext, launchPersistentContext } from 'cloakbrowser';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { waitForLoginSignal } from './login-signal.js';
import { createLogger } from './logger.js';

// ── Resource types to block (not needed for scraping) ──────────────────────
const BLOCKED_TYPES = new Set(['image', 'stylesheet', 'font', 'media']);

// ── storageState session (best practice) ────────────────────────────────────
//
// Instead of a persistent Chromium userDataDir — a single, mutable, lockable
// on-disk profile that fails to launch when it's locked/corrupt or used by two
// launches at once ("browserType.launchPersistentContext: Target page, context
// or browser has been closed") — persist only the session as a portable
// `storageState` JSON (cookies + localStorage). Every scrape then launches a
// FRESH, isolated incognito context seeded from that JSON, so:
//   - launches never fight over one on-disk profile (no lock crashes), and
//   - the background daemon's queued scrapes are safe to run back-to-back.
// cloakbrowser's launchContext closes the underlying browser when the context
// closes, so there's no process leak.

/** Path to the session's storageState JSON inside its session dir. */
export function sessionStatePath(sessionDir) {
  return join(sessionDir, 'state.json');
}

/** True once a session has been saved (i.e. the user has logged in). */
export function sessionStateExists(sessionDir) {
  return existsSync(sessionStatePath(sessionDir));
}

/**
 * True if a usable session exists — either a saved storageState OR a legacy
 * persistent profile that launchSessionContext will migrate on first use. Use
 * this (not sessionStateExists) to gate headless scrapes, so an existing login
 * in the old profile format isn't rejected before migration can run.
 */
export function hasSavedSession(sessionDir) {
  return sessionStateExists(sessionDir) || existsSync(join(sessionDir, 'Default'));
}

/**
 * Launch a fresh isolated context, seeded from the saved storageState if one
 * exists. No persistent profile, so no lock/corruption launch failures.
 *
 * One-time migration: an older build stored the login in a persistent Chromium
 * profile under this same dir. If we find that profile but no storageState yet,
 * export it once so the existing login survives the switch — then the
 * persistent profile is never touched again. Best-effort: if the export fails
 * the caller simply gets a logged-out context (and re-logs in when headed).
 */
export async function launchSessionContext(sessionDir, { headless = true, viewport = null } = {}) {
  const statePath = sessionStatePath(sessionDir);

  if (!existsSync(statePath) && existsSync(join(sessionDir, 'Default'))) {
    try {
      const legacy = await launchPersistentContext({ userDataDir: sessionDir, headless: true, humanize: true });
      try { await legacy.storageState({ path: statePath }); }
      finally { await legacy.close(); }
    } catch { /* migration is best-effort — fall through to a fresh context */ }
  }

  return launchContext({
    headless,
    humanize: true,
    ...(viewport ? { viewport } : {}),
    contextOptions: existsSync(statePath) ? { storageState: statePath } : {},
  });
}

/** Persist the context's cookies + localStorage so the next launch is logged in. */
export async function saveSessionState(context, sessionDir) {
  if (!existsSync(sessionDir)) mkdirSync(sessionDir, { recursive: true });
  await context.storageState({ path: sessionStatePath(sessionDir) });
}

/** Drop the saved session (forces a fresh login next headed run). */
export function clearSessionState(sessionDir) {
  const p = sessionStatePath(sessionDir);
  if (existsSync(p)) rmSync(p, { force: true });
}

export async function setupPage(context) {
  const page = await context.newPage();

  // Block unused resource types to cut ~70% bandwidth
  await page.route('**/*', route => {
    if (BLOCKED_TYPES.has(route.request().resourceType())) {
      return route.abort();
    }
    return route.continue();
  });

  return page;
}

/**
 * P0: Check if the current page reflects an active Twitter session.
 * Returns true if logged in, false otherwise.
 */
export async function isLoggedIn(page) {
  try {
    return await page.evaluate(() => !!(
      document.querySelector('[data-testid="SideNav_NewTweet_Button"]') ||
      document.querySelector('[data-testid="AppTabBar_Profile_Link"]') ||
      document.querySelector('[data-testid="tweetButtonInline"]')
    ));
  } catch {
    return false;
  }
}

/**
 * P0: Mid-scrape session health check.
 * Called after several consecutive empty GraphQL responses to determine
 * whether the session has silently expired.
 */
export async function checkSessionHealth(page) {
  const url = page.url();
  if (url.includes('/login') || url.includes('/i/flow')) return false;
  return isLoggedIn(page);
}

/**
 * Wait for user to complete manual login in headed mode.
 * Resolves when URL leaves auth pages OR user presses Enter.
 */
export async function waitForLogin(page, username, log = createLogger()) {
  log.log('Not logged in. Please log in to Twitter/X in the browser window.');
  log.log('  After login completes → press Enter here to continue');

  const success = await Promise.race([
    // Auto-detect: URL leaves login flow AND session is confirmed active
    (async () => {
      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline) {
        await page.waitForTimeout(1500);
        const url = page.url();
        const onLoginPage =
          url.includes('/login') ||
          url.includes('/i/flow') ||
          url.includes('/signup') ||
          url.includes('apple.com') ||
          url.includes('appleid.apple.com');
        const onTwitter = url.includes('x.com') || url.includes('twitter.com');
        if (!onLoginPage && onTwitter && await isLoggedIn(page)) return true;
      }
      return false;
    })(),

    // Manual fallback: TUI user presses Enter
    waitForLoginSignal().then(() => true),
  ]);

  return success;
}
