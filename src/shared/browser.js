/**
 * browser.js — P0
 * CloakBrowser 启动、持久 session 管理、登录流程、session 失效检测
 */

import { launchPersistentContext } from 'cloakbrowser';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { waitForLoginSignal } from './login-signal.js';

// ── Resource types to block (not needed for scraping) ──────────────────────
const BLOCKED_TYPES = new Set(['image', 'stylesheet', 'font', 'media']);

export async function createBrowser(sessionDir, { headless = true, debug = false, viewport = null } = {}) {
  if (!existsSync(sessionDir)) mkdirSync(sessionDir, { recursive: true });

  const context = await launchPersistentContext({
    userDataDir: sessionDir,
    headless,
    humanize: true,
    ...(viewport ? { viewport } : {}),
  });

  return context;
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
export async function waitForLogin(page, username) {
  console.log('\nNot logged in. Please log in to Twitter/X in the browser window.');
  console.log('─'.repeat(50));
  console.log('  After login completes → press Enter here to continue');
  console.log('─'.repeat(50));

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

export function clearSession(sessionDir) {
  if (existsSync(sessionDir)) {
    rmSync(sessionDir, { recursive: true, force: true });
  }
}

export function sessionExists(sessionDir) {
  return existsSync(join(sessionDir, 'Default'));
}
