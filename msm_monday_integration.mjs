// msm_monday_integration.mjs
// Integration to send MSM scraped data to Monday.com
// Creates a board with columns matching the MSM JSON structure and adds new items

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONDAY_API_URL = 'https://api.monday.com/v2';
const MONDAY_API_TOKEN = process.env.MONDAY_API_TOKEN;
const BOARD_NAME = 'MSM Shift Data';
const BOARD_ID = process.env.MONDAY_MSM_BOARD_ID; // Optional: specify existing board ID

// Column type mapping for MSM data
const COLUMN_MAPPINGS = {
  'Date': 'date',
  'Customer': 'text',
  'Employee': 'board_relation',
  'Sch Start': 'text',
  'Sch End': 'text',
  'Sch Hrs': 'text',
  'Actual Start': 'text',
  'Actual End': 'text',
  'Actual Hrs': 'text',
  'Adjusted Start': 'text',
  'Adjusted End': 'text',
  'Adjusted Hrs': 'text',
  'Product': 'text',
  'Position': 'text',
  'Comments': 'text',
  'Comments Logged': 'checkbox',
  'Exception Types': 'dropdown',
  'Shift ID': 'text'
};

class MSMMondayIntegration {
  constructor() {
    if (!MONDAY_API_TOKEN) {
      throw new Error('MONDAY_API_TOKEN environment variable is required');
    }
    this.headers = {
      'Authorization': MONDAY_API_TOKEN,
      'Content-Type': 'application/json',
      'API-Version': '2024-07'
    };
  }

  async makeRequest(query, variables = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    try {
      const response = await fetch(MONDAY_API_URL, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          query,
          variables
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      const result = await response.json();
      
      if (result.errors) {
        throw new Error(`Monday.com API Error: ${JSON.stringify(result.errors)}`);
      }
      
      return result.data;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Monday.com API request timed out after 10 seconds');
      }
      throw error;
    }
  }

  parseExceptionTypes(exceptionString) {
    if (!exceptionString) return [];
    
    // Check if the string has newlines (formatted) or is concatenated
    let exceptions;
    if (exceptionString.includes('\n')) {
      // Split by newlines if formatted
      exceptions = exceptionString
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
    } else {
      // Split concatenated exceptions using regex patterns
      exceptions = exceptionString
        .replace(/([a-z])([A-Z])/g, '$1\n$2') // Add newline before capital letters after lowercase
        .replace(/(Shift)([A-Z])/g, '$1\n$2') // Add newline after "Shift" before capital letters
        .replace(/(Threshold)([A-Z])/g, '$1\n$2') // Add newline after "Threshold" before capital letters
        .replace(/(Submitted)([A-Z])/g, '$1\n$2') // Add newline after "Submitted" before capital letters
        .replace(/(Denied)([A-Z])/g, '$1\n$2') // Add newline after "Denied" before capital letters
        .replace(/(Time)([A-Z])/g, '$1\n$2') // Add newline after "Time" before capital letters
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
    }
    
    // Return each exception as a separate label
    return exceptions;
  }

  async updateExceptionTypes(itemId, exceptionString, boardId, columns) {
    try {
      const exceptions = this.parseExceptionTypes(exceptionString);
      const exceptionColumn = columns.find(col => col.title === 'Exception Types');
      
      if (!exceptionColumn) {
        console.log('Exception Types column not found');
        return;
      }
      
      // Use comma-separated string format for change_simple_column_value
      const exceptionValue = exceptions.join(',');
      
      const query = `
        mutation ChangeSimpleColumnValue($itemId: ID!, $boardId: ID!, $columnId: String!, $value: String!) {
          change_simple_column_value(
            item_id: $itemId,
            board_id: $boardId,
            column_id: $columnId,
            value: $value,
            create_labels_if_missing: true
          ) {
            id
          }
        }
      `;
      
      const variables = {
        itemId: itemId,
        boardId: boardId,
        columnId: exceptionColumn.id,
        value: exceptionValue
      };
      
      await this.makeRequest(query, variables);
    } catch (error) {
      console.error(`Failed to update Exception Types for item ${itemId}:`, error.message);
    }
  }

