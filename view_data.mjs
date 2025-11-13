#!/usr/bin/env node
/**
 * Database Data Viewer
 * 
 * This script provides various ways to view data from the SQLite database:
 * - View all employees
 * - View all shifts
 * - View shifts by date range
 * - View specific employee's shifts
 * - Search for specific data
 */

import MSMDatabase from './database.mjs';

class DataViewer {
  constructor() {
    this.db = new MSMDatabase();
  }

  async viewAllEmployees() {
    console.log('👥 All Employees:');
    console.log('================');
    
    const employees = await this.db.getAllEmployees();
    employees.forEach((emp, index) => {
      console.log(`${index + 1}. ${emp.name}`);
      console.log(`   Email: ${emp.email || 'No email'}`);
      console.log(`   Phone: ${emp.phone || 'No phone'}`);
      console.log(`   Position: ${emp.position || 'No position'}`);
      console.log('');
    });
    
    console.log(`Total: ${employees.length} employees`);
  }

  async viewAllShifts() {
    console.log('📅 All Shifts:');
    console.log('==============');
    
    const shifts = await this.db.getShiftsByDateRange('2020-01-01', '2030-12-31');
    shifts.forEach((shift, index) => {
      console.log(`${index + 1}. ${shift.customer} - ${shift.date}`);
      console.log(`   Employee: ${shift.employee_name || 'No employee'}`);
      console.log(`   Shift ID: ${shift.shift_id}`);
      console.log(`   Scheduled: ${shift.sch_start} - ${shift.sch_end}`);
      console.log(`   Actual: ${shift.actual_start || 'N/A'} - ${shift.actual_end || 'N/A'}`);
      console.log(`   Exceptions: ${shift.exception_types || 'None'}`);
      console.log(`   Comments: ${shift.comments || 'None'}`);
      console.log('');
    });
    
    console.log(`Total: ${shifts.length} shifts`);
  }

  async viewShiftsByEmployee(employeeName) {
    console.log(`📅 Shifts for ${employeeName}:`);
    console.log('===============================');
    
    const shifts = await this.db.getShiftsByDateRange('2020-01-01', '2030-12-31');
    const employeeShifts = shifts.filter(shift => 
      shift.employee_name && shift.employee_name.toLowerCase().includes(employeeName.toLowerCase())
    );
    
    if (employeeShifts.length === 0) {
      console.log('No shifts found for this employee');
      return;
    }
    
    employeeShifts.forEach((shift, index) => {
      console.log(`${index + 1}. ${shift.customer} - ${shift.date}`);
      console.log(`   Shift ID: ${shift.shift_id}`);
      console.log(`   Scheduled: ${shift.sch_start} - ${shift.sch_end}`);
      console.log(`   Actual: ${shift.actual_start || 'N/A'} - ${shift.actual_end || 'N/A'}`);
      console.log(`   Exceptions: ${shift.exception_types || 'None'}`);
      console.log('');
    });
    
    console.log(`Total: ${employeeShifts.length} shifts for ${employeeName}`);
  }

  async viewShiftsByDate(date) {
    console.log(`📅 Shifts for ${date}:`);
    console.log('=====================');
    
    const shifts = await this.db.getShiftsByDateRange('2020-01-01', '2030-12-31');
    const dateShifts = shifts.filter(shift => shift.date === date);
    
    if (dateShifts.length === 0) {
      console.log('No shifts found for this date');
      return;
    }
    
    dateShifts.forEach((shift, index) => {
      console.log(`${index + 1}. ${shift.customer}`);
      console.log(`   Employee: ${shift.employee_name || 'No employee'}`);
      console.log(`   Shift ID: ${shift.shift_id}`);
      console.log(`   Scheduled: ${shift.sch_start} - ${shift.sch_end}`);
      console.log(`   Actual: ${shift.actual_start || 'N/A'} - ${shift.actual_end || 'N/A'}`);
      console.log('');
    });
    
    console.log(`Total: ${dateShifts.length} shifts for ${date}`);
  }

