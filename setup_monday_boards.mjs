#!/usr/bin/env node
/**
 * Monday.com Board Setup Script
 * 
 * This script automatically creates the required Monday.com boards for the ABS scraper:
 * 1. Employees board - for employee lookup and board-relations
 * 2. MSM Shift Data board - for Mobile Shift Maintenance data (Employee column connects to Employees board)
 * 3. ABS Shift Data board - for schedule data
 * 
 * Note: After creation, manually change the "Employee" column in MSM Shift Data 
 * from text to board-relation and connect it to the Employees board.
 * 
 * Usage: 
 *   node setup_monday_boards.mjs           # Normal mode - uses existing boards or creates new ones
 *   node setup_monday_boards.mjs --test    # Test mode - creates test boards with "TEST" prefix
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check for test mode
const isTestMode = process.argv.includes('--test');

// Monday.com API configuration
const MONDAY_API_URL = 'https://api.monday.com/v2';
const MONDAY_API_TOKEN = process.env.MONDAY_API_TOKEN;


if (!MONDAY_API_TOKEN) {
  console.error('❌ Error: MONDAY_API_TOKEN environment variable is required');
  console.error('Please set your Monday.com API token in the .env file');
  process.exit(1);
}

class MondayBoardSetup {
  constructor() {
    this.headers = {
      'Authorization': MONDAY_API_TOKEN,
      'Content-Type': 'application/json'
    };
  }

  async makeRequest(query, variables = {}) {
    try {
      const response = await fetch(MONDAY_API_URL, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          query,
          variables
        })
      });

      const data = await response.json();
      
      if (data.errors) {
        throw new Error(`Monday.com API Error: ${JSON.stringify(data.errors)}`);
      }
      
      return data.data;
    } catch (error) {
      console.error('API Request failed:', error.message);
      throw error;
    }
  }

  async createBoard(name, description) {
    console.log(`\n🔨 Creating board: "${name}"`);

    // Try different approaches to board creation
    const queries = [
      // Approach 1: With board_kind
      {
        query: `
          mutation CreateBoard($name: String!, $description: String!) {
            create_board(
              board_name: $name,
              board_kind: private,
              description: $description
            ) {
              id
              name
              description
            }
          }
        `,
        variables: { name, description }
      },
      // Approach 2: With board_kind but no description
      {
        query: `
          mutation CreateBoard($name: String!) {
            create_board(
              board_name: $name,
              board_kind: private
            ) {
              id
              name
            }
          }
        `,
        variables: { name }
      },
      // Approach 3: With workspace_id and board_kind (will be updated dynamically)
      {
        query: `
          mutation CreateBoard($name: String!, $workspaceId: ID!) {
            create_board(
              board_name: $name,
              board_kind: private,
              workspace_id: $workspaceId
            ) {
              id
              name
            }
          }
        `,
        variables: { name, workspaceId: '8405159' }
      }
    ];

    for (let i = 0; i < queries.length; i++) {
      const { query, variables } = queries[i];
      console.log(`   Trying approach ${i + 1}...`);
      
      try {
        const result = await this.makeRequest(query, variables);
        const board = result.create_board;

        console.log(`✅ Successfully created board: "${board.name}"`);
        console.log(`   Board ID: ${board.id}`);

        return board;
      } catch (error) {
        console.log(`   ❌ Approach ${i + 1} failed: ${error.message}`);
        if (i === queries.length - 1) {
          // Last approach failed, throw the error
          throw error;
        }
      }
    }
  }

  async addColumn(boardId, title, type, labels = null) {
    // For now, let's create columns without labels to test basic functionality
    const query = `
      mutation AddColumn($boardId: ID!, $title: String!, $type: ColumnType!) {
        create_column(
          board_id: $boardId,
          title: $title,
          column_type: $type
        ) {
          id
          title
          type
        }
      }
    `;

    const variables = {
      boardId,
      title,
      type
    };

    try {
      const result = await this.makeRequest(query, variables);
      return result.create_column;
    } catch (error) {
      console.error(`❌ Failed to add column "${title}":`, error.message);
      throw error;
    }
  }

  async createBoardWithColumns(name, description, columns) {
    // First create the board
    const board = await this.createBoard(name, description);
    
    console.log(`   Adding ${columns.length} columns...`);
    
    // Then add columns one by one
    for (const column of columns) {
      try {
        const labels = column.labels ? column.labels.map(label => ({
          name: label.label,
          color: label.color
        })) : null;
        
        await this.addColumn(board.id, column.title, column.type, labels);
        console.log(`   ✅ Added column: ${column.title}`);
      } catch (error) {
        console.error(`   ❌ Failed to add column "${column.title}":`, error.message);
        // Continue with other columns even if one fails
      }
    }
    
    return board;
  }

  async createEmployeesBoard() {
    const columns = [
      { title: 'Employment Start Date', type: 'date' },
      { title: 'Kiosk code', type: 'text' },
      { title: 'CTUserId', type: 'text' },
      { title: 'Phone', type: 'text' },
      { title: 'Email', type: 'text' },
      { title: 'Employee Id', type: 'text' },
      { title: 'Birthday', type: 'date' },
      { title: 'Gender', type: 'text' },
      { title: 'Position', type: 'text' }
    ];

    const boardName = isTestMode ? 'TEST Employees' : 'Employees';
    const description = isTestMode 
      ? 'TEST Employee directory for ABS scraper board-relations (can be deleted)'
      : 'Employee directory for ABS scraper board-relations';

    return await this.createBoardWithColumns(boardName, description, columns);
  }

  async createMSMShiftDataBoard() {
    const columns = [
      { title: 'Customer', type: 'text' },
      { title: 'Employee', type: 'text' }, // Will be changed to board_relation manually (connects to Employees board)
      { title: 'Position', type: 'text' },
      { title: 'Product', type: 'text' },
      { title: 'Sch Start', type: 'text' },
      { title: 'Sch End', type: 'text' },
      { title: 'Sch Hrs', type: 'text' },
      { title: 'Actual Start', type: 'text' },
      { title: 'Actual End', type: 'text' },
      { title: 'Actual Hrs', type: 'text' },
      { title: 'Adjusted Start', type: 'text' },
      { title: 'Adjusted End', type: 'text' },
      { title: 'Adjusted Hrs', type: 'text' },
      { title: 'Exception Types', type: 'long_text' },
      { title: 'Comments', type: 'text' },
      { title: 'Shift ID', type: 'text' },
      { title: 'Comments Logged', type: 'checkbox' }
    ];

    const boardName = isTestMode ? 'TEST MSM Shift Data' : 'MSM Shift Data';
    const description = isTestMode 
      ? 'TEST Mobile Shift Maintenance data from ABS scraper (can be deleted)'
      : 'Mobile Shift Maintenance data from ABS scraper';

    return await this.createBoardWithColumns(boardName, description, columns);
  }

  async createABSShiftDataBoard() {
    const columns = [
      { title: 'time', type: 'text' },
      { title: 'start_time', type: 'text' },
      { title: 'end_time', type: 'text' },
      { title: 'client', type: 'text' },
      { title: 'employee', type: 'text' },
      { title: 'location', type: 'text' },
      { title: 'product', type: 'text' },
      { title: 'bill_rate', type: 'text' },
      { title: 'pay_rate', type: 'text' },
      { title: 'status', type: 'status' }
    ];

    const boardName = isTestMode ? 'TEST ABS Shift Data' : 'ABS Shift Data';
    const description = isTestMode 
      ? 'TEST Schedule data from ABS scraper (can be deleted)'
      : 'Schedule data from ABS scraper';

    return await this.createBoardWithColumns(boardName, description, columns);
  }

  async updateEnvFile(boardIds) {
    const envPath = path.join(__dirname, '.env');
    
    try {
      // Read existing .env file
      const fs = await import('fs/promises');
      let envContent = '';
      
      try {
        envContent = await fs.readFile(envPath, 'utf8');
      } catch (error) {
        console.log('📝 No existing .env file found, will create one');
      }

      // Update or add board IDs
      const updates = {
        'EMPLOYEE_BOARD_ID': boardIds.employees,
        'MONDAY_MSM_BOARD_ID': boardIds.msm,
        'MONDAY_SCHEDULE_BOARD_ID': boardIds.schedule
      };

      let updatedContent = envContent;

      for (const [key, value] of Object.entries(updates)) {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        const newLine = `${key}=${value}`;
        
        if (regex.test(updatedContent)) {
          updatedContent = updatedContent.replace(regex, newLine);
        } else {
          updatedContent += `\n${newLine}`;
        }
      }

      // Write updated .env file
      await fs.writeFile(envPath, updatedContent);
      console.log('✅ Updated .env file with new board IDs');
      
    } catch (error) {
      console.error('❌ Failed to update .env file:', error.message);
      console.log('📝 Please manually add these board IDs to your .env file:');
      console.log(`EMPLOYEE_BOARD_ID=${boardIds.employees}`);
      console.log(`MONDAY_MSM_BOARD_ID=${boardIds.msm}`);
      console.log(`MONDAY_SCHEDULE_BOARD_ID=${boardIds.schedule}`);
    }
  }

  async testAPIConnection() {
    console.log('🔍 Testing Monday.com API connection...');
    
    const query = `
      query {
        me {
          id
          name
          email
        }
      }
    `;

    try {
      const result = await this.makeRequest(query);
      console.log('✅ API connection successful!');
      console.log('User info:', result.me);
      return true;
    } catch (error) {
      console.error('❌ API connection failed:', error.message);
      return false;
    }
  }

  async checkTokenPermissions() {
    console.log('🔍 Checking API token permissions...');
    
    const query = `
      query {
        me {
          id
          name
          email
          account {
            id
            name
          }
        }
        workspaces {
          id
          name
          kind
        }
      }
    `;

    try {
      const result = await this.makeRequest(query);
      console.log('✅ Token permissions check successful!');
      console.log('Account info:', result.me.account);
      console.log('Available workspaces:', result.workspaces);
      return true;
    } catch (error) {
      console.error('❌ Token permissions check failed:', error.message);
      return false;
    }
  }

  async testBoardCreation() {
    console.log('🔍 Testing board creation with minimal board...');
    
    // Try the exact same approach that worked for your existing boards
    const query = `
      mutation CreateTestBoard($name: String!) {
        create_board(
          board_name: $name,
          board_kind: private
        ) {
          id
          name
        }
      }
    `;

    const variables = {
      name: 'API Test Board - ' + new Date().toISOString()
    };

    try {
      const result = await this.makeRequest(query, variables);
      console.log('✅ Board creation test successful!');
      console.log('Created board:', result.create_board);
      return result.create_board;
    } catch (error) {
      console.error('❌ Board creation test failed:', error.message);
      
      // Let's also try to see what the exact error details are
      console.log('🔍 Full error details:', JSON.stringify(error, null, 2));
      return null;
    }
  }

  async checkExistingBoards() {
    console.log('🔍 Checking for existing boards...');
    
    const query = `
      query {
        boards(limit: 50) {
          id
          name
          description
          owner {
            id
            name
          }
        }
      }
    `;

    try {
      const result = await this.makeRequest(query);
      const boards = result.boards || [];
      
      console.log(`Found ${boards.length} existing boards:`);
      boards.forEach(board => {
        console.log(`  - ${board.name} (ID: ${board.id}) - Owner: ${board.owner?.name || 'Unknown'}`);
      });
      
      // Check if any boards were created by the current user
      const myBoards = boards.filter(board => board.owner?.id === '67165223');
      console.log(`\n📊 Boards created by you: ${myBoards.length}`);
      myBoards.forEach(board => {
        console.log(`  - ${board.name} (ID: ${board.id})`);
      });
      
      return boards;
    } catch (error) {
      console.error('❌ Failed to check existing boards:', error.message);
      return [];
    }
  }

  async getBoardColumns(boardId) {
    console.log(`🔍 Getting columns for board ${boardId}...`);
    
    const query = `
      query GetBoardColumns($boardId: ID!) {
        boards(ids: [$boardId]) {
          columns {
            id
            title
            type
            settings_str
          }
        }
      }
    `;

    try {
      const result = await this.makeRequest(query, { boardId });
      const board = result.boards[0];
      if (board && board.columns) {
        console.log(`Found ${board.columns.length} columns:`);
        board.columns.forEach(column => {
          console.log(`  - ${column.title} (${column.type})`);
        });
        return board.columns;
      }
      return [];
    } catch (error) {
      console.error(`❌ Failed to get columns for board ${boardId}:`, error.message);
      return [];
    }
  }

  async setupAllBoards() {
    if (isTestMode) {
      console.log('🧪 Starting Monday.com board setup in TEST MODE...');
      console.log('This will create 3 TEST boards: TEST Employees, TEST MSM Shift Data, and TEST ABS Shift Data');
      console.log('⚠️  These are test boards that can be safely deleted after testing\n');
    } else {
      console.log('🚀 Starting Monday.com board setup...');
      console.log('This will create 3 boards: Employees, MSM Shift Data, and ABS Shift Data\n');
    }

    try {
      // Test API connection first
      const connectionOk = await this.testAPIConnection();
      if (!connectionOk) {
        console.error('❌ Cannot proceed without valid API connection');
        process.exit(1);
      }

      // Check token permissions
      await this.checkTokenPermissions();

      // Test board creation with minimal board
      if (isTestMode) {
        const testBoard = await this.testBoardCreation();
        if (testBoard) {
          console.log('✅ Board creation works! The issue might be with the specific board creation parameters.');
          console.log('🧹 Cleaning up test board...');
          // Note: We could add board deletion here, but let's keep it simple for now
        }
      }

      if (!isTestMode) {
        // Check for existing boards only in normal mode
        const existingBoards = await this.checkExistingBoards();
        
        // Check if required boards already exist
        const requiredBoards = ['Employees', 'MSM Shift Data', 'ABS Shift Data'];
        const existingBoardNames = existingBoards.map(b => b.name);
        const missingBoards = requiredBoards.filter(name => !existingBoardNames.includes(name));
        
        if (missingBoards.length === 0) {
          console.log('✅ All required boards already exist!');
          const boardIds = {
            employees: existingBoards.find(b => b.name === 'Employees')?.id,
            msm: existingBoards.find(b => b.name === 'MSM Shift Data')?.id,
            schedule: existingBoards.find(b => b.name === 'ABS Shift Data')?.id
          };
          await this.updateEnvFile(boardIds);
          return;
        }

        console.log(`\n📋 Need to create ${missingBoards.length} boards: ${missingBoards.join(', ')}`);
      } else {
        // In test mode, let's analyze existing boards to get the correct column structure
        console.log('\n🔍 Analyzing existing boards to get correct column structure...');
        const existingBoards = await this.checkExistingBoards();
        
        const employeesBoard = existingBoards.find(b => b.name === 'Employees');
        const msmBoard = existingBoards.find(b => b.name === 'MSM Shift Data');
        const absBoard = existingBoards.find(b => b.name === 'ABS Shift Data');
        
        if (employeesBoard) {
          console.log('\n📊 Analyzing Employees board columns...');
          await this.getBoardColumns(employeesBoard.id);
        }
        
        if (msmBoard) {
          console.log('\n📊 Analyzing MSM Shift Data board columns...');
          await this.getBoardColumns(msmBoard.id);
        }
        
        if (absBoard) {
          console.log('\n📊 Analyzing ABS Shift Data board columns...');
          await this.getBoardColumns(absBoard.id);
        }
      }
      
      // Try to create boards
      try {
        const employeesBoard = await this.createEmployeesBoard();
        const msmBoard = await this.createMSMShiftDataBoard();
        const scheduleBoard = await this.createABSShiftDataBoard();

        const boardIds = {
          employees: employeesBoard.id,
          msm: msmBoard.id,
          schedule: scheduleBoard.id
        };

        // Update .env file
        await this.updateEnvFile(boardIds);

        if (isTestMode) {
          console.log('\n🎉 TEST Board creation completed successfully!');
          console.log('\n📋 Test Board Summary:');
          console.log(`   TEST Employees Board: ${employeesBoard.id}`);
          console.log(`   TEST MSM Shift Data Board: ${msmBoard.id}`);
          console.log(`   TEST ABS Shift Data Board: ${scheduleBoard.id}`);
          
          console.log('\n✅ Test boards created successfully!');
          console.log('🧪 You can now verify the board creation functionality works');
          
          console.log('\n⚠️  Manual Steps Required:');
          console.log('1. MSM Shift Data: Change "Employee" column from text to board-relation');
          console.log('   - Connect it to the Employees board for employee lookup');
          console.log('2. ABS Shift Data: Add status labels to "status" column');
          console.log('3. Check your Monday.com workspace for the TEST boards');
          console.log('4. Delete the TEST boards when done testing');
          console.log('5. Run without --test flag to use existing boards');
        } else {
          console.log('\n🎉 Board setup completed successfully!');
          console.log('\n📋 Board Summary:');
          console.log(`   Employees Board: ${employeesBoard.id}`);
          console.log(`   MSM Shift Data Board: ${msmBoard.id}`);
          console.log(`   ABS Shift Data Board: ${scheduleBoard.id}`);
          
          console.log('\n✅ Your .env file has been updated with the new board IDs');
          console.log('🚀 You can now run the scrapers!');
          
          console.log('\n⚠️  Manual Steps Required:');
          console.log('1. MSM Shift Data: Change "Employee" column from text to board-relation');
          console.log('   - Connect it to the Employees board for employee lookup');
          console.log('2. ABS Shift Data: Add status labels to "status" column');
          console.log('3. Add some employees to the Employees board');
          console.log('4. Run the scrapers: node mobile_shift_maintenance_scrape.mjs');
          console.log('5. Check your Monday.com boards for the data');
        }

      } catch (createError) {
        if (createError.message.includes('USER_UNAUTHORIZED')) {
          console.error('\n❌ Permission Error: Cannot create boards');
          console.error('\n🔧 Solution: Your API token needs workspace-level permissions');
          console.error('\n📝 To fix this:');
          console.error('1. Go to Monday.com → Your Profile (top right) → Developers');
          console.error('2. Generate a new API token');
          console.error('3. Make sure to select "Workspace" level permissions (not just "Me")');
          console.error('4. Update your .env file with the new token');
          console.error('5. Run this script again');
          console.error('\n💡 Alternative: Ask your Monday.com admin to create the boards manually');
          console.error('   Required boards: "Employees", "MSM Shift Data", "ABS Shift Data"');
        } else {
          console.error('\n❌ Board creation failed:', createError.message);
        }
        process.exit(1);
      }

    } catch (error) {
      console.error('\n❌ Board setup failed:', error.message);
      process.exit(1);
    }
  }
}

// Run the setup
const setup = new MondayBoardSetup();
setup.setupAllBoards().catch(error => {
  console.error('Setup failed:', error);
  process.exit(1);
});
