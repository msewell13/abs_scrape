import MSMMondayIntegration from './msm_monday_integration.mjs';
import dotenv from 'dotenv';

dotenv.config();

async function debugExtraction() {
  const mondayIntegration = new MSMMondayIntegration();
  
  try {
    console.log('🔍 Debugging data extraction...');
    
    const employeeBoardId = process.env.MONDAY_EMPLOYEES_BOARD_ID || process.env.EMPLOYEE_BOARD_ID;
    console.log(`Employee Board ID: ${employeeBoardId}`);
    
    // Get board columns
    const columns = await mondayIntegration.getBoardColumns(employeeBoardId);
    console.log(`Found ${columns.length} columns`);
    
    // Get employees
    const employees = await mondayIntegration.getBoardItems(employeeBoardId);
    console.log(`Found ${employees.length} employees`);
    
    // Test extraction on first employee
    const testEmployee = employees[0];
    console.log(`\n🧪 Testing extraction on: ${testEmployee.name}`);
    
    // Simulate the extraction process
    const data = {
      monday_item_id: testEmployee.id,
      name: testEmployee.name,
      email: null,
      phone: null,
      connectteam_user_id: null,
      position: null,
      kiosk_code: null,
      employee_id: null,
      employment_start_date: null,
      birthday: null,
      gender: null,
      location: null,
      status: 'active'
    };
    
    console.log('\n📋 Processing column values:');
    for (const columnValue of testEmployee.column_values) {
      const column = columns.find(col => col.id === columnValue.id);
      if (!column) {
        console.log(`  ⚠️ Column not found for ID: ${columnValue.id}`);
        continue;
      }
      
      const value = columnValue.text;
      console.log(`  - "${column.title}": "${value}"`);
      
      // Test the switch statement
      switch (column.title) {
        case 'Email':
          data.email = value;
          console.log(`    ✅ Mapped to email: ${value}`);
          break;
        case 'Phone':
          data.phone = value;
          console.log(`    ✅ Mapped to phone: ${value}`);
          break;
        case 'CTUserId':
          data.connectteam_user_id = value;
          console.log(`    ✅ Mapped to connectteam_user_id: ${value}`);
          break;
        case 'Position':
          data.position = value;
          console.log(`    ✅ Mapped to position: ${value}`);
          break;
        case 'Kiosk code':
          data.kiosk_code = value;
          console.log(`    ✅ Mapped to kiosk_code: ${value}`);
          break;
        case 'Employee Id':
          data.employee_id = value;
          console.log(`    ✅ Mapped to employee_id: ${value}`);
          break;
        case 'Employment Start Date':
          data.employment_start_date = value;
          console.log(`    ✅ Mapped to employment_start_date: ${value}`);
          break;
        case 'Birthday':
          data.birthday = value;
          console.log(`    ✅ Mapped to birthday: ${value}`);
          break;
        case 'Gender':
          data.gender = value;
          console.log(`    ✅ Mapped to gender: ${value}`);
          break;
        case 'Location':
          data.location = value;
          console.log(`    ✅ Mapped to location: ${value}`);
          break;
        default:
          console.log(`    ⚠️ No mapping for: "${column.title}"`);
      }
    }
    
    console.log('\n📊 Final extracted data:');
    console.log(JSON.stringify(data, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

debugExtraction();


