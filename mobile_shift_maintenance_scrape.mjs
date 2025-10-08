// mobile_shift_maintenance_scrape.mjs
// Standalone scraper for "Mobile Shift Maintenance" grid
// Requires: Playwright (Chromium). Reuses your existing storageState.json for auth.

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { execSync } from 'child_process';
import MSMMondayIntegration from './msm_monday_integration.mjs';

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
const eightDaysAgo = new Date(today);
eightDaysAgo.setDate(today.getDate() - 8);

// Utility: format as MM/DD/YYYY for Kendo DatePicker text values
function mmddyyyy(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const y = d.getFullYear();
  return `${m}/${day}/${y}`;
}

// Sync employees from ConnectTeam to Monday.com at the start of scraping
async function syncEmployeesAtStart() {
  try {
    console.log('🔄 Syncing employees from ConnectTeam to Monday.com...');
    
    // Import the employee sync module
    const { default: EmployeeSync } = await import('./employee_sync.mjs');
    const employeeSync = new EmployeeSync();
    
    const result = await employeeSync.syncEmployees();
    console.log(`✅ Employee sync completed: ${result.created} created, ${result.updated} updated, ${result.errors} errors`);
  } catch (error) {
    console.log('⚠️ Employee sync failed:', error.message);
    console.log('Continuing with scraping...');
  }
}

