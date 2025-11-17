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
async function sendToGrist(data, apiKey, server, docName, tableName, org = 'brightstar', upsert = false, keyColumns = null) {
    if (!data || data.length === 0) {
        console.log('No data to send');
        return;
    }

    const client = new GristClient(apiKey, server, org);

    // Get or create document
    console.log(`Getting/creating document: ${docName}`);
    const doc = await client.getOrCreateDocument(docName);
    console.log(`Document ID: ${doc.id}`);

    // Infer columns from data
    console.log('Inferring column types from data...');
    const columns = inferColumnsFromData(data);
    console.log(`Detected ${columns.length} columns: ${columns.map(c => c.id).join(', ')}`);

    // Ensure table exists with correct schema
    console.log(`Ensuring table '${tableName}' exists...`);
    await client.ensureTable(doc.id, tableName, columns);

    // Add timestamp column if not present
    const hasTimestamp = columns.some(c => c.id === 'scraped_at');
    if (!hasTimestamp) {
        await client.ensureTable(doc.id, tableName, [{ id: 'scraped_at', type: 'DateTime' }]);
    }

    // Add timestamp to all records
    const timestamp = new Date().toISOString();
    data.forEach(record => {
        if (!record.scraped_at) {
            record.scraped_at = timestamp;
        }
    });

    // Send data
    console.log(`Sending ${data.length} records to Grist...`);
    let result;
    if (upsert) {
        result = await client.upsertRecords(doc.id, tableName, data, keyColumns);
    } else {
        result = await client.addRecords(doc.id, tableName, data);
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

