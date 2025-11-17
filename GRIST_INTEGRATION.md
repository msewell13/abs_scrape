# Grist Integration

This repository includes integration with Grist for automatically sending scraper results to Grist tables.

## Files

- `grist_client.js` - Grist API client library (Node.js)
- `grist_integration.js` - Script to send JSON/CSV files to Grist
- `scripts/run_with_grist.js` - Node.js script to run scrapers and send to Grist
- `scripts/run_with_grist.sh` - Bash wrapper script (optional)

## Setup

1. **Install Node.js dependencies (already included):**
   ```bash
   npm install
   ```
   
   No additional dependencies needed - uses Node.js built-in modules only!

2. **Set environment variables:**
   ```bash
   export GRIST_API_KEY=your_api_key_here
   export GRIST_SERVER=https://grist.pythonfinancial.com
   export GRIST_ORG=brightstar  # Optional, defaults to brightstar
   ```

3. **Get your Grist API key:**
   - Log in to your Grist instance
   - Go to Profile Settings → API
   - Generate a new API key

## Usage

### Option 1: Use the npm script (recommended)

```bash
export GRIST_API_KEY=your_key
export GRIST_SERVER=https://grist.pythonfinancial.com
npm run scrape-with-grist
```

Or use the Node.js script directly:
```bash
node scripts/run_with_grist.js
```

This will:
- Run all scrapers (MSM and Schedule)
- Automatically send results to Grist tables

### Option 2: Run scrapers manually, then send to Grist

```bash
# Run scraper
npm run scrape-msm

# Send to Grist
node grist_integration.js \
  --api-key $GRIST_API_KEY \
  --server $GRIST_SERVER \
  --doc "ABS_Data" \
  --table "MSM_Results" \
  msm_results.json
```

### Option 3: Use in your scraper code

```javascript
const { GristClient, inferColumnsFromData } = require('./grist_client');

const client = new GristClient(
    process.env.GRIST_API_KEY,
    'https://grist.pythonfinancial.com',
    'brightstar'
);

// Get or create document
const doc = await client.getOrCreateDocument('ABS_Data');

// Prepare your data
const data = [{ column1: 'value1', column2: 123 }];

// Infer columns and ensure table exists
const columns = inferColumnsFromData(data);
await client.ensureTable(doc.id, 'MSM_Results', columns);

// Add records
await client.addRecords(doc.id, 'MSM_Results', data);
```

## Grist Tables Created

The integration automatically creates:

- **Document:** `ABS_Data` (or value of `GRIST_DOC` env var)
- **Tables:**
  - `MSM_Results` - Mobile Shift Maintenance data
  - `Schedule_Data` - Schedule Master (Month Block) data

Each table includes:
- All columns from your scraper output
- A `scraped_at` timestamp column (automatically added)

## Docker Compose Integration

This scraper can be run from the Grist docker-compose file. The compose file will:
1. Mount this repository
2. Set environment variables
3. Run `scripts/run_with_grist.sh`

See the Grist repository's `compose.yaml` for configuration.