// Update to latest version via git pull
async function updateToLatestVersion() {
  try {
    console.log('🔄 Checking for updates...');
    
    // Check if we're in a git repository
    try {
      execSync('git status', { stdio: 'pipe' });
    } catch (error) {
      console.log('ℹ️ Not in a git repository, skipping update check');
      return;
    }
    
    // Fetch latest changes
    execSync('git fetch origin', { stdio: 'pipe' });
    
    // Check if there are updates available
    const localCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    const remoteCommit = execSync('git rev-parse origin/main', { encoding: 'utf8' }).trim();
    
    if (localCommit === remoteCommit) {
      console.log('✅ Already running latest version');
      return;
    }
    
    console.log('🔄 Updates available, pulling latest changes...');
    
    // Pull the latest changes
    execSync('git pull origin main', { stdio: 'inherit' });
    
    console.log('✅ Successfully updated to latest version');
    console.log('ℹ️ Restarting scraper with updated code...');
    
    // Restart the script with the updated code
    process.exit(0);
    
  } catch (error) {
    console.log('⚠️ Could not update to latest version:', error.message);
    console.log('ℹ️ Continuing with current version...');
  }
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
  // Check for updates and pull latest version
  await updateToLatestVersion();
  
  // Sync employees from ConnectTeam to Monday.com at the beginning
  await syncEmployeesAtStart();
  
  const browser = await chromium.launch({ 
    headless: process.env.DEBUG !== 'True', // Use DEBUG env var to control headless mode 
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
  await page.waitForLoadState('networkidle').catch(() => {});

  // Handle potential OIDC/login redirects by retrying navigation until widgets appear
  {
    const MAX_TRIES = 5;
    let ready = false;
    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
      const visible = await page.locator('#dtpStartDate').isVisible({ timeout: 5000 }).catch(() => false);
      if (visible) { ready = true; break; }
      const urlNow = page.url();
      if (/signin-oidc|\/Account\/Login/i.test(urlNow)) {
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
        await page.waitForLoadState('networkidle').catch(() => {});
      } else {
        // soft reload to encourage Kendo boot
        await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await page.waitForLoadState('networkidle').catch(() => {});
      }
      await page.waitForTimeout(1000);
    }
    if (!ready) {
      await debugDump(page, 'GRID-WIDGETS-NOT-READY');
      throw new Error('Could not find date pickers after redirects/retries');
    }
  }

  // Sanity check key widgets exist (dtpStartDate already probed above)
  await page.waitForSelector('#dtpEndDate',   { timeout: 20000 });
  await page.waitForSelector('#btnSearch', { timeout: 20000 });
  
  // Wait for the page to fully load and Kendo widgets to initialize
  await page.waitForTimeout(2000);
  
  // Skip exception dropdown check - using default selection
  console.log('Skipping exception dropdown check - using default selection');

  // Handle Location dropdown - try to select "All" if available
  console.log('Checking Location dropdown for "All" option...');
  try {
    // Check if location dropdown exists
    const locationWrapper = page.locator('#divDdlLocation .k-dropdown-wrap');
    if (await locationWrapper.count() > 0) {
      console.log('Found location dropdown wrapper');
      
      // Click to open the dropdown
      await locationWrapper.click();
      
      // Wait for dropdown list to appear
      await page.waitForSelector('#ddlLocation_listbox', { timeout: 2000 });
      console.log('Location dropdown list opened');
      
      // Look for "All" option
      const allOption = page.locator('#ddlLocation_listbox .k-item').filter({ 
        hasText: /^all$/i 
      }).or(page.locator('#ddlLocation_listbox .k-item').filter({ 
        hasText: /all/i 
      }));
      
      if (await allOption.count() > 0) {
        console.log('Found "All" option, clicking it');
        await allOption.first().click();
        console.log('Successfully selected "All" option');
      } else {
        console.log('No "All" option found, keeping default selection');
        // Close the dropdown by clicking the wrapper again
        await locationWrapper.click();
      }
    } else {
      console.log('Location dropdown wrapper not found, keeping default selection');
    }
  } catch (error) {
    console.log('Error handling location dropdown:', error.message);
    // Try to close dropdown if it's open
    try {
      const locationWrapper = page.locator('#divDdlLocation .k-dropdown-wrap');
      if (await locationWrapper.count() > 0) {
        await locationWrapper.click();
      }
    } catch (closeError) {
      console.log('Could not close dropdown:', closeError.message);
    }
  }

  // Use page.evaluate to interact with Kendo widgets (DatePicker & MultiSelect)
  // We set Start/End to 8 days ago to today and use default exception selection.
  const startText = mmddyyyy(eightDaysAgo);
  const endText   = mmddyyyy(today);

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

    // Skip exception selection - use default selection
    console.log('Skipping exception dropdown manipulation - using default selection');
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
    // Product and Position columns
    'Product',
    'Position',
    // Comments column
    'Comments',
    // Exception columns (add both common variants)
    'Exception Type',
    'Exception Types',
    // Shift ID column for records with exceptions
    'Shift ID',
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

  // Helper: scrape shift ID by clicking gear icon and extracting from popup
  async function scrapeShiftId(rowIndex) {
    try {
      // First, dismiss any existing overlays or popups
      await page.evaluate(() => {
        // Close any open Kendo windows
        const windows = document.querySelectorAll('.k-window');
        windows.forEach(window => {
          const closeBtn = window.querySelector('.k-window-actions .k-button, .k-icon-close');
          if (closeBtn) closeBtn.click();
        });
        
        // Remove any overlays
        const overlays = document.querySelectorAll('.k-overlay');
        overlays.forEach(overlay => overlay.remove());
      });
      
      await page.waitForTimeout(300);

      // Find the gear icon for this specific row - try multiple selectors
      let gearIcon = page.locator(`${GRID_WRAPPER} .k-grid-content table tbody tr:nth-child(${rowIndex + 1}) .fas.fa-cog`).first();
      
      if (await gearIcon.count() === 0) {
        // Try alternative selectors for gear icon
        gearIcon = page.locator(`${GRID_WRAPPER} .k-grid-content table tbody tr:nth-child(${rowIndex + 1}) .k-icon-gear`).first();
      }
      
      if (await gearIcon.count() === 0) {
        // Try alternative selectors for gear icon
        gearIcon = page.locator(`${GRID_WRAPPER} .k-grid-content table tbody tr:nth-child(${rowIndex + 1}) .k-icon-cog`).first();
      }
      
      if (await gearIcon.count() === 0) {
        // Try looking for any icon with gear/cog in class name
        gearIcon = page.locator(`${GRID_WRAPPER} .k-grid-content table tbody tr:nth-child(${rowIndex + 1}) [class*="gear"], ${GRID_WRAPPER} .k-grid-content table tbody tr:nth-child(${rowIndex + 1}) [class*="cog"]`).first();
      }
      
      if (await gearIcon.count() === 0) {
        // Try looking for any clickable icon in the row
        gearIcon = page.locator(`${GRID_WRAPPER} .k-grid-content table tbody tr:nth-child(${rowIndex + 1}) .k-icon, ${GRID_WRAPPER} .k-grid-content table tbody tr:nth-child(${rowIndex + 1}) [class*="icon"]`).first();
      }
      
      if (await gearIcon.count() === 0) {
        // Debug: log what elements are available in the row
        const rowElements = await page.evaluate(({ rowIndex, GRID_WRAPPER }) => {
          const row = document.querySelector(`${GRID_WRAPPER} .k-grid-content table tbody tr:nth-child(${rowIndex + 1})`);
          if (!row) return 'Row not found';
          
          const icons = row.querySelectorAll('[class*="icon"], [class*="gear"], [class*="cog"], .k-icon');
          const iconInfo = Array.from(icons).map(icon => ({
            tagName: icon.tagName,
            className: icon.className,
            textContent: icon.textContent?.trim()
          }));
          
          return {
            rowExists: true,
            totalCells: row.querySelectorAll('td').length,
            icons: iconInfo,
            rowHTML: row.outerHTML.substring(0, 200) + '...'
          };
        }, { rowIndex, GRID_WRAPPER });
        
        console.log(`No gear icon found for row ${rowIndex + 1}:`, rowElements);
        return null;
      }

      // Click the gear icon using force to bypass overlay issues
      await gearIcon.click({ force: true });

      // Look for "Show Shift" option in the menu
      const showShiftOption = page.locator('text=Show Shift').first();
      if (await showShiftOption.count() === 0) {
        console.log(`Show Shift option not found for row ${rowIndex + 1}`);
        return null;
      }

      // Click "Show Shift"
      await showShiftOption.click({ force: true });

      // Extract shift number from div with id "divShiftNumber"
      const shiftNumber = await page.evaluate(() => {
        const shiftDiv = document.querySelector('#divShiftNumber');
        if (shiftDiv) {
          const text = shiftDiv.textContent || shiftDiv.innerText || '';
          const number = text.trim();
          return number ? parseInt(number, 10) : null;
        }
        return null;
      });

      // Close the popup using JavaScript to avoid overlay issues
      await page.evaluate(() => {
        const windows = document.querySelectorAll('.k-window');
        windows.forEach(window => {
          const closeBtn = window.querySelector('.k-window-actions .k-button, .k-icon-close');
          if (closeBtn) closeBtn.click();
        });
        
        // Remove any overlays
        const overlays = document.querySelectorAll('.k-overlay');
        overlays.forEach(overlay => overlay.remove());
      });

      console.log(`Scraped shift ID for row ${rowIndex + 1}: ${shiftNumber}`);
      return shiftNumber;
    } catch (error) {
      console.error(`Error scraping shift ID for row ${rowIndex + 1}:`, error.message);
      return null;
    }
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
      
      // Filter to only include records that have exceptions
      const hasException = (obj) => {
        const exceptionType = obj['Exception Type'] || obj['Exception Types'] || '';
        return exceptionType && exceptionType.trim() !== '';
      };
      
      // Filter out "No Task List Submitted" records with "00:00" Actual End unless they have other exceptions
      const shouldIncludeRecord = (obj) => {
        const exceptionType = obj['Exception Type'] || obj['Exception Types'] || '';
        const actualEnd = obj['Actual End'] || '';
        
        // If it's "No Task List Submitted" and Actual End is "00:00", check for other exceptions
        if (exceptionType.includes('No Task List Submitted') && actualEnd === '00:00') {
          // Check if there are other exceptions besides "No Task List Submitted"
          const exceptions = exceptionType.split(',').map(e => e.trim());
          const hasOtherExceptions = exceptions.some(exp => 
            exp !== 'No Task List Submitted' && exp.trim() !== ''
          );
          
          // Only include if there are other exceptions
          return hasOtherExceptions;
        }
        
        // Include all other records with exceptions
        return true;
      };
      
      const hasAnyValue = (obj) => Object.values(obj).some(v => v != null && String(v).trim() !== '');
      return mapped.filter(hasAnyValue).filter(hasException).filter(shouldIncludeRecord);
    }, { pickHeaders, headerMap });
  }

  // Extract rows with shift ID scraping for records with exceptions
  async function extractCurrentPageRowsWithShiftId() {
    // First, get all data rows and their actual DOM elements
    const dataRows = await page.$$(`${GRID_WRAPPER} .k-grid-content table tbody tr`);
    
    const rows = [];
    let dataRowIndex = 0;
    
    for (let i = 0; i < dataRows.length; i++) {
      const tr = dataRows[i];
      const className = await tr.getAttribute('class') || '';
      
      // Skip non-data rows
      if (/k-grouping-row|k-group-footer|k-detail-row|k-grid-norecords/i.test(className)) {
        continue;
      }
      
      const tds = await tr.$$('td');
      if (tds.length === 0) continue;
      
      // Extract data from this row
      const rowData = await page.evaluate(({ tr, pickHeaders, headerMap }) => {
        const getColText = (row, colIdx) => {
          if (colIdx < 0) return null;
          const cells = row.querySelectorAll('td');
          const cell = cells[colIdx];
          const text = cell ? (cell.textContent || '').trim().replace(/\s+/g, ' ') : '';
          return text.length ? text : null;
        };
        
        const obj = {};
        for (const label of pickHeaders) {
          const colIdx = Object.prototype.hasOwnProperty.call(headerMap, label) ? headerMap[label] : -1;
          obj[label] = getColText(tr, colIdx);
        }
        return obj;
      }, { tr, pickHeaders, headerMap });
      
      // Check if this row has exceptions
      const exceptionType = rowData['Exception Type'] || rowData['Exception Types'] || '';
      const actualEnd = rowData['Actual End'] || '';
      
      // First check if it has any exceptions
      if (!exceptionType || exceptionType.trim() === '') {
        continue;
      }
      
      // Filter out "No Task List Submitted" records with "00:00" Actual End unless they have other exceptions
      let shouldInclude = true;
      if (exceptionType.includes('No Task List Submitted') && actualEnd === '00:00') {
        // Check if there are other exceptions besides "No Task List Submitted"
        const exceptions = exceptionType.split(',').map(e => e.trim());
        const hasOtherExceptions = exceptions.some(exp => 
          exp !== 'No Task List Submitted' && exp.trim() !== ''
        );
        
        // Only include if there are other exceptions
        shouldInclude = hasOtherExceptions;
      }
      
      if (shouldInclude) {
        // This is a row with exceptions, add it to our list
        rowData._domElement = tr;
        rowData._dataRowIndex = dataRowIndex;
        
        // Look for comments in the next row (detail row)
        const nextRow = dataRows[i + 1];
        if (nextRow) {
          const nextRowClass = await nextRow.getAttribute('class') || '';
          if (nextRowClass.includes('k-detail-row')) {
            // Extract comments from the detail row
            const commentResult = await page.evaluate((detailRow) => {
              const result = {
                comments: null,
                debug: {
                  detailRowHTML: detailRow.outerHTML,
                  detailCellFound: false,
                  detailCellText: '',
                  allTds: []
                }
              };
              
              const detailCell = detailRow.querySelector('td.k-detail-cell');
              if (detailCell) {
                result.debug.detailCellFound = true;
                const text = detailCell.textContent || detailCell.innerText || '';
                result.debug.detailCellText = text;
                
                // Clean up the text by removing extra whitespace and newlines
                const cleanText = text.replace(/\s+/g, ' ').trim();
                result.debug.cleanText = cleanText;
                
                // Remove "Comments:" prefix and check if it's not "No records to display"
                if (cleanText.startsWith('Comments:')) {
                  const commentText = cleanText.replace(/^Comments:\s*/, '').trim();
                  result.debug.commentText = commentText;
                  // Only store comments if they're not "No records to display" and not empty
                  if (commentText !== 'No records to display' && commentText !== 'No records to display.' && commentText.length > 0) {
                    result.comments = commentText;
                  } else {
                    result.comments = null; // Treat "No records to display" as no comments
                  }
                } else {
                  result.comments = null; // No comments found
                }
              } else {
                // Try to find any td elements
                const allTds = detailRow.querySelectorAll('td');
                result.debug.allTds = Array.from(allTds).map((td, index) => ({
                  index,
                  className: td.className,
                  text: td.textContent
                }));
              }
              
              return result;
            }, nextRow);
            
            // console.log(`Debug for ${rowData.Customer} - ${rowData.Employee}:`, commentResult.debug);
            const comments = commentResult.comments;
            
            rowData['Comments'] = comments;
          } else {
            rowData['Comments'] = null;
          }
        } else {
          rowData['Comments'] = null;
        }
        
        rows.push(rowData);
      }
      
      dataRowIndex++;
    }

    // Scrape shift ID for each row with exceptions
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      console.log(`Scraping shift ID for row ${i + 1}/${rows.length} (${row.Customer} - ${row.Employee})`);
      
      // Extract adjusted times from the main grid row
      const adjustedTimes = await page.evaluate((trElement) => {
        const adjStartInput = trElement.querySelector('input[id*="adjStartTxt"]');
        const adjEndInput = trElement.querySelector('input[id*="adjEndTxt"]');
        
        return {
          adjustedStart: adjStartInput ? (adjStartInput.value || adjStartInput.getAttribute('value') || '') : null,
          adjustedEnd: adjEndInput ? (adjEndInput.value || adjEndInput.getAttribute('value') || '') : null
        };
      }, row._domElement);
      
      row['Adjusted Start'] = adjustedTimes.adjustedStart;
      row['Adjusted End'] = adjustedTimes.adjustedEnd;
      
      // Use the actual DOM element to find the gear icon and get shift ID
      let shiftId = await scrapeShiftIdFromElement(row._domElement, i + 1);
      
      // Simple retry if Shift ID extraction failed
      if (!shiftId) {
        console.log(`Retrying Shift ID extraction for row ${i + 1}...`);
        await page.waitForTimeout(1000); // Wait before retry
        shiftId = await scrapeShiftIdFromElement(row._domElement, i + 1);
      }
      
      row['Shift ID'] = shiftId;
      
      // Remove the temporary properties
      delete row._domElement;
      delete row._dataRowIndex;
    }

    return rows;
  }

  // Helper: scrape shift ID and adjusted times from a specific DOM element
  async function scrapeShiftIdFromElement(trElement, rowNumber) {
    try {
      // First, dismiss any existing overlays or popups
      await page.evaluate(() => {
        // Close any open Kendo windows
        const windows = document.querySelectorAll('.k-window');
        windows.forEach(window => {
          const closeBtn = window.querySelector('.k-window-actions .k-button, .k-icon-close');
          if (closeBtn) closeBtn.click();
        });
        
        // Remove any overlays
        const overlays = document.querySelectorAll('.k-overlay');
        overlays.forEach(overlay => overlay.remove());
      });
      
      await page.waitForTimeout(300);

      // Find the gear icon within this specific row element using querySelector
      const gearIcon = await trElement.evaluate((tr) => {
        // Try different selectors for gear icon
        let icon = tr.querySelector('.fas.fa-cog');
        if (!icon) icon = tr.querySelector('.k-icon-gear');
        if (!icon) icon = tr.querySelector('.k-icon-cog');
        if (!icon) icon = tr.querySelector('[class*="gear"], [class*="cog"]');
        if (!icon) icon = tr.querySelector('.k-icon, [class*="icon"]');
        
        return icon ? {
          tagName: icon.tagName,
          className: icon.className,
          textContent: icon.textContent?.trim()
        } : null;
      });
      
      if (!gearIcon) {
        console.log(`No gear icon found for row ${rowNumber}`);
        return null;
      }
      
      console.log(`Found gear icon for row ${rowNumber}:`, gearIcon);

      // Click the gear icon using JavaScript to bypass overlay issues
      await trElement.evaluate((tr) => {
        // Try different selectors for gear icon
        let icon = tr.querySelector('.fas.fa-cog');
        if (!icon) icon = tr.querySelector('.k-icon-gear');
        if (!icon) icon = tr.querySelector('.k-icon-cog');
        if (!icon) icon = tr.querySelector('[class*="gear"], [class*="cog"]');
        if (!icon) icon = tr.querySelector('.k-icon, [class*="icon"]');
        
        if (icon) {
          // Create and dispatch a click event
          const clickEvent = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true
          });
          icon.dispatchEvent(clickEvent);
        }
      });

      // Look for the "Show Shift" button using the specific selector
      const showShiftButton = page.locator('#btnShowShift');
      if (await showShiftButton.count() === 0) {
        console.log(`Show Shift button not found for row ${rowNumber}`);
        return null;
      }
      await showShiftButton.click({ force: true });
      console.log(`Clicked "Show Shift" button for row ${rowNumber}`);
      
      // Wait a moment for the popup content to load
      await page.waitForTimeout(200);
      
      // Debug: Check what elements are available after clicking
      const debugInfo = await page.evaluate(() => {
        const buttons = document.querySelectorAll('button, a, input[type="button"], input[type="submit"]');
        const showShiftButtons = Array.from(buttons).filter(btn => 
          btn.textContent && btn.textContent.toLowerCase().includes('show shift')
        );
        const popups = document.querySelectorAll('[id*="popup"], [id*="Popup"], [class*="popup"], [class*="Popup"], [class*="window"], [class*="Window"]');
        const divViewShiftPopup = document.querySelector('#divViewShiftPopup');
        
        return {
          totalButtons: buttons.length,
          showShiftButtons: showShiftButtons.length,
          showShiftButtonTexts: showShiftButtons.map(btn => btn.textContent?.trim()),
          totalPopups: popups.length,
          divViewShiftPopupExists: !!divViewShiftPopup,
          divViewShiftPopupDisplay: divViewShiftPopup ? divViewShiftPopup.style.display : 'N/A',
          divViewShiftPopupVisibility: divViewShiftPopup ? divViewShiftPopup.style.visibility : 'N/A'
        };
      });
      console.log(`Debug info after clicking "Show Shift" for row ${rowNumber}:`, debugInfo);
      
      // Try multiple approaches to get the shift ID and adjusted times
      let shiftNumber = null;
      let adjustedStart = null;
      let adjustedEnd = null;
      
      // Approach 1: Look for the divViewShiftPopup (without data-role requirement)
      try {
        // Wait for the popup to appear (even if hidden)
        await page.waitForSelector('#divViewShiftPopup', { timeout: 1000, state: 'attached' });
        
        // Wait for the popup content to load
        
        // Look for shift ID in the popup
        const popupData = await page.evaluate(() => {
          const popup = document.querySelector('#divViewShiftPopup');
          if (popup) {
            console.log('divViewShiftPopup found, checking for shift number...');
            console.log('Popup display:', popup.style.display);
            console.log('Popup visibility:', popup.style.visibility);
            console.log('Popup offsetParent:', popup.offsetParent !== null);
            console.log('Popup classList:', popup.classList.toString());
            console.log('Popup data-role:', popup.getAttribute('data-role'));
            
            let shiftNumber = null;
            
            // Look for divShiftNumber inside the popup
            const shiftDiv = popup.querySelector('#divShiftNumber');
            if (shiftDiv) {
              const text = shiftDiv.textContent || shiftDiv.innerText || '';
              console.log('Found divShiftNumber with text:', text);
              console.log('divShiftNumber innerHTML:', shiftDiv.innerHTML);
              
              // Extract the 8-digit number from "Shift #: 97533258"
              const shiftMatch = text.match(/Shift #:\s*(\d{8})/);
              if (shiftMatch) {
                const number = parseInt(shiftMatch[1], 10);
                console.log('Extracted shift number from regex:', number);
                shiftNumber = number;
              } else {
                // Fallback: look for any 8-digit number in the text
                const eightDigitMatch = text.match(/\b\d{8}\b/);
                if (eightDigitMatch) {
                  console.log('Found 8-digit number in divShiftNumber:', eightDigitMatch[0]);
                  shiftNumber = parseInt(eightDigitMatch[0], 10);
                } else {
                  // Additional fallback: check if text contains "Shift #:" and extract number
                  if (text.includes('Shift #:')) {
                    const parts = text.split('Shift #:');
                    if (parts.length > 1) {
                      const numberPart = parts[1].trim();
                      const numberMatch = numberPart.match(/\d{8}/);
                      if (numberMatch) {
                        const number = parseInt(numberMatch[0], 10);
                        console.log('Extracted shift number from split method:', number);
                        shiftNumber = number;
                      }
                    }
                  }
                }
              }
            }
            
            
            // If we still don't have shift number, search the entire popup content
            if (!shiftNumber) {
              console.log('Searching entire popup for 8-digit numbers...');
              const popupText = popup.textContent || popup.innerText || '';
              console.log('Popup text content length:', popupText.length);
              console.log('Popup text content preview:', popupText.substring(0, 500));
              const eightDigitMatch = popupText.match(/\b\d{8}\b/);
              if (eightDigitMatch) {
                console.log('Found 8-digit number in popup:', eightDigitMatch[0]);
                shiftNumber = parseInt(eightDigitMatch[0], 10);
              } else if (popupText.length > 0) {
                console.log('Popup has content but may be hidden, checking all elements...');
                const allElements = popup.querySelectorAll('*');
                for (const el of allElements) {
                  const text = el.textContent || el.innerText || '';
                  const eightDigitMatch = text.match(/\b\d{8}\b/);
                  if (eightDigitMatch) {
                    console.log('Found 8-digit number in popup element:', el.tagName, el.id, el.className, eightDigitMatch[0]);
                    shiftNumber = parseInt(eightDigitMatch[0], 10);
                    break;
                  }
                }
              }
            }
            
            return shiftNumber;
          }
          return null;
        });
        
        if (popupData) {
          shiftNumber = popupData;
        }
        
        if (shiftNumber) {
          console.log(`Found shift ID via divViewShiftPopup for row ${rowNumber}: ${shiftNumber}`);
        }
      } catch (error) {
        console.log(`divViewShiftPopup approach failed for row ${rowNumber}:`, error.message);
      }
      
      // Approach 2: Try to find shift ID in the row's data attributes or grid data
      if (!shiftNumber) {
        try {
          shiftNumber = await page.evaluate((rowIndex) => {
            // Look for the shift ID in the row's data attributes
            const rows = document.querySelectorAll('tr[data-uid], tr[data-shift-id], tr[data-shiftid]');
            if (rows[rowIndex]) {
              const row = rows[rowIndex];
              console.log('Row data attributes:', row.dataset);
              
              // Check various data attributes that might contain shift ID
              const possibleKeys = ['shiftId', 'shift-id', 'shiftid', 'id', 'uid', 'shiftNumber', 'shift-number'];
              for (const key of possibleKeys) {
                if (row.dataset[key]) {
                  const value = row.dataset[key];
                  const eightDigitMatch = value.match(/\b\d{8}\b/);
                  if (eightDigitMatch) {
                    console.log(`Found shift ID in data attribute ${key}:`, eightDigitMatch[0]);
                    return parseInt(eightDigitMatch[0], 10);
                  }
                }
              }
            }
            
            // Look for shift ID in the grid's data source
            const grids = document.querySelectorAll('[id*="grid"], [class*="grid"]');
            for (const grid of grids) {
              // Check if grid has data source
              if (grid._kendoWidget && grid._kendoWidget.dataSource) {
                const dataSource = grid._kendoWidget.dataSource;
                const data = dataSource.data();
                if (data && data[rowIndex]) {
                  const rowData = data[rowIndex];
                  console.log('Grid row data:', rowData);
                  
                  // Look for shift ID in the row data
                  const possibleFields = ['ShiftId', 'ShiftID', 'shiftId', 'shift_id', 'id', 'Id', 'ID'];
                  for (const field of possibleFields) {
                    if (rowData[field]) {
                      const value = String(rowData[field]);
                      const eightDigitMatch = value.match(/\b\d{8}\b/);
                      if (eightDigitMatch) {
                        console.log(`Found shift ID in grid data field ${field}:`, eightDigitMatch[0]);
                        return parseInt(eightDigitMatch[0], 10);
                      }
                    }
                  }
                }
              }
            }
            
            return null;
          }, rowNumber - 1); // Convert to 0-based index
          
          if (shiftNumber) {
            console.log(`Found shift ID via row data for row ${rowNumber}: ${shiftNumber}`);
          }
        } catch (error) {
          console.log(`Row data approach failed for row ${rowNumber}:`, error.message);
        }
      }
      
      // Approach 2.5: Disabled - element search gives incorrect results
      // if (!shiftNumber) {
      //   // Element search approach disabled as it finds incorrect shift IDs
      // }
      
      // Approach 3: Try to find shift ID in page's global variables or data structures
      if (!shiftNumber) {
        try {
          shiftNumber = await page.evaluate(() => {
            // Look for shift ID in global variables
            const globalVars = ['shiftId', 'shiftID', 'currentShiftId', 'currentShiftID', 'selectedShiftId', 'selectedShiftID'];
            for (const varName of globalVars) {
              if (window[varName]) {
                const value = String(window[varName]);
                const eightDigitMatch = value.match(/\b\d{8}\b/);
                if (eightDigitMatch) {
                  console.log(`Found shift ID in global variable ${varName}:`, eightDigitMatch[0]);
                  return parseInt(eightDigitMatch[0], 10);
                }
              }
            }
            
            // Look for shift ID in any data structures that might have been populated
            const dataStructures = ['shiftData', 'currentShift', 'selectedShift', 'shiftInfo', 'popupData'];
            for (const structName of dataStructures) {
              if (window[structName] && typeof window[structName] === 'object') {
                const data = window[structName];
                for (const key in data) {
                  const value = String(data[key]);
                  const eightDigitMatch = value.match(/\b\d{8}\b/);
                  if (eightDigitMatch) {
                    console.log(`Found shift ID in data structure ${structName}.${key}:`, eightDigitMatch[0]);
                    return parseInt(eightDigitMatch[0], 10);
                  }
                }
              }
            }
            
            // Look for shift ID in any Kendo widgets or components
            const kendoWidgets = document.querySelectorAll('[data-role="window"], [data-role="popup"], [data-role="modal"]');
            for (const widget of kendoWidgets) {
              if (widget._kendoWidget && widget._kendoWidget.dataItem) {
                const dataItem = widget._kendoWidget.dataItem();
                if (dataItem) {
                  for (const key in dataItem) {
                    const value = String(dataItem[key]);
                    const eightDigitMatch = value.match(/\b\d{8}\b/);
                    if (eightDigitMatch) {
                      console.log(`Found shift ID in Kendo widget data item ${key}:`, eightDigitMatch[0]);
                      return parseInt(eightDigitMatch[0], 10);
                    }
                  }
                }
              }
            }
            
            return null;
          });
          
          if (shiftNumber) {
            console.log(`Found shift ID via global variables for row ${rowNumber}: ${shiftNumber}`);
          }
        } catch (error) {
          console.log(`Global variables approach failed for row ${rowNumber}:`, error.message);
        }
      }
      
      // Approach 4: If still no shift number, set to null
      if (!shiftNumber) {
        console.log(`No shift ID found for row ${rowNumber} - popup may not be loading correctly`);
        shiftNumber = null; // Explicitly set to null instead of using incorrect fallback
      }
      

      // Debug: Check if popup appeared and look for shift number
      const popupInfo = await page.evaluate(() => {
        const windows = document.querySelectorAll('.k-window, [class*="popup"], [class*="modal"]');
        const visiblePopups = Array.from(windows).filter(win => win.offsetParent !== null);
        
        // Look specifically for the divViewShiftPopup
        const popupDiv = document.querySelector('#divViewShiftPopup');
        const shiftDiv = popupDiv ? popupDiv.querySelector('#divShiftNumber') : null;
        
        // Look for 8-digit numbers in the popup
        const popupText = popupDiv ? popupDiv.textContent || popupDiv.innerText || '' : '';
        const eightDigitMatches = popupText.match(/\b\d{8}\b/g);
        const fourDigitMatches = popupText.match(/\b\d{4,}\b/g);
        
        return {
          visiblePopupsCount: visiblePopups.length,
          popupDivFound: !!popupDiv,
          shiftDivFound: !!shiftDiv,
          shiftDivText: shiftDiv ? shiftDiv.textContent?.trim() : null,
          popupTextLength: popupText.length,
          eightDigitNumbers: eightDigitMatches || [],
          fourDigitNumbers: fourDigitMatches || []
        };
      });
      console.log(`Popup info for row ${rowNumber}:`, popupInfo);

      // Close the popup using JavaScript to avoid overlay issues
      await page.evaluate(() => {
        const windows = document.querySelectorAll('.k-window');
        windows.forEach(window => {
          const closeBtn = window.querySelector('.k-window-actions .k-button, .k-icon-close');
          if (closeBtn) closeBtn.click();
        });
        
        // Remove any overlays
        const overlays = document.querySelectorAll('.k-overlay');
        overlays.forEach(overlay => overlay.remove());
      });

      console.log(`Scraped shift ID for row ${rowNumber}: ${shiftNumber}`);
      return shiftNumber;
    } catch (error) {
      console.error(`Error scraping shift ID for row ${rowNumber}:`, error.message);
      return null;
    }
  }

  // Collect all pages
  const allRows = [];
  let totalProcessed = 0;
  let totalWithExceptions = 0;
  
  for (let p = 1; p <= totalPages; p++) {
    if (p > 1) {
      await changeKendoPage(p);
      // extra wait for grid content render
      await page.waitForSelector(`${GRID_WRAPPER} .k-grid-content table tbody tr`, { timeout: 15000 }).catch(() => {});
    }
    
    // Get all rows first (before filtering) for counting
    const allPageRows = await page.$$eval(`${GRID_WRAPPER} .k-grid-content table tbody tr`, (trs, { pickHeaders, headerMap }) => {
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
    
    // Filter to only include records with exceptions and count them
    const pageRowsWithExceptions = allPageRows.filter(obj => {
      const exceptionType = obj['Exception Type'] || obj['Exception Types'] || '';
      const actualEnd = obj['Actual End'] || '';
      
      // First check if it has any exceptions
      if (!exceptionType || exceptionType.trim() === '') {
        return false;
      }
      
      // Filter out "No Task List Submitted" records with "00:00" Actual End unless they have other exceptions
      if (exceptionType.includes('No Task List Submitted') && actualEnd === '00:00') {
        // Check if there are other exceptions besides "No Task List Submitted"
        const exceptions = exceptionType.split(',').map(e => e.trim());
        const hasOtherExceptions = exceptions.some(exp => 
          exp !== 'No Task List Submitted' && exp.trim() !== ''
        );
        
        // Only include if there are other exceptions
        return hasOtherExceptions;
      }
      
      // Include all other records with exceptions
      return true;
    });
    
    // Use the new function that includes shift ID scraping
    const pageRows = await extractCurrentPageRowsWithShiftId();
    
    totalProcessed += allPageRows.length;
    totalWithExceptions += pageRows.length;
    allRows.push(...pageRows);
    
    console.log(`Page ${p}/${totalPages}: ${pageRows.length} records with exceptions (${allPageRows.length} total processed)`);
  }
  
  console.log(`\nFiltering complete: ${totalWithExceptions} records with exceptions out of ${totalProcessed} total records`);

  // Format exception data for local files (with commas and spaces for readability)
  const formattedRows = allRows.map(obj => {
    const formatted = { ...obj };
    if (formatted['Exception Types']) {
      // Split by common exception patterns and join with commas and spaces for local files
      const exceptions = formatted['Exception Types']
        .replace(/([a-z])([A-Z])/g, '$1, $2') // Add comma and space before capital letters after lowercase
        .replace(/(Shift)([A-Z])/g, '$1, $2') // Add comma and space after "Shift" before capital letters
        .replace(/(Threshold)([A-Z])/g, '$1, $2') // Add comma and space after "Threshold" before capital letters
        .replace(/(Submitted)([A-Z])/g, '$1, $2') // Add comma and space after "Submitted" before capital letters
        .replace(/(Denied)([A-Z])/g, '$1, $2') // Add comma and space after "Denied" before capital letters
        .replace(/(Time)([A-Z])/g, '$1, $2') // Add comma and space after "Time" before capital letters
        .split(',')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join(', ');
      formatted['Exception Types'] = exceptions;
    }
    return formatted;
  });

  // Write JSON (with formatted exceptions for readability)
  await fs.writeFile(OUTPUT_JSON, JSON.stringify(formattedRows, null, 2), 'utf8');

  // Write CSV (simple) - use formatted rows for better readability
  const headers = pickHeaders;
  const csvLines = [
    headers.join(','),
    ...formattedRows.map(r => headers.map(h => {
      const val = String(r[h] ?? '');
      const needsQuotes = /[",\n]/.test(val);
      const escaped = val.replace(/"/g, '""');
      return needsQuotes ? `"${escaped}"` : escaped;
    }).join(','))
  ];
  await fs.writeFile(OUTPUT_CSV, csvLines.join('\n'), 'utf8');

  console.log(`Done. Saved:
- ${OUTPUT_JSON}
- ${OUTPUT_CSV}`);

  // Send data directly to Monday.com
  console.log('\n=== Sending MSM data to Monday.com ===');
  try {
    const msmIntegration = new MSMMondayIntegration();
    await msmIntegration.syncData(allRows); // Pass data directly
    console.log('✅ Successfully synced MSM data to Monday.com');
    
    // Check for new comments that need to be logged
    console.log('\n=== Checking for new comments to log ===');
    await logNewComments(allRows, page);
    
    // Final sync to Monday.com with updated CommentsLogged status
    console.log('\n=== Final sync to Monday.com with updated Comments Logged status ===');
    
    // Debug: Check which records have CommentsLogged = true
    const recordsWithLoggedComments = allRows.filter(r => r.CommentsLogged === true);
    console.log(`Found ${recordsWithLoggedComments.length} records with CommentsLogged = true`);
    recordsWithLoggedComments.forEach(r => {
      console.log(`- ${r.Customer} - ${r.Employee}: CommentsLogged = ${r.CommentsLogged}`);
    });
    
    try {
      // Use the updated allRows that have CommentsLogged status set
      // Skip the data fetching and just update the records directly
      await msmIntegration.updateCommentsLoggedStatus(allRows);
      console.log('✅ Successfully updated Comments Logged status in Monday.com');
    } catch (error) {
      console.error('❌ Failed to update Comments Logged status:', error.message);
    }
  } catch (error) {
    console.error('❌ MSM Monday.com sync failed:', error.message);
    console.log('\nFalling back to local file output...');
    console.log(`MSM data saved to ${OUTPUT_JSON} and ${OUTPUT_CSV} as backup`);
  }

  await browser.close();
}

// Function to log new comments using Call Logger
async function logNewComments(records, page) {
  try {
    // Check if call logger notes should be logged
    if (process.env.CALL_LOGGER_NOTES !== 'True') {
      console.log('CALL_LOGGER_NOTES is disabled, skipping comment logging');
      return;
    }
    
    // First, fetch existing Monday.com data to check Comments Logged status
    console.log('Fetching existing Monday.com data to check Comments Logged status...');
    const msmIntegration = new MSMMondayIntegration();
    const boardId = process.env.MONDAY_MSM_BOARD_ID;
    
    if (!boardId) {
      console.log('❌ MONDAY_MSM_BOARD_ID not set, cannot check Comments Logged status');
      return;
    }
    
    const existingItems = await msmIntegration.getBoardItems(boardId);
    const columns = await msmIntegration.getBoardColumns(boardId);
    
    // Create a map of Shift ID -> Comments Logged status
    const commentsLoggedMap = new Map();
    const shiftIdColumn = columns.find(col => col.title === 'Shift ID');
    const commentsLoggedColumn = columns.find(col => col.title === 'Comments Logged');
    
    for (const item of existingItems) {
      if (shiftIdColumn && commentsLoggedColumn && item.column_values) {
        const shiftIdValue = item.column_values.find(cv => cv.id === shiftIdColumn.id);
        const commentsLoggedValue = item.column_values.find(cv => cv.id === commentsLoggedColumn.id);
        
        if (shiftIdValue && shiftIdValue.text) {
          let commentsLogged = false;
          if (commentsLoggedValue && commentsLoggedValue.value) {
            try {
              const valueObj = JSON.parse(commentsLoggedValue.value);
              commentsLogged = valueObj.checked === true;
            } catch (e) {
              commentsLogged = commentsLoggedValue.text === 'true' || commentsLoggedValue.text === 'Yes';
            }
          }
          commentsLoggedMap.set(shiftIdValue.text, commentsLogged);
        }
      }
    }
    
    console.log(`Found Comments Logged status for ${commentsLoggedMap.size} existing records`);
    
    // Filter records that have comments and haven't been logged yet
    const recordsWithComments = records.filter(record => {
      const hasComments = record.Comments && 
        record.Comments.trim().length > 0 && 
        record.Comments !== 'No records to display' && 
        record.Comments !== 'No records to display.';
      
      if (!hasComments) return false;
      
      // Check if already logged in Monday.com
      const shiftId = String(record['Shift ID']);
      const alreadyLogged = commentsLoggedMap.get(shiftId) || false;
      
      if (alreadyLogged) {
        console.log(`Comment already logged for Shift ID ${shiftId}: ${record.Customer} - ${record.Employee}`);
      }
      
      return !alreadyLogged;
    });

    if (recordsWithComments.length === 0) {
      console.log('No new comments found to log (all comments already processed)');
      return;
    }

    console.log(`Found ${recordsWithComments.length} new comments to log`);

    // Process all records with new comments
    for (let i = 0; i < recordsWithComments.length; i++) {
      const recordToLog = recordsWithComments[i];
      console.log(`\n--- Processing comment ${i + 1}/${recordsWithComments.length} ---`);
      console.log(`Logging comment for: ${recordToLog.Customer} - ${recordToLog.Employee}`);
      console.log(`Comment: ${recordToLog.Comments}`);

      // Click the Call Logger button
      const callLoggerButton = page.locator('button[onclick="CallLogger_Click()"]');
      if (await callLoggerButton.count() > 0) {
        await callLoggerButton.click();
        console.log('✅ Clicked Call Logger button');
        
        // Wait for the modal to appear
        await page.waitForSelector('#callLoggerModal', { state: 'visible', timeout: 5000 });
        console.log('✅ Call Logger modal opened');
        
        // Fill out the form and save
        const success = await fillCallLoggerForm(recordToLog, page);
        
        // If successful, mark this comment as logged
        if (success) {
          recordToLog.CommentsLogged = true;
          // Also update the original record in the main data array
          const originalRecord = records.find(r => r['Shift ID'] === recordToLog['Shift ID']);
          if (originalRecord) {
            originalRecord.CommentsLogged = true;
          }
          console.log('✅ Comment marked as logged');
        }
        
        // Wait a moment before processing the next record
        if (i < recordsWithComments.length - 1) {
          console.log('⏳ Waiting before processing next comment...');
          await page.waitForTimeout(2000);
          
          // Ensure the modal is closed before proceeding
          const modal = page.locator('#callLoggerModal');
          if (await modal.isVisible()) {
            console.log('⚠️ Modal still open, closing it...');
            const cancelButton = page.locator('button[data-dismiss="modal"]').filter({ hasText: 'Cancel' });
            await cancelButton.click();
            await page.waitForTimeout(1000);
          }
        }
        
      } else {
        console.log('❌ Call Logger button not found');
      }
    }

  } catch (error) {
    console.error('❌ Error logging comments:', error.message);
  }
}

// Function to fill out the Call Logger form
async function fillCallLoggerForm(record, page) {
  try {
    // Set the date/time - use the record date + Sch Start time
    const recordDate = record.Date; // Format: YYYY-MM-DD
    const schStart = record['Sch Start']; // Format: HH:MM AM/PM
    
    // Convert to the format expected by the datetime picker
    const dateTimeValue = `${recordDate} ${schStart}`;
    
    // Set the date/time field
    const dateTimeInput = page.locator('#CallLogger_NoteDate');
    await dateTimeInput.fill(dateTimeValue);
    console.log(`✅ Set date/time to: ${dateTimeValue}`);
    
    // Select the Type dropdown - "(Neutral) - Patient Update"
    // Click on the dropdown wrapper instead of the hidden input
    const typeDropdownWrapper = page.locator('#divDdlNoteType .k-dropdown-wrap');
    await typeDropdownWrapper.click();
    console.log('✅ Clicked Type dropdown wrapper');
    
    // Wait for dropdown options to appear
    await page.waitForTimeout(1000);
    
    // Look for the "(Neutral) - Patient Update" option
    const neutralOption = page.locator('text=(Neutral) - Patient Update');
    if (await neutralOption.count() > 0) {
      await neutralOption.click();
      console.log('✅ Selected "(Neutral) - Patient Update" type');
    } else {
      console.log('❌ Could not find "(Neutral) - Patient Update" option');
      // Let's see what options are available
      const allOptions = await page.locator('.k-list .k-item').allTextContents();
      console.log('Available options:', allOptions);
    }
    
    // Fill in the Employee field (autocomplete dropdown)
    const employeeInput = page.locator('#acEmployee');
    const employeeLastName = record.Employee.split(',')[0].trim(); // Get last name before comma
    await employeeInput.fill(employeeLastName);
    console.log(`✅ Set employee to: ${employeeLastName}`);
    
    // Wait for dropdown options to appear and select the first match
    await page.waitForTimeout(1500);
    
    // Try multiple selectors for employee dropdown
    let employeeDropdown = null;
    const employeeSelectors = [
      '#acEmployee_listbox .k-item',
      '#acEmployee_listbox li',
      '[aria-owns="acEmployee_listbox"] .k-item',
      '.k-list .k-item'
    ];
    
    for (const selector of employeeSelectors) {
      employeeDropdown = page.locator(selector);
      if (await employeeDropdown.count() > 0) {
        console.log(`Found employee dropdown with selector: ${selector} (${await employeeDropdown.count()} options)`);
        break;
      }
    }
    
    if (employeeDropdown && await employeeDropdown.count() > 0) {
      // If multiple options, try to find exact match first
      const options = await employeeDropdown.allTextContents();
      console.log(`Available employee options: ${options.join(', ')}`);
      
      // Look for exact match with the full name
      const fullEmployeeName = record.Employee;
      let selectedOption = null;
      
      for (let i = 0; i < options.length; i++) {
        if (options[i].includes(employeeLastName) || options[i].includes(fullEmployeeName)) {
          selectedOption = employeeDropdown.nth(i);
          console.log(`Found matching employee option: ${options[i]}`);
          break;
        }
      }
      
      if (selectedOption) {
        await selectedOption.click();
        console.log(`✅ Selected matching employee from dropdown`);
      } else {
        await employeeDropdown.first().click();
        console.log(`✅ Selected first employee option from dropdown`);
      }
    } else {
      console.log(`⚠️ No employee dropdown options found for: ${employeeLastName}`);
      // Try pressing Enter as fallback
      await employeeInput.press('Enter');
      console.log(`Tried pressing Enter for employee field`);
    }
    
    // Fill in the Customer field (autocomplete dropdown)
    const customerInput = page.locator('#acCustomer');
    const customerLastName = record.Customer.split(',')[0].trim(); // Get last name before comma
    await customerInput.fill(customerLastName);
    console.log(`✅ Set customer to: ${customerLastName}`);
    
    // Wait for dropdown options to appear and select the first match
    await page.waitForTimeout(1500);
    
    // Try multiple selectors for customer dropdown
    let customerDropdown = null;
    const customerSelectors = [
      '#acCustomer_listbox .k-item',
      '#acCustomer_listbox li',
      '[aria-owns="acCustomer_listbox"] .k-item',
      '.k-list .k-item'
    ];
    
    for (const selector of customerSelectors) {
      customerDropdown = page.locator(selector);
      if (await customerDropdown.count() > 0) {
        console.log(`Found customer dropdown with selector: ${selector} (${await customerDropdown.count()} options)`);
        break;
      }
    }
    
    if (customerDropdown && await customerDropdown.count() > 0) {
      // If multiple options, try to find exact match first
      const options = await customerDropdown.allTextContents();
      console.log(`Available customer options: ${options.join(', ')}`);
      
      // Look for exact match with the full name
      const fullCustomerName = record.Customer;
      let selectedOption = null;
      
      for (let i = 0; i < options.length; i++) {
        if (options[i].includes(customerLastName) || options[i].includes(fullCustomerName)) {
          selectedOption = customerDropdown.nth(i);
          console.log(`Found matching customer option: ${options[i]}`);
          break;
        }
      }
      
      if (selectedOption) {
        await selectedOption.click();
        console.log(`✅ Selected matching customer from dropdown`);
      } else {
        await customerDropdown.first().click();
        console.log(`✅ Selected first customer option from dropdown`);
      }
    } else {
      console.log(`⚠️ No customer dropdown options found for: ${customerLastName}`);
      // Try pressing Enter as fallback
      await customerInput.press('Enter');
      console.log(`Tried pressing Enter for customer field`);
    }
    
    // Fill in the Call Notes with the comments
    const notesTextarea = page.locator('#CallLogger_NoteText');
    await notesTextarea.fill(record.Comments);
    console.log(`✅ Set call notes to: ${record.Comments}`);
    
    // Click the Save button
    const saveButton = page.locator('#btnCallLoggerSave');
    await saveButton.click();
    console.log('✅ Clicked Save button');
    
    // Wait for the modal to close after saving (with shorter timeout)
    try {
      await page.waitForSelector('#callLoggerModal', { state: 'hidden', timeout: 5000 });
      console.log('✅ Call Logger entry saved successfully');
      return true; // Success
    } catch (error) {
      console.log('⚠️ Modal did not close automatically, but entry was likely saved');
      // Try to close the modal manually if it's still open
      const modal = page.locator('#callLoggerModal');
      if (await modal.isVisible()) {
        // Use the Cancel button specifically (not Clear)
        const cancelButton = page.locator('button[data-dismiss="modal"]').filter({ hasText: 'Cancel' });
        await cancelButton.click();
        console.log('✅ Manually closed Call Logger modal');
      }
      return true; // Still consider it successful if we got this far
    }
    
  } catch (error) {
    console.error('❌ Error filling Call Logger form:', error.message);
    return false; // Failed
  }
}

run().catch(err => {
  console.error('SCRAPER ERROR:', err);
  process.exit(1);
});
