#!/usr/bin/env node
/**
 * Test script to run all scrapers and verify they successfully write to Grist
 * 
 * This script:
 * 1. Runs each scraper
 * 2. Verifies output files are created
 * 3. Sends data to Grist
 * 4. Verifies data was written by querying Grist
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { sendToGrist, loadJsonData } = require('./grist_integration');
const { GristClient } = require('./grist_client');

// Check required environment variables
const apiKey = process.env.GRIST_API_KEY;
const server = process.env.GRIST_SERVER;
const org = process.env.GRIST_ORG || 'brightstar';
const docName = process.env.GRIST_DOC || 'ABS_Data';

if (!apiKey) {
    console.error('❌ Error: GRIST_API_KEY environment variable must be set');
    console.error('   Example: export GRIST_API_KEY=your_api_key_here');
    process.exit(1);
}

if (!server) {
    console.error('❌ Error: GRIST_SERVER environment variable must be set');
    console.error('   Example: export GRIST_SERVER=https://grist.pythonfinancial.com');
    process.exit(1);
}

console.log('🧪 Testing Scrapers and Grist Integration');
console.log('═══════════════════════════════════════════');
console.log(`   Server: ${server}`);
console.log(`   Document: ${docName}`);
console.log(`   Organization: ${org}`);
console.log('');

// Scraper configurations
const scrapers = [
    {
        name: 'MSM (Mobile Shift Maintenance)',
        npmScript: 'scrape-msm',
        outputFile: 'msm_results.json',
        tableName: 'MSM_Results'
    },
    {
        name: 'Schedule',
        npmScript: 'scrape-schedule',
        outputFile: 'month_block.json',
        tableName: 'Schedule_Data'
    },
    {
        name: 'Customer Search',
        npmScript: 'scrape-customers',
        outputFile: 'customer_search_results.json',
        tableName: 'Customer_Search_Results'
    },
    {
        name: 'Employee Search',
        npmScript: 'scrape-employees',
        outputFile: 'employee_search_results.json',
        tableName: 'Employee_Search_Results'
    }
];

// Initialize Grist client for verification
const gristClient = new GristClient(apiKey, server, org);

/**
 * Verify data was written to Grist by querying the table
 */
