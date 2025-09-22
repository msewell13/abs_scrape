// mobile_shift_maintenance_scrape.mjs
// Standalone scraper for "Mobile Shift Maintenance" grid
// Requires: Playwright (Chromium). Reuses your existing storageState.json for auth.

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Config you can tweak ----
const BASE_URL = 'https://abscore.brightstarcare.com/Scheduling/MobileShiftMaintenance/index/';
const LOGIN_URL = process.env.ABS_LOGIN_URL || 'https://abs.brightstarcare.com/Account/Login';
const STORAGE_STATE = path.join(__dirname, 'storageState.json'); // reuse from your other script
const OUTPUT_JSON = path.join(__dirname, 'msm_results.json');
const OUTPUT_CSV  = path.join(__dirname, 'msm_results.csv');

// Credentials - set these via environment variables or modify here
const USERNAME = process.env.ABS_USER || '';
const PASSWORD = process.env.ABS_PASS || '';

// Set the month you want to scrape (defaults to current month in your local time zone)
const today = new Date();
const YEAR  = today.getFullYear();
const MONTH = today.getMonth(); // 0-based
const monthStart = new Date(YEAR, MONTH, 1);
const monthEnd   = new Date(YEAR, MONTH + 1, 0);

// Utility: format as MM/DD/YYYY for Kendo DatePicker text values
function mmddyyyy(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const y = d.getFullYear();
  return `${m}/${day}/${y}`;
}

async function ensureAuthState() {
  try {
    await fs.access(STORAGE_STATE);
    return true;
  } catch {
    return false;
  }
}

async function testAuthState(page) {
  try {
    // Try to navigate to a protected page to test if auth is still valid
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 10000 });
    // Check if we're redirected to login
    if (page.url().includes('/Account/Login')) {
      return false;
    }
    // Check if we can see the main content (wait a bit for page to load)
    await page.waitForTimeout(2000);
    const hasStartDate = await page.locator('#dtpStartDate').isVisible({ timeout: 5000 }).catch(() => false);
    return hasStartDate;
  } catch {
    return false;
  }
}

async function assertNotBlocked(page, context) {
  // Simple check for common blocking patterns
  const title = await page.title();
  if (title.includes('Access Denied') || title.includes('Blocked')) {
    throw new Error(`Page appears to be blocked in ${context} context`);
  }
}

async function debugDump(page, context) {
  const title = await page.title();
  const url = page.url();
  console.log(`DEBUG ${context}: Title="${title}", URL="${url}"`);
}

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

async function login(page, user, pass) {
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
  await assertNotBlocked(page, 'login');

  await page.getByText('Accept All', { exact: false }).first().click({ timeout: 1200 }).catch(() => {});
  await page.getByRole('button', { name: /accept/i }).click({ timeout: 1200 }).catch(() => {});

  await page.locator('#UserName').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('#Password').waitFor({ state: 'visible', timeout: 15000 });
  await page.fill('#UserName', user);
  await page.fill('#Password', pass);

  const submit = page.locator('button[type="submit"], input[type="submit"]');
  if (await submit.count()) await submit.first().click(); else await page.press('#Password', 'Enter');

  await Promise.race([
    page.waitForURL(u => !/\/Account\/Login/i.test(u.href), { timeout: 25000 }),
    page.waitForLoadState('networkidle', { timeout: 25000 }),
  ]).catch(() => {});
  if (/\/Account\/Login/i.test(page.url())) {
    await debugDump(page, 'LOGIN-STUCK');
    throw new Error('Still on login after submit — check credentials/MFA.');
  }
}

