// employee_search_scrape.mjs
// Standalone scraper for "Employee Search" page
// Requires: Playwright (Chromium). Uses shared auth.mjs for authentication.

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import auth from './auth.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Config ----
const OUTPUT_JSON = path.join(__dirname, 'employee_search_results.json');
const OUTPUT_CSV = path.join(__dirname, 'employee_search_results.csv');

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
    
    // Click the Employee Search link
    console.log('Looking for Employee Search link...');
    await page.waitForTimeout(1000); // Give page time to fully render
    
    const employeeSearchLink = page.locator('#ctl00_pcMCRefreshArea > div.col-md-7 > section:nth-child(1) > div > div:nth-child(2) > a');
    const linkCount = await employeeSearchLink.count();
    console.log(`Found ${linkCount} Employee Search link(s)`);
    
    if (linkCount === 0) {
      throw new Error('Employee Search link not found on page');
    }
    
    await employeeSearchLink.waitFor({ state: 'visible', timeout: 15000 });
    await employeeSearchLink.click();
    
    // Wait for navigation to Employee Search page
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2000);
    
    console.log('Current URL:', page.url());
    
    // Click the Search button
    console.log('Clicking Search button...');
    const searchButton = page.locator('#ctl00_MC_RadButtonSearch');
    await searchButton.waitFor({ state: 'visible', timeout: 15000 });
    await searchButton.click();
  
    // Wait for the results table to load
    console.log('Waiting for results table...');
    await page.waitForSelector('#ctl00_MC_RadGridEmployeeSearchResults', { timeout: 20000 });
    await page.waitForTimeout(3000); // Give the grid time to render
    
    // Check if grid has loaded
    const gridExists = await page.locator('#ctl00_MC_RadGridEmployeeSearchResults').count();
    if (gridExists === 0) {
      throw new Error('Employee search grid not found after clicking search');
    }
    console.log('Grid found, proceeding with data extraction...');
  
    // Scroll to bottom to find the pagination dropdown
    console.log('Scrolling to pagination controls...');
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(1500);
    
    // Click the pagination dropdown arrow and select "250"
    console.log('Opening pagination dropdown...');
    const dropdownArrow = page.locator('#ctl00_MC_RadGridEmployeeSearchResults_ctl00_ctl03_ctl01_PageSizeComboBox_Arrow');
    const arrowExists = await dropdownArrow.count();
    
    if (arrowExists > 0) {
      await dropdownArrow.waitFor({ state: 'visible', timeout: 10000 });
      await dropdownArrow.click();
      await page.waitForTimeout(500);
      
      // Select "250" option
      console.log('Selecting "250" option...');
      const selectChanged = await page.evaluate(() => {
        // Find the dropdown/select element
        const grid = document.querySelector('#ctl00_MC_RadGridEmployeeSearchResults');
        if (!grid) return false;
        
        // Try to find the RadComboBox or select element
        const comboBox = grid.querySelector('[id*="PageSizeComboBox"]');
        if (!comboBox) return false;
        
        // Try to find the input or select element
        const input = comboBox.querySelector('input[type="text"]');
        const select = comboBox.querySelector('select');
        
        if (select) {
          // It's a select element
          const option250 = Array.from(select.options).find(opt => opt.text.includes('250') || opt.value === '250');
          if (option250) {
            const oldValue = select.value;
            select.value = option250.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            return oldValue !== select.value;
          }
        } else if (input) {
          // It's a RadComboBox - try to click the option
          // First, try to find the dropdown list
          const dropdownList = document.querySelector('.rcbList');
          if (dropdownList) {
            const option250 = Array.from(dropdownList.querySelectorAll('li')).find(li => 
              li.textContent.includes('250')
            );
            if (option250) {
              option250.click();
              return true;
            }
          }
        }
        
        return false;
      });
      
      if (selectChanged) {
        // Wait for the grid to reload with 250 items per page
        console.log('Waiting for data to reload with 250 items per page...');
        await page.waitForTimeout(3000);
      } else {
        console.log('⚠️ Could not change pagination to "250", proceeding with current page size');
      }
    } else {
      console.log('⚠️ Pagination dropdown not found, proceeding with current page data only');
    }
    
    // Extract all data, handling pagination if needed
    console.log('Extracting table data...');
    let allRows = [];
    let currentPage = 1;
    let hasMorePages = true;
    
    while (hasMorePages) {
      console.log(`Extracting page ${currentPage}...`);
      
      const pageData = await page.evaluate(() => {
        const grid = document.querySelector('#ctl00_MC_RadGridEmployeeSearchResults');
        if (!grid) {
          return { headers: [], rows: [], debug: { gridFound: false } };
        }
        
        // Debug: log grid structure
        const tables = grid.querySelectorAll('table');
        const allRows = grid.querySelectorAll('tr');
        const headerRows = grid.querySelectorAll('thead tr, .rgHeader tr');
        
        // Get table headers - RadGrid structure: command row first, then header row
        // Find the tr that has th elements with actual column headers (not command row)
        let headerRow = null;
        const thead = grid.querySelector('thead');
        if (thead) {
          const rows = Array.from(thead.querySelectorAll('tr'));
          // Find the row that has th elements with links (sortable columns) or meaningful text
          // Skip the command row which has class "rgCommandRow" or contains "Command item"
          for (const row of rows) {
            if (row.classList.contains('rgCommandRow')) {
              continue; // Skip command row
            }
            // Check if this row has th elements with actual column headers
            const ths = row.querySelectorAll('th');
            let hasRealHeaders = false;
            for (const th of ths) {
              const link = th.querySelector('a');
              const text = (link ? link.textContent : th.textContent || '').trim();
              // If it has a link (sortable) or meaningful text (not empty, not "Command item")
              if (link || (text && text !== 'Command item' && text.length > 0)) {
                hasRealHeaders = true;
                break;
              }
            }
            if (hasRealHeaders) {
              headerRow = row;
              break;
            }
          }
        }
        
        if (!headerRow) {
          return { 
            headers: [], 
            rows: [], 
            debug: { 
              error: 'Header row not found',
              tablesCount: tables.length,
              allRowsCount: allRows.length,
              headerRowsCount: headerRows.length
            } 
          };
        }
        
        // Get all header cells (th elements) - try from headerRow first, then from grid
        let headerCells = [];
        if (headerRow) {
          headerCells = headerRow.querySelectorAll('th');
        }
        
        // If no headers found in headerRow, try finding all th in thead (excluding command row)
        if (headerCells.length === 0) {
          const thead = grid.querySelector('thead');
          if (thead) {
            // Get all th elements, but exclude those in command row
            const allThs = thead.querySelectorAll('th');
            headerCells = Array.from(allThs).filter(th => {
              const parentRow = th.closest('tr');
              return parentRow && !parentRow.classList.contains('rgCommandRow');
            });
          }
        }
        
        // Last resort: find all th in grid, excluding command row
        if (headerCells.length === 0) {
          const allThs = grid.querySelectorAll('th');
          headerCells = Array.from(allThs).filter(th => {
            const parentRow = th.closest('tr');
            return parentRow && !parentRow.classList.contains('rgCommandRow');
          });
        }
        
        // Extract header text and track which columns are visible/have text
        const headers = [];
        const headerIndices = []; // Track which column index each header corresponds to
        
        Array.from(headerCells).forEach((th, index) => {
          // Skip expand, checkbox, and empty icon columns
          const className = th.className || '';
          if (/rgExpandCol|rgCheck/i.test(className)) {
            return;
          }
          
          // Skip empty columns (no text and no link)
          const link = th.querySelector('a');
          let headerText = (link ? link.textContent : th.textContent || '').trim();
          
          // Clean up header text
          headerText = headerText.replace(/\s+/g, ' ').trim();
          
          // Check if this column is visible (not hidden)
          const style = window.getComputedStyle(th);
          const isVisible = style.display !== 'none' && style.visibility !== 'hidden';
          
          // Include headers that have meaningful text and are visible
          if (headerText && isVisible && headerText.length > 0) {
            headers.push(headerText);
            headerIndices.push(index);
          }
        });
        
        // If no headers found, try a different approach - look for column definitions
        if (headers.length === 0) {
          // Try to infer headers from first data row
          const firstDataRow = grid.querySelector('tbody tr.rgRow, tbody tr.rgAltRow, tbody tr');
          if (firstDataRow) {
            const cells = firstDataRow.querySelectorAll('td');
            cells.forEach((cell, index) => {
              const cellText = (cell.textContent || '').trim();
              // Skip command/action cells
              if (cellText && !/Command|Action|Select|Refresh/i.test(cellText) && cellText.length > 2) {
                headers.push(`Column${index + 1}`);
                headerIndices.push(index);
              }
            });
          }
        }
        
        // Get all data rows from the current page - RadGrid uses .rgRow and .rgAltRow
        let dataRows = grid.querySelectorAll('tbody tr.rgRow, tbody tr.rgAltRow');
        if (dataRows.length === 0) {
          dataRows = grid.querySelectorAll('.rgRow, .rgAltRow');
        }
        if (dataRows.length === 0) {
          // Fallback to all tbody rows
          const tbody = grid.querySelector('tbody');
          if (tbody) {
            dataRows = tbody.querySelectorAll('tr');
          }
        }
        
        const rows = [];
        dataRows.forEach(tr => {
          // Skip non-data rows
          const className = tr.className || '';
          if (/rgHeader|rgFooter|rgNoRecords|rgPager|rgEditRow/i.test(className)) {
            return;
          }
          
          const cells = tr.querySelectorAll('td');
          if (cells.length === 0) return;
          
          // Map cells to headers using the header indices, skipping expand/checkbox/icon columns
          const rowData = {};
          
          Array.from(cells).forEach((cell, cellArrayIndex) => {
            // Skip expand, checkbox, and icon columns (first 3 columns typically)
            const cellClassName = cell.className || '';
            const parentTd = cell.closest('td');
            const parentClassName = parentTd ? (parentTd.className || '') : '';
            
            // Skip expand column, checkbox column, and icon column
            if (/rgExpandCol|rgCheck/i.test(parentClassName) || 
                cellArrayIndex < 3 || 
                (parentTd && parentTd.querySelector('input[type="checkbox"]')) ||
                (parentTd && parentTd.querySelector('img[src*="icon"]'))) {
              return; // Skip this cell
            }
            
            // Find matching header index
            const headerArrayIndex = headerIndices.indexOf(cellArrayIndex);
            if (headerArrayIndex >= 0 && headers[headerArrayIndex]) {
              const cellText = (cell.textContent || '').trim();
              rowData[headers[headerArrayIndex]] = cellText;
            }
          });
          
          // Only include rows that have at least one non-empty value
          const hasData = Object.values(rowData).some(val => val && val.trim().length > 0);
          if (hasData && Object.keys(rowData).length > 0) {
            rows.push(rowData);
          }
        });
        
        // Check if there's a next page
        const nextButton = grid.querySelector('.rgPageNext:not(.rgDisabled), a[title*="Next"]:not(.rgDisabled)');
        const hasNext = nextButton && window.getComputedStyle(nextButton).display !== 'none';
        
        return { 
          headers, 
          rows,
          hasNext,
          debug: {
            gridFound: true,
            headerCellsCount: headerCells.length,
            visibleHeadersCount: headers.length,
            dataRowsCount: dataRows.length,
            extractedRowsCount: rows.length,
            headerTexts: headers.slice(0, 5) // First 5 headers for debugging
          }
        };
      });
      
      // Log debug info for first page
      if (currentPage === 1 && pageData.debug) {
        console.log('Debug info:', JSON.stringify(pageData.debug, null, 2));
      }
      
      if (pageData.rows && pageData.rows.length > 0) {
        allRows = allRows.concat(pageData.rows);
        console.log(`Extracted ${pageData.rows.length} records from page ${currentPage} (total: ${allRows.length})`);
      }
      
      // Check if we need to go to the next page
      if (pageData.hasNext && pageData.rows.length > 0) {
        console.log(`Moving to next page...`);
        const nextButton = page.locator('#ctl00_MC_RadGridEmployeeSearchResults .rgPageNext:not(.rgDisabled), #ctl00_MC_RadGridEmployeeSearchResults a[title*="Next"]:not(.rgDisabled)');
        const nextExists = await nextButton.count();
        
        if (nextExists > 0) {
          await nextButton.first().click();
          await page.waitForTimeout(3000); // Wait for next page to load
          currentPage++;
        } else {
          hasMorePages = false;
        }
      } else {
        hasMorePages = false;
      }
    }
    
    console.log(`Extracted ${allRows.length} total records`);
    
    // Get headers from the extracted data (use keys from first row)
    let headers = [];
    if (allRows.length > 0) {
      headers = Object.keys(allRows[0]);
    }
    
    // Write JSON (overwrites existing file)
    await fs.writeFile(OUTPUT_JSON, JSON.stringify(allRows, null, 2), 'utf8');
    
    // Write CSV (overwrites existing file)
    if (allRows.length > 0 && headers.length > 0) {
      const csvLines = [
        headers.join(','),
        ...allRows.map(r => headers.map(h => {
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
        await page.screenshot({ path: 'employee_search_error.png', fullPage: true });
        console.log('Screenshot saved to employee_search_error.png');
        
        // Also save page HTML for debugging
        const html = await page.content();
        await fs.writeFile('employee_search_error.html', html, 'utf8');
        console.log('Page HTML saved to employee_search_error.html');
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
  process.exitCode = 1;
});

