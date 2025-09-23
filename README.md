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
MONDAY_SCHEDULE_BOARD_ID=your_schedule_board_id
MONDAY_MSM_BOARD_ID=board_id
```

Alternative: set env vars in the shell for one session

- Windows (PowerShell):
```powershell
$env:ABS_USER="your_username"; $env:ABS_PASS="your_password"; $env:MONDAY_API_TOKEN="your_token"; $env:MONDAY_SCHEDULE_BOARD_ID="your_schedule_board_id"
```

- macOS/Linux (bash/zsh):
```bash
export ABS_USER="your_username" ABS_PASS="your_password" MONDAY_API_TOKEN="your_token" MONDAY_SCHEDULE_BOARD_ID="your_schedule_board_id"
```

Notes:
- Keep `.env` private (do not commit it).
- Shell env vars override `.env` for that session.
- Get your Monday.com API token from: Account Settings → API → Generate new token
- Board ID can be found in the Monday.com board URL

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

#### For Schedule Scraper (ABS Shift Data)

1. **Set up Monday.com API token in `.env`:**
```env
MONDAY_API_TOKEN=your_monday_api_token
MONDAY_SCHEDULE_BOARD_ID=your_schedule_board_id
```

2. **Create the Monday.com board manually:**
   - In Monday.com, go to your workspace
   - Click the "+" button → "Import from Excel"
   - Upload the `schedule_board_import.xlsx` file (included with sample data)
   - Name the board "ABS Shift Data" (exact name required)
   - After import, copy the Board ID from the URL and add it to your `.env` file
   - **Note:** The Excel file contains sample data - you can delete the sample rows after import

#### For MSM Scraper (MSM Shift Data)

1. **Set up Monday.com API token in `.env` (same as above):**
```env
MONDAY_API_TOKEN=your_monday_api_token
MONDAY_MSM_BOARD_ID=your_msm_board_id
```

2. **Create the MSM Monday.com board manually:**
   - In Monday.com, go to your workspace
   - Click the "+" button → "Import from Excel"
   - Upload the `msm_board_import.xlsx` file (included with sample data)
   - Name the board "MSM Shift Data" (exact name required)
   - After import, copy the Board ID from the URL and add it to your `.env` file as `MONDAY_MSM_BOARD_ID`
   - **Note:** The Excel file contains sample data - you can delete the sample rows after import

### Run Commands

**Schedule Scraper with Monday.com (recommended):**
```bash
npm run scrape-monday
```

**MSM Scraper with Monday.com (recommended):**
```bash
npm run scrape-msm-monday
```

**Original scrapers (local files only):**
```bash
npm run scrape          # Schedule scraper
npm run scrape-msm      # MSM scraper
```

**Manual sync to Monday.com:**
```bash
npm run sync-monday     # Sync existing schedule data
npm run sync-msm-monday # Sync existing MSM data
```

**Manual run:**
- Windows (PowerShell)
```powershell
node .\schedule_scrape.mjs
node .\mobile_shift_maintenance_scrape.mjs
```

- macOS/Linux (bash/zsh)
```bash
node ./schedule_scrape.mjs
node ./mobile_shift_maintenance_scrape.mjs
```

---

## Automated Scheduling (Cron Jobs)

The project includes automated scheduling capabilities for running scrapers at regular intervals.

### Quick Start

**Run scrapers with cron scheduler:**
```bash
npm run cron-schedule    # Run schedule scraper
npm run cron-msm         # Run MSM scraper  
npm run cron-both        # Run both scrapers
```

**Install Windows scheduled tasks:**
```bash
npm run install-tasks    # Install Windows Task Scheduler tasks
```

### Windows Task Scheduler Setup

1. **Automatic Installation:**
   ```bash
   npm run install-tasks
   ```
   This creates three scheduled tasks:
   - `ABS-Schedule-Scraper` (Weekdays at 8:00 AM)
   - `ABS-MSM-Scraper` (Weekdays at 9:00 AM)  
   - `ABS-Both-Scrapers` (Weekdays at 10:00 AM)

2. **Manual Installation:**
   - Open Task Scheduler (`taskschd.msc`)
   - Create Basic Task → Name: "ABS-Schedule-Scraper"
   - Trigger: Daily → Start time: 8:00 AM → Recur every: 1 day
   - Action: Start a program → Program: `node` → Arguments: `"C:\path\to\cron_scheduler.mjs" --schedule-schedule`

### macOS/Linux Cron Setup

1. **Automatic Installation:**
   ```bash
   npm run install-cron-mac
   ```
   This creates three cron jobs:
   - Schedule Scraper (Weekdays at 8:00 AM)
   - MSM Scraper (Weekdays at 9:00 AM)
   - Both Scrapers (Weekdays at 10:00 AM)

2. **Manual Installation:**
   ```bash
   # Make script executable
   chmod +x cron_scheduler_mac.sh
   
   # Install cron jobs
   ./cron_scheduler_mac.sh install
   
   # View installed cron jobs
   crontab -l
   ```

3. **Manual Execution:**
   ```bash
   # Run scrapers manually
   ./cron_scheduler_mac.sh schedule    # Schedule scraper
   ./cron_scheduler_mac.sh msm         # MSM scraper
   ./cron_scheduler_mac.sh both        # Both scrapers
   
   # Or using npm scripts
   npm run cron-schedule-mac
   npm run cron-msm-mac
   npm run cron-both-mac
   ```

### Cron Scheduler Features

- **Automatic Retries**: Failed runs are retried up to 3 times
- **Logging**: All runs are logged to `logs/cron-YYYY-MM-DD.log`
- **Timeout Protection**: Scripts timeout after 30 minutes
- **Error Handling**: Comprehensive error reporting and recovery
- **Sleep Mode Handling**: Automatically wakes up computer if sleeping
- **Cross-Platform**: Works on Windows, macOS, and Linux

### Sleep Mode Handling

The cron scheduler automatically handles computers in sleep mode:

**Windows:**
- Uses `powercfg` to prevent sleep during execution
- Windows Task Scheduler configured with `-WakeToRun` flag
- Automatically disables sleep timeouts during script execution

**macOS/Linux:**
- Uses `caffeinate` (macOS) or system commands (Linux) to wake up
- Checks system responsiveness before running scripts
- Waits 30 seconds for full system wake-up

**Wake-up Process:**
1. **Detection**: Checks if computer is responsive
2. **Wake-up**: Sends wake-up commands if needed
3. **Wait**: Allows 30 seconds for system to fully wake up
4. **Retry**: Up to 3 attempts if wake-up fails
5. **Proceed**: Runs scripts even if wake-up partially fails

### Log Files

- **Location**: `logs/cron-YYYY-MM-DD.log`
- **Retention**: Last 30 days of logs kept automatically
- **Format**: `[TIMESTAMP] [LEVEL] MESSAGE`

### Manual Execution

**Using batch files:**
```bash
run_schedule.bat    # Run schedule scraper
run_msm.bat         # Run MSM scraper
run_both.bat        # Run both scrapers
```

**Using PowerShell:**
```powershell
# Run with custom times
.\install_scheduled_tasks.ps1 -ScheduleTime "07:00" -MSMTime "08:00"

