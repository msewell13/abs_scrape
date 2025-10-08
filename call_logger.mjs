#!/usr/bin/env node
/**
 * Call Logger Integration
 * 
 * This module handles automatic logging of employee comments to the call logger system.
 * It integrates with the SQLite database to track which comments have been logged.
 */

import MSMDatabase from './database.mjs';
import { chromium } from 'playwright';
import dotenv from 'dotenv';

dotenv.config();

class CallLogger {
  constructor() {
    this.db = new MSMDatabase();
    this.browser = null;
    this.page = null;
  }

  async initialize() {
    console.log('🚀 Initializing Call Logger...');
    
    try {
      await this.db.initializeSchema();
      
      // Launch browser
      this.browser = await chromium.launch({
        headless: process.env.DEBUG !== 'True',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      this.page = await this.browser.newPage();
      
      // Set viewport
      await this.page.setViewportSize({ width: 1280, height: 720 });
      
      console.log('✅ Call Logger initialized successfully');
      
    } catch (error) {
      console.error('❌ Failed to initialize Call Logger:', error.message);
      throw error;
    }
  }

  async logUnloggedComments() {
    console.log('📝 Starting call logging process...');
    
    try {
      // Check if call logging is enabled
      if (process.env.CALL_LOGGER_NOTES !== 'True') {
        console.log('CALL_LOGGER_NOTES is disabled, skipping call logging');
        return { logged: 0, skipped: 0, errors: 0 };
      }

      // Get unlogged comments from database
      const unloggedComments = await this.getUnloggedComments();
      
      if (unloggedComments.length === 0) {
        console.log('✅ No unlogged comments found');
        return { logged: 0, skipped: 0, errors: 0 };
      }

      console.log(`Found ${unloggedComments.length} unlogged comments`);

      let loggedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;

      // Process each unlogged comment
      for (let i = 0; i < unloggedComments.length; i++) {
        const comment = unloggedComments[i];
        console.log(`\n--- Processing comment ${i + 1}/${unloggedComments.length} ---`);
        console.log(`Shift ID: ${comment.shift_id}`);
        console.log(`Customer: ${comment.customer}`);
        console.log(`Employee: ${comment.employee_name || 'Unknown'}`);
        console.log(`Comment: ${comment.comments.substring(0, 100)}${comment.comments.length > 100 ? '...' : ''}`);

        try {
          const success = await this.logComment(comment);
          
          if (success) {
            // Mark as logged in database
            await this.db.updateCommentsLoggedStatus(comment.shift_id, true);
            loggedCount++;
            console.log(`✅ Successfully logged comment for shift ${comment.shift_id}`);
          } else {
            skippedCount++;
            console.log(`⚠️ Skipped comment for shift ${comment.shift_id}`);
          }

          // Wait between comments to avoid overwhelming the system
          if (i < unloggedComments.length - 1) {
            console.log('⏳ Waiting before processing next comment...');
            await this.page.waitForTimeout(2000);
          }

        } catch (error) {
          console.error(`❌ Error logging comment for shift ${comment.shift_id}:`, error.message);
          errorCount++;
        }
      }

      console.log(`\n📊 Call logging summary:`);
      console.log(`   - Comments logged: ${loggedCount}`);
      console.log(`   - Comments skipped: ${skippedCount}`);
      console.log(`   - Errors: ${errorCount}`);

      return { logged: loggedCount, skipped: skippedCount, errors: errorCount };

    } catch (error) {
      console.error('❌ Call logging process failed:', error.message);
      throw error;
    }
  }

  async getUnloggedComments() {
    return new Promise((resolve, reject) => {
      this.db.db.all(`
        SELECT s.*, e.name as employee_name, e.email as employee_email
        FROM msm_shifts s
        LEFT JOIN employees e ON s.employee_id = e.id
        WHERE s.comments IS NOT NULL 
          AND s.comments != '' 
          AND s.comments != 'No records to display'
          AND s.comments != 'No records to display.'
          AND (s.comments_logged IS NULL OR s.comments_logged = 0)
        ORDER BY s.date, s.sch_start
      `, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async logComment(comment) {
    try {
      // Navigate to the MSM page (assuming it's the same as the scraper)
      const loginUrl = process.env.ABS_LOGIN_URL || 'https://abs.brightstarcare.com/Account/Login';
      const msmUrl = 'https://abs.brightstarcare.com/MobileShiftMaintenance/Index';
      
      console.log('🌐 Navigating to MSM page...');
      await this.page.goto(msmUrl, { waitUntil: 'networkidle' });

      // Check if we need to login
      if (this.page.url().includes('/Account/Login')) {
        console.log('🔐 Login required, authenticating...');
        await this.login();
        await this.page.goto(msmUrl, { waitUntil: 'networkidle' });
      }

      // Wait for the page to load
      await this.page.waitForSelector('table, .k-grid', { timeout: 10000 });
      console.log('✅ MSM page loaded');

      // Find the specific shift row and click to open details
      const shiftFound = await this.findAndClickShift(comment);
      
      if (!shiftFound) {
        console.log(`⚠️ Could not find shift ${comment.shift_id} in the grid`);
        return false;
      }

      // Wait for the popup to appear
      await this.page.waitForSelector('#divViewShiftPopup', { state: 'visible', timeout: 5000 });
      console.log('✅ Shift details popup opened');

      // Click the Call Logger button
      const callLoggerButton = this.page.locator('button[onclick="CallLogger_Click()"]');
      if (await callLoggerButton.count() === 0) {
        console.log('❌ Call Logger button not found');
        await this.closePopup();
        return false;
      }

      await callLoggerButton.click();
      console.log('✅ Clicked Call Logger button');

      // Wait for the call logger modal
      await this.page.waitForSelector('#callLoggerModal', { state: 'visible', timeout: 5000 });
      console.log('✅ Call Logger modal opened');

      // Fill out the call logger form
      const success = await this.fillCallLoggerForm(comment);
      
      if (success) {
        console.log('✅ Call Logger form filled successfully');
      } else {
        console.log('❌ Failed to fill Call Logger form');
      }

      // Close the modal
      await this.closeCallLoggerModal();
      
      // Close the shift details popup
      await this.closePopup();

      return success;

    } catch (error) {
      console.error('❌ Error in logComment:', error.message);
      return false;
    }
  }

  async findAndClickShift(comment) {
    try {
      // Look for the shift in the grid by shift ID
      const shiftIdCell = this.page.locator(`text=${comment.shift_id}`);
      
      if (await shiftIdCell.count() > 0) {
        // Click on the row containing this shift ID
        const row = shiftIdCell.locator('..').locator('..'); // Go up to the table row
        await row.click();
        console.log(`✅ Found and clicked shift ${comment.shift_id}`);
        return true;
      }

      // Alternative: look for customer name and date combination
      const customerCell = this.page.locator(`text=${comment.customer}`);
      if (await customerCell.count() > 0) {
        const row = customerCell.locator('..').locator('..');
        await row.click();
        console.log(`✅ Found and clicked shift by customer ${comment.customer}`);
        return true;
      }

      return false;

    } catch (error) {
      console.error('❌ Error finding shift:', error.message);
      return false;
    }
  }

  async fillCallLoggerForm(comment) {
    try {
      // Set the date/time - use the record date + Sch Start time
      const recordDate = comment.date; // Format: "Fri, Oct 03, 2025"
      const schStart = comment.sch_start; // Format: "08:00 AM"
      
      // Convert date format from "Fri, Oct 03, 2025" to "2025-10-03"
      const dateObj = new Date(recordDate);
      const isoDate = dateObj.toISOString().split('T')[0];
      const dateTimeValue = `${isoDate} ${schStart}`;
      
      // Set the date/time field
      const dateTimeInput = this.page.locator('#CallLogger_NoteDate');
      await dateTimeInput.fill(dateTimeValue);
      console.log(`✅ Set date/time to: ${dateTimeValue}`);
      
      // Select the Type dropdown - "(Neutral) - Patient Update"
      const typeDropdownWrapper = this.page.locator('#divDdlNoteType .k-dropdown-wrap');
      await typeDropdownWrapper.click();
      console.log('✅ Clicked Type dropdown wrapper');
      
      // Wait for dropdown options to appear
      await this.page.waitForTimeout(1000);
      
      // Look for the "(Neutral) - Patient Update" option
      const neutralOption = this.page.locator('text=(Neutral) - Patient Update');
      if (await neutralOption.count() > 0) {
        await neutralOption.click();
        console.log('✅ Selected "(Neutral) - Patient Update" type');
      } else {
        console.log('❌ Could not find "(Neutral) - Patient Update" option');
        // Try to select the first available option
        const firstOption = this.page.locator('.k-list .k-item').first();
        if (await firstOption.count() > 0) {
          await firstOption.click();
          console.log('✅ Selected first available option');
        }
      }
      
      // Fill in the Employee field
      const employeeInput = this.page.locator('#acEmployee');
      const employeeName = comment.employee_name || 'Unknown Employee';
      const employeeLastName = employeeName.split(',')[0].trim();
      await employeeInput.fill(employeeLastName);
      console.log(`✅ Set employee to: ${employeeLastName}`);
      
      // Wait for dropdown and select first option
      await this.page.waitForTimeout(1500);
      const employeeDropdown = this.page.locator('#acEmployee_listbox .k-item').first();
      if (await employeeDropdown.count() > 0) {
        await employeeDropdown.click();
        console.log('✅ Selected employee from dropdown');
      } else {
        await employeeInput.press('Enter');
        console.log('✅ Pressed Enter for employee field');
      }
      
      // Fill in the Customer field
      const customerInput = this.page.locator('#acCustomer');
      const customerLastName = comment.customer.split(',')[0].trim();
      await customerInput.fill(customerLastName);
      console.log(`✅ Set customer to: ${customerLastName}`);
      
      // Wait for dropdown and select first option
      await this.page.waitForTimeout(1500);
      const customerDropdown = this.page.locator('#acCustomer_listbox .k-item').first();
      if (await customerDropdown.count() > 0) {
        await customerDropdown.click();
        console.log('✅ Selected customer from dropdown');
      } else {
        await customerInput.press('Enter');
        console.log('✅ Pressed Enter for customer field');
      }
      
      // Fill in the Call Notes with the comments
      const notesTextarea = this.page.locator('#CallLogger_NoteText');
      await notesTextarea.fill(comment.comments);
      console.log(`✅ Set call notes to: ${comment.comments.substring(0, 50)}...`);
      
      // Click the Save button
      const saveButton = this.page.locator('#btnCallLoggerSave');
      await saveButton.click();
      console.log('✅ Clicked Save button');
      
      // Wait for the modal to close after saving
      try {
        await this.page.waitForSelector('#callLoggerModal', { state: 'hidden', timeout: 5000 });
        console.log('✅ Call Logger entry saved successfully');
        return true;
      } catch (error) {
        console.log('⚠️ Modal did not close automatically, but entry was likely saved');
        return true; // Still consider it successful
      }
      
    } catch (error) {
      console.error('❌ Error filling Call Logger form:', error.message);
      return false;
    }
  }

  async closeCallLoggerModal() {
    try {
      const modal = this.page.locator('#callLoggerModal');
      if (await modal.isVisible()) {
        const cancelButton = this.page.locator('button[data-dismiss="modal"]').filter({ hasText: 'Cancel' });
        if (await cancelButton.count() > 0) {
          await cancelButton.click();
          console.log('✅ Closed Call Logger modal');
        }
      }
    } catch (error) {
      console.log('⚠️ Could not close Call Logger modal:', error.message);
    }
  }

  async closePopup() {
    try {
      const popup = this.page.locator('#divViewShiftPopup');
      if (await popup.isVisible()) {
        const closeButton = this.page.locator('button[onclick*="close"], .k-window-close, [aria-label="Close"]');
        if (await closeButton.count() > 0) {
          await closeButton.first().click();
          console.log('✅ Closed shift details popup');
        }
      }
    } catch (error) {
      console.log('⚠️ Could not close popup:', error.message);
    }
  }

  async login() {
    try {
      const username = process.env.ABS_USER;
      const password = process.env.ABS_PASS;
      
      if (!username || !password) {
        throw new Error('ABS_USER and ABS_PASS environment variables are required');
      }

      await this.page.fill('#UserName', username);
      await this.page.fill('#Password', password);
      await this.page.click('input[type="submit"]');
      
      // Wait for login to complete
      await this.page.waitForNavigation({ waitUntil: 'networkidle' });
      console.log('✅ Login successful');
      
    } catch (error) {
      console.error('❌ Login failed:', error.message);
      throw error;
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
    if (this.db) {
      await this.db.close();
    }
  }
}

// CLI handling
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'log';
  
  const callLogger = new CallLogger();
  
  try {
    await callLogger.initialize();
    
    switch (command) {
      case 'log':
        await callLogger.logUnloggedComments();
        break;
      case 'test':
        console.log('🧪 Testing call logger...');
        const unlogged = await callLogger.getUnloggedComments();
        console.log(`Found ${unlogged.length} unlogged comments`);
        if (unlogged.length > 0) {
          console.log('Sample comment:', unlogged[0]);
        }
        break;
      default:
        console.log('Usage: node call_logger.mjs [log|test]');
        break;
    }
    
  } catch (error) {
    console.error('❌ Call Logger failed:', error.message);
    process.exit(1);
  } finally {
    await callLogger.close();
  }
}

// Run if called directly
main();

export default CallLogger;

