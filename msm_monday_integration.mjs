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
  'Employee': 'text',
  'Sch Start': 'text',
  'Sch End': 'text',
  'Sch Hrs': 'text',
  'Actual Start': 'text',
  'Actual End': 'text',
  'Actual Hrs': 'text',
  'Adjusted Start': 'text',
  'Adjusted End': 'text',
  'Adjusted Hrs': 'text',
  'Exception Types': 'dropdown'
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
    const response = await fetch(MONDAY_API_URL, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        query,
        variables
      })
    });

    const result = await response.json();
    
    if (result.errors) {
      throw new Error(`Monday.com API Error: ${JSON.stringify(result.errors)}`);
    }
    
    return result.data;
  }

  parseExceptionTypes(exceptionString) {
    if (!exceptionString) return [];
    
    // For Monday.com dropdown, we need to match predefined combinations
    // Split by newlines and clean up, then concatenate back to match predefined options
    const exceptions = exceptionString
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    // Join exceptions without spaces to match Monday.com predefined options
    // This matches the format like "Early Start ShiftEarly End Shift"
    return [exceptions.join('')];
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
          }
        }
      }
    `;
    
    const data = await this.makeRequest(query);
    return data.boards[0].columns;
  }

  async getBoardItems(boardId) {
    const allItems = [];
    let cursor = null;
    const limit = 500; // Monday.com API limit

    do {
      const query = `
        query {
          boards(ids: [${boardId}]) {
            items_page(limit: ${limit}${cursor ? `, cursor: "${cursor}"` : ''}) {
              items {
                id
                name
                column_values {
                  id
                  text
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
    
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      
      // Create items one by one in parallel for maximum speed
      const promises = batch.map(async (record) => {
        try {
          const itemName = record.Date;
          const columnValues = {};
          
          for (const [key, value] of Object.entries(record)) {
            const column = columns.find(col => col.title === key);
            if (column && value !== null) {
              let columnValue = value;
              
              // Handle special column types
              if (column.type === 'date') {
                columnValue = value;
              } else if (column.type === 'dropdown' && key === 'Exception Types') {
                // Parse multiple exceptions for dropdown field
                const exceptions = this.parseExceptionTypes(value);
                columnValue = { labels: exceptions };
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
          
          await this.makeRequest(query, variables);
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
    
    // Map data to column values
    const columnValues = {};
    
    for (const [key, value] of Object.entries(itemData)) {
      const column = columns.find(col => col.title === key);
      if (column && value !== null) {
        let columnValue = value;
        
        // Handle special column types
        if (column.type === 'date') {
          // Convert date to Monday.com format (YYYY-MM-DD)
          columnValue = value;
        } else if (column.type === 'dropdown' && key === 'Exception Types') {
          // Parse multiple exceptions for dropdown field
          const exceptions = this.parseExceptionTypes(value);
          columnValue = { labels: exceptions };
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

      // Clear all existing items first
      console.log('Clearing existing MSM data...');
      await this.deleteAllItems(board.id);

      // Then create new items
      console.log(`Creating ${records.length} new MSM items...`);

      const newItemsCount = await this.createItemsBatch(board.id, records, columns);
      const failedCount = records.length - newItemsCount;

      console.log(`\nMSM Sync completed:`);
      console.log(`- New items created: ${newItemsCount}`);
      console.log(`- Items failed: ${failedCount}`);
      console.log(`- Total processed: ${records.length}`);

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
