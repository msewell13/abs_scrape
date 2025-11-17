/**
 * Grist API Client for sending scraped data to Grist tables.
 * 
 * This client handles:
 * - Creating documents if they don't exist
 * - Creating tables if they don't exist
 * - Adding records to tables
 * - Updating existing records
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

class GristClient {
    /**
     * Initialize Grist API client.
     * 
     * @param {string} apiKey - Grist API key
     * @param {string} server - Grist server URL (e.g., https://grist.pythonfinancial.com)
     * @param {string} org - Organization/workspace name (default: brightstar)
     */
    constructor(apiKey, server, org = 'brightstar') {
        this.apiKey = apiKey;
        this.server = server.replace(/\/$/, '');
        this.org = org;
        this.baseUrl = `${this.server}/api`;
    }

    /**
     * Make an API request.
     * @private
     */
    async _request(method, endpoint, data = null) {
        const url = new URL(`${this.baseUrl}${endpoint}`);
        const options = {
            method,
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            }
        };

        if (data) {
            options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(data));
        }

        return new Promise((resolve, reject) => {
            const client = url.protocol === 'https:' ? https : http;
            const req = client.request(url, options, (res) => {
                let body = '';
                res.on('data', (chunk) => { body += chunk; });
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve(JSON.parse(body || '{}'));
                        } catch (e) {
                            resolve(body);
                        }
                    } else {
                        const error = new Error(`HTTP ${res.statusCode}: ${body}`);
                        error.statusCode = res.statusCode;
                        error.body = body;
                        reject(error);
                    }
                });
            });

            req.on('error', reject);
            if (data) {
                req.write(JSON.stringify(data));
            }
            req.end();
        });
    }

    /**
     * List all workspaces.
     */
    async listWorkspaces() {
        return this._request('GET', '/workspaces');
    }

    /**
     * Get workspace by ID or name.
     * If workspaceId is null, uses the org name.
     */
    async getWorkspace(workspaceId = null) {
        if (workspaceId === null) {
            workspaceId = this.org;
        }

        const workspaces = await this.listWorkspaces();
        const workspace = workspaces.find(ws => 
            ws.id === workspaceId || ws.name === workspaceId
        );

        if (!workspace) {
            throw new Error(`Workspace '${workspaceId}' not found`);
        }

        return workspace;
    }

    /**
     * List all documents in a workspace.
     */
    async listDocuments(workspaceId = null) {
        if (workspaceId === null) {
            const workspace = await this.getWorkspace();
            workspaceId = workspace.id;
        }

        return this._request('GET', `/workspaces/${workspaceId}/docs`);
    }

    /**
     * Get existing document or create a new one.
     * 
     * @param {string} docName - Name of the document
     * @param {string} workspaceId - Workspace ID (optional)
     * @returns {Promise<Object>} Document object with 'id' and 'name'
     */
    async getOrCreateDocument(docName, workspaceId = null) {
        if (workspaceId === null) {
            const workspace = await this.getWorkspace();
            workspaceId = workspace.id;
        }

        // Check if document exists
        const docs = await this.listDocuments(workspaceId);
        const existing = docs.find(doc => doc.name === docName);
        if (existing) {
            return existing;
        }

        // Create new document
        return this._request('POST', `/workspaces/${workspaceId}/docs`, {
            name: docName
        });
    }

    /**
     * List all tables in a document.
     */
    async listTables(docId) {
        const response = await this._request('GET', `/docs/${docId}/tables`);
        return Object.keys(response);
    }

    /**
     * Get table schema (columns).
     */
    async getTableSchema(docId, tableId) {
        return this._request('GET', `/docs/${docId}/tables/${tableId}/columns`);
    }

    /**
     * Create a new table with specified columns.
     * 
     * @param {string} docId - Document ID
     * @param {string} tableId - Table ID (e.g., "MSM_Results")
     * @param {Array<Object>} columns - List of column definitions
     *                    [{id: "col1", type: "Text"}, {id: "col2", type: "Numeric"}]
     */
    async createTable(docId, tableId, columns) {
        const columnsData = {};
        columns.forEach(col => {
            columnsData[col.id] = { type: col.type || 'Text' };
        });

        return this._request('POST', `/docs/${docId}/tables`, {
            tables: [{
                id: tableId,
                columns: columnsData
            }]
        });
    }

    /**
     * Ensure a table exists with the specified columns.
     * Creates it if it doesn't exist, adds missing columns if it does.
     */
    async ensureTable(docId, tableId, columns) {
        const tables = await this.listTables(docId);

        if (!tables.includes(tableId)) {
            // Create new table
            await this.createTable(docId, tableId, columns);
        } else {
            // Check and add missing columns
            const existingSchema = await this.getTableSchema(docId, tableId);
            const existingCols = new Set(
                (existingSchema.columns || []).map(col => col.id)
            );

            const newCols = {};
            columns.forEach(col => {
                if (!existingCols.has(col.id)) {
                    newCols[col.id] = { type: col.type || 'Text' };
                }
            });

            if (Object.keys(newCols).length > 0) {
                await this._request('PATCH', `/docs/${docId}/tables/${tableId}/columns`, {
                    columns: newCols
                });
            }
        }
    }

    /**
     * Add records to a table.
     * 
     * @param {string} docId - Document ID
     * @param {string} tableId - Table ID
     * @param {Array<Object>} records - List of record objects (column_name: value)
     * @returns {Promise<Object>} Response with record IDs
     */
    async addRecords(docId, tableId, records) {
        return this._request('POST', `/docs/${docId}/tables/${tableId}/records`, {
            records
        });
    }

    /**
     * Upsert records (insert or update based on key columns).
     * 
     * @param {string} docId - Document ID
     * @param {string} tableId - Table ID
     * @param {Array<Object>} records - List of record objects
     * @param {Array<string>} keyColumns - Columns to use for matching (e.g., ["id", "date"])
     * @returns {Promise<Object>} Response with record IDs
     */
    async upsertRecords(docId, tableId, records, keyColumns = null) {
        // For now, just add records
        // TODO: Implement proper upsert logic if needed
        return this.addRecords(docId, tableId, records);
    }
}

/**
 * Infer Grist column types from sample data.
 * 
 * @param {Array<Object>} data - List of record objects
 * @returns {Array<Object>} List of column definitions
 */
function inferColumnsFromData(data) {
    if (!data || data.length === 0) {
        return [];
    }

    const columns = [];
    const sample = data[0];

    for (const [key, value] of Object.entries(sample)) {
        let colType = 'Text'; // default

        if (typeof value === 'boolean') {
            colType = 'Bool';
        } else if (typeof value === 'number') {
            colType = Number.isInteger(value) ? 'Int' : 'Numeric';
        } else if (value instanceof Date) {
            colType = 'DateTime';
        } else if (typeof value === 'string') {
            // Try to detect date strings
            try {
                const date = new Date(value);
                if (!isNaN(date.getTime()) && value.match(/^\d{4}-\d{2}-\d{2}/)) {
                    colType = 'DateTime';
                }
            } catch (e) {
                // Not a date, keep as Text
            }
        }

        columns.push({
            id: key,
            type: colType
        });
    }

    return columns;
}

module.exports = { GristClient, inferColumnsFromData };

