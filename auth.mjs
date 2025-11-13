// auth.mjs
// Shared authentication module for all ABS scrapers
// Handles login and authentication state management

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOGIN_URL = process.env.ABS_LOGIN_URL || 'https://abs.brightstarcare.com/Account/Login';
const STORAGE_STATE = path.join(__dirname, 'storageState.json');

const USERNAME = process.env.ABS_USER || '';
const PASSWORD = process.env.ABS_PASS || '';

/**
 * Check if storage state file exists
 */
async function ensureAuthState() {
  try {
    await fs.access(STORAGE_STATE);
    return true;
  } catch {
    return false;
  }
}

/**
 * Test if stored authentication is still valid
 */
async function testAuthState(page) {
  try {
    // Check current URL first without navigating
    const currentUrl = page.url();
    if (currentUrl && !currentUrl.includes('about:blank') && !currentUrl.includes('/Account/Login')) {
      // Already on a valid page, just check if we can access it
      try {
        await page.waitForLoadState('domcontentloaded', { timeout: 3000 });
        return true;
      } catch {
        // Page might be loading, try navigation
      }
    }
    
    // Navigate to test auth
    await page.goto('https://abs.brightstarcare.com/', { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(1000); // Give page time to settle
    
    if (page.url().includes('/Account/Login')) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if page is blocked
 */
async function assertNotBlocked(page, context) {
  const title = await page.title();
  if (title.includes('Access Denied') || title.includes('Blocked')) {
    throw new Error(`Page appears to be blocked in ${context} context`);
  }
}

/**
 * Perform login
 */
async function login(page, user, pass) {
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
  await assertNotBlocked(page, 'login');

  // Handle cookie consent if present
  await page.getByText('Accept All', { exact: false }).first().click({ timeout: 1200 }).catch(() => {});
  await page.getByRole('button', { name: /accept/i }).click({ timeout: 1200 }).catch(() => {});

  // Fill in credentials
  await page.locator('#UserName').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('#Password').waitFor({ state: 'visible', timeout: 15000 });
  await page.fill('#UserName', user);
  await page.fill('#Password', pass);

  // Submit form
  const submit = page.locator('button[type="submit"], input[type="submit"]');
  if (await submit.count()) {
    await submit.first().click();
  } else {
    await page.press('#Password', 'Enter');
  }

  // Wait for redirect away from login page
  await Promise.race([
    page.waitForURL(u => !/\/Account\/Login/i.test(u.href), { timeout: 25000 }),
    page.waitForLoadState('networkidle', { timeout: 25000 }),
  ]).catch(() => {});

  // Check if still on login page (login failed)
  if (/\/Account\/Login/i.test(page.url())) {
    throw new Error('Still on login after submit — check credentials/MFA.');
  }
}

/**
 * Perform login and save authentication state
 */
async function performLogin(page) {
  if (!USERNAME || !PASSWORD) {
    throw new Error('Username and password must be provided via ABS_USER and ABS_PASS environment variables');
  }
  
  console.log('Performing login...');
  await login(page, USERNAME, PASSWORD);
  
  // Save the authentication state for future use
  await page.context().storageState({ path: STORAGE_STATE });
  console.log('Authentication state saved');
}

/**
 * Get an authenticated browser context and page
 * Reuses existing authentication if valid, otherwise performs fresh login
 * 
 * @param {Object} options - Browser options
 * @param {boolean} options.headless - Run in headless mode (default: based on DEBUG env var)
 * @returns {Promise<{browser: Browser, context: BrowserContext, page: Page}>}
 */
async function getAuthenticatedBrowser(options = {}) {
  const headless = options.headless !== undefined ? options.headless : process.env.DEBUG !== 'True';
  
  const browser = await chromium.launch({ 
    headless,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-software-rasterizer'] 
  });
  
  // Handle browser crashes
  browser.on('disconnected', () => {
    console.error('Browser disconnected unexpectedly');
  });
  
  let context;
  let page;
  
  // Check if we have existing auth state
  const hasStorage = await ensureAuthState();
  
  if (hasStorage) {
    try {
      // Try to use existing storage state
      context = await browser.newContext({
        storageState: STORAGE_STATE,
        locale: 'en-US',
        timezoneId: 'America/Chicago',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        viewport: { width: 1400, height: 900 },
      });
      await context.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => undefined }));
      page = await context.newPage();
      
      // Test if the stored auth is still valid
      const isValid = await testAuthState(page);
      if (isValid) {
        console.log('Using existing authentication state');
        return { browser, context, page };
      } else {
        console.log('Stored authentication expired, performing fresh login');
        await context.close();
      }
    } catch (error) {
      console.log('Error using stored auth, performing fresh login:', error.message);
      if (context) await context.close();
    }
  }
  
  // No valid auth state, perform fresh login
  if (!context) {
    console.log('No stored authentication found, performing fresh login');
    context = await browser.newContext({
      locale: 'en-US',
      timezoneId: 'America/Chicago',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1400, height: 900 },
    });
    await context.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => undefined }));
    page = await context.newPage();
    await performLogin(page);
  }
  
  return { browser, context, page };
}

export default {
  getAuthenticatedBrowser,
  ensureAuthState,
  testAuthState,
  performLogin,
  login
};

