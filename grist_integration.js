/**
 * Integration script to send scraper output to Grist.
 * 
 * This script reads JSON/CSV files from scrapers and sends them to Grist tables.
 * It can be used as a wrapper around existing scrapers or called after scrapers run.
 */

const fs = require('fs').promises;
const path = require('path');
const { GristClient, inferColumnsFromData } = require('./grist_client');

/**
 * Load data from JSON file.
 */
async function loadJsonData(filePath) {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    
    // Handle both list and dict formats
    if (Array.isArray(data)) {
        return data;
    } else if (typeof data === 'object') {
        // If it's a dict, try to find a list value
        for (const value of Object.values(data)) {
            if (Array.isArray(value)) {
                return value;
            }
        }
        // If no list found, wrap the dict
        return [data];
    }
    
    return [data];
}

/**
 * Load data from CSV file.
 */
async function loadCsvData(filePath) {
    // For CSV, we'll use a simple parser or require a library
    // For now, let's use a basic approach
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    if (lines.length === 0) return [];
    
    const headers = lines[0].split(',').map(h => h.trim());
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const record = {};
        headers.forEach((header, index) => {
            record[header] = values[index] || null;
        });
        data.push(record);
    }
    
    return data;
}

/**
 * Send data to Grist table.
 * 
 * @param {Array<Object>} data - List of record objects
 * @param {string} apiKey - Grist API key
 * @param {string} server - Grist server URL
 * @param {string} docName - Document name
 * @param {string} tableName - Table name
 * @param {string} org - Organization name
 * @param {boolean} upsert - Whether to upsert (update existing) records
 * @param {Array<string>} keyColumns - Columns to use for upsert matching
 */
async function sendToGrist(data, apiKey, server, docName, tableName, org = 'brightstar', upsert = false, keyColumns = null, docId = null) {
    if (!data || data.length === 0) {
        console.log('No data to send');
        return;
    }

    const client = new GristClient(apiKey, server, org);

    // Get or create document - use provided docId if available, otherwise check env var, otherwise get/create by name
    let doc;
    const envDocId = process.env.GRIST_DOC_ID || docId;
    if (envDocId) {
        // Check if document ID is a draft (starts with "new~")
        if (envDocId.startsWith('new~')) {
            console.log(`⚠️  Document ID is a draft (${envDocId}). Creating a new saved document instead...`);
            // Create a new saved document in the workspace
            doc = await client.getOrCreateDocument(docName);
            console.log(`✅ Created new saved document: ${doc.id}`);
            console.log(`⚠️  Update your .env file: GRIST_DOC_ID=${doc.id}`);
        } else {
            // Use provided document ID directly
            console.log(`Using provided document ID: ${envDocId}`);
            doc = { id: envDocId, name: docName };
            
            // Ensure document is saved so it appears in the user's document list
            try {
                await client.saveDocument(doc.id, docName);
            } catch (e) {
                // Document might already be saved, continue anyway
            }
        }
    } else {
        console.log(`Getting/creating document: ${docName}`);
        doc = await client.getOrCreateDocument(docName);
        console.log(`Document ID: ${doc.id}`);
        
        // Document is already saved by getOrCreateDocument, but ensure it's persisted
        try {
            await client.saveDocument(doc.id, docName);
            console.log(`✅ Document saved and will appear in your document list`);
        } catch (e) {
            // Document might already be saved, continue anyway
        }
        
        console.log(`⚠️  Note: To reuse this document in future runs, set: export GRIST_DOC_ID=${doc.id}`);
    }

    // Infer columns from data
    console.log('Inferring column types from data...');
    const columns = inferColumnsFromData(data);
    const columnMapping = columns._mapping || {}; // Get mapping from sanitized to original names
    console.log(`Detected ${columns.length} columns: ${columns.map(c => c.id).join(', ')}`);

    // Ensure table exists with correct schema
    console.log(`Ensuring table '${tableName}' exists...`);
    // Remove the _mapping property before sending to ensureTable
    const cleanColumns = columns.filter(c => c.id !== '_mapping');
    
    await client.ensureTable(doc.id, tableName, cleanColumns);
    
    // Special handling: Link Customer column in MSM_Results to Customer_Search_Results
    if (tableName === 'MSM_Results') {
        try {
            const tables = await client.listTables(doc.id);
            if (tables.includes('Customer_Search_Results')) {
                console.log('Creating reference link: Customer → Customer_Search_Results...');
                await client.createReferenceColumn(doc.id, tableName, 'Customer', 'Customer_Search_Results', 0);
                console.log('✅ Customer column is now linked to Customer_Search_Results table');
            }
        } catch (e) {
            console.log(`⚠️  Could not create reference link: ${e.message}`);
            console.log('   You can manually create this link in Grist UI');
        }
    }

    // Transform data to use sanitized column names
    const transformedData = data.map(record => {
        const transformed = {};
        for (const [originalKey, value] of Object.entries(record)) {
            const sanitizedKey = columnMapping[originalKey] || originalKey.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
            transformed[sanitizedKey] = value;
        }
        return transformed;
    });

    // Sanitize key columns to match transformed data column names
    let sanitizedKeyColumns = null;
    if (upsert && keyColumns) {
        sanitizedKeyColumns = keyColumns.map(keyCol => {
            if (!keyCol) {
                console.warn('Warning: Empty key column found, skipping');
                return null;
            }
            // Find the sanitized name from the mapping
            for (const [original, sanitized] of Object.entries(columnMapping)) {
                if (original === keyCol) {
                    return sanitized;
                }
            }
            // If not in mapping, sanitize it ourselves
            return String(keyCol).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
        }).filter(col => col !== null); // Remove any null values
    }

    // Send data
    console.log(`Sending ${transformedData.length} records to Grist...`);
    let result;
    if (upsert) {
        result = await client.upsertRecords(doc.id, tableName, transformedData, sanitizedKeyColumns);
    } else {
        result = await client.addRecords(doc.id, tableName, transformedData);
    }

    // Ensure document is saved after data changes
    try {
        await client.saveDocument(doc.id, docName);
        console.log('✅ Document saved after data update');
    } catch (e) {
        console.log('⚠️  Could not explicitly save document (may already be saved):', e.message);
    }

    console.log(`✅ Successfully sent ${data.length} records to ${docName}/${tableName}`);
    return result;
}

