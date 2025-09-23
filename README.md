## ABS Scrapers

This repo contains two Playwright-based scrapers for the ABS portal:
- `mobile_shift_maintenance_scrape.mjs`: scrapes the Mobile Shift Maintenance grid
- `schedule_scrape.mjs`: scrapes Month Block view from Schedule Master and sends data directly to Monday.com

Both load credentials from a `.env` file and save a reusable Playwright `storageState.json` after login.

### Monday.com Integration

The `schedule_scrape.mjs` scraper now includes integrated Monday.com sync:
- Scrapes shift data from the ABS portal
- Sends data directly to Monday.com (no intermediate files)
- Falls back to local JSON/CSV files if Monday.com sync fails
- Includes duplicate detection to prevent creating duplicate records

---

## Requirements

- Windows or macOS
- Node.js 18+ and npm installed
- Google Chrome (recommended)

Verify versions:

- Windows (PowerShell)
```powershell
node -v
npm -v
```

- macOS/Linux (bash/zsh)
```bash
node -v
npm -v
```

If PowerShell blocks npm with an execution policy error (Windows only):
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
```

---

## Install

From this project folder (same for Windows/macOS):
```bash
npm install
```

This installs `playwright` and `dotenv` used by the scripts.

---

## Set credentials with .env (recommended)

Create a file named `.env` in the project root with:

### ABS Portal Credentials
```env
ABS_USER=your_username
ABS_PASS=your_password
```

### Monday.com Integration (for schedule scraper)
```env
MONDAY_API_TOKEN=your_monday_api_token
MONDAY_BOARD_ID=your_board_id
```

Alternative: set env vars in the shell for one session

- Windows (PowerShell):
```powershell
$env:ABS_USER="your_username"; $env:ABS_PASS="your_password"; $env:MONDAY_API_TOKEN="your_token"; $env:MONDAY_BOARD_ID="your_board_id"
```

- macOS/Linux (bash/zsh):
```bash
export ABS_USER="your_username" ABS_PASS="your_password" MONDAY_API_TOKEN="your_token" MONDAY_BOARD_ID="your_board_id"
```

Notes:
- Keep `.env` private (do not commit it).
- Shell env vars override `.env` for that session.
- Get your Monday.com API token from: Account Settings → API → Generate new token
- Board ID can be found in the Monday.com board URL
- **Python required** for board creation: `pip install pandas openpyxl` (if not already installed)

---

## Script 1: Mobile Shift Maintenance scraper

File: `mobile_shift_maintenance_scrape.mjs`

What it does:
- Logs in (using `.env`), navigates to Mobile Shift Maintenance, selects the full current month and selects all exceptions, paginates the Kendo grid, and saves results.

Outputs:
- `msm_results.json`
- `msm_results.csv`
- `storageState.json` (session reused on next runs)

Run:

- Windows (PowerShell)
```powershell
node .\mobile_shift_maintenance_scrape.mjs
```

- macOS/Linux (bash/zsh)
```bash
node ./mobile_shift_maintenance_scrape.mjs
```

---

## Script 2: Schedule Month Block scraper (with Monday.com integration)

File: `schedule_scrape.mjs`

What it does:
- Logs in (using `.env`), goes to Schedule Master, switches to Month tab → Month Block view, scrapes all visible cards with date inference
- **NEW**: Sends data directly to Monday.com (no intermediate files)
- Falls back to local files if Monday.com sync fails

Outputs:
- Data sent directly to Monday.com board
- `month_block.json` and `month_block.csv` (only if Monday.com sync fails)
- `storageState.json`

### Prerequisites for Monday.com Integration

1. **Set up Monday.com API token in `.env`:**
```env
MONDAY_API_TOKEN=your_monday_api_token
MONDAY_BOARD_ID=your_board_id
```

2. **Create the Monday.com board manually:**
   - Run `python create_monday_board.py` to generate `monday_board_import.xlsx`
   - In Monday.com, go to your workspace
   - Click the "+" button → "Import from Excel"
   - Upload the `monday_board_import.xlsx` file
   - Name the board "ABS Shift Data" (exact name required)
   - After import, copy the Board ID from the URL and add it to your `.env` file

   **Quick setup:**
   ```bash
   python create_monday_board.py
   # Then upload monday_board_import.xlsx to Monday.com
   ```

### Run Commands

**Integrated scraper (recommended):**
```bash
npm run scrape-monday
```

**Original scraper (local files only):**
```bash
npm run scrape
```

**Manual run:**
- Windows (PowerShell)
```powershell
node .\schedule_scrape.mjs
```

- macOS/Linux (bash/zsh)
```bash
node ./schedule_scrape.mjs
```

---

## Troubleshooting

- Node is not recognized in Cursor terminal:
  - Ensure `C:\\Program Files\\nodejs\\` is on PATH inside Cursor, or run with full path to `node.exe`.
- Blocked by WAF/Cloudflare:
  - Run from your normal/trusted network.
- Login issues:
  - Verify `.env` values and that the login page still uses `#UserName` / `#Password` fields.
- **Monday.com board creation issues:**
  - If `python create_monday_board.py` fails: Install Python dependencies with `pip install pandas openpyxl`
  - If board import fails: Ensure the board is named exactly "ABS Shift Data"
  - If sync fails: Check that `MONDAY_BOARD_ID` is set correctly in `.env`
- Partial/empty results (Mobile Shift Maintenance):
  - The script automatically selects all exceptions and paginates the grid.
  - Verify the date range is the month you expect.