  async updateEmployeeBoardRelation(itemId, employeeName, boardId, columns, employeeBoardId) {
    try {
      const employeeColumn = columns.find(col => col.title === 'Employee');
      
      if (!employeeColumn) {
        console.log('Employee column not found');
        return;
      }
      
      if (!employeeBoardId) {
        console.log('Employee board ID not found');
        return;
      }
      
      const employeeItemId = await this.findEmployeeItemId(employeeName, employeeBoardId);
      if (!employeeItemId) {
        console.log(`Could not find employee item for "${employeeName}"`);
        return;
      }
      
      // Use change_column_value for board-relation columns
      const query = `
        mutation ChangeColumnValue($itemId: ID!, $boardId: ID!, $columnId: String!, $value: JSON!) {
          change_column_value(
            item_id: $itemId,
            board_id: $boardId,
            column_id: $columnId,
            value: $value
          ) {
            id
          }
        }
      `;
      
      const variables = {
        itemId: itemId,
        boardId: boardId,
        columnId: employeeColumn.id,
        value: JSON.stringify({item_ids: [employeeItemId]})
      };
      
      console.log(`Updating Employee board-relation for "${employeeName}": ${variables.value}`);
      await this.makeRequest(query, variables);
      console.log(`✅ Successfully updated Employee board-relation for "${employeeName}"`);
    } catch (error) {
      console.error(`Failed to update Employee board-relation for item ${itemId}:`, error.message);
    }
  }

  async findBoardByName(boardName) {
    const query = `
      query {
        boards(limit: 200) {
          id
          name
        }
      }
    `;
    
    const data = await this.makeRequest(query);
    return data.boards.find(board => board.name === boardName);
  }

  async getBoardColumns(boardId) {
    const query = `
      query {
        boards(ids: [${boardId}]) {
          columns {
            id
            title
            type
            settings_str
          }
        }
      }
    `;
    
    const data = await this.makeRequest(query);
    return data.boards[0].columns;
  }

  async getEmployeeBoardItems(employeeBoardId) {
    const allItems = [];
    let cursor = null;
    const limit = 500;

    do {
      const query = `
        query {
          boards(ids: [${employeeBoardId}]) {
            items_page(limit: ${limit}${cursor ? `, cursor: "${cursor}"` : ''}) {
              items {
                id
                name
              }
              cursor
            }
          }
        }
      `;
      const data = await this.makeRequest(query);
      const itemsPage = data.boards[0].items_page;
      allItems.push(...itemsPage.items);
      cursor = itemsPage.cursor;
    } while (cursor);
    
    return allItems;
  }

  async findEmployeeItemId(employeeName, employeeBoardId) {
    try {
      const employeeItems = await this.getEmployeeBoardItems(employeeBoardId);
      
      // Try exact match first
      let employee = employeeItems.find(item => item.name === employeeName);
      if (employee) {
        return employee.id;
      }
      
      // Try case-insensitive match
      employee = employeeItems.find(item => item.name.toLowerCase() === employeeName.toLowerCase());
      if (employee) {
        return employee.id;
      }
      
      // Try partial match (last name only)
      const lastName = employeeName.split(',')[0]?.trim();
      if (lastName) {
        employee = employeeItems.find(item => {
          const itemLastName = item.name.split(',')[0]?.trim();
          return itemLastName && itemLastName.toLowerCase() === lastName.toLowerCase();
        });
        if (employee) {
          return employee.id;
        }
      }
      
      console.log(`Could not find employee item for "${employeeName}"`);
      return null;
    } catch (error) {
      console.error(`Error finding employee item for "${employeeName}":`, error.message);
      return null;
    }
  }

  async getEmployeeBoardId(employeeColumn) {
    try {
      if (employeeColumn.settings_str) {
        const settings = JSON.parse(employeeColumn.settings_str);
        const boardId = settings.linkedPulseId || settings.linked_board_id || settings.linkedBoardId || (settings.boardIds && settings.boardIds[0]);
        if (boardId) {
          return boardId;
        }
      }
      
      // Fallback to hardcoded employee board ID
      return '18076293881';
    } catch (error) {
      console.error('Error parsing employee column settings:', error.message);
      // Fallback to hardcoded employee board ID
      return '18076293881';
    }
  }

