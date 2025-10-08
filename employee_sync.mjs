// employee_sync.mjs
// One-way sync from ConnectTeam to Monday.com for employee data
// This module handles fetching employees from both systems and syncing them

import dotenv from 'dotenv';

dotenv.config();

const MONDAY_API_URL = 'https://api.monday.com/v2';
const CONNECTEAM_API_URL = 'https://api.connecteam.com';
const MONDAY_API_TOKEN = process.env.MONDAY_API_TOKEN;
const CT_API_KEY = process.env.CT_API_KEY;
const EMPLOYEE_BOARD_ID = process.env.EMPLOYEE_BOARD_ID;

class EmployeeSync {
  constructor() {
    if (!MONDAY_API_TOKEN) {
      throw new Error('MONDAY_API_TOKEN environment variable is required');
    }
    if (!CT_API_KEY) {
      throw new Error('CT_API_KEY environment variable is required');
    }
    if (!EMPLOYEE_BOARD_ID) {
      throw new Error('EMPLOYEE_BOARD_ID environment variable is required');
    }

    this.mondayHeaders = {
      'Authorization': MONDAY_API_TOKEN,
      'Content-Type': 'application/json',
      'API-Version': '2024-07'
    };

    this.connectTeamHeaders = {
      'X-API-Key': CT_API_KEY,
      'Content-Type': 'application/json'
    };
  }

