// customer_search_scrape.mjs
// Standalone scraper for "Customer Search" page
// Requires: Playwright (Chromium). Uses shared auth.mjs for authentication.

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import auth from './auth.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Config ----
const CUSTOMER_SEARCH_URL = 'https://abscore.brightstarcare.com/customer/CustomerSearch';
const OUTPUT_JSON = path.join(__dirname, 'customer_search_results.json');
const OUTPUT_CSV = path.join(__dirname, 'customer_search_results.csv');

async function run() {
  let browser, page;
  
  try {
    // Get authenticated browser, context, and page
    console.log('Initializing browser...');
    const authResult = await auth.getAuthenticatedBrowser();
    browser = authResult.browser;
    page = authResult.page;
    
    // Wait for any ongoing navigation from auth test to complete
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000); // Give page time to fully load
    
    // Check current URL
    let currentUrl = page.url();
    console.log('Current URL:', currentUrl);
    
    // Navigate to main page if we're not already there
    if (currentUrl.includes('/Account/Login')) {
      throw new Error('Redirected to login page - authentication may have expired');
    }
    
    if (!currentUrl.includes('brightstarcare.com') || currentUrl === 'about:blank') {
      console.log('Navigating to main page...');
      await page.goto('https://abs.brightstarcare.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(2000);
      currentUrl = page.url();
      console.log('After navigation, URL:', currentUrl);
    }
    
    // Navigate directly to Customer Search page (more reliable than clicking hidden links)
    console.log('Navigating to Customer Search page...');
    await page.goto(CUSTOMER_SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2000);
    
    // Verify we're on the Customer Search page
    const currentUrlAfterNav = page.url();
    console.log('Current URL:', currentUrlAfterNav);
    if (!currentUrlAfterNav.includes('CustomerSearch')) {
      throw new Error('Failed to navigate to Customer Search page');
    }
    
    console.log('Current URL:', page.url());
    
    // Click the Search button
    console.log('Clicking Search button...');
    const searchButton = page.locator('#btnSearch');
    await searchButton.waitFor({ state: 'visible', timeout: 15000 });
    await searchButton.click();
  
    // Wait for the results table to load
    console.log('Waiting for results table...');
    await page.waitForSelector('#customerSearchGrid', { timeout: 20000 });
    await page.waitForTimeout(3000); // Give the grid time to render
    
    // Check if grid has loaded
    const gridExists = await page.locator('#customerSearchGrid').count();
    if (gridExists === 0) {
      throw new Error('Customer search grid not found after clicking search');
    }
    console.log('Grid found, proceeding with data extraction...');
  
    // Scroll to bottom to find the pagination dropdown
    console.log('Scrolling to pagination controls...');
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(1500);
    
    // Check if pagination dropdown exists
    const paginationExists = await page.locator('#customerSearchGrid .k-pager-sizes').count();
    if (paginationExists === 0) {
      console.log('⚠️ Pagination dropdown not found, proceeding with current page data only');
    } else {
      // Click the pagination dropdown arrow
      console.log('Opening pagination dropdown...');
      const dropdownArrow = page.locator('#customerSearchGrid .k-pager-sizes .k-icon.k-i-arrow-60-down');
      const arrowExists = await dropdownArrow.count();
      
      if (arrowExists > 0) {
        await dropdownArrow.waitFor({ state: 'visible', timeout: 10000 });
        await dropdownArrow.click();
        await page.waitForTimeout(500);
      }
      
      // Select "All" option
      console.log('Selecting "All" option...');
      // Use evaluate to change the select value directly
      const selectChanged = await page.evaluate(() => {
        const select = document.querySelector('#customerSearchGrid .k-pager-sizes select');
        if (select) {
          // Find the "All" option (usually the last option or option with value like "0" or "9999")
          const options = Array.from(select.options);
          const allOption = options.find(opt => opt.text.toLowerCase().includes('all')) || options[options.length - 1];
          if (allOption) {
            const oldValue = select.value;
            select.value = allOption.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            return oldValue !== select.value; // Return true if value changed
          }
        }
        return false;
      });
      
      if (selectChanged) {
        // Wait for the grid to reload with all data
        console.log('Waiting for all data to load...');
        await page.waitForTimeout(3000);
      } else {
        console.log('⚠️ Could not change pagination to "All", proceeding with current page');
      }
    }
    
    // Extract table data
    console.log('Extracting table data...');
    const data = await page.evaluate(() => {
      const grid = document.querySelector('#customerSearchGrid');
      if (!grid) {
        console.log('Grid not found');
        return { headers: [], rows: [], debug: { gridFound: false } };
      }
      
      // Get table headers - find the actual header row
      let headerRow = grid.querySelector('.k-grid-header thead tr');
      if (!headerRow) {
        headerRow = grid.querySelector('thead tr');
      }
      if (!headerRow) {
        headerRow = grid.querySelector('.k-grid-header tr');
      }
      
      if (!headerRow) {
        return { headers: [], rows: [], debug: { error: 'Header row not found' } };
      }
      
      // Get all header cells (th elements) from the header row
      const headerCells = headerRow.querySelectorAll('th');
      
      // Extract header text and track which columns are visible/have text
      const headers = [];
      const headerIndices = []; // Track which column index each header corresponds to
      
      Array.from(headerCells).forEach((th, index) => {
        const link = th.querySelector('.k-link');
        const headerText = (link ? link.textContent : th.textContent || '').trim();
        
        // Check if this column is visible (not hidden)
        const style = window.getComputedStyle(th);
        const isVisible = style.display !== 'none' && style.visibility !== 'hidden';
        
        if (headerText && isVisible) {
          headers.push(headerText);
          headerIndices.push(index);
        }
      });
      
      // Get all data rows
      let dataRows = grid.querySelectorAll('.k-grid-content table tbody tr');
      if (dataRows.length === 0) {
        dataRows = grid.querySelectorAll('table tbody tr');
      }
      if (dataRows.length === 0) {
        dataRows = grid.querySelectorAll('tbody tr');
      }
      
      const rows = [];
      dataRows.forEach(tr => {
        // Skip non-data rows
        const className = tr.className || '';
        if (/k-grouping-row|k-group-footer|k-detail-row|k-grid-norecords/i.test(className)) {
          return;
        }
        
        const cells = tr.querySelectorAll('td');
        if (cells.length === 0) return;
        
        // Map cells to headers using the header indices
        const rowData = {};
        headerIndices.forEach((headerIndex, headerArrayIndex) => {
          const cell = cells[headerIndex];
          if (cell && headers[headerArrayIndex]) {
            const text = (cell.textContent || '').trim();
            rowData[headers[headerArrayIndex]] = text;
          }
        });
        
        if (Object.keys(rowData).length > 0) {
          rows.push(rowData);
        }
      });
      
      return { 
        headers, 
        rows,
        debug: {
          gridFound: true,
          headerCellsCount: headerCells.length,
          visibleHeadersCount: headers.length,
          dataRowsCount: dataRows.length,
          extractedRowsCount: rows.length
        }
      };
    });
    
    // Log debug info
    if (data.debug) {
      console.log('Debug info:', JSON.stringify(data.debug, null, 2));
    }
    
    console.log(`Extracted ${data.rows.length} records`);
    
    // Write JSON (overwrites existing file)
    const outputData = data.rows || [];
    await fs.writeFile(OUTPUT_JSON, JSON.stringify(outputData, null, 2), 'utf8');
    
    // Write CSV (overwrites existing file)
    if (data.rows.length > 0 && data.headers.length > 0) {
      const csvLines = [
        data.headers.join(','),
        ...data.rows.map(r => data.headers.map(h => {
          const val = String(r[h] ?? '');
          const needsQuotes = /[",\n]/.test(val);
          const escaped = val.replace(/"/g, '""');
          return needsQuotes ? `"${escaped}"` : escaped;
        }).join(','))
      ];
      await fs.writeFile(OUTPUT_CSV, csvLines.join('\n'), 'utf8');
    }
    
    console.log(`Done. Saved:
- ${OUTPUT_JSON}
- ${OUTPUT_CSV}`);

  } catch (error) {
    console.error('Error during scraping:', error.message);
    console.error('Stack:', error.stack);
    
    // Take a screenshot for debugging if page exists
    if (page) {
      try {
        await page.screenshot({ path: 'customer_search_error.png', fullPage: true });
        console.log('Screenshot saved to customer_search_error.png');
        
        // Also save page HTML for debugging
        const html = await page.content();
        await fs.writeFile('customer_search_error.html', html, 'utf8');
        console.log('Page HTML saved to customer_search_error.html');
      } catch (screenshotError) {
        console.error('Could not take screenshot:', screenshotError.message);
      }
    }
    
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

run().catch(err => {
  console.error('SCRAPER ERROR:', err.message);
  console.error('Full error:', err);
  process.exit(1);
});

