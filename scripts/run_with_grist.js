#!/usr/bin/env node
/**
 * Run scrapers and send results to Grist
 * This script runs all scrapers and automatically sends output to Grist tables
 */

const { execSync } = require('child_process');
const path = require('path');
const { sendToGrist, loadJsonData } = require('../grist_integration');

// Check required environment variables
const apiKey = process.env.GRIST_API_KEY;
const server = process.env.GRIST_SERVER;
const org = process.env.GRIST_ORG || 'brightstar';
const docName = process.env.GRIST_DOC || 'ABS_Data';

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
        await sendToGrist(data, apiKey, server, docName, 'MSM_Results', org);
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
        await sendToGrist(data, apiKey, server, docName, 'Schedule_Data', org);
    } else {
        console.log('⚠️  Warning: month_block.json not found after scraper run');
    }
} catch (error) {
    console.log('⚠️  Warning: Schedule scraper failed (continuing...)');
    if (error.message) console.log(`   ${error.message}`);
}

console.log('');
console.log('✅ All scrapers completed');

