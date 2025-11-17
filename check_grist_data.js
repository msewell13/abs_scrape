#!/usr/bin/env node
/**
 * Script to verify and display Grist data information
 */

require('dotenv').config();
const { GristClient } = require('./grist_client');

async function checkGristData() {
    const apiKey = process.env.GRIST_API_KEY;
    const server = process.env.GRIST_SERVER;
    const org = process.env.GRIST_ORG || 'brightstar';
    const docId = process.env.GRIST_DOC_ID;

    if (!apiKey || !server) {
        console.error('❌ Error: GRIST_API_KEY and GRIST_SERVER must be set');
        process.exit(1);
    }

    if (!docId) {
        console.error('❌ Error: GRIST_DOC_ID not set in .env file');
        console.error('   Run the scrapers first to create a document, then set GRIST_DOC_ID');
        process.exit(1);
    }

    const client = new GristClient(apiKey, server, org);

    console.log('🔍 Checking Grist Data...');
    console.log('═══════════════════════════════════════════');
    console.log(`Server: ${server}`);
    console.log(`Document ID: ${docId}`);
    console.log(`Organization: ${org}`);
    console.log('');

    try {
        // List tables
        const tables = await client.listTables(docId);
        console.log('📊 Tables found:', tables.length);
        console.log('');

        let totalRecords = 0;
        for (const table of tables) {
            if (table !== 'Table1') {
                try {
                    const records = await client.listRecords(docId, table);
                    const count = records.length;
                    totalRecords += count;
                    console.log(`✅ ${table}: ${count} records`);
                    
                    if (count > 0) {
                        const sample = records[0];
                        const fields = sample.fields || sample;
                        const fieldNames = Object.keys(fields).slice(0, 3);
                        console.log(`   Columns: ${fieldNames.join(', ')}...`);
                    }
                } catch (e) {
                    console.log(`❌ ${table}: Error - ${e.message}`);
                }
            }
        }

        console.log('');
        console.log(`📈 Total records: ${totalRecords}`);
        console.log('');
        console.log('🔗 View your data:');
        console.log(`   ${server}/doc/${docId}`);
        console.log('');
        console.log('💡 Troubleshooting:');
        console.log('   1. Make sure you\'re logged into the same Grist account');
        console.log('   2. The API key must belong to your account');
        console.log('   3. Check if the document appears in your workspace');
        console.log('   4. Try the direct URL above');
        console.log('   5. In Grist, look for tables in the left sidebar');

    } catch (error) {
        console.error('❌ Error accessing document:', error.message);
        if (error.body) {
            console.error('Response:', error.body);
        }
        console.error('');
        console.error('Possible issues:');
        console.error('  - Document ID might be incorrect');
        console.error('  - API key might not have access to this document');
        console.error('  - Document might be in a different workspace');
        process.exit(1);
    }
}

checkGristData();


