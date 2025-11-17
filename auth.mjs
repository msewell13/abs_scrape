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
  // OIDC flow may go through authentication.brightstarcare.com first, then redirect to abs.brightstarcare.com
  console.log('Waiting for login redirect...');
  let redirectCompleted = false;
  
  try {
    // Wait for redirect to abs.brightstarcare.com (final destination) - must NOT be on login page
    await page.waitForURL(u => {
      const url = u.href;
      return url.includes('abs.brightstarcare.com') && 
             !url.includes('/Account/Login') && 
             !url.includes('authentication.brightstarcare.com');
    }, { timeout: 30000 });
    redirectCompleted = true;
    console.log('Login redirect completed successfully');
  } catch (e) {
    console.log('Primary redirect wait timed out, checking current state...');
  }
  
  // Give page time for any final redirects
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Check current URL
  let currentUrl;
  try {
    currentUrl = page.url();
    console.log('URL after login:', currentUrl);
  } catch (e) {
    throw new Error(`Page was closed during login redirect: ${e.message}`);
  }
  
  // If still on login page (not OIDC intermediate), login failed - check for error messages
  if (/\/Account\/Login/i.test(currentUrl) && !currentUrl.includes('authentication.brightstarcare.com')) {
    // Wait for page to fully load before checking for errors
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Try to get error message from page
    try {
      const errorText = await page.evaluate(() => {
        // Look for common error message selectors
        const errorSelectors = [
          '.validation-summary-errors',
          '.field-validation-error',
          '.alert-danger',
          '.alert',
          '[class*="error"]',
          '[class*="validation"]',
          '[id*="error"]',
          '[id*="Error"]'
        ];
        for (const selector of errorSelectors) {
          const elems = document.querySelectorAll(selector);
          for (const elem of elems) {
            const text = elem.textContent.trim();
            if (text && text.length > 0 && text.length < 500) {
              return text;
            }
          }
        }
        // Check page title or body text for errors
        const bodyText = document.body.textContent || '';
        if (bodyText.includes('Invalid') || bodyText.includes('incorrect') || bodyText.includes('error') || bodyText.includes('failed')) {
          return 'Login error detected (check page for details)';
        }
        return null;
      });
      if (errorText) {
        console.log('Login error message found:', errorText);
        throw new Error(`Login failed: ${errorText}. Check credentials/MFA.`);
      }
    } catch (e) {
      if (e.message.includes('Login failed:')) {
        throw e;
      }
      // If we can't get error message, continue with generic error
      console.log('Could not extract error message from page');
    }
    throw new Error('Still on login after submit — check credentials/MFA. URL: ' + currentUrl);
  }
  
  // If on OIDC intermediate page and redirect didn't complete, wait more
  if (currentUrl.includes('authentication.brightstarcare.com') && !redirectCompleted) {
    console.log('Waiting for OIDC redirect to complete...');
    try {
      await page.waitForURL(u => {
        const url = u.href;
        return url.includes('abs.brightstarcare.com') && 
               !url.includes('/Account/Login') && 
               !url.includes('authentication.brightstarcare.com');
      }, { timeout: 20000 });
      await new Promise(resolve => setTimeout(resolve, 1000));
      currentUrl = page.url();
      console.log('OIDC redirect completed, final URL:', currentUrl);
    } catch (e) {
      console.log('OIDC redirect timeout - may need manual navigation');
      // Try navigating to trigger redirect
      try {
        await page.goto('https://abs.brightstarcare.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
        await new Promise(resolve => setTimeout(resolve, 2000));
        currentUrl = page.url();
        console.log('Navigation triggered, current URL:', currentUrl);
      } catch (e2) {
        console.log('Navigation failed:', e2.message);
      }
    }
  }
  
  // Final verification - ensure we're not on a login page
  if (currentUrl && /\/Account\/Login/i.test(currentUrl) && !currentUrl.includes('authentication.brightstarcare.com')) {
    throw new Error('Still on login page after redirect attempts — check credentials/MFA.');
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
  
  // Verify page is still valid before saving state
  try {
    const testUrl = page.url();
    if (!testUrl) {
      throw new Error('Page URL is empty');
    }
  } catch (e) {
    throw new Error(`Page was closed after login: ${e.message}`);
  }
  
  // Save the authentication state for future use
  try {
    await page.context().storageState({ path: STORAGE_STATE });
    console.log('Authentication state saved');
  } catch (e) {
    console.log('Warning: Could not save authentication state:', e.message);
  }
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
    
    // Verify page is still valid after login
    try {
      const finalUrl = page.url();
      console.log('Final URL after login:', finalUrl);
      if (!finalUrl || finalUrl.includes('/Account/Login')) {
        throw new Error('Login did not complete successfully - still on login page');
      }
    } catch (e) {
      if (e.message.includes('closed') || e.message.includes('Target page')) {
        throw new Error('Page was closed during login process');
      }
      throw e;
    }
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

