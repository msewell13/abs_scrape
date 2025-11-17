# Testing Scrapers and Grist Integration

This guide explains how to test all scrapers and verify they successfully write data to Grist.

## Prerequisites

1. **Set Environment Variables:**
   ```bash
   export GRIST_API_KEY=your_api_key_here
   export GRIST_SERVER=https://grist.pythonfinancial.com
   export GRIST_ORG=brightstar  # Optional, defaults to brightstar
   export GRIST_DOC=ABS_Data    # Optional, defaults to ABS_Data
   ```

2. **Get your Grist API key:**
   - Log in to your Grist instance
   - Go to Profile Settings → API
   - Generate a new API key

## Running Tests

### Option 1: Run Comprehensive Test Script (Recommended)

The test script runs all scrapers, verifies output files, sends data to Grist, and verifies the data was written:

```bash
npm test
# or
npm run test-scrapers
# or
node test_scrapers_grist.js
```

This will:
1. ✅ Run each scraper (MSM, Schedule, Customer Search, Employee Search)
2. ✅ Verify output JSON files are created
3. ✅ Load and validate the data
4. ✅ Send data to Grist tables
5. ✅ Verify data was successfully written by querying Grist

### Option 2: Run Scrapers with Grist Integration

Run all scrapers and automatically send results to Grist (without verification):

```bash
npm run scrape-with-grist
# or
node scripts/run_with_grist.js
```

### Option 3: Test Individual Scrapers

Test a single scraper manually:

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

## Scrapers and Output Files

| Scraper | Command | Output File | Grist Table |
|---------|---------|-------------|-------------|
| MSM | `npm run scrape-msm` | `msm_results.json` | `MSM_Results` |
| Schedule | `npm run scrape-schedule` | `month_block.json` | `Schedule_Data` |
| Customer Search | `npm run scrape-customers` | `customer_search_results.json` | `Customer_Search_Results` |
| Employee Search | `npm run scrape-employees` | `employee_search_results.json` | `Employee_Search_Results` |

## Test Output

The test script provides detailed output for each scraper:

```
🧪 Testing Scrapers and Grist Integration
═══════════════════════════════════════════
   Server: https://grist.pythonfinancial.com
   Document: ABS_Data
   Organization: brightstar

📊 Testing: MSM (Mobile Shift Maintenance)
─────────────────────────────────────────
   Step 1: Running scraper (npm run scrape-msm)...
   ✅ Scraper completed successfully
   Step 2: Checking for output file: msm_results.json...
   ✅ Output file found (45.23 KB)
   Step 3: Loading and validating data...
   ✅ Loaded 150 record(s)
   Step 4: Sending data to Grist table: MSM_Results...
   ✅ Data sent to Grist successfully
   Step 5: Verifying data in Grist...
   ✅ Verified: 150 record(s) found in Grist table
```

## Troubleshooting

### Environment Variables Not Set
```
❌ Error: GRIST_API_KEY environment variable must be set
```
**Solution:** Set the required environment variables (see Prerequisites)

### Scraper Fails
If a scraper fails, check:
- Authentication credentials in `.env` file
- Network connectivity
- Website availability

### Grist Write Fails
If sending to Grist fails:
- Verify API key is correct
- Check Grist server URL is accessible
- Ensure workspace/document exists or can be created

### Verification Fails
If verification fails but data was sent:
- Check Grist API permissions
- Verify table name matches exactly
- Check if data was written to a different table

## Notes

- The test script has a 5-minute timeout per scraper
- All scrapers run sequentially (not in parallel)
- If one scraper fails, the test continues with the next scraper
- The final summary shows which tests passed/failed