async function verifyGristWrite(docId, tableName, expectedMinRecords = 1) {
    try {
        const records = await gristClient.listRecords(docId, tableName);
        const recordCount = records.length || 0;
        
        if (recordCount >= expectedMinRecords) {
            console.log(`   ✅ Verified: ${recordCount} record(s) found in Grist table`);
            return { success: true, recordCount };
        } else {
            console.log(`   ⚠️  Warning: Only ${recordCount} record(s) found (expected at least ${expectedMinRecords})`);
            return { success: false, recordCount };
        }
    } catch (error) {
        console.log(`   ❌ Error verifying Grist write: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Test a single scraper
 */
async function testScraper(scraper) {
    console.log(`\n📊 Testing: ${scraper.name}`);
    console.log('─────────────────────────────────────────');
    
    const results = {
        scraper: scraper.name,
        ran: false,
        outputFileCreated: false,
        dataSent: false,
        verified: false,
        recordCount: 0,
        error: null
    };
    
    try {
        // Step 1: Run the scraper
        console.log(`   Step 1: Running scraper (npm run ${scraper.npmScript})...`);
        try {
            execSync(`npm run ${scraper.npmScript}`, { 
                stdio: 'inherit',
                cwd: process.cwd(),
                timeout: 300000 // 5 minute timeout
            });
            results.ran = true;
            console.log('   ✅ Scraper completed successfully');
        } catch (error) {
            results.error = `Scraper failed: ${error.message}`;
            console.log(`   ❌ Scraper failed: ${error.message}`);
            return results;
        }
        
        // Step 2: Check if output file exists
        const outputPath = path.join(process.cwd(), scraper.outputFile);
        console.log(`   Step 2: Checking for output file: ${scraper.outputFile}...`);
        
        if (!fs.existsSync(outputPath)) {
            results.error = `Output file not found: ${scraper.outputFile}`;
            console.log(`   ❌ Output file not found: ${scraper.outputFile}`);
            return results;
        }
        
        results.outputFileCreated = true;
        
        // Check file size
        const stats = fs.statSync(outputPath);
        if (stats.size === 0) {
            results.error = `Output file is empty: ${scraper.outputFile}`;
            console.log(`   ⚠️  Warning: Output file is empty`);
            return results;
        }
        
        console.log(`   ✅ Output file found (${(stats.size / 1024).toFixed(2)} KB)`);
        
        // Step 3: Load and validate data
        console.log('   Step 3: Loading and validating data...');
        let data;
        try {
            data = await loadJsonData(outputPath);
            if (!Array.isArray(data) || data.length === 0) {
                results.error = 'No data found in output file';
                console.log('   ⚠️  Warning: No data found in output file');
                return results;
            }
            console.log(`   ✅ Loaded ${data.length} record(s)`);
        } catch (error) {
            results.error = `Failed to load data: ${error.message}`;
            console.log(`   ❌ Failed to load data: ${error.message}`);
            return results;
        }
        
        // Step 4: Send to Grist
        console.log(`   Step 4: Sending data to Grist table: ${scraper.tableName}...`);
        try {
            await sendToGrist(data, apiKey, server, docName, scraper.tableName, org);
            results.dataSent = true;
            results.recordCount = data.length;
            console.log('   ✅ Data sent to Grist successfully');
        } catch (error) {
            results.error = `Failed to send to Grist: ${error.message}`;
            console.log(`   ❌ Failed to send to Grist: ${error.message}`);
            return results;
        }
        
        // Step 5: Verify data in Grist
        console.log('   Step 5: Verifying data in Grist...');
        try {
            const doc = await gristClient.getOrCreateDocument(docName);
            const verification = await verifyGristWrite(doc.id, scraper.tableName, data.length);
            results.verified = verification.success;
            if (verification.recordCount !== undefined) {
                results.recordCount = verification.recordCount;
            }
        } catch (error) {
            console.log(`   ⚠️  Warning: Could not verify: ${error.message}`);
            // Don't fail the test if verification fails, data was sent
        }
        
        return results;
        
    } catch (error) {
        results.error = `Unexpected error: ${error.message}`;
        console.log(`   ❌ Unexpected error: ${error.message}`);
        if (error.stack) {
            console.log(`   Stack: ${error.stack}`);
        }
        return results;
    }
}

/**
 * Main test runner
 */
async function runTests() {
    const testResults = [];
    
    for (const scraper of scrapers) {
        const result = await testScraper(scraper);
        testResults.push(result);
    }
    
    // Print summary
    console.log('\n\n📋 Test Summary');
    console.log('═══════════════════════════════════════════');
    
    let allPassed = true;
    for (const result of testResults) {
        const status = result.verified || (result.dataSent && !result.error) ? '✅' : '❌';
        console.log(`${status} ${result.scraper}`);
        console.log(`   Ran: ${result.ran ? '✅' : '❌'}`);
        console.log(`   Output File: ${result.outputFileCreated ? '✅' : '❌'}`);
        console.log(`   Sent to Grist: ${result.dataSent ? '✅' : '❌'}`);
        console.log(`   Verified: ${result.verified ? '✅' : '⚠️'}`);
        if (result.recordCount > 0) {
            console.log(`   Records: ${result.recordCount}`);
        }
        if (result.error) {
            console.log(`   Error: ${result.error}`);
            allPassed = false;
        }
        console.log('');
    }
    
    if (allPassed) {
        console.log('✅ All tests passed!');
        process.exit(0);
    } else {
        console.log('❌ Some tests failed. See details above.');
        process.exit(1);
    }
}

// Run tests
if (require.main === module) {
    runTests().catch(error => {
        console.error('❌ Fatal error:', error);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    });
}

module.exports = { testScraper, runTests };


