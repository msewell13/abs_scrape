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
const BOARD_ID = process.env.MONDAY_BOARD_ID; // Optional: specify existing board ID

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
    
    // Try different approaches to create a board
    const approaches = [
      // Approach 1: Basic board creation
      () => this.createBasicBoard(boardName),
      // Approach 2: Board with workspace
      () => this.createBoardWithWorkspace(boardName),
      // Approach 3: Board with template
      () => this.createBoardWithTemplate(boardName)
    ];
    
    for (let i = 0; i < approaches.length; i++) {
      try {
        console.log(`Trying approach ${i + 1}...`);
        const board = await approaches[i]();
        
        if (board) {
          console.log(`Successfully created board with ID: ${board.id}`);
          
          // Add columns
          await this.addColumnsToBoard(board.id, columns);
          return board;
        }
      } catch (error) {
        console.log(`Approach ${i + 1} failed:`, error.message);
        if (i === approaches.length - 1) {
          throw error; // Re-throw the last error
        }
      }
    }
  }

  async createBasicBoard(boardName) {
    const query = `
      mutation {
        create_board(
          board_name: "${boardName}",
          board_kind: private
        ) {
          id
          name
        }
      }
    `;
    
    const data = await this.makeRequest(query);
    return data.create_board;
  }

  async createBoardWithWorkspace(boardName) {
    // First get the workspace ID
    const workspaceQuery = `
      query {
        me {
          account {
            id
          }
        }
      }
    `;
    
    const workspaceData = await this.makeRequest(workspaceQuery);
    const workspaceId = workspaceData.me.account.id;
    
    const query = `
      mutation {
        create_board(
          board_name: "${boardName}",
          board_kind: private,
          workspace_id: ${workspaceId}
        ) {
          id
          name
        }
      }
    `;
    
    const data = await this.makeRequest(query);
    return data.create_board;
  }

  async createBoardWithTemplate(boardName) {
    // Try to create a board with a simple template
    const query = `
      mutation {
        create_board(
          board_name: "${boardName}",
          board_kind: private,
          template_id: 1
        ) {
          id
          name
        }
      }
    `;
    
    const data = await this.makeRequest(query);
    return data.create_board;
  }

  async addColumnsToBoard(boardId, columns) {
    console.log(`Adding ${columns.length} columns to board...`);
    
    // Wait a moment for the board to be fully created
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Add columns one by one
    for (const column of columns) {
      try {
        const columnQuery = `
          mutation {
            create_column(
              board_id: ${boardId},
              title: "${column.title}",
              column_type: ${column.type}
            ) {
              id
              title
            }
          }
        `;
        
        await this.makeRequest(columnQuery);
        console.log(`Added column: ${column.title}`);
        
        // Small delay between column creations
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`Failed to add column ${column.title}:`, error.message);
        // Continue with other columns even if one fails
      }
    }
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

  async createItem(boardId, itemData, columns) {
    // Create a unique name for the item (combination of key fields)
    const itemName = `${itemData.client} - ${itemData.employee} - ${itemData.date}`.replace(/"/g, '\\"');
    
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

    // Use variables to avoid GraphQL syntax issues
    const variables = {
      boardId: boardId,
      itemName: itemName,
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
      let board;
      
      if (BOARD_ID) {
        console.log(`Using specified board ID: ${BOARD_ID}`);
        board = { id: BOARD_ID, name: BOARD_NAME };
      } else {
        board = await this.findBoardByName(BOARD_NAME);
        
        if (!board) {
          console.log('Board not found, creating new board...');
          
          // Create column definitions
          const columns = Object.entries(COLUMN_MAPPINGS).map(([title, type]) => ({
            title,
            type
          }));
          
          try {
            board = await this.createBoard(BOARD_NAME, columns);
            console.log(`Created board: ${board.name} (ID: ${board.id})`);
          } catch (error) {
            console.error('Failed to create board:', error.message);
            console.log('\nThis might be due to API permissions. Please try:');
            console.log('1. Check that your API token has "Create boards" permission');
            console.log('2. Or create the board manually and set MONDAY_BOARD_ID in .env');
            process.exit(1);
          }
        } else {
          console.log(`Found existing board: ${board.name} (ID: ${board.id})`);
        }
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
    console.log('Initializing Monday.com integration...');
    const integration = new MondayIntegration();
    const jsonFilePath = path.join(__dirname, 'month_block.json');
    
    console.log(`Looking for data file: ${jsonFilePath}`);
    await integration.syncData(jsonFilePath);
    console.log('Monday.com integration completed successfully!');
    
  } catch (error) {
    console.error('Integration failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

export default MondayIntegration;

// Run if called directly
console.log('Script loaded, checking if should run main...');
console.log('process.argv[1]:', process.argv[1]);
console.log('import.meta.url:', import.meta.url);

if (process.argv[1] && process.argv[1].includes('monday_integration.mjs')) {
  console.log('Running Monday.com integration...');
  main();
}
