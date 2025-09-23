// fix_monday_permissions.mjs
// Script to help fix Monday.com API permissions and provide alternatives

import dotenv from 'dotenv';

dotenv.config();

const MONDAY_API_TOKEN = process.env.MONDAY_API_TOKEN;

async function checkPermissions() {
  console.log('🔍 Checking Monday.com API permissions...\n');
  
  if (!MONDAY_API_TOKEN) {
    console.log('❌ No API token found. Please add MONDAY_API_TOKEN to your .env file');
    return;
  }

  try {
    const response = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Authorization': MONDAY_API_TOKEN,
        'Content-Type': 'application/json',
        'API-Version': '2024-07'
      },
      body: JSON.stringify({
        query: `
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
          }
        `
      })
    });

    const data = await response.json();
    
    if (data.errors) {
      console.log('❌ API Error:', data.errors[0].message);
      return;
    }

    const user = data.data.me;
    console.log('✅ API token is valid');
    console.log(`👤 User: ${user.name} (${user.email})`);
    console.log(`🏢 Account: ${user.account.name}`);
    
    // Check if user can create boards
    console.log('\n🔍 Testing board creation permissions...');
    
    const boardResponse = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Authorization': MONDAY_API_TOKEN,
        'Content-Type': 'application/json',
        'API-Version': '2024-07'
      },
      body: JSON.stringify({
        query: `
          mutation {
            create_board(
              board_name: "Test Board - Delete Me",
              board_kind: private
            ) {
              id
              name
            }
          }
        `
      })
    });

    const boardData = await boardResponse.json();
    
    if (boardData.errors) {
      console.log('❌ Cannot create boards:', boardData.errors[0].message);
      console.log('\n🔧 SOLUTIONS:');
      console.log('1. Ask your Monday.com admin to grant "Create boards" permission');
      console.log('2. Upgrade to a plan that allows board creation');
      console.log('3. Use an existing board by setting MONDAY_BOARD_ID in .env');
      console.log('4. Create the board manually and use option 3');
      
      console.log('\n📋 To use an existing board:');
      console.log('1. Go to any board in Monday.com');
      console.log('2. Look at the URL: https://yourcompany.monday.com/boards/1234567890');
      console.log('3. Copy the number (1234567890)');
      console.log('4. Add to .env: MONDAY_BOARD_ID=1234567890');
      
    } else {
      console.log('✅ Can create boards!');
      console.log(`📋 Created test board: ${boardData.data.create_board.name} (ID: ${boardData.data.create_board.id})`);
      
      // Clean up the test board
      console.log('🧹 Cleaning up test board...');
      await fetch('https://api.monday.com/v2', {
        method: 'POST',
        headers: {
          'Authorization': MONDAY_API_TOKEN,
          'Content-Type': 'application/json',
          'API-Version': '2024-07'
        },
        body: JSON.stringify({
          query: `
            mutation {
              delete_board(board_id: ${boardData.data.create_board.id}) {
                id
              }
            }
          `
        })
      });
      console.log('✅ Test board deleted');
    }
    
  } catch (error) {
    console.log('❌ Error checking permissions:', error.message);
  }
}

checkPermissions();