/**
 * Main function - CLI interface
 */
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        console.log(`
Usage: node grist_integration.js <input_file> [options]

Options:
  --api-key <key>        Grist API key (required)
  --server <url>         Grist server URL (required)
  --doc <name>           Grist document name (default: ABS_Scraper_Data)
  --table <name>         Grist table name (required)
  --org <name>           Grist organization name (default: brightstar)
  --upsert               Upsert records (update existing)
  --key-columns <cols>   Columns to use for upsert matching (space-separated)

Example:
  node grist_integration.js msm_results.json \\
    --api-key YOUR_KEY \\
    --server https://grist.pythonfinancial.com \\
    --doc "ABS_Data" \\
    --table "MSM_Results"
        `);
        process.exit(0);
    }

    // Parse arguments
    const inputFile = args[0];
    let apiKey = null;
    let server = null;
    let docName = 'ABS_Scraper_Data';
    let tableName = null;
    let org = 'brightstar';
    let upsert = false;
    let keyColumns = null;

    for (let i = 1; i < args.length; i++) {
        if (args[i] === '--api-key' && args[i + 1]) {
            apiKey = args[++i];
        } else if (args[i] === '--server' && args[i + 1]) {
            server = args[++i];
        } else if (args[i] === '--doc' && args[i + 1]) {
            docName = args[++i];
        } else if (args[i] === '--table' && args[i + 1]) {
            tableName = args[++i];
        } else if (args[i] === '--org' && args[i + 1]) {
            org = args[++i];
        } else if (args[i] === '--upsert') {
            upsert = true;
        } else if (args[i] === '--key-columns' && args[i + 1]) {
            keyColumns = args[++i].split(/\s+/);
        }
    }

    // Validate required arguments
    if (!apiKey) {
        console.error('Error: --api-key is required');
        process.exit(1);
    }
    if (!server) {
        console.error('Error: --server is required');
        process.exit(1);
    }
    if (!tableName) {
        console.error('Error: --table is required');
        process.exit(1);
    }

    // Load data
    const inputPath = path.resolve(inputFile);
    try {
        await fs.access(inputPath);
    } catch (e) {
        console.error(`Error: File not found: ${inputFile}`);
        process.exit(1);
    }

    console.log(`Loading data from ${inputFile}...`);
    let data;
    const ext = path.extname(inputFile).toLowerCase();
    
    if (ext === '.json') {
        data = await loadJsonData(inputPath);
    } else if (ext === '.csv') {
        data = await loadCsvData(inputPath);
    } else {
        console.error(`Error: Unsupported file format: ${ext}`);
        console.error('Supported formats: .json, .csv');
        process.exit(1);
    }

    console.log(`Loaded ${data.length} records`);

    // Send to Grist
    try {
        await sendToGrist(data, apiKey, server, docName, tableName, org, upsert, keyColumns);
    } catch (error) {
        console.error(`Error sending data to Grist: ${error.message}`);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error('Unhandled error:', error);
        process.exit(1);
    });
}

module.exports = { sendToGrist, loadJsonData, loadCsvData };