# Force overwrite existing tasks
.\install_scheduled_tasks.ps1 -Force
```

### Troubleshooting Scheduling

**Windows:**
- **Task not running**: Check Windows Event Viewer for Task Scheduler errors
- **Permission issues**: Run PowerShell as Administrator
- **Node not found**: Ensure Node.js is in system PATH

**macOS/Linux:**
- **Cron not running**: Check system cron service is enabled
- **Permission issues**: Ensure script is executable (`chmod +x cron_scheduler_mac.sh`)
- **Node not found**: Ensure Node.js is in system PATH
- **Cron logs**: Check system cron logs (`/var/log/cron` or `journalctl -u cron`)

**Both Platforms:**
- **Log files**: Check `logs/` directory for detailed error information
- **Environment variables**: Ensure `.env` file is properly configured

---

## Troubleshooting

- Node is not recognized in Cursor terminal:
  - Ensure `C:\\Program Files\\nodejs\\` is on PATH inside Cursor, or run with full path to `node.exe`.
- Blocked by WAF/Cloudflare:
  - Run from your normal/trusted network.
- Login issues:
  - Verify `.env` values and that the login page still uses `#UserName` / `#Password` fields.
- **Monday.com board creation issues:**
  - If board import fails: Ensure the board is named exactly "ABS Shift Data"
  - If sync fails: Check that `MONDAY_SCHEDULE_BOARD_ID` is set correctly in `.env`
- Partial/empty results (Mobile Shift Maintenance):
  - The script automatically selects all exceptions and paginates the grid.
  - Verify the date range is the month you expect.
