# Employee Sync Documentation

This document describes the employee synchronization functionality that syncs employee data from ConnectTeam to Monday.com.

## Overview

The employee sync system provides one-way synchronization from ConnectTeam to Monday.com, ensuring that employee data in the Monday.com "Employees" board is kept up-to-date with the source of truth in ConnectTeam.

## Features

- **One-way sync**: ConnectTeam → Monday.com (ConnectTeam is the source of truth)
- **Automatic matching**: Matches employees by ConnectTeam ID first, then by Employee ID
- **Create new employees**: Adds new employees from ConnectTeam to Monday.com
- **Update existing employees**: Updates existing employee data when changes are detected
- **Error handling**: Continues processing even if individual employees fail
- **Detailed logging**: Provides comprehensive sync statistics

## Files

### Core Files

- `employee_sync.mjs` - Main sync logic and API integration
- `sync_employees.mjs` - Standalone script to run employee sync manually
- `install.mjs` - Updated to include employee sync during board setup
- `mobile_shift_maintenance_scrape.mjs` - Updated to sync employees at start of scraping

### Integration Points

1. **Install Script**: Runs employee sync after creating Monday.com boards
2. **MSM Scraper**: Runs employee sync at the beginning of each scraping session

## Usage

### Manual Sync

Run employee sync manually using the npm script:

```bash
npm run sync-employees
```

Or run the script directly:

```bash
node sync_employees.mjs
```

### Automatic Sync

Employee sync runs automatically in two scenarios:

1. **During installation**: After Monday.com boards are created
2. **During MSM scraping**: At the beginning of each scraping session

## Configuration

### Required Environment Variables

```env
MONDAY_API_TOKEN=your_monday_api_token
CT_API_KEY=your_connectteam_api_key
EMPLOYEE_BOARD_ID=your_employee_board_id
```

### Monday.com Board Structure

The employee sync expects the following columns in the "Employees" board:

- **Name** (first column) - Employee name in "Last, First" format
- **CTUserId** - ConnectTeam user ID
- **Email** - Employee email address
- **Phone** - Employee phone number
- **Employee Id** - Internal employee ID
- **Position** - Job position/title
- **Gender** - Employee gender
- **Kiosk code** - Kiosk access code
- **Employment Start Date** - Date employee started
- **Birthday** - Employee birthday

## API Integration

### Monday.com API

Uses the Monday.com GraphQL API v2 with the following operations:
- `items_page` - Paginated fetching of board items
- `create_item` - Creating new employee records
- `change_column_value` - Updating employee data
- `change_multiple_column_values` - Bulk updating employee data

### ConnectTeam API

Uses the ConnectTeam REST API:
- `GET /users/v1/users` - Fetching all users

## Sync Process

1. **Fetch Data**: Retrieves employees from both Monday.com and ConnectTeam
2. **Create Lookups**: Builds maps for efficient matching by ConnectTeam ID and Employee ID
3. **Process Each User**: For each ConnectTeam user:
   - Try to match by ConnectTeam ID
   - If not found, try to match by Employee ID
   - If found, update existing employee
   - If not found, create new employee
4. **Report Results**: Provides detailed statistics on sync results

## Error Handling

- **API Errors**: Logged but don't stop the sync process
- **Individual Failures**: Logged but processing continues
- **Missing Data**: Gracefully handles missing or null values
- **Network Issues**: Includes timeout and retry logic

## Logging

The sync process provides detailed logging:

```
🔄 Starting employee sync from ConnectTeam to Monday.com...

📋 Fetching employees from Monday.com...
   Fetched 25 employees (total: 25)
✅ Found 25 employees in Monday.com

📋 Fetching users from ConnectTeam...
✅ Found 50 users in ConnectTeam

📊 Sync Summary:
   Monday.com employees: 25
   ConnectTeam users: 50

   Creating employee: John Doe
   ✅ Created employee with ID: 1234567890
   Updating employee: Jane Smith
   ✅ Updated employee: Jane Smith

✅ Employee sync completed!
   Created: 25
   Updated: 20
   Errors: 0
```

## Troubleshooting

### Common Issues

1. **Missing Environment Variables**
   - Ensure all required environment variables are set
   - Check that the .env file is in the correct location

2. **API Authentication Errors**
   - Verify Monday.com API token has correct permissions
   - Check ConnectTeam API key is valid and active

3. **Board Not Found**
   - Ensure EMPLOYEE_BOARD_ID is set correctly
   - Verify the board exists and is accessible

4. **Column Mapping Issues**
   - Check that the Monday.com board has the expected columns
   - Verify column titles match exactly (case-sensitive)

### Debug Mode

To enable more detailed logging, you can modify the sync functions to include additional debug information.

## Future Enhancements

Potential improvements for the employee sync system:

1. **Two-way sync**: Sync changes from Monday.com back to ConnectTeam
2. **Conflict resolution**: Handle cases where data differs between systems
3. **Incremental sync**: Only sync changed records since last sync
4. **Webhook integration**: Real-time sync when data changes
5. **Bulk operations**: More efficient handling of large employee datasets
6. **Data validation**: Validate data before syncing
7. **Sync history**: Track sync history and changes over time