  async createColumn(boardId, title, type) {
    const mutation = `
      mutation {
        create_column(
          board_id: ${parseInt(boardId)}
          title: "${title}"
          column_type: ${type}
        ) {
          id
          title
          type
        }
      }
    `;
    
    const data = await this.makeRequest(mutation);
    console.log(`✅ Created column: ${title} (${type})`);
    return data.create_column;
  }

  async getBoardItems(boardId) {
    const allItems = [];
    let cursor = null;
    const limit = 500; // Monday.com API limit

    do {
      const query = `
        query {
          boards(ids: [${parseInt(boardId)}]) {
            items_page(limit: ${limit}${cursor ? `, cursor: "${cursor}"` : ''}) {
              items {
                id
                name
                column_values {
                  id
                  text
                  value
                }
              }
              cursor
            }
          }
        }
      `;
      const data = await this.makeRequest(query);
      const itemsPage = data.boards[0].items_page;
      allItems.push(...itemsPage.items);
      cursor = itemsPage.cursor;
      console.log(`Fetched ${itemsPage.items.length} items (total: ${allItems.length})`);
      
    } while (cursor);
    
    return allItems;
  }

  async deleteOldItems(boardId, daysOld = 8) {
    console.log(`Deleting MSM items older than ${daysOld} days...`);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    console.log(`Cutoff date: ${cutoffDate.toISOString().split('T')[0]}`);
    
    // Get all items
    const allItems = await this.getBoardItems(boardId);
    const itemsToDelete = [];
    
    // Find items older than cutoff date
    for (const item of allItems) {
      const dateColumn = item.column_values?.find(cv => cv.title === 'Date');
      if (dateColumn && dateColumn.text) {
        try {
          // Parse the date (assuming MM/DD/YYYY format)
          const [month, day, year] = dateColumn.text.split('/');
          const itemDate = new Date(year, month - 1, day);
          
          if (itemDate < cutoffDate) {
            itemsToDelete.push(item.id);
            console.log(`Marking for deletion: Item ${item.id} with date ${dateColumn.text}`);
          }
        } catch (error) {
          console.log(`Could not parse date for item ${item.id}: ${dateColumn.text}`);
        }
      }
    }
    
    if (itemsToDelete.length === 0) {
      console.log('No old items found to delete');
      return 0;
    }
    
    console.log(`Found ${itemsToDelete.length} old items to delete`);
    
    // Delete items in batches
    let deletedCount = 0;
    const batchSize = 50;
    
    for (let i = 0; i < itemsToDelete.length; i += batchSize) {
      const batch = itemsToDelete.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      
      try {
        console.log(`Deleting batch ${batchNumber} (${batch.length} items)...`);
        
        // Delete items one by one (Monday.com doesn't support batch deletion)
        for (const itemId of batch) {
          await this.deleteItem(itemId);
          deletedCount++;
        }
        
        console.log(`Deleted batch ${batchNumber}: ${batch.length} items`);
        
        // Small delay between batches
        if (i + batchSize < itemsToDelete.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`Failed to delete batch ${batchNumber}:`, error.message);
      }
    }
    
    console.log(`Deleted ${deletedCount} old MSM items`);
    return deletedCount;
  }

  async deleteItem(itemId) {
    const query = `
      mutation {
        delete_item (item_id: ${itemId}) {
          id
        }
      }
    `;

    const response = await this.makeRequest(query);
    
    if (response.errors && response.errors.length > 0) {
      throw new Error(`Monday.com API Error: ${JSON.stringify(response.errors)}`);
    }
    
    return response.data?.delete_item;
  }

