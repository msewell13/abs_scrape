// monday_integration.mjs
// Integration to send scraped data to Monday.com
// Creates a board with columns matching the JSON structure and adds new items

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Monday.com API configuration
const MONDAY_API_URL = 'https://api.monday.com/v2';
const MONDAY_API_TOKEN = process.env.MONDAY_API_TOKEN;
const BOARD_NAME = 'ABS Shift Data';

// Column type mapping based on data analysis
const COLUMN_MAPPINGS = {
  date: 'date',
  time: 'text',
  start_time: 'text',
  end_time: 'text',
  client: 'text',
  employee: 'text',
  location: 'text',
  product: 'text',
  bill_rate: 'text',
  pay_rate: 'text',
  status: 'status'
};

// Status color mapping for Monday.com
const STATUS_COLORS = {
  'Open': 'red',
  'Assigned': 'green',
  'Completed': 'blue'
};

class MondayIntegration {
  constructor() {
    if (!MONDAY_API_TOKEN) {
      throw new Error('MONDAY_API_TOKEN environment variable is required');
    }
    this.headers = {
      'Authorization': MONDAY_API_TOKEN,
      'Content-Type': 'application/json',
      'API-Version': '2024-01'
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

  async findBoardByName(boardName) {
    const query = `
      query {
        boards(limit: 50) {
          id
          name
        }
      }
    `;
    
    const data = await this.makeRequest(query);
    const board = data.boards.find(b => b.name === boardName);
    return board;
  }

  async createBoard(boardName, columns) {
    console.log(`Creating board: ${boardName}`);
    
    const columnDefinitions = columns.map(col => 
      `"${col.title}": "${col.type}"`
    ).join(', ');

    const query = `
      mutation {
        create_board(
          board_name: "${boardName}",
          board_kind: private,
          columns: {${columnDefinitions}}
        ) {
          id
          name
        }
      }
    `;

    const data = await this.makeRequest(query);
    return data.create_board;
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
    const query = `
      query {
        boards(ids: [${boardId}]) {
          items_page(limit: 1000) {
            items {
              id
              name
              column_values {
                id
                text
              }
            }
          }
        }
      }
    `;
    
    const data = await this.makeRequest(query);
    return data.boards[0].items_page.items;
  }

  async createItem(boardId, itemData, columns) {
    // Create a unique name for the item (combination of key fields)
    const itemName = `${itemData.client} - ${itemData.employee} - ${itemData.date}`;
    
    // Map data to column values
    const columnValues = {};
    
    for (const [key, value] of Object.entries(itemData)) {
      const column = columns.find(col => col.title === key);
      if (column && value !== null) {
        let columnValue = value;
        
        // Handle special column types
        if (column.type === 'status') {
          const color = STATUS_COLORS[value] || 'gray';
          columnValue = JSON.stringify({ label: { text: value, color: color } });
        } else if (column.type === 'date') {
          // Convert date to Monday.com format (YYYY-MM-DD)
          columnValue = value;
        }
        
        columnValues[column.id] = columnValue;
      }
    }

    const query = `
      mutation {
        create_item(
          board_id: ${boardId},
          item_name: "${itemName}",
          column_values: "${JSON.stringify(columnValues).replace(/"/g, '\\"')}"
        ) {
          id
        }
      }
    `;

    const data = await this.makeRequest(query);
    return data.create_item;
  }

  async syncData(jsonFilePath) {
    try {
      console.log('Starting Monday.com integration...');
      
      // Load the JSON data
      const jsonData = await fs.readFile(jsonFilePath, 'utf8');
      const records = JSON.parse(jsonData);
      
      if (!records.length) {
        console.log('No records to sync');
        return;
      }

      console.log(`Loaded ${records.length} records`);

      // Find or create board
      let board = await this.findBoardByName(BOARD_NAME);
      
      if (!board) {
        console.log('Board not found, creating new board...');
        
        // Create column definitions
        const columns = Object.entries(COLUMN_MAPPINGS).map(([title, type]) => ({
          title,
          type
        }));
        
        board = await this.createBoard(BOARD_NAME, columns);
        console.log(`Created board: ${board.name} (ID: ${board.id})`);
      } else {
        console.log(`Found existing board: ${board.name} (ID: ${board.id})`);
      }

      // Get board columns
      const columns = await this.getBoardColumns(board.id);
      console.log(`Board has ${columns.length} columns`);

      // Get existing items to avoid duplicates
      const existingItems = await this.getBoardItems(board.id);
      console.log(`Found ${existingItems.length} existing items`);

      // Create a set of existing item names for quick lookup
      const existingItemNames = new Set(
        existingItems.map(item => item.name)
      );

      // Process records and create new items
      let newItemsCount = 0;
      let skippedCount = 0;

      for (const record of records) {
        const itemName = `${record.client} - ${record.employee} - ${record.date}`;
        
        if (existingItemNames.has(itemName)) {
          skippedCount++;
          continue;
        }

        try {
          await this.createItem(board.id, record, columns);
          newItemsCount++;
          console.log(`Created item: ${itemName}`);
          
          // Add a small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Failed to create item ${itemName}:`, error.message);
        }
      }

      console.log(`\nSync completed:`);
      console.log(`- New items created: ${newItemsCount}`);
      console.log(`- Items skipped (already exist): ${skippedCount}`);
      console.log(`- Total processed: ${records.length}`);

    } catch (error) {
      console.error('Monday.com integration failed:', error.message);
      throw error;
    }
  }
}

// Main execution
async function main() {
  try {
    const integration = new MondayIntegration();
    const jsonFilePath = path.join(__dirname, 'month_block.json');
    
    await integration.syncData(jsonFilePath);
    console.log('Monday.com integration completed successfully!');
    
  } catch (error) {
    console.error('Integration failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default MondayIntegration;
