// test_monday_integration.mjs
// Test script to verify Monday.com integration setup

import MondayIntegration from './monday_integration.mjs';
import dotenv from 'dotenv';

dotenv.config();

async function testIntegration() {
  try {
    console.log('Testing Monday.com integration...');
    
    // Check if API token is set
    if (!process.env.MONDAY_API_TOKEN) {
      console.error('❌ MONDAY_API_TOKEN not found in environment variables');
      console.log('Please add your Monday.com API token to the .env file');
      process.exit(1);
    }
    
    console.log('✅ API token found');
    
    // Test API connection
    const integration = new MondayIntegration();
    
    // Try to list boards to test connection
    const query = `
      query {
        boards(limit: 5) {
          id
          name
        }
      }
    `;
    
    const data = await integration.makeRequest(query);
    console.log('✅ Successfully connected to Monday.com API');
    console.log(`Found ${data.boards.length} boards in your workspace`);
    
    // Check if our target board exists
    const targetBoard = await integration.findBoardByName('ABS Shift Data');
    if (targetBoard) {
      console.log(`✅ Target board "ABS Shift Data" found (ID: ${targetBoard.id})`);
    } else {
      console.log('ℹ️  Target board "ABS Shift Data" not found (will be created on first sync)');
    }
    
    console.log('\n🎉 Monday.com integration is ready!');
    console.log('Run "npm run sync-monday" to sync your data');
    
  } catch (error) {
    console.error('❌ Integration test failed:', error.message);
    
    if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      console.log('\n💡 This usually means your API token is invalid or expired');
      console.log('Please check your MONDAY_API_TOKEN in the .env file');
    } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
      console.log('\n💡 This usually means your API token lacks required permissions');
      console.log('Make sure your token has permissions to read and create boards');
    }
    
    process.exit(1);
  }
}

testIntegration();
