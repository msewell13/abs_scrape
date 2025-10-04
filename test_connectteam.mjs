import dotenv from 'dotenv';
dotenv.config();

// Test ConnectTeam integration directly
import ConnectTeamIntegration from './connectteam_integration.mjs';

async function testConnectTeam() {
  try {
    const connectTeam = new ConnectTeamIntegration();
    
    // Test with a sample record
    const testRecord = {
      'Employee': 'Baldwin, David',
      'Customer': 'Test Client',
      'Date': '2025-01-02',
      'Exception Types': 'Late Clock In, Early Clock Out',
      'Sch Start': '08:00 AM',
      'Actual Start': '08:15 AM',
      'Sch End': '05:00 PM',
      'Actual End': '04:45 PM'
    };
    
    // Test with a known CTUserId (Baldwin, David has ID 12941471)
    const ctUserId = '12941471';
    
    console.log('Testing ConnectTeam notification...');
    console.log('Record:', testRecord);
    console.log('CTUserId:', ctUserId);
    
    await connectTeam.sendShiftNotification(testRecord, ctUserId);
    console.log('✅ ConnectTeam notification sent successfully!');
    
  } catch (error) {
    console.error('❌ ConnectTeam test failed:', error.message);
  }
}

testConnectTeam();

