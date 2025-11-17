// customer_search_scrape.mjs
// Standalone scraper for "Customer Search" page
// Requires: Playwright (Chromium). Navigates directly to Customer Search and handles auth automatically.

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Config ----
const CUSTOMER_SEARCH_URL = 'https://abscore.brightstarcare.com/customer/CustomerSearch';
const OUTPUT_JSON = path.join(__dirname, 'customer_search_results.json');
const OUTPUT_CSV = path.join(__dirname, 'customer_search_results.csv');

async function run() {
  let browser, page;
  
  try {
    // Get browser and page - we'll navigate directly to Customer Search and let auth handle login
    console.log('Initializing browser...');
    
    browser = await chromium.launch({ 
      headless: process.env.DEBUG !== 'True',
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-software-rasterizer'] 
    });
    
    // Create context - try to use stored auth if available
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const STORAGE_STATE = path.join(__dirname, 'storageState.json');
    
    let context;
    try {
      await fs.access(STORAGE_STATE);
      // Use stored auth if available
      context = await browser.newContext({
        storageState: STORAGE_STATE,
        locale: 'en-US',
        timezoneId: 'America/Chicago',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        viewport: { width: 1400, height: 900 },
      });
      console.log('Using stored authentication state');
    } catch {
      // No stored auth, create new context
      context = await browser.newContext({
        locale: 'en-US',
        timezoneId: 'America/Chicago',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        viewport: { width: 1400, height: 900 },
      });
      console.log('No stored authentication, will login when needed');
    }
    
    await context.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => undefined }));
    page = await context.newPage();
    
    // Navigate directly to Customer Search page - authentication will handle login if needed
    console.log('Navigating directly to Customer Search page...');
    console.log('URL:', CUSTOMER_SEARCH_URL);
    
    try {
      await page.goto(CUSTOMER_SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    } catch (e) {
      console.log('Initial navigation error (may be expected during auth):', e.message);
    }
    
    // Wait for any authentication redirects to complete
    // The page may go through login -> OIDC -> Customer Search
    console.log('Waiting for page to stabilize and authentication to complete...');
    
    let currentUrl;
    let attempts = 0;
    const maxAttempts = 30; // Allow up to 60 seconds (30 * 2s delays)
    
    while (attempts < maxAttempts) {
      try {
        currentUrl = page.url();
        console.log(`Attempt ${attempts + 1}/${maxAttempts}: Current URL: ${currentUrl}`);
        
        // If we're on the Customer Search page, we're done
        if (currentUrl.includes('CustomerSearch') && !currentUrl.includes('/Account/Login')) {
          console.log('✅ Successfully reached Customer Search page');
          break;
        }
        
        // If we're on a login page (including authentication.brightstarcare.com), perform login
        if (currentUrl.includes('/Account/Login')) {
          console.log('On login page, performing login...');
          const USERNAME = process.env.ABS_USER;
          const PASSWORD = process.env.ABS_PASS;
          
          if (!USERNAME || !PASSWORD) {
            throw new Error('ABS_USER and ABS_PASS environment variables must be set');
          }
          
          // Handle cookie consent if present
          await page.getByText('Accept All', { exact: false }).first().click({ timeout: 1200 }).catch(() => {});
          await page.getByRole('button', { name: /accept/i }).click({ timeout: 1200 }).catch(() => {});
          
          // Fill in credentials
          await page.locator('#UserName').waitFor({ state: 'visible', timeout: 15000 });
          await page.locator('#Password').waitFor({ state: 'visible', timeout: 15000 });
          await page.fill('#UserName', USERNAME);
          await page.fill('#Password', PASSWORD);
          
          // Submit form
          const submit = page.locator('button[type="submit"], input[type="submit"]');
          if (await submit.count()) {
            await submit.first().click();
          } else {
            await page.press('#Password', 'Enter');
          }
          
          console.log('Login submitted, waiting for redirect...');
          await new Promise(resolve => setTimeout(resolve, 3000));
          attempts++;
          continue;
        }
        
        // If we're on OIDC/auth redirect page (but not login), wait for redirect
        if (currentUrl.includes('/signin-oidc') || (currentUrl.includes('authentication.brightstarcare.com') && !currentUrl.includes('/Account/Login'))) {
          console.log('Waiting for authentication redirect...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          attempts++;
          continue;
        }
        
        // If we're on a 404 or other page, wait a bit and check again
        if (currentUrl.includes('404') || currentUrl.includes('error') || !currentUrl.includes('brightstarcare.com')) {
          console.log('On intermediate page, waiting for redirect...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          attempts++;
          continue;
        }
        
        // If we're on some other page, try navigating again
        if (!currentUrl.includes('CustomerSearch')) {
          console.log('Not on Customer Search page yet, waiting...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          attempts++;
          continue;
        }
      } catch (e) {
        console.log('Error checking URL:', e.message);
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
        continue;
      }
    }
    
    // Final check - verify we're on the right page
    try {
      currentUrl = page.url();
      if (!currentUrl.includes('CustomerSearch') || currentUrl.includes('/Account/Login')) {
        throw new Error(`Failed to reach Customer Search page. Current URL: ${currentUrl}`);
      }
    } catch (e) {
      throw new Error(`Page validation failed: ${e.message}`);
    }
    
    // Wait for page to fully load
    console.log('Waiting for Customer Search page to fully load...');
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 2000));
    
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
            const headerName = headers[headerArrayIndex];
            
            // Special handling for "Active Incident Report" - check for exclamation triangle
            if (headerName === 'Active Incident Report') {
              // Check if the exclamation triangle icon exists in this cell
              const hasExclamation = cell.querySelector('i.fa.fa-exclamation-triangle') !== null;
              rowData[headerName] = hasExclamation;
            } else {
              const text = (cell.textContent || '').trim();
              rowData[headerName] = text;
            }
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
    
    // Now fetch additional details from each customer's detail page
    console.log(`\nFetching additional details from customer detail pages...`);
    const outputData = [];
    
    for (let i = 0; i < data.rows.length; i++) {
      const record = data.rows[i];
      const customerNumber = record['Customer Number'];
      
      if (!customerNumber || customerNumber.trim() === '') {
        console.log(`⚠️  Record ${i + 1}/${data.rows.length}: No Customer Number, skipping detail page`);
        outputData.push(record);
        continue;
      }
      
      try {
        console.log(`[${i + 1}/${data.rows.length}] Fetching details for Customer Number: ${customerNumber}...`);
        
        // Navigate to customer detail page
        const detailUrl = `https://abscore.brightstarcare.com/customer/customerdetail/${customerNumber}`;
        await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForTimeout(2000); // Give page time to load
        
        // Extract additional fields
        const additionalData = await page.evaluate(() => {
          const result = {
            Sex: '',
            DOB: '',
            Address: '',
            Email: ''
          };
          
          // Extract sex and birth date from: #divCustomerHeader > div.bg-gray.p-3.mx-2.border.border-radius-5 > div > div.col-md-9 > div:nth-child(1) > div.col-md-4 > div > div:nth-child(2) > div:nth-child(2)
          try {
            const sexBirthElement = document.querySelector('#divCustomerHeader > div.bg-gray.p-3.mx-2.border.border-radius-5 > div > div.col-md-9 > div:nth-child(1) > div.col-md-4 > div > div:nth-child(2) > div:nth-child(2)');
            if (sexBirthElement) {
              const text = sexBirthElement.textContent.trim();
              // Parse sex and birth date from the text
              // Format might be like "Male, 78 (11/22/1946)" or "Male, 11/22/1946"
              const parts = text.split(',').map(p => p.trim());
              if (parts.length >= 1) {
                const sexValue = parts[0];
                // Only set Sex if it's actually "Male" or "Female" (case-insensitive)
                if (sexValue && (sexValue.toLowerCase() === 'male' || sexValue.toLowerCase() === 'female')) {
                  result.Sex = sexValue;
                } else {
                  // Leave blank if not a valid sex value
                  result.Sex = '';
                }
              }
              if (parts.length >= 2) {
                let dobText = parts.slice(1).join(',').trim();
                
                // Extract date from format like "78 (11/22/1946)" - get just the date in parentheses
                const dateMatch = dobText.match(/\(([^)]+)\)/);
                if (dateMatch) {
                  // Found date in parentheses, use that
                  result.DOB = dateMatch[1].trim();
                } else {
                  // No parentheses, check if it's already a date format (MM/DD/YYYY)
                  const directDateMatch = dobText.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
                  if (directDateMatch) {
                    result.DOB = directDateMatch[0];
                  } else {
                    // Fallback: use the whole text
                    result.DOB = dobText;
                  }
                }
              }
            }
          } catch (e) {
            console.log('Error extracting sex/birth date:', e);
          }
          
          // Extract address from: #divCustomerHeader > div.bg-gray.p-3.mx-2.border.border-radius-5 > div > div.col-md-9 > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > a
          try {
            const addressElement = document.querySelector('#divCustomerHeader > div.bg-gray.p-3.mx-2.border.border-radius-5 > div > div.col-md-9 > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > a');
            if (addressElement) {
              result.Address = addressElement.textContent.trim();
            }
          } catch (e) {
            console.log('Error extracting address:', e);
          }
          
          // Extract email from: #divCustomerHeader > div.bg-gray.p-3.mx-2.border.border-radius-5 > div > div.col-md-9 > div:nth-child(1) > div:nth-child(3) > a
          try {
            const emailElement = document.querySelector('#divCustomerHeader > div.bg-gray.p-3.mx-2.border.border-radius-5 > div > div.col-md-9 > div:nth-child(1) > div:nth-child(3) > a');
            if (emailElement) {
              result.Email = emailElement.textContent.trim();
              // Also check href in case email is in the link
              if (!result.Email && emailElement.href && emailElement.href.startsWith('mailto:')) {
                result.Email = emailElement.href.replace('mailto:', '');
              }
            }
          } catch (e) {
            console.log('Error extracting email:', e);
          }
          
          return result;
        });
        
        // Merge additional data into the record
        const enhancedRecord = {
          ...record,
          ...additionalData
        };
        
        outputData.push(enhancedRecord);
        console.log(`  ✅ Extracted: Sex="${additionalData.Sex}", DOB="${additionalData.DOB}", Address="${additionalData.Address}", Email="${additionalData.Email}"`);
        
        // Small delay between requests to avoid overwhelming the server
        await page.waitForTimeout(500);
        
      } catch (error) {
        console.error(`  ❌ Error fetching details for Customer Number ${customerNumber}: ${error.message}`);
        // Still add the record without additional data
        outputData.push(record);
      }
    }
    
    console.log(`\n✅ Completed fetching details for ${outputData.length} records`);
    
    // Write JSON (overwrites existing file)
    await fs.writeFile(OUTPUT_JSON, JSON.stringify(outputData, null, 2), 'utf8');
    
    // Write CSV (overwrites existing file)
    if (outputData.length > 0) {
      // Get all unique headers from all records (including new fields)
      const allHeaders = new Set();
      outputData.forEach(record => {
        Object.keys(record).forEach(key => allHeaders.add(key));
      });
      const csvHeaders = Array.from(allHeaders);
      
      const csvLines = [
        csvHeaders.join(','),
        ...outputData.map(r => csvHeaders.map(h => {
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

