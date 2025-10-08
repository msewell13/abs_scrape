#!/usr/bin/env node
/**
 * Employee Sync Script
 * 
 * This script syncs employees from ConnectTeam to Monday.com
 * It can be run standalone or as part of the main scraper
 * 
 * Usage: 
 *   node sync_employees.mjs
 */

import dotenv from 'dotenv';
import EmployeeSync from './employee_sync.mjs';

// Load environment variables
dotenv.config();

async function main() {
  try {
    console.log('🚀 Starting Employee Sync...\n');
    
    // Debug: Check environment variables
    console.log('🔍 Environment check:');
    console.log('   MONDAY_API_TOKEN:', process.env.MONDAY_API_TOKEN ? 'SET' : 'NOT SET');
    console.log('   CT_API_KEY:', process.env.CT_API_KEY ? 'SET' : 'NOT SET');
    console.log('   EMPLOYEE_BOARD_ID:', process.env.EMPLOYEE_BOARD_ID || 'NOT SET');
    console.log('');
    
    const employeeSync = new EmployeeSync();
    const result = await employeeSync.syncEmployees();
    
    console.log('\n🎉 Employee sync completed successfully!');
    console.log(`📊 Summary:`);
    console.log(`   Total processed: ${result.total}`);
    console.log(`   Created: ${result.created}`);
    console.log(`   Updated: ${result.updated}`);
    console.log(`   Skipped: ${result.skipped}`);
    console.log(`   Errors: ${result.errors}`);
    
    if (result.errors > 0) {
      console.log('\n⚠️  Some errors occurred during sync. Check the logs above for details.');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Employee sync failed:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Check that all required environment variables are set:');
    console.error('   - MONDAY_API_TOKEN');
    console.error('   - CT_API_KEY');
    console.error('   - EMPLOYEE_BOARD_ID');
    console.error('2. Verify that the Monday.com Employees board exists');
    console.error('3. Check that ConnectTeam API credentials are valid');
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}` || 
    import.meta.url.endsWith(process.argv[1]) ||
    process.argv[1] && process.argv[1].endsWith('sync_employees.mjs')) {
  main();
}