  async deleteAllItems(boardId) {
    console.log('Clearing remaining old MSM items...');
    
    // Fast deletion with aggressive batching
    let deletedCount = 0;
    let batchNumber = 1;
    const batchSize = 50; // Large batches for deletion
    
    while (true) {
      try {
        // Get a batch of items to delete
        const query = `
          query {
            boards(ids: [${boardId}]) {
              items_page(limit: ${batchSize}) {
                items {
                  id
                }
              }
            }
          }
        `;
        
        const data = await this.makeRequest(query);
        const items = data.boards[0].items_page.items;
        
        if (items.length === 0) {
          break; // No more items to delete
        }
        
        // Delete this batch with multiple mutations
        const mutations = items.map((item, index) => 
          `delete${index + 1}: delete_item(item_id: "${item.id}") { id }`
        ).join('\n');
        
        const deleteQuery = `mutation { ${mutations} }`;
        await this.makeRequest(deleteQuery);
        
        deletedCount += items.length;
        console.log(`Deleted MSM cleanup batch ${batchNumber} (${items.length} items, total: ${deletedCount})`);
        
        batchNumber++;
        
        // Minimal delay for cleanup
        await new Promise(resolve => setTimeout(resolve, 10));
        
      } catch (error) {
        console.error(`Failed to delete MSM cleanup batch ${batchNumber}:`, error.message);
        break; // Stop if we can't delete anymore
      }
    }
    
    if (deletedCount > 0) {
      console.log(`✅ MSM cleanup completed (${deletedCount} old items removed)`);
    } else {
      console.log('✅ No old MSM items to clean up');
    }
  }

  async createItemsBatch(boardId, records, columns) {
    // Create items in batches of 20 (reduced for reliability)
    const batchSize = 20;
    let totalCreated = 0;
    
    // Get employee board ID for board_relation column
    const employeeColumn = columns.find(col => col.title === 'Employee');
    let employeeBoardId = null;
    if (employeeColumn && employeeColumn.type === 'board_relation') {
      employeeBoardId = await this.getEmployeeBoardId(employeeColumn);
      if (employeeBoardId) {
        console.log(`Found employee board ID: ${employeeBoardId}`);
      } else {
        console.log('Warning: Could not find employee board ID for board_relation column');
      }
    }
    
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      
      // Create items one by one in parallel for maximum speed
      const promises = batch.map(async (record) => {
        try {
          const itemName = record.Date;
          const columnValues = {};
          
          for (const [key, value] of Object.entries(record)) {
            const column = columns.find(col => col.title === key);
            if (column && (value !== null || key === 'Comments' || key === 'Comments Logged')) {
              let columnValue = value;
              
              // Handle special column types
              if (column.type === 'date') {
                columnValue = value;
              } else if (column.type === 'text' && key === 'Shift ID') {
                // Convert Shift ID to text format for Monday.com
                columnValue = value ? String(value) : null;
              } else if (column.type === 'checkbox' && key === 'Comments Logged') {
                // Format checkbox value for Monday.com
                columnValue = value ? '{"checked": "true"}' : '{"checked": "false"}';
              } else if (column.type === 'dropdown' && key === 'Exception Types') {
                // Skip Exception Types for now - we'll update it separately
                continue;
              } else if (column.type === 'board_relation' && key === 'Employee') {
                // Skip board_relation columns during initial creation - we'll update them separately
                console.log(`Skipping Employee board-relation column during creation for "${value}"`);
                continue;
              }
              
              columnValues[column.id] = columnValue;
            }
          }
          
          const query = `
            mutation CreateItem($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
              create_item(
                board_id: $boardId,
                item_name: $itemName,
                column_values: $columnValues
              ) {
                id
              }
            }
          `;
          
          const variables = {
            boardId: boardId,
            itemName: itemName,
            columnValues: JSON.stringify(columnValues)
          };
          
          console.log(`Creating item with column values:`, JSON.stringify(columnValues, null, 2));
          
          const result = await this.makeRequest(query, variables);
          
          // Update Exception Types field separately with create_labels_if_missing
          if (record['Exception Types']) {
            await this.updateExceptionTypes(result.create_item.id, record['Exception Types'], boardId, columns);
          }
          
          // Update Employee board-relation field separately
          if (record['Employee']) {
            await this.updateEmployeeBoardRelation(result.create_item.id, record['Employee'], boardId, columns, employeeBoardId);
          }
          
          return true;
        } catch (error) {
          console.error(`Failed to create item:`, error.message);
          return false;
        }
      });
      
      try {
        const results = await Promise.all(promises);
        const successCount = results.filter(r => r).length;
        totalCreated += successCount;
        console.log(`Created MSM batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(records.length/batchSize)} (${successCount}/${batch.length} items)`);
      } catch (error) {
        console.error(`Failed to create MSM batch:`, error.message);
      }
    }
    