  async searchData(searchTerm) {
    console.log(`🔍 Search results for "${searchTerm}":`);
    console.log('=====================================');
    
    const shifts = await this.db.getShiftsByDateRange('2020-01-01', '2030-12-31');
    const employees = await this.db.getAllEmployees();
    
    // Search in shifts
    const matchingShifts = shifts.filter(shift => 
      shift.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (shift.employee_name && shift.employee_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (shift.comments && shift.comments.toLowerCase().includes(searchTerm.toLowerCase()))
    );
    
    // Search in employees
    const matchingEmployees = employees.filter(emp => 
      emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (emp.email && emp.email.toLowerCase().includes(searchTerm.toLowerCase()))
    );
    
    if (matchingShifts.length > 0) {
      console.log('\n📅 Matching Shifts:');
      matchingShifts.forEach((shift, index) => {
        console.log(`${index + 1}. ${shift.customer} - ${shift.date} (${shift.employee_name || 'No employee'})`);
      });
    }
    
    if (matchingEmployees.length > 0) {
      console.log('\n👥 Matching Employees:');
      matchingEmployees.forEach((emp, index) => {
        console.log(`${index + 1}. ${emp.name} (${emp.email || 'No email'})`);
      });
    }
    
    if (matchingShifts.length === 0 && matchingEmployees.length === 0) {
      console.log('No matches found');
    }
  }

  async showStats() {
    console.log('📊 Database Statistics:');
    console.log('======================');
    
    const stats = await this.db.getStats();
    console.log(`Employees: ${stats.employees}`);
    console.log(`Shifts: ${stats.shifts}`);
    console.log(`Unsynced shifts: ${stats.unsyncedShifts}`);
    
    // Show date range
    const shifts = await this.db.getShiftsByDateRange('2020-01-01', '2030-12-31');
    if (shifts.length > 0) {
      const dates = shifts.map(s => s.date).sort();
      console.log(`Date range: ${dates[0]} to ${dates[dates.length - 1]}`);
    }
  }

  async close() {
    await this.db.close();
  }
}

// CLI handling
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const param = args[1];
  
  const viewer = new DataViewer();
  
  try {
    await viewer.db.initializeSchema();
    
    switch (command) {
      case 'employees':
        await viewer.viewAllEmployees();
        break;
      case 'shifts':
        await viewer.viewAllShifts();
        break;
      case 'employee':
        if (!param) {
          console.log('❌ Please provide employee name: node view_data.mjs employee "John Doe"');
          process.exit(1);
        }
        await viewer.viewShiftsByEmployee(param);
        break;
      case 'date':
        if (!param) {
          console.log('❌ Please provide date: node view_data.mjs date "Sat, Oct 04, 2025"');
          process.exit(1);
        }
        await viewer.viewShiftsByDate(param);
        break;
      case 'search':
        if (!param) {
          console.log('❌ Please provide search term: node view_data.mjs search "John"');
          process.exit(1);
        }
        await viewer.searchData(param);
        break;
      case 'stats':
        await viewer.showStats();
        break;
      default:
        console.log('📖 Database Data Viewer');
        console.log('=======================');
        console.log('');
        console.log('Usage:');
        console.log('  node view_data.mjs employees              # View all employees');
        console.log('  node view_data.mjs shifts                 # View all shifts');
        console.log('  node view_data.mjs employee "John Doe"    # View shifts for specific employee');
        console.log('  node view_data.mjs date "Sat, Oct 04, 2025" # View shifts for specific date');
        console.log('  node view_data.mjs search "John"          # Search for data');
        console.log('  node view_data.mjs stats                  # Show database statistics');
        console.log('');
        console.log('Examples:');
        console.log('  node view_data.mjs employee "Smith"');
        console.log('  node view_data.mjs date "Fri, Oct 03, 2025"');
        console.log('  node view_data.mjs search "late"');
        break;
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await viewer.close();
  }
}

// Run if called directly
main();

export default DataViewer;
