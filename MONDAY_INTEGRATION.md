# Monday.com Integration

This integration automatically syncs scraped shift data to Monday.com, creating a board with columns that match the JSON structure.

## Setup

### 1. Get Monday.com API Token

1. Go to [Monday.com Developer](https://developer.monday.com/)
2. Sign in to your Monday.com account
3. Go to "My Account" → "API" → "Generate Token"
4. Copy the generated token

### 2. Add Token to Environment

Add your Monday.com API token to your `.env` file:

```bash
# Existing variables
ABS_USER=your.username
ABS_PASS=your.password
ABS_LOGIN_URL=https://abs.brightstarcare.com/Account/Login
ABS_SCHEDULE_URL=https://abs.brightstarcare.com/schedule/schedulemaster.aspx

# Monday.com integration
MONDAY_API_TOKEN=your_monday_api_token_here
```

### 3. Run the Integration

```bash
# Scrape data first
npm run scrape

# Then sync to Monday.com
npm run sync-monday
```

## Features

### Board Creation
- Automatically creates a board named "ABS Shift Data" if it doesn't exist
- Creates columns matching all JSON fields with appropriate types:
  - `date` → Date column
  - `time`, `start_time`, `end_time` → Text columns
  - `client`, `employee`, `location`, `product` → Text columns
  - `bill_rate`, `pay_rate` → Text columns
  - `status` → Status column with color coding (Open=red, Assigned=green, Completed=blue)

### Duplicate Prevention
- Checks existing items before creating new ones
- Uses combination of `client - employee - date` as unique identifier
- Skips items that already exist

### Error Handling
- Continues processing even if individual items fail
- Provides detailed logging of successes and failures
- Rate limiting to avoid API limits

## Usage

### Basic Sync
```bash
npm run sync-monday
```

### Programmatic Usage
```javascript
import MondayIntegration from './monday_integration.mjs';

const integration = new MondayIntegration();
await integration.syncData('./month_block.json');
```

## Board Structure

The created board will have these columns:
- **Date** (Date) - Shift date
- **Time** (Text) - Full time range
- **Start Time** (Text) - Start time
- **End Time** (Text) - End time
- **Client** (Text) - Client name
- **Employee** (Text) - Employee name
- **Location** (Text) - Work location
- **Product** (Text) - Service/product type
- **Bill Rate** (Text) - Billing rate
- **Pay Rate** (Text) - Pay rate
- **Status** (Status) - Shift status with color coding

## Troubleshooting

### Common Issues

1. **"MONDAY_API_TOKEN environment variable is required"**
   - Make sure you've added the token to your `.env` file
   - Restart your terminal/IDE after adding the token

2. **"Monday.com API Error"**
   - Check that your API token is valid and has the right permissions
   - Ensure you have access to create boards in your Monday.com workspace

3. **Rate limiting errors**
   - The integration includes built-in delays, but if you're still hitting limits, increase the delay in the code

### API Permissions Required

Your Monday.com API token needs these permissions:
- Read boards
- Create boards
- Create items
- Update items

## Development

The integration is built with:
- Monday.com GraphQL API v2024-01
- Node.js fetch API
- ES6 modules

To modify column types or add new features, edit `monday_integration.mjs`.