async function run() {
  const browser = await chromium.launch({ 
    headless: false, 
    args: ['--no-sandbox', '--disable-dev-shm-usage'] 
  });
  let context;
  let page;
  
  // Check if we have existing auth state
  const hasStorage = await ensureAuthState();
  
  if (hasStorage) {
    // Try to use existing storage state
    try {
      context = await browser.newContext({
        storageState: STORAGE_STATE,
        locale: 'en-US',
        timezoneId: 'America/Chicago',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        viewport: { width: 1400, height: 900 },
      });
      await context.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => undefined }));
      page = await context.newPage();
      
      // Test if the stored auth is still valid by trying to access a simple page first
      try {
        await page.goto('https://abs.brightstarcare.com/', { waitUntil: 'domcontentloaded', timeout: 10000 });
        if (page.url().includes('/Account/Login')) {
          throw new Error('Redirected to login');
        }
        console.log('Using existing authentication state');
      } catch (error) {
        console.log('Stored authentication expired, performing fresh login');
        await context.close();
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
    } catch (error) {
      console.log('Error using stored auth, performing fresh login:', error.message);
      if (context) await context.close();
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
  } else {
    // No stored auth, perform fresh login
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

  // Go to page (should already be there from auth test, but ensure we're on the right page)
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

  // Sanity check key widgets exist
  await page.waitForSelector('#dtpStartDate', { timeout: 20000 });
  await page.waitForSelector('#dtpEndDate',   { timeout: 20000 });
  await page.waitForSelector('#btnSearch', { timeout: 20000 });
  
  // Wait for the page to fully load and Kendo widgets to initialize
  await page.waitForTimeout(2000);
  
  // Check if ddlExceptions exists (it might be hidden initially)
  const exceptionsExists = await page.locator('#ddlExceptions').count() > 0;
  if (!exceptionsExists) {
    console.log('Warning: ddlExceptions not found, continuing without it');
  }

  // Use page.evaluate to interact with Kendo widgets (DatePicker & MultiSelect)
  // We set Start/End to full current month and select ALL exceptions.
  const startText = mmddyyyy(monthStart);
  const endText   = mmddyyyy(monthEnd);

  await page.evaluate(({ startText, endText }) => {
    // Set dates using Kendo DatePicker API if available, otherwise set input value and trigger change
    const kStart = window.$ && window.$('#dtpStartDate').data && window.$('#dtpStartDate').data('kendoDatePicker');
    const kEnd   = window.$ && window.$('#dtpEndDate').data && window.$('#dtpEndDate').data('kendoDatePicker');

    if (kStart && kEnd) {
      // Parse from MM/DD/YYYY
      const toDate = (s) => {
        const [mm, dd, yyyy] = s.split('/');
        return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
      };
      kStart.value(toDate(startText));
      kEnd.value(toDate(endText));
      kStart.trigger('change');
      kEnd.trigger('change');
    } else {
      const startEl = document.querySelector('#dtpStartDate');
      const endEl   = document.querySelector('#dtpEndDate');
      if (startEl) {
        startEl.value = startText;
        startEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (endEl) {
        endEl.value = endText;
        endEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    // Select ALL exceptions via Kendo MultiSelect (if available)
    const exceptionsEl = document.querySelector('#ddlExceptions');
    if (exceptionsEl) {
      const multi = window.$ && window.$('#ddlExceptions').data && window.$('#ddlExceptions').data('kendoMultiSelect');
      if (multi) {
        try {
          // Build full list of values from data source
          const ds = multi.dataSource;
          const data = ds && (typeof ds.view === 'function' ? ds.view() : (typeof ds.data === 'function' ? ds.data() : [])) || [];
          const valueField = multi.options && multi.options.dataValueField;
          const textField = multi.options && multi.options.dataTextField;
          const allValues = data.map(item => {
            if (valueField && item && Object.prototype.hasOwnProperty.call(item, valueField)) return item[valueField];
            if (item && (item.value != null)) return item.value;
            if (item && (item.id != null)) return item.id;
            // last resort: use text as value
            if (textField && item && Object.prototype.hasOwnProperty.call(item, textField)) return item[textField];
            return String(item);
          });

          const current = Array.isArray(multi.value?.()) ? multi.value() : [];
          if (current.length !== allValues.length) {
            multi.value(allValues);
            multi.trigger('change');
          }
        } catch (e) {
          // Fallback: try select() API if available
          if (typeof multi.select === 'function') {
            const ds = multi.dataSource;
            const data = ds && (typeof ds.view === 'function' ? ds.view() : (typeof ds.data === 'function' ? ds.data() : [])) || [];
            const allIdx = Array.from({ length: data.length }, (_, i) => i);
            multi.select(allIdx);
            multi.trigger('change');
          }
        }
      } else {
        // Fallback: if it's a plain <select multiple>, select all options
        const sel = document.querySelector('#ddlExceptions');
        if (sel && sel.options && sel.options.length > 0) {
          for (let i = 0; i < sel.options.length; i++) {
            sel.options[i].selected = true;
          }
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    } else {
      console.log('ddlExceptions element not found, skipping exception selection');
    }
  }, { startText, endText });

  // Click search
  await Promise.all([
    page.waitForLoadState('networkidle').catch(() => {}), // not all Kendo ops trigger loads, so we also watch DOM
    page.click('#btnSearch')
  ]);

  // Wait for grid rows to appear; Kendo puts data in a scrollable content area
  const GRID_WRAPPER = '#gridMobileShifts';
  await page.waitForSelector(`${GRID_WRAPPER} .k-grid-content table tbody tr`, { timeout: 30000 });

  // Build a header->columnIndex map by reading the header row
  const headerMap = await page.evaluate((GRID_WRAPPER) => {
    const map = {};
    const headerCells = document.querySelectorAll(`${GRID_WRAPPER} .k-grid-header th`);
    headerCells.forEach((th, idx) => {
      // Prefer the displayed title (link text), else th text content
      const link = th.querySelector('.k-link');
      const raw = (link ? link.textContent : th.textContent || '').trim();
      if (raw) map[raw] = idx;
    });
    return map;
  }, GRID_WRAPPER);

  // Helper to safely pick a cell by header label
  function idx(label, fallback = -1) {
    return Object.prototype.hasOwnProperty.call(headerMap, label) ? headerMap[label] : fallback;
  }

  // Choose the columns you care about (these are what I see in your HTML: Date, Customer, Employee, Sch Start, Sch End, Sch Hrs, Actual Start, Actual End, Actual Hrs, Adjusted Start, Adjusted End, Adjusted Hrs, plus any Pay columns if present)
  const pickHeaders = [
    'Date',
    'Customer',
    'Employee',
    'Sch Start',
    'Sch End',
    'Sch Hrs',
    'Actual Start',
    'Actual End',
    'Actual Hrs',
    'Adjusted Start',
    'Adjusted End',
    'Adjusted Hrs',
    // Add more labels here if the grid shows them for you (e.g., 'Payor', 'Pay', etc.)
  ];

  // Helper: change Kendo Grid page and wait for dataBound
  async function changeKendoPage(targetPage) {
    await page.evaluate(async ({ targetPage, GRID_WRAPPER }) => {
      const grid = window.$ && window.$(GRID_WRAPPER).data && window.$(GRID_WRAPPER).data('kendoGrid');
      if (!grid) return false;
      await new Promise(resolve => {
        const onBound = () => { grid.unbind('dataBound', onBound); resolve(true); };
        grid.bind('dataBound', onBound);
        grid.dataSource.page(targetPage);
      });
      return true;
    }, { targetPage, GRID_WRAPPER });
    // small settle time
    await page.waitForTimeout(200);
  }

  // Determine total pages via Kendo API or pager DOM
  let totalPages = await page.evaluate((GRID_WRAPPER) => {
    const grid = window.$ && window.$(GRID_WRAPPER).data && window.$(GRID_WRAPPER).data('kendoGrid');
    if (grid && grid.dataSource && typeof grid.dataSource.totalPages === 'function') {
      const tp = grid.dataSource.totalPages();
      return Number(tp) || 1;
    }
    // Fallback: pager numbers in DOM
    const nums = document.querySelectorAll(`${GRID_WRAPPER} .k-pager-numbers li a, ${GRID_WRAPPER} .k-pager-numbers li span`);
    let max = 1;
    nums.forEach(n => {
      const v = parseInt((n.textContent || '').trim(), 10);
      if (!isNaN(v)) max = Math.max(max, v);
    });
    return max || 1;
  }, GRID_WRAPPER).catch(() => 1);

  // Extract rows for current page (reusable)
  async function extractCurrentPageRows() {
    return await page.$$eval(`${GRID_WRAPPER} .k-grid-content table tbody tr`, (trs, { pickHeaders, headerMap }) => {
      const isDataRow = (tr) => {
        const cls = tr.className || '';
        if (/k-grouping-row|k-group-footer|k-detail-row|k-grid-norecords/i.test(cls)) return false;
        const tds = tr.querySelectorAll('td');
        return tds && tds.length > 0;
      };
      const getColText = (row, colIdx) => {
        if (colIdx < 0) return null;
        const cells = row.querySelectorAll('td');
        const cell = cells[colIdx];
        const text = cell ? (cell.textContent || '').trim().replace(/\s+/g, ' ') : '';
        return text.length ? text : null;
      };
      const mapped = Array.from(trs)
        .filter(isDataRow)
        .map(tr => {
          const obj = {};
          for (const label of pickHeaders) {
            const colIdx = Object.prototype.hasOwnProperty.call(headerMap, label) ? headerMap[label] : -1;
            obj[label] = getColText(tr, colIdx);
          }
          return obj;
        });
      const hasAnyValue = (obj) => Object.values(obj).some(v => v != null && String(v).trim() !== '');
      return mapped.filter(hasAnyValue);
    }, { pickHeaders, headerMap });
  }

  // Collect all pages
  const allRows = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p > 1) {
      await changeKendoPage(p);
      // extra wait for grid content render
      await page.waitForSelector(`${GRID_WRAPPER} .k-grid-content table tbody tr`, { timeout: 15000 }).catch(() => {});
    }
    const pageRows = await extractCurrentPageRows();
    allRows.push(...pageRows);
  }

  // Write JSON
  await fs.writeFile(OUTPUT_JSON, JSON.stringify(allRows, null, 2), 'utf8');

  // Write CSV (simple)
  const headers = pickHeaders;
  const csvLines = [
    headers.join(','),
    ...allRows.map(r => headers.map(h => {
      const val = r[h] ?? '';
      const needsQuotes = /[",\n]/.test(val);
      const escaped = val.replace(/"/g, '""');
      return needsQuotes ? `"${escaped}"` : escaped;
    }).join(','))
  ];
  await fs.writeFile(OUTPUT_CSV, csvLines.join('\n'), 'utf8');

  console.log(`Done. Saved:
- ${OUTPUT_JSON}
- ${OUTPUT_CSV}`);

  await browser.close();
}

run().catch(err => {
  console.error('SCRAPER ERROR:', err);
  process.exit(1);
});