  async makeMondayRequest(query, variables = {}) {
    const response = await fetch(MONDAY_API_URL, {
      method: 'POST',
      headers: this.mondayHeaders,
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

  async makeConnectTeamRequest(endpoint) {
    const response = await fetch(`${CONNECTEAM_API_URL}${endpoint}`, {
      method: 'GET',
      headers: this.connectTeamHeaders
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ConnectTeam API Error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    return await response.json();
  }

  async getMondayEmployees() {
    console.log('📋 Fetching employees from Monday.com...');
    
    const allEmployees = [];
    let cursor = null;
    const limit = 500; // Monday.com API limit
    
    do {
      const query = `
        query GetEmployees($boardId: ID!, $limit: Int!, $cursor: String) {
          boards(ids: [$boardId]) {
            items_page(limit: $limit, cursor: $cursor) {
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
      
      const variables = {
        boardId: EMPLOYEE_BOARD_ID,
        limit,
        cursor
      };
      
      const data = await this.makeMondayRequest(query, variables);
      const itemsPage = data.boards[0].items_page;
      
      allEmployees.push(...itemsPage.items);
      cursor = itemsPage.cursor;
      
      console.log(`   Fetched ${itemsPage.items.length} employees (total: ${allEmployees.length})`);
      
    } while (cursor);
    
    // Get column mapping first
    const columns = await this.getBoardColumns();
    const columnMapping = new Map();
    columns.forEach(col => {
      columnMapping.set(col.id, col.title);
    });
    
    // Transform to a more usable format
    const employees = allEmployees.map(item => {
      const employee = {
        mondayId: item.id,
        name: item.name
      };
      
      // Extract column values
      for (const cv of item.column_values) {
        if (cv.text) {
          // Map common column titles to properties
          const columnTitle = columnMapping.get(cv.id);
          if (columnTitle) {
            switch (columnTitle) {
              case 'CTUserId':
                employee.connectTeamId = cv.text;
                break;
              case 'Email':
                employee.email = cv.text;
                break;
              case 'Phone':
                employee.phone = cv.text;
                break;
              case 'Employee Id':
                employee.employeeId = cv.text;
                break;
              case 'Position':
                employee.position = cv.text;
                break;
              case 'Gender':
                employee.gender = cv.text;
                break;
              case 'Kiosk code':
                employee.kioskCode = cv.text;
                break;
              case 'Employment Start Date':
                employee.employmentStartDate = cv.text;
                break;
              case 'Birthday':
                employee.birthday = cv.text;
                break;
            }
          }
        }
      }
      
      return employee;
    });
    
    console.log(`✅ Found ${employees.length} employees in Monday.com`);
    return employees;
  }

  async getConnectTeamUsers() {
    console.log('📋 Fetching users from ConnectTeam...');
    
    try {
      const response = await this.makeConnectTeamRequest('/users/v1/users?limit=500');
      
      // Handle ConnectTeam API response format
      let users = [];
      if (response.data && response.data.users && Array.isArray(response.data.users)) {
        users = response.data.users;
      } else if (response.data && Array.isArray(response.data)) {
        users = response.data;
      } else if (Array.isArray(response)) {
        users = response;
      } else if (response.users && Array.isArray(response.users)) {
        users = response.users;
      } else {
        console.log('Unexpected ConnectTeam response format:', typeof response);
        return [];
      }
      
      console.log(`✅ Found ${users.length} users in ConnectTeam`);
      return users;
    } catch (error) {
      console.error('❌ Failed to fetch ConnectTeam users:', error.message);
      return [];
    }
  }

  async getBoardColumns() {
    const query = `
      query GetBoardColumns($boardId: ID!) {
        boards(ids: [$boardId]) {
          columns {
            id
            title
            type
          }
        }
      }
    `;
    
    const data = await this.makeMondayRequest(query, { boardId: EMPLOYEE_BOARD_ID });
    return data.boards[0].columns;
  }

  getCustomFieldValue(user, fieldName) {
    if (!user.customFields || !Array.isArray(user.customFields)) {
      return null;
    }
    
    const field = user.customFields.find(f => f.name === fieldName);
    if (!field) {
      return null;
    }
    
    // Handle different field types
    if (field.type === 'dropdown' && Array.isArray(field.value) && field.value.length > 0) {
      return field.value[0].value;
    } else if (field.type === 'str') {
      return field.value;
    } else if (field.type === 'date' || field.type === 'birthday') {
      // Convert MM/DD/YYYY to YYYY-MM-DD for Monday.com
      return this.convertDateFormat(field.value);
    }
    
    return field.value;
  }

  convertDateFormat(dateString) {
    if (!dateString) return null;
    
    // Convert MM/DD/YYYY to YYYY-MM-DD
    const parts = dateString.split('/');
    if (parts.length === 3) {
      const month = parts[0].padStart(2, '0');
      const day = parts[1].padStart(2, '0');
      const year = parts[2];
      return `${year}-${month}-${day}`;
    }
    
    return dateString; // Return as-is if format is unexpected
  }

  hasEmployeeDataChanged(mondayEmployee, connectTeamUser) {
    // Compare key fields to detect changes
    const changes = [];
    
    // Helper function to normalize values for comparison
    const normalizeValue = (value) => {
      if (value === null || value === undefined || value === '' || value === 'undefined') {
        return null;
      }
      return value;
    };
    
    // Check name
    const expectedName = `${connectTeamUser.lastName}, ${connectTeamUser.firstName}`;
    if (mondayEmployee.name !== expectedName) {
      changes.push(`name: "${mondayEmployee.name}" → "${expectedName}"`);
    }
    
    // Check ConnectTeam ID
    const expectedCtId = connectTeamUser.userId?.toString();
    if (mondayEmployee.connectTeamId !== expectedCtId) {
      changes.push(`CTUserId: "${mondayEmployee.connectTeamId}" → "${expectedCtId}"`);
    }
    
    // Check email
    if (mondayEmployee.email !== connectTeamUser.email) {
      changes.push(`email: "${mondayEmployee.email}" → "${connectTeamUser.email}"`);
    }
    
    // Check phone
    if (mondayEmployee.phone !== connectTeamUser.phoneNumber) {
      changes.push(`phone: "${mondayEmployee.phone}" → "${connectTeamUser.phoneNumber}"`);
    }
    
    // Check employee ID
    const expectedEmployeeId = this.getCustomFieldValue(connectTeamUser, 'Employee ID');
    const normalizedEmployeeId = normalizeValue(mondayEmployee.employeeId);
    const normalizedExpectedEmployeeId = normalizeValue(expectedEmployeeId);
    if (normalizedEmployeeId !== normalizedExpectedEmployeeId) {
      changes.push(`employeeId: "${mondayEmployee.employeeId}" → "${expectedEmployeeId}"`);
    }
    
    // Check position
    const expectedPosition = this.getCustomFieldValue(connectTeamUser, 'Position');
    const normalizedPosition = normalizeValue(mondayEmployee.position);
    const normalizedExpectedPosition = normalizeValue(expectedPosition);
    if (normalizedPosition !== normalizedExpectedPosition) {
      changes.push(`position: "${mondayEmployee.position}" → "${expectedPosition}"`);
    }
    
    // Check gender
    const expectedGender = this.getCustomFieldValue(connectTeamUser, 'Gender');
    const normalizedGender = normalizeValue(mondayEmployee.gender);
    const normalizedExpectedGender = normalizeValue(expectedGender);
    if (normalizedGender !== normalizedExpectedGender) {
      changes.push(`gender: "${mondayEmployee.gender}" → "${expectedGender}"`);
    }
    
    // Check kiosk code
    if (mondayEmployee.kioskCode !== connectTeamUser.kioskCode) {
      changes.push(`kioskCode: "${mondayEmployee.kioskCode}" → "${connectTeamUser.kioskCode}"`);
    }
    
    // Check employment start date
    const expectedStartDate = this.getCustomFieldValue(connectTeamUser, 'Employment Start Date');
    const normalizedStartDate = normalizeValue(mondayEmployee.employmentStartDate);
    const normalizedExpectedStartDate = normalizeValue(expectedStartDate);
    if (normalizedStartDate !== normalizedExpectedStartDate) {
      changes.push(`employmentStartDate: "${mondayEmployee.employmentStartDate}" → "${expectedStartDate}"`);
    }
    
    // Check birthday
    const expectedBirthday = this.getCustomFieldValue(connectTeamUser, 'Birthday');
    const normalizedBirthday = normalizeValue(mondayEmployee.birthday);
    const normalizedExpectedBirthday = normalizeValue(expectedBirthday);
    if (normalizedBirthday !== normalizedExpectedBirthday) {
      changes.push(`birthday: "${mondayEmployee.birthday}" → "${expectedBirthday}"`);
    }
    
    if (changes.length > 0) {
      console.log(`   🔍 Changes detected for ${mondayEmployee.name}:`);
      changes.forEach(change => console.log(`      - ${change}`));
      return true;
    }
    
    return false;
  }


  async createEmployeeInMonday(connectTeamUser) {
    console.log(`   Creating employee: ${connectTeamUser.firstName} ${connectTeamUser.lastName}`);
    
    // Get board columns to map data correctly
    const columns = await this.getBoardColumns();
    
    // Create column values mapping
    const columnValues = {};
    
    // Map ConnectTeam user data to Monday.com columns
    columns.forEach(column => {
      let value = null;
      
      switch (column.title) {
        case 'CTUserId':
          value = connectTeamUser.userId?.toString();
          break;
        case 'Email':
          value = connectTeamUser.email;
          break;
        case 'Phone':
          value = connectTeamUser.phoneNumber;
          break;
        case 'Employee Id':
          value = this.getCustomFieldValue(connectTeamUser, 'Employee ID');
          break;
        case 'Position':
          value = this.getCustomFieldValue(connectTeamUser, 'Position');
          break;
        case 'Gender':
          value = this.getCustomFieldValue(connectTeamUser, 'Gender');
          break;
        case 'Kiosk code':
          value = connectTeamUser.kioskCode;
          break;
        case 'Employment Start Date':
          value = this.getCustomFieldValue(connectTeamUser, 'Employment Start Date');
          break;
        case 'Birthday':
          value = this.getCustomFieldValue(connectTeamUser, 'Birthday');
          break;
      }
      
      if (value !== null && value !== undefined) {
        columnValues[column.id] = value;
      }
    });
    
    const query = `
      mutation CreateEmployee($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
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
      boardId: EMPLOYEE_BOARD_ID,
      itemName: `${connectTeamUser.lastName}, ${connectTeamUser.firstName}`,
      columnValues: JSON.stringify(columnValues)
    };
    
    try {
      const result = await this.makeMondayRequest(query, variables);
      console.log(`   ✅ Created employee with ID: ${result.create_item.id}`);
      return result.create_item;
    } catch (error) {
      console.error(`   ❌ Failed to create employee: ${error.message}`);
      return null;
    }
  }

  async updateEmployeeInMonday(mondayEmployee, connectTeamUser) {
    console.log(`   Updating employee: ${mondayEmployee.name}`);
    
    // Get board columns to map data correctly
    const columns = await this.getBoardColumns();
    
    // Create column values mapping for update
    const columnValues = {};
    let hasChanges = false;
    
    // Map ConnectTeam user data to Monday.com columns
    columns.forEach(column => {
      let newValue = null;
      
      switch (column.title) {
        case 'CTUserId':
          newValue = connectTeamUser.userId?.toString();
          break;
        case 'Email':
          newValue = connectTeamUser.email;
          break;
        case 'Phone':
          newValue = connectTeamUser.phoneNumber;
          break;
        case 'Employee Id':
          newValue = this.getCustomFieldValue(connectTeamUser, 'Employee ID');
          break;
        case 'Position':
          newValue = this.getCustomFieldValue(connectTeamUser, 'Position');
          break;
        case 'Gender':
          newValue = this.getCustomFieldValue(connectTeamUser, 'Gender');
          break;
        case 'Kiosk code':
          newValue = connectTeamUser.kioskCode;
          break;
        case 'Employment Start Date':
          newValue = this.getCustomFieldValue(connectTeamUser, 'Employment Start Date');
          break;
        case 'Birthday':
          newValue = this.getCustomFieldValue(connectTeamUser, 'Birthday');
          break;
      }
      
      if (newValue !== null && newValue !== undefined) {
        // Check if value has changed
        const currentValue = mondayEmployee[column.title.toLowerCase().replace(/\s+/g, '')] || 
                           mondayEmployee[column.title.toLowerCase().replace(/\s+/g, '')];
        
        if (currentValue !== newValue) {
          columnValues[column.id] = newValue;
          hasChanges = true;
        }
      }
    });
    
    if (!hasChanges) {
      console.log(`   ⏭️  No changes needed for ${mondayEmployee.name}`);
      return mondayEmployee;
    }
    
    const query = `
      mutation UpdateEmployee($itemId: ID!, $boardId: ID!, $itemName: JSON!, $columnValues: JSON!) {
        change_column_value(
          item_id: $itemId,
          board_id: $boardId,
          column_id: "name",
          value: $itemName
        ) {
          id
        }
        change_multiple_column_values(
          item_id: $itemId,
          board_id: $boardId,
          column_values: $columnValues
        ) {
          id
        }
      }
    `;
    
    const variables = {
      itemId: mondayEmployee.mondayId,
      boardId: EMPLOYEE_BOARD_ID,
      itemName: JSON.stringify(`${connectTeamUser.lastName}, ${connectTeamUser.firstName}`),
      columnValues: JSON.stringify(columnValues)
    };
    
    try {
      await this.makeMondayRequest(query, variables);
      console.log(`   ✅ Updated employee: ${mondayEmployee.name}`);
      return mondayEmployee;
    } catch (error) {
      console.error(`   ❌ Failed to update employee: ${error.message}`);
      return null;
    }
  }

  async syncEmployees() {
    console.log('🔄 Starting employee sync from ConnectTeam to Monday.com...\n');
    
    try {
      // Fetch data from both systems
      const [mondayEmployees, connectTeamUsers] = await Promise.all([
        this.getMondayEmployees(),
        this.getConnectTeamUsers()
      ]);
      
      // Create lookup maps
      const mondayByConnectTeamId = new Map();
      const mondayByEmployeeId = new Map();
      
      mondayEmployees.forEach(emp => {
        if (emp.connectTeamId) {
          mondayByConnectTeamId.set(emp.connectTeamId, emp);
        }
        if (emp.employeeId) {
          mondayByEmployeeId.set(emp.employeeId, emp);
        }
      });
      
      // Track sync results
      let created = 0;
      let updated = 0;
      let skipped = 0;
      let errors = 0;
      
      console.log(`\n📊 Sync Summary:`);
      console.log(`   Monday.com employees: ${mondayEmployees.length}`);
      console.log(`   ConnectTeam users: ${connectTeamUsers.length}\n`);
      
      // Process each ConnectTeam user
      for (const ctUser of connectTeamUsers) {
        const fullName = `${ctUser.lastName}, ${ctUser.firstName}`;
        const ctUserId = ctUser.userId?.toString();
        const employeeId = this.getCustomFieldValue(ctUser, 'Employee ID');
        
        try {
          // Matching strategy:
          // 1. First try to match by ConnectTeam ID (most reliable)
          // 2. If not found, try to match by Employee ID (fallback)
          // 3. If still not found, create new employee
          let mondayEmployee = mondayByConnectTeamId.get(ctUserId);
          
          // If not found by ConnectTeam ID, try to match by Employee ID
          if (!mondayEmployee && employeeId) {
            mondayEmployee = mondayByEmployeeId.get(employeeId);
          }
          
      if (mondayEmployee) {
        // Check if employee data has changed before updating
        const hasChanges = this.hasEmployeeDataChanged(mondayEmployee, ctUser);
        if (hasChanges) {
          const result = await this.updateEmployeeInMonday(mondayEmployee, ctUser);
          if (result) {
            updated++;
          } else {
            errors++;
          }
        } else {
          console.log(`   ⏭️  No changes detected for ${fullName}`);
          skipped++;
        }
      } else {
        // Create new employee
        const result = await this.createEmployeeInMonday(ctUser);
        if (result) {
          created++;
        } else {
          errors++;
        }
      }
          
        } catch (error) {
          console.error(`❌ Error processing ${fullName}: ${error.message}`);
          errors++;
        }
      }
      
      console.log(`\n✅ Employee sync completed!`);
      console.log(`   Created: ${created}`);
      console.log(`   Updated: ${updated}`);
      console.log(`   Skipped: ${skipped}`);
      console.log(`   Errors: ${errors}`);
      
      return {
        created,
        updated,
        skipped,
        errors,
        total: connectTeamUsers.length
      };
      
    } catch (error) {
      console.error('❌ Employee sync failed:', error.message);
      throw error;
    }
  }
}

export default EmployeeSync;
