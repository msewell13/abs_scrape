# Grist Integration

This repository includes integration with Grist for automatically sending scraper results to Grist tables.

## Files

- `grist_client.py` - Grist API client library
- `grist_integration.py` - Script to send JSON/CSV files to Grist
- `scripts/run_with_grist.sh` - Wrapper script to run scrapers and send to Grist

## Setup

1. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

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

### Option 1: Use the wrapper script (recommended)

```bash
export GRIST_API_KEY=your_key
export GRIST_SERVER=https://grist.pythonfinancial.com
bash scripts/run_with_grist.sh
```

This will:
- Run all scrapers (MSM and Schedule)
- Automatically send results to Grist tables

### Option 2: Run scrapers manually, then send to Grist

```bash
# Run scraper
npm run scrape-msm

# Send to Grist
python3 grist_integration.py \
  --api-key $GRIST_API_KEY \
  --server $GRIST_SERVER \
  --doc "ABS_Data" \
  --table "MSM_Results" \
  msm_results.json
```

### Option 3: Use in your scraper code

```python
from grist_client import GristClient, infer_columns_from_data

client = GristClient(
    api_key=os.getenv("GRIST_API_KEY"),
    server="https://grist.pythonfinancial.com",
    org="brightstar"
)

# Get or create document
doc = client.get_or_create_document("ABS_Data")

# Prepare your data
data = [{"column1": "value1", "column2": 123}]

# Infer columns and ensure table exists
columns = infer_columns_from_data(data)
client.ensure_table(doc["id"], "MSM_Results", columns)

# Add records
client.add_records(doc["id"], "MSM_Results", data)
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

