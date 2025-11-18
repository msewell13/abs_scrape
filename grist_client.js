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
     * List all workspaces (tries multiple API structures).
     */
    async listWorkspaces() {
        // Try different API structures
        try {
            return await this._request('GET', '/workspaces');
        } catch (e) {
            // Try org-based structure
            try {
                return await this._request('GET', `/orgs/${this.org}/workspaces`);
            } catch (e2) {
                // If both fail, return empty array and let caller handle it
                return [];
            }
        }
    }

    /**
     * Get workspace by ID or name.
     * If workspaceId is null, uses the org name.
     */
    async getWorkspace(workspaceId = null) {
        const workspaces = await this.listWorkspaces();
        if (workspaces.length === 0) {
            // If we can't list workspaces, try to use org name
            if (workspaceId === null) {
                workspaceId = this.org;
            }
            return { id: workspaceId, name: workspaceId };
        }

        // If workspaceId is provided, try to find it
        if (workspaceId !== null) {
            const workspace = workspaces.find(ws => 
                ws.id === workspaceId || ws.name === workspaceId || String(ws.id) === String(workspaceId)
            );
            if (workspace) {
                return workspace;
            }
        }

        // If no workspaceId provided or not found, try to find by org domain
        const workspace = workspaces.find(ws => 
            ws.orgDomain === this.org || ws.name === this.org
        );

        if (workspace) {
            return workspace;
        }

        // Fallback: return first workspace or use org name
        if (workspaces.length > 0) {
            return workspaces[0];
        }

        // Last resort: use org name as workspace ID
        return { id: workspaceId || this.org, name: workspaceId || this.org };
    }

    /**
     * List all documents in a workspace.
     */
    async listDocuments(workspaceId = null) {
        if (workspaceId === null) {
            const workspace = await this.getWorkspace();
            workspaceId = workspace.id;
        }

        // First, try to get documents from workspace object (they're included in workspace listing)
        try {
            const workspaces = await this.listWorkspaces();
            const workspace = workspaces.find(ws => 
                ws.id === workspaceId || String(ws.id) === String(workspaceId)
            );
            if (workspace && workspace.docs && Array.isArray(workspace.docs)) {
                return workspace.docs;
            }
        } catch (e) {
            // Continue to try API endpoint
        }

        // Try different API structures
        try {
            return await this._request('GET', `/workspaces/${workspaceId}/docs`);
        } catch (e) {
            // Try org-based structure
            try {
                return await this._request('GET', `/orgs/${this.org}/docs`);
            } catch (e2) {
                // If both fail, return empty array - we can't list documents
                // This is okay, we'll just create a new one if needed
                console.log('Could not list documents, will create new if needed');
                return [];
            }
        }
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

        // Check if document exists - try multiple methods
        let docs = [];
        let existing = null;
        
        // Try to list documents using different endpoints
        try {
            docs = await this.listDocuments(workspaceId);
            if (Array.isArray(docs)) {
                existing = docs.find(doc => {
                    const name = doc.name || doc.title || doc.id;
                    // Case-insensitive comparison
                    return name && name.toLowerCase() === docName.toLowerCase();
                });
            }
        } catch (e) {
            // If listing fails, we can't check for existing documents
            // We'll need to create a new one, but this means we might create duplicates
            // For now, proceed to creation
        }
        
        if (existing) {
            // Ensure the document has an id property
            if (!existing.id) {
                if (existing.documentId) {
                    existing.id = existing.documentId;
                } else if (existing.id) {
                    // Already has id
                } else {
                    // Use the docName as a fallback (not ideal, but better than creating new)
                    console.log(`Warning: Document found but missing ID. Using name as identifier.`);
                }
            }
            if (!existing.name && !existing.title) {
                existing.name = docName;
            }
            return existing;
        }
        
        // IMPORTANT: Before creating, try to verify document doesn't exist by attempting to access it
        // Since we can't list documents reliably, we'll create it and the user will need to
        // manually specify the document ID if they want to reuse an existing document
        // For production use, consider storing the document ID in a config file

        // Try to create new document using different API structures
        let created;
        try {
            created = await this._request('POST', `/workspaces/${workspaceId}/docs`, {
                name: docName
            });
        } catch (e) {
            // Try org-based structure
            try {
                created = await this._request('POST', `/orgs/${this.org}/docs`, {
                    name: docName
                });
            } catch (e2) {
                // Try direct creation
                try {
                    created = await this._request('POST', `/docs`, {
                        name: docName
                    });
                } catch (e3) {
                    // If all creation attempts fail, try to find by name in all docs
                    try {
                        const allDocs = await this._request('GET', '/docs');
                        const found = Array.isArray(allDocs) ? allDocs.find(doc => 
                            doc.name === docName || doc.title === docName
                        ) : null;
                        if (found) {
                            if (!found.id && found.documentId) {
                                found.id = found.documentId;
                            }
                            return found;
                        }
                    } catch (e4) {
                        // Last resort: throw the original error
                        throw new Error(`Failed to create or find document '${docName}'. Tried multiple API endpoints. Last error: ${e3.message}`);
                    }
                    throw new Error(`Failed to create document '${docName}'. Tried multiple API endpoints. Last error: ${e3.message}`);
                }
            }
        }

        // Handle different response formats
        // Grist API may return document ID as a string or as an object
        let doc;
        if (typeof created === 'string') {
            // If response is a string, it's the document ID
            doc = { id: created, name: docName };
        } else if (created && typeof created === 'object') {
            // If response is an object, ensure it has an id property
            if (!created.id) {
                if (created.documentId) {
                    created.id = created.documentId;
                } else {
                    // If no id found, use the response itself as the id (might be an object with id inside)
                    throw new Error(`Document created but missing ID. Response: ${JSON.stringify(created)}`);
                }
            }
            if (!created.name && !created.title) {
                created.name = docName;
            }
            doc = created;
        } else {
            throw new Error(`Unexpected response format when creating document. Response: ${JSON.stringify(created)}`);
        }

        // Ensure document is saved/persisted by updating it
        // This makes it appear in the user's document list
        try {
            await this.saveDocument(doc.id, docName);
        } catch (e) {
            // If save fails, document might already be saved or API doesn't support it
            // Continue anyway - the document exists
            console.log(`Note: Could not explicitly save document (may already be saved): ${e.message}`);
        }

        return doc;
    }

    /**
     * Save/persist a document to make it appear in the user's document list.
     * This ensures the document is not in a draft/unsaved state.
     * 
     * @param {string} docId - Document ID
     * @param {string} docName - Document name
     */
    async saveDocument(docId, docName) {
        // If document ID starts with "new~", it's a draft and needs to be saved
        if (docId.startsWith('new~')) {
            console.log('Document is in draft mode, attempting to save...');
            // Try to get workspace and create document there instead
            try {
                const workspace = await this.getWorkspace();
                if (workspace && workspace.id) {
                    // Create a new document in the workspace (this will be saved)
                    const newDoc = await this._request('POST', `/workspaces/${workspace.id}/docs`, {
                        name: docName
                    });
                    console.log('Created new saved document:', newDoc);
                    return newDoc;
                }
            } catch (e) {
                console.log('Could not create in workspace, trying to update draft:', e.message);
            }
        }
        
        // Try to update the document to ensure it's saved
        // Grist documents are typically auto-saved, but we can update metadata
        try {
            // Update document name/metadata to ensure it's persisted
            const result = await this._request('PATCH', `/docs/${docId}`, {
                name: docName,
                isPinned: true  // Pin the document to ensure it's saved
            });
            return result;
        } catch (e) {
            // If PATCH doesn't work, try PUT
            try {
                return await this._request('PUT', `/docs/${docId}`, {
                    name: docName,
                    isPinned: true
                });
            } catch (e2) {
                // Try POST to /api/docs/{docId}/save or similar
                try {
                    return await this._request('POST', `/docs/${docId}/save`, {});
                } catch (e3) {
                    // If all fail, the document might already be saved
                    // Or the API might not require explicit saving
                    console.log('Could not save document via API:', e3.message);
                    return null;
                }
            }
        }
    }

    /**
     * List all tables in a document.
     */
    async listTables(docId) {
        const response = await this._request('GET', `/docs/${docId}/tables`);
        // Grist API returns { tables: [{ id: "Table1", ... }, ...] }
        if (response.tables && Array.isArray(response.tables)) {
            return response.tables.map(table => table.id);
        }
        // Fallback for different response formats
        if (Array.isArray(response)) {
            return response.map(table => table.id || table);
        }
        // Last resort: return object keys (excluding metadata keys)
        const keys = Object.keys(response);
        return keys.filter(key => key !== 'tables' && key !== 'columns');
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
        // Grist API expects columns as an array, not an object
        const columnsArray = columns.map(col => ({
            id: col.id,
            type: col.type || 'Text'
        }));

        return this._request('POST', `/docs/${docId}/tables`, {
            tables: [{
                id: tableId,
                columns: columnsArray
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

            const newCols = [];
            const columnsToUpdate = [];
            
            for (const col of columns) {
                if (!existingCols.has(col.id)) {
                    // Handle reference columns - type format: "Ref:TableName" or {type: "Ref", targetTable: "TableName"}
                    let colDef = { id: col.id, fields: {} };
                    if (col.type && col.type.startsWith('Ref:')) {
                        const targetTable = col.type.substring(4); // Remove "Ref:" prefix
                        colDef.fields.type = 'Ref:' + targetTable;
                        colDef.fields.visibleCol = col.visibleCol || 0; // Default to first visible column
                    } else if (col.type === 'Ref' && col.targetTable) {
                        colDef.fields.type = 'Ref:' + col.targetTable;
                        colDef.fields.visibleCol = col.visibleCol || 0;
                    } else {
                        colDef.fields.type = col.type || 'Text';
                    }
                    newCols.push(colDef);
                } else if (col.type && (col.type.startsWith('Ref:') || col.type === 'Ref')) {
                    // Queue column update for after we add new columns
                    columnsToUpdate.push(col);
                }
            }

            if (newCols.length > 0) {
                // Use POST to add new columns (PATCH is for updating existing columns)
                await this._request('POST', `/docs/${docId}/tables/${tableId}/columns`, {
                    columns: newCols
                });
            }
            
            // Update existing columns that need to be converted to references
            for (const col of columnsToUpdate) {
                await this.updateColumnType(docId, tableId, col.id, col);
            }
        }
    }

    /**
     * Update a column's type, including converting to reference column.
     * 
     * @param {string} docId - Document ID
     * @param {string} tableId - Table ID
     * @param {string} columnId - Column ID
     * @param {Object} columnDef - Column definition with type and optional targetTable
     */
    async updateColumnType(docId, tableId, columnId, columnDef) {
        try {
            let columnType = columnDef.type;
            let columnConfig = { type: columnType };
            
            // Handle reference columns
            if (columnType && columnType.startsWith('Ref:')) {
                const targetTable = columnType.substring(4);
                columnConfig = {
                    type: 'Ref:' + targetTable,
                    visibleCol: columnDef.visibleCol || 0
                };
            } else if (columnType === 'Ref' && columnDef.targetTable) {
                columnConfig = {
                    type: 'Ref:' + columnDef.targetTable,
                    visibleCol: columnDef.visibleCol || 0
                };
            }
            
            return await this._request('PATCH', `/docs/${docId}/tables/${tableId}/columns/${columnId}`, columnConfig);
        } catch (e) {
            // If update fails, column might already be correct type
            // Or API might not support this operation
            return null;
        }
    }

    /**
     * Create or update a column to be a reference to another table.
     * 
     * @param {string} docId - Document ID
     * @param {string} tableId - Table ID
     * @param {string} columnId - Column ID to create/update
     * @param {string} targetTableId - Target table to reference
     * @param {number} visibleCol - Which column in target table to show (default: 0)
     */
    async createReferenceColumn(docId, tableId, columnId, targetTableId, visibleCol = 0) {
        const refType = `Ref:${targetTableId}`;
        
        try {
            // Get current schema to find the column
            const schema = await this.getTableSchema(docId, tableId);
            const column = (schema.columns || []).find(col => col.id === columnId);
            
            if (!column) {
                throw new Error(`Column ${columnId} not found in table ${tableId}`);
            }
            
            // Get the target table's schema to determine which column to display
            const targetSchema = await this.getTableSchema(docId, targetTableId);
            const targetCols = (targetSchema.columns || []).map(col => col.id);
            // Use first text column or first column as display column
            const displayCol = targetCols.find(id => id !== 'id') || targetCols[0] || 0;
            
            // Update column using PATCH on columns endpoint
            // Grist API expects columns as an array of column update objects
            return await this._request('PATCH', `/docs/${docId}/tables/${tableId}/columns`, {
                columns: [{
                    id: columnId,
                    type: refType,
                    visibleCol: visibleCol
                }]
            });
        } catch (e) {
            // Try alternative: use the column's colRef from fields
            try {
                const schema = await this.getTableSchema(docId, tableId);
                const column = (schema.columns || []).find(col => col.id === columnId);
                
                if (column && column.fields && column.fields.colRef) {
                    // Try updating using colRef
                    return await this._request('PATCH', `/docs/${docId}/tables/${tableId}/columns`, {
                        columns: [{
                            id: columnId,
                            fields: {
                                type: refType,
                                visibleCol: visibleCol
                            }
                        }]
                    });
                }
                throw e;
            } catch (e2) {
                throw new Error(`Failed to create reference column: ${e2.message}. Response: ${e2.body || JSON.stringify(e2)}`);
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
        // Format records - Grist API expects records with 'fields' property
        const formattedRecords = records.map(record => {
            // If record already has 'fields', use it; otherwise wrap the record
            if (record.fields) {
                return record;
            }
            return { fields: record };
        });

        return this._request('POST', `/docs/${docId}/tables/${tableId}/records`, {
            records: formattedRecords
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
        if (!keyColumns || keyColumns.length === 0) {
            // No key columns specified, just add records
            console.log('⚠️  No key columns specified for upsert, adding records as new');
            return this.addRecords(docId, tableId, records);
        }

        // Format incoming records
        const formattedRecords = records.map(record => {
            if (record.fields) {
                return record;
            }
            return { fields: record };
        });

        // Fetch existing records
        console.log(`Fetching existing records from ${tableId}...`);
        const existingRecords = await this.listRecords(docId, tableId);
        
        // Get all unique field names from incoming records to ensure consistency
        const allFieldNames = new Set();
        formattedRecords.forEach(record => {
            const fields = record.fields || record;
            Object.keys(fields).forEach(key => allFieldNames.add(key));
        });
        const fieldNamesArray = Array.from(allFieldNames);
        
        // Create a map of existing records by key columns
        const existingMap = new Map();
        existingRecords.forEach(record => {
            const key = this._buildRecordKey(record, keyColumns);
            if (key) {
                existingMap.set(key, record);
            }
        });
        
        // Separate records into updates and inserts
        const recordsToUpdate = [];
        const recordsToInsert = [];

        formattedRecords.forEach(record => {
            const fields = record.fields || record;
            const key = this._buildRecordKey(fields, keyColumns);
            
            // Ensure all fields are present (fill missing ones with null)
            const normalizedFields = {};
            fieldNamesArray.forEach(fieldName => {
                const fields = record.fields || record;
                normalizedFields[fieldName] = fields.hasOwnProperty(fieldName) ? fields[fieldName] : null;
            });
            
            if (!key) {
                // Missing key columns, treat as new record
                recordsToInsert.push({ fields: normalizedFields });
            } else if (existingMap.has(key)) {
                // Record exists, prepare for update
                const existingRecord = existingMap.get(key);
                recordsToUpdate.push({
                    id: existingRecord.id,
                    fields: normalizedFields
                });
            } else {
                // New record
                recordsToInsert.push({ fields: normalizedFields });
            }
        });

        const results = {
            updated: 0,
            inserted: 0
        };

        // Update existing records
        if (recordsToUpdate.length > 0) {
            console.log(`Updating ${recordsToUpdate.length} existing records...`);
            try {
                // Grist API: PATCH to update records
                await this._request('PATCH', `/docs/${docId}/tables/${tableId}/records`, {
                    records: recordsToUpdate
                });
                results.updated = recordsToUpdate.length;
            } catch (e) {
                console.error(`Error updating records: ${e.message}`);
                throw e;
            }
        }

        // Insert new records
        if (recordsToInsert.length > 0) {
            console.log(`Inserting ${recordsToInsert.length} new records...`);
            try {
                const insertResult = await this._request('POST', `/docs/${docId}/tables/${tableId}/records`, {
                    records: recordsToInsert
                });
                results.inserted = recordsToInsert.length;
            } catch (e) {
                console.error(`Error inserting records: ${e.message}`);
                throw e;
            }
        }

        console.log(`✅ Upsert complete: ${results.updated} updated, ${results.inserted} inserted`);
        if (results.inserted > 0) {
            console.log(`   Note: ${results.inserted} new records were inserted (these are customers that didn't exist in Grist yet)`);
        }
        if (results.updated > 0) {
            console.log(`   Note: ${results.updated} existing records were updated`);
        }
        return results;
    }

    /**
     * Build a key string from a record using specified key columns.
     * 
     * @param {Object} record - Record object (may have 'fields' property)
     * @param {Array<string>} keyColumns - Column names to use for key
     * @returns {string|null} Key string or null if any key column is missing
     */
    _buildRecordKey(record, keyColumns) {
        const fields = record.fields || record;
        const keyParts = [];
        
        for (const col of keyColumns) {
            const value = fields[col];
            // Allow empty values - use empty string instead of null
            // This allows matching records where Product might be empty
            if (value === null || value === undefined) {
                keyParts.push('');
            } else {
                keyParts.push(String(value));
            }
        }
        
        // If all key parts are empty, return null (invalid key)
        if (keyParts.every(part => part === '')) {
            return null;
        }
        
        return keyParts.join('|||'); // Use a separator that's unlikely to appear in data
    }

    /**
     * List records from a table.
     * 
     * @param {string} docId - Document ID
     * @param {string} tableId - Table ID
     * @param {Object} options - Optional query parameters (filters, limit, etc.)
     * @returns {Promise<Array>} List of records
     */
    async listRecords(docId, tableId, options = {}) {
        const response = await this._request('GET', `/docs/${docId}/tables/${tableId}/records`);
        // Grist API returns { records: [...] } format
        if (response.records) {
            return response.records;
        }
        // Fallback if response is already an array
        return Array.isArray(response) ? response : [];
    }
}

/**
 * Infer Grist column types from sample data.
 * 
 * @param {Array<Object>} data - List of record objects
 * @returns {Array<Object>} List of column definitions
 */
/**
 * Sanitize column name for Grist (remove spaces, special chars)
 * Grist column IDs must be valid identifiers
 */
function sanitizeColumnName(name) {
    // Replace spaces and special characters with underscores
    // Keep it simple: spaces -> underscores, remove other special chars
    return name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
}

function inferColumnsFromData(data) {
    if (!data || data.length === 0) {
        return [];
    }

    const columns = [];
    const sample = data[0];
    const columnMapping = {}; // Map sanitized names back to original

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

        const sanitizedId = sanitizeColumnName(key);
        columns.push({
            id: sanitizedId,
            type: colType,
            label: key // Keep original name as label
        });
        columnMapping[key] = sanitizedId;
    }

    // Store mapping for later use in data transformation
    columns._mapping = columnMapping;
    return columns;
}

module.exports = { GristClient, inferColumnsFromData };