    return totalCreated;
  }

  async createItem(boardId, itemData, columns, itemName) {
    // Use the provided item name (date with customer/employee for uniqueness)
    const safeItemName = itemName.replace(/"/g, '\\"');
    
    // Get employee board ID for board_relation column
    const employeeColumn = columns.find(col => col.title === 'Employee');
    let employeeBoardId = null;
    if (employeeColumn && employeeColumn.type === 'board_relation') {
      employeeBoardId = await this.getEmployeeBoardId(employeeColumn);
    }
    
    // Map data to column values
    const columnValues = {};
    
    for (const [key, value] of Object.entries(itemData)) {
      const column = columns.find(col => col.title === key);
      if (column && (value !== null || key === 'Comments')) {
        let columnValue = value;
        
        // Handle special column types
        if (column.type === 'date') {
          // Convert date to Monday.com format (YYYY-MM-DD)
          columnValue = value;
        } else if (column.type === 'text' && key === 'Shift ID') {
          // Convert Shift ID to text format for Monday.com
          columnValue = value ? String(value) : null;
        } else if (column.type === 'dropdown' && key === 'Exception Types') {
          // Parse multiple exceptions for dropdown field
          const exceptions = this.parseExceptionTypes(value);
          columnValue = exceptions.join(',');
        } else if (column.type === 'board_relation' && key === 'Employee') {
          // Skip board_relation columns during initial creation - we'll update them separately
          console.log(`Skipping Employee board-relation column during creation for "${value}"`);
          continue;
        }
        
        columnValues[column.id] = columnValue;
      }
    }

    // Use variables to avoid GraphQL syntax issues
    const variables = {
      boardId: boardId,
      itemName: safeItemName,
      columnValues: JSON.stringify(columnValues)
    };

    const query = `
      mutation CreateItem($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
        create_item(
          board_id: $boardId,
          item_name: $itemName,
          column_values: $columnValues
        ) {
          id
        }
      }
    `;
    const data = await this.makeRequest(query, variables);
    return data.create_item;
  }

  async updateItem(boardId, itemId, itemData, columns) {
    // Get employee board ID for board_relation column
    const employeeColumn = columns.find(col => col.title === 'Employee');
    let employeeBoardId = null;
    if (employeeColumn && employeeColumn.type === 'board_relation') {
      employeeBoardId = await this.getEmployeeBoardId(employeeColumn);
    }
    
    // Map data to column values
    const columnValues = {};
    
    for (const [key, value] of Object.entries(itemData)) {
      const column = columns.find(col => col.title === key);
      if (column && (value !== null || key === 'Comments' || key === 'Comments Logged')) {
        let columnValue = value;
        
        // Handle special column types
        if (column.type === 'date') {
          // Convert date to Monday.com format (YYYY-MM-DD)
          columnValue = value;
        } else if (column.type === 'text' && key === 'Shift ID') {
          // Convert Shift ID to text format for Monday.com
          columnValue = value ? String(value) : null;
        } else if (column.type === 'checkbox' && key === 'Comments Logged') {
          // Format checkbox value for Monday.com
          columnValue = value ? '{"checked": "true"}' : '{"checked": "false"}';
        } else if (column.type === 'dropdown' && key === 'Exception Types') {
          // Parse multiple exceptions for dropdown field
          const exceptions = this.parseExceptionTypes(value);
          columnValue = exceptions.join(',');
        } else if (column.type === 'board_relation' && key === 'Employee') {
          // Skip board_relation columns during initial creation - we'll update them separately
          console.log(`Skipping Employee board-relation column during creation for "${value}"`);
          continue;
        }
        
        columnValues[column.id] = columnValue;
      }
    }

    // Use variables to avoid GraphQL syntax issues
    const variables = {
      itemId: itemId,
      boardId: boardId,
      columnValues: JSON.stringify(columnValues)
    };

    const query = `
      mutation UpdateItem($itemId: ID!, $boardId: ID!, $columnValues: JSON!) {
        change_multiple_column_values(
          item_id: $itemId,
          board_id: $boardId,
          column_values: $columnValues
        ) {
          id
        }
      }
    `;
    
    const data = await this.makeRequest(query, variables);
    
    // Update Exception Types separately if needed (for dropdown with create_labels_if_missing)
    if (itemData['Exception Types']) {
      const exceptionTypesColumn = columns.find(col => col.title === 'Exception Types');
      if (exceptionTypesColumn) {
        await this.updateExceptionTypes(itemId, itemData['Exception Types'], boardId, columns);
      }
    }
    
    // Update Employee board-relation separately if needed
    if (itemData['Employee']) {
      const employeeColumn = columns.find(col => col.title === 'Employee');
      if (employeeColumn && employeeColumn.type === 'board_relation') {
        const employeeBoardId = await this.getEmployeeBoardId(employeeColumn);
        if (employeeBoardId) {
          await this.updateEmployeeBoardRelation(itemId, itemData['Employee'], boardId, columns, employeeBoardId);
        }
      }
    }
    
    return data.change_multiple_column_values;
  }

  async updateCommentsLoggedStatus(records) {
    try {
      console.log('Updating Comments Logged status for records...');
      
      // Get board info
      const board = await this.findBoardByName('MSM Shift Data');
      if (!board) {
        throw new Error('MSM Shift Data board not found');
      }
      
      // Get board columns
      const columns = await this.getBoardColumns(board.id);
      const commentsLoggedColumn = columns.find(col => col.title === 'Comments Logged');
      
      if (!commentsLoggedColumn) {
        console.log('Comments Logged column not found, skipping update');
        return;
      }
      
      // Update only records that have CommentsLogged = true (just processed by Call Logger)
      const recordsToUpdate = records.filter(record => record.CommentsLogged === true);
      
      if (recordsToUpdate.length === 0) {
        console.log('No records with CommentsLogged = true to update');
        return;
      }
      
      console.log(`Updating Comments Logged status for ${recordsToUpdate.length} records that were just processed`);
      
      for (const record of recordsToUpdate) {
        if (record['Shift ID']) {
          try {
            // Find the item by Shift ID
            const existingItems = await this.getBoardItems(board.id);
            const item = existingItems.find(item => {
              const shiftIdValue = item.column_values.find(cv => {
                const column = columns.find(col => col.title === 'Shift ID');
                return column && cv.id === column.id;
              });
              return shiftIdValue && shiftIdValue.text === String(record['Shift ID']);
            });
            
            if (item) {
              // Update the Comments Logged checkbox to true
              const query = `
                mutation UpdateCheckbox($itemId: ID!, $boardId: ID!, $columnValues: JSON!) {
                  change_multiple_column_values(
                    item_id: $itemId
                    board_id: $boardId
                    column_values: $columnValues
                  ) {
                    id
                  }
                }
              `;
              
              const columnValues = {};
              columnValues[commentsLoggedColumn.id] = {checked: true};
              
              const variables = {
                itemId: item.id,
                boardId: board.id,
                columnValues: JSON.stringify(columnValues)
              };
              
              await this.makeRequest(query, variables);
              console.log(`✓ Updated Comments Logged for Shift ID ${record['Shift ID']}: true`);
            }
          } catch (error) {
            console.error(`Failed to update Comments Logged for Shift ID ${record['Shift ID']}:`, error.message);
          }
        }
      }
      
      console.log('✅ Successfully updated Comments Logged status');
    } catch (error) {
      console.error('❌ Failed to update Comments Logged status:', error.message);
      throw error;
    }
  }

  async syncData(data) {
    try {
      console.log('Starting MSM Monday.com integration...');
      
      // Handle both file path and direct data
      let records;
      if (typeof data === 'string') {
        // Load from file
        const jsonData = await fs.readFile(data, 'utf8');
        records = JSON.parse(jsonData);
      } else if (Array.isArray(data)) {
        // Use data directly
        records = data;
      } else {
        throw new Error('Data must be either a file path (string) or an array of records');
      }
      
      if (!records.length) {
        console.log('No MSM records to sync');
        return;
      }

      console.log(`Loaded ${records.length} MSM records`);

      // Find or create board
      let board;
      
      if (BOARD_ID) {
        console.log(`Using specified MSM board ID: ${BOARD_ID}`);
        board = { id: BOARD_ID, name: BOARD_NAME };
      } else {
        board = await this.findBoardByName(BOARD_NAME);
        
        if (!board) {
          console.log('MSM board not found. Please create it manually using msm_board_import.xlsx');
          console.log('1. Upload msm_board_import.xlsx to Monday.com');
          console.log('2. Name the board "MSM Shift Data" (exact name required)');
          console.log('3. Add the board ID to your .env file as MONDAY_MSM_BOARD_ID');
          process.exit(1);
        } else {
          console.log(`Found existing MSM board: ${board.name} (ID: ${board.id})`);
        }
      }

      // Get board columns
      const columns = await this.getBoardColumns(board.id);
      console.log(`MSM board has ${columns.length} columns`);
      
      // Debug: Log all column types
      // console.log('Column types:');
      // columns.forEach(col => {
      //   console.log(`- ${col.title}: ${col.type}`);
      // });
      
      // Check if "Comments Logged" column exists, create it if not
      const commentsLoggedColumn = columns.find(col => col.title === 'Comments Logged');
      if (!commentsLoggedColumn) {
        console.log('Creating "Comments Logged" column...');
        await this.createColumn(board.id, 'Comments Logged', 'checkbox');
        // Refresh columns after creating new one
        const updatedColumns = await this.getBoardColumns(board.id);
        console.log(`MSM board now has ${updatedColumns.length} columns`);
      } else {
        console.log('✅ "Comments Logged" column already exists');
      }

      // Delete old items (older than 8 days)
      const deletedCount = await this.deleteOldItems(board.id, 8);
      if (deletedCount > 0) {
        console.log(`Cleaned up ${deletedCount} old items from MSM board`);
      }

      // Fetch existing items and create Shift ID lookup map
      console.log('Fetching existing MSM items...');
      const existingItems = await this.getBoardItems(board.id);
      const shiftIdLookup = new Map();
      
      // Create lookup map: Shift ID -> { itemId, commentsLogged }
      for (const item of existingItems) {
        const shiftIdColumn = columns.find(col => col.title === 'Shift ID');
        const commentsLoggedColumn = columns.find(col => col.title === 'Comments Logged');
        
        if (shiftIdColumn && item.column_values) {
          const shiftIdValue = item.column_values.find(cv => cv.id === shiftIdColumn.id);
          let commentsLogged = false;
          
          if (commentsLoggedColumn) {
            const commentsLoggedValue = item.column_values.find(cv => cv.id === commentsLoggedColumn.id);
            if (commentsLoggedValue && commentsLoggedValue.value) {
              try {
                const valueObj = JSON.parse(commentsLoggedValue.value);
                commentsLogged = valueObj.checked === true;
              } catch (e) {
                // If parsing fails, check text value
                commentsLogged = commentsLoggedValue.text === 'true' || commentsLoggedValue.text === 'Yes';
              }
            }
          }
          
          if (shiftIdValue && shiftIdValue.text) {
            shiftIdLookup.set(shiftIdValue.text, { 
              itemId: item.id, 
              commentsLogged: commentsLogged 
            });
            console.log(`Added to lookup: Shift ID "${shiftIdValue.text}" -> Item ID ${item.id}, Comments Logged: ${commentsLogged}`);
          } else {
            console.log(`No Shift ID found for item ${item.id}:`, shiftIdValue);
          }
        }
      }
      
      console.log(`Found ${existingItems.length} existing items in Monday.com`);
      console.log(`Found ${shiftIdLookup.size} items with Shift IDs`);
      console.log('Lookup map contents:', Array.from(shiftIdLookup.entries()));

      // Process records: update existing or create new
      let updatedCount = 0;
      let createdCount = 0;
      let failedCount = 0;

      console.log(`Processing ${records.length} scraped records...`);

      // Track which Shift IDs we've processed from the scraped data
      const processedShiftIds = new Set();

      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        console.log(`Processing record ${i + 1}/${records.length}...`);
        try {
          const shiftId = record['Shift ID'];
          if (!shiftId) {
            console.log(`Skipping record without Shift ID: ${record.Customer} - ${record.Employee}`);
            failedCount++;
            continue;
          }

          // Track this Shift ID as processed
          processedShiftIds.add(String(shiftId));

          if (shiftIdLookup.has(String(shiftId))) {
            // Update existing item
            const itemData = shiftIdLookup.get(String(shiftId));
            const itemId = itemData.itemId;
            
            // Set CommentsLogged based on whether the comment was successfully logged
            record.CommentsLogged = record.CommentsLogged || false;
            
            await this.updateItem(board.id, itemId, record, columns);
            updatedCount++;
            console.log(`✓ Updated item for Shift ID ${shiftId}`);
          } else {
            // Create new item
            const itemName = record.Date || 'New Shift';
            record.CommentsLogged = record.CommentsLogged || false;
            await this.createItem(board.id, record, columns, itemName);
            createdCount++;
            console.log(`✓ Created new item for Shift ID ${shiftId}`);
          }
        } catch (error) {
          console.error(`Failed to process record with Shift ID ${record['Shift ID']}:`, error.message);
          failedCount++;
        }
      }

      // Delete orphaned records (in Monday but not in scraped data)
      console.log('\nChecking for orphaned records...');
      const orphanedItems = [];
      
      for (const [shiftId, itemData] of shiftIdLookup.entries()) {
        if (!processedShiftIds.has(shiftId)) {
          orphanedItems.push({ shiftId, itemId: itemData.itemId });
          console.log(`Found orphaned record: Shift ID ${shiftId} -> Item ID ${itemData.itemId}`);
        }
      }

      if (orphanedItems.length > 0) {
        console.log(`Deleting ${orphanedItems.length} orphaned records...`);
        let deletedCount = 0;
        
        for (const { shiftId, itemId } of orphanedItems) {
          try {
            await this.deleteItem(itemId);
            deletedCount++;
            console.log(`Deleted orphaned record: Shift ID ${shiftId}`);
          } catch (error) {
            console.error(`Failed to delete orphaned record ${shiftId}:`, error.message);
          }
        }
        
        console.log(`Deleted ${deletedCount} orphaned records`);
      } else {
        console.log('No orphaned records found');
      }

      console.log(`\nMSM Sync completed:`);
      console.log(`- Items updated: ${updatedCount}`);
      console.log(`- Items created: ${createdCount}`);
      console.log(`- Items failed: ${failedCount}`);
      console.log(`- Orphaned records deleted: ${orphanedItems.length}`);
      console.log(`- Total processed: ${records.length}`);
      
      if (updatedCount > 0 || createdCount > 0) {
        console.log('✅ Successfully synced MSM data to Monday.com');
      } else {
        console.log('❌ No items were processed');
      }

    } catch (error) {
      console.error('MSM Monday.com integration failed:', error.message);
      throw error;
    }
  }
}

// Main execution
async function main() {
  try {
    console.log('Running MSM Monday.com integration...');
    
    // Look for MSM data file
    const dataFile = path.join(__dirname, 'msm_results.json');
    console.log(`Looking for MSM data file: ${dataFile}`);
    
    const integration = new MSMMondayIntegration();
    await integration.syncData(dataFile);
    
    console.log('MSM Monday.com integration completed successfully!');
  } catch (error) {
    console.error('Integration failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

// Check if this script is being run directly
if (process.argv[1] && process.argv[1].includes('msm_monday_integration.mjs')) {
  main();
}

export default MSMMondayIntegration;
