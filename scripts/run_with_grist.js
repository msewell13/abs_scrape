#!/usr/bin/env node
/**
 * Run scrapers and send results to Grist
 * This script runs all scrapers and automatically sends output to Grist tables
 */

require('dotenv').config();
const { execSync } = require('child_process');
const path = require('path');
const { sendToGrist, loadJsonData } = require('../grist_integration');

// Check required environment variables
const apiKey = process.env.GRIST_API_KEY;
const server = process.env.GRIST_SERVER;
const org = process.env.GRIST_ORG || 'brightstar';
const docName = process.env.GRIST_DOC || 'ABS_Data';
const docId = process.env.GRIST_DOC_ID; // Optional: use specific document ID to reuse existing document

if (!apiKey) {
    console.error('Error: GRIST_API_KEY environment variable must be set');
    process.exit(1);
}

if (!server) {
    console.error('Error: GRIST_SERVER environment variable must be set');
    console.error('Example: export GRIST_SERVER=https://grist.pythonfinancial.com');
    process.exit(1);
}

console.log('🚀 Starting scrapers with Grist integration...');
console.log(`   Server: ${server}`);
console.log(`   Document: ${docName}`);
console.log('');

async function runScrapers() {
    // Run MSM scraper
    console.log('📊 Running MSM scraper...');
    try {
        execSync('npm run scrape-msm', { stdio: 'inherit' });
        
        const msmFile = path.join(process.cwd(), 'msm_results.json');
        const fs = require('fs');
        
        if (fs.existsSync(msmFile)) {
            console.log('');
            console.log('📤 Sending MSM results to Grist...');
            const data = await loadJsonData(msmFile);
            // Use Date, Customer, Employee, and Sch Start as key columns for matching
            await sendToGrist(data, apiKey, server, docName, 'MSM_Results', org, true, ['Date', 'Customer', 'Employee', 'Sch Start'], docId);
        } else {
            console.log('⚠️  Warning: msm_results.json not found after scraper run');
        }
    } catch (error) {
        console.log('⚠️  Warning: MSM scraper failed (continuing...)');
        if (error.message) console.log(`   ${error.message}`);
    }

    console.log('');

    // Run schedule scraper
    console.log('📅 Running schedule scraper...');
    try {
        execSync('npm run scrape-schedule', { stdio: 'inherit' });
        
        const scheduleFile = path.join(process.cwd(), 'month_block.json');
        const fs = require('fs');
        
        if (fs.existsSync(scheduleFile)) {
            console.log('');
            console.log('📤 Sending schedule results to Grist...');
            const data = await loadJsonData(scheduleFile);
            // Use date, client, employee, and start_time as key columns for matching
            await sendToGrist(data, apiKey, server, docName, 'Schedule_Data', org, true, ['date', 'client', 'employee', 'start_time'], docId);
        } else {
            console.log('⚠️  Warning: month_block.json not found after scraper run');
        }
    } catch (error) {
        console.log('⚠️  Warning: Schedule scraper failed (continuing...)');
        if (error.message) console.log(`   ${error.message}`);
    }

    console.log('');

    // Run customer search scraper
    console.log('👥 Running customer search scraper...');
    try {
        execSync('npm run scrape-customers', { stdio: 'inherit' });
        
        const customerFile = path.join(process.cwd(), 'customer_search_results.json');
        const fs = require('fs');
        
        if (fs.existsSync(customerFile)) {
            console.log('');
            console.log('📤 Sending customer search results to Grist...');
            const data = await loadJsonData(customerFile);
            // Use only Customer Number as key column for matching
            // All products for a customer are stored in a single record
            await sendToGrist(data, apiKey, server, docName, 'Customer_Search_Results', org, true, ['Customer Number'], docId);
        } else {
            console.log('⚠️  Warning: customer_search_results.json not found after scraper run');
        }
    } catch (error) {
        console.log('⚠️  Warning: Customer search scraper failed (continuing...)');
        if (error.message) console.log(`   ${error.message}`);
    }

    console.log('');

    // Run employee search scraper
    console.log('👤 Running employee search scraper...');
    try {
        execSync('npm run scrape-employees', { stdio: 'inherit' });
        
        const employeeFile = path.join(process.cwd(), 'employee_search_results.json');
        const fs = require('fs');
        
        if (fs.existsSync(employeeFile)) {
            console.log('');
            console.log('📤 Sending employee search results to Grist...');
            const data = await loadJsonData(employeeFile);
            // Use Name and Office as key columns for matching (in case there are duplicate names)
            await sendToGrist(data, apiKey, server, docName, 'Employee_Search_Results', org, true, ['Name', 'Office'], docId);
        } else {
            console.log('⚠️  Warning: employee_search_results.json not found after scraper run');
        }
    } catch (error) {
        console.log('⚠️  Warning: Employee search scraper failed (continuing...)');
        if (error.message) console.log(`   ${error.message}`);
    }

    console.log('');
    console.log('✅ All scrapers completed');
}

// Run if called directly
if (require.main === module) {
    runScrapers().catch(error => {
        console.error('Unhandled error:', error);
        process.exit(1);
    });
}

module.exports = { runScrapers };

