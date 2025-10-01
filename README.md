## ABS Mobile Shift Maintenance Scraper

This repo contains a Playwright-based scraper for the ABS portal:
- `mobile_shift_maintenance_scrape.mjs`: scrapes the Mobile Shift Maintenance grid
- Sends data directly to Monday.com
- Runs automatically every 15 minutes via cron job

The scraper loads credentials from a `.env` file and saves a reusable Playwright `storageState.json` after login.

### Monday.com Integration

The scrapers now includes integrated Monday.com sync:
- Scrapes data from the ABS portal
- Sends data directly to Monday.com (no intermediate files)
- Falls back to local JSON/CSV files if Monday.com sync fails


---

## Requirements

- Windows, macOS, or Linux
- Node.js 16+ and npm installed
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

### Quick Install (All Platforms)

From this project folder:
```bash
npm install
npx playwright install chromium
```

This installs `playwright` and `dotenv` used by the scripts.

### Linux Automated Setup

For Linux systems, use the automated installation script:

```bash
# Make the script executable
chmod +x install_linux.sh

# Run the automated installer
./install_linux.sh
```

The installer will:
- Detect your Linux distribution
- Install Node.js if needed
- Install project dependencies
- Set up Playwright browsers
- Create environment file template
- Install cron job (runs every 15 minutes)
- Set up log rotation

---

## Set credentials with .env

Create a file named `.env` in the project root with:

### ABS Portal Credentials
```env
ABS_USER=your_username
ABS_PASS=your_password
```

### Monday.com Integration
```env
MONDAY_API_TOKEN=your_monday_api_token
MONDAY_SCHEDULE_BOARD_ID=your_schedule_board_id
MONDAY_MSM_BOARD_ID=your_msm_board_id
EMPLOYEE_BOARD_ID=18076293881
```

### Debug and Feature Flags
```env
DEBUG=True
CALL_LOGGER_NOTES=True
```

---

Notes:
- Keep `.env` private (do not commit it).
- Get your Monday.com API token from: Your profile in top right corner and then Developers
- Board ID can be found in the Monday.com board URL

#### Environment Variable Descriptions:

**Monday.com Configuration:**
- `MONDAY_API_TOKEN`: Your Monday.com API token
- `MONDAY_SCHEDULE_BOARD_ID`: Board ID for the schedule scraper
- `MONDAY_MSM_BOARD_ID`: Board ID for the mobile shift maintenance scraper
- `EMPLOYEE_BOARD_ID`: Board ID for employee lookup (used for board-relation columns)

**Debug and Feature Flags:**
- `DEBUG`: Set to `True` to run scrapers in visible browser mode, `False` for headless mode
- `CALL_LOGGER_NOTES`: Set to `True` to log employee comments in call logger, `False` to skip this step

---

## Mobile Shift Maintenance Scraper

File: `mobile_shift_maintenance_scrape.mjs`

What it does:
- Logs in (using `.env`), navigates to Mobile Shift Maintenance, selects the last 8 days and selects all exceptions, paginates the Kendo grid, and saves results
- Sends data directly to Monday.com board
- Automatically logs comments using Call Logger
- Runs every 15 minutes via cron job

Outputs:
- Data sent directly to Monday.com board
- `msm_results.json` and `msm_results.csv` (only if Monday.com sync fails)
- `storageState.json`

### Prerequisites for Monday.com Integration

#### For MSM Scraper (MSM Shift Data)

1. **Create the MSM Monday.com board manually:**
   - In Monday.com, go to your workspace
   - Click the "+" button → "Import from Excel"
   - Upload the `msm_board_import.xlsx` file (included with sample data)
   - Name the board "MSM Shift Data" (exact name required)
   - After import, copy the Board ID from the URL and add it to your `.env` file as `MONDAY_MSM_BOARD_ID`
   - **Note:** The Excel file contains sample data - you can delete the sample rows after import

### Run Commands

**MSM Scraper with Monday.com (recommended):**
```bash
npm run scrape-msm-monday
```

**Manual sync to Monday.com:**
```bash
npm run sync-msm-monday # Sync existing MSM data
```

**Manual run:**
- Windows (PowerShell)
```powershell
node .\mobile_shift_maintenance_scrape.mjs
```

- macOS/Linux (bash/zsh)
```bash
node ./mobile_shift_maintenance_scrape.mjs
```

---

## Automated Scheduling (Cron Jobs)

The project includes automated scheduling capabilities for running the MSM scraper every 15 minutes.

### Quick Start

**Run MSM scraper with cron scheduler:**
```bash
npm run cron-msm         # Run MSM scraper only
```

**Install scheduled tasks:**
```bash
# Windows
npm run install-tasks    # Install Windows Task Scheduler task

# macOS/Linux
npm run install-cron-mac    # macOS
npm run install-cron-linux  # Linux
```

### Windows Task Scheduler Setup

1. **Automatic Installation:**
   ```bash
   npm run install-tasks
   ```
   This creates one scheduled task:
   - `ABS-MSM-Scraper` (Every 15 minutes)

2. **Manual Installation:**
   - Open Task Scheduler (`taskschd.msc`)
   - Create Basic Task → Name: "ABS-MSM-Scraper"
   - Trigger: Daily → Start time: 12:00 AM → Recur every: 15 minutes
   - Action: Start a program → Program: `node` → Arguments: `"C:\path\to\cron_scheduler.mjs" --schedule-msm`

### macOS/Linux Cron Setup

1. **Automatic Installation:**
   ```bash
   # macOS
   npm run install-cron-mac
   
   # Linux
   npm run install-cron-linux
   ```
   This creates one cron job:
   - MSM Scraper (Every 15 minutes)

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
   # Run MSM scraper manually
   ./cron_scheduler_mac.sh msm
   
   # Or using npm scripts
   npm run cron-msm-mac
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

- **Location**: `logs/cron-msm.log` and `logs/cron-YYYY-MM-DD.log`
- **Retention**: Last 30 days of logs kept automatically
- **Format**: `[TIMESTAMP] [LEVEL] MESSAGE`

### Manual Execution

**Using PowerShell:**
```powershell
# Run MSM scraper manually
node .\cron_scheduler.mjs --schedule-msm

# Install Windows scheduled tasks
.\install_scheduled_tasks.ps1
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
  - If board import fails: Ensure the board is named exactly "MSM Shift Data"
  - If sync fails: Check that `MONDAY_MSM_BOARD_ID` is set correctly in `.env`
- Partial/empty results (Mobile Shift Maintenance):
  - The script automatically selects all exceptions and paginates the grid.
  - Verify the date range is the last 8 days as expected.

---

## Linux Setup Instructions

This section provides detailed setup instructions for Linux systems.

### Prerequisites

1. **Node.js**: Version 16 or higher
2. **npm**: Comes with Node.js
3. **Playwright**: Will be installed automatically
4. **Cron**: Usually pre-installed on Linux systems

### Installation Steps

#### 1. Install Node.js (if not already installed)

**Ubuntu/Debian:**
```bash
# Update package index
sudo apt update

# Install Node.js and npm
sudo apt install nodejs npm

# Verify installation
node --version
npm --version
```

**CentOS/RHEL/Fedora:**
```bash
# Install Node.js and npm
sudo yum install nodejs npm
# or for newer versions:
sudo dnf install nodejs npm

# Verify installation
node --version
npm --version
```

**Using Node Version Manager (nvm) - Recommended:**
```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Reload shell
source ~/.bashrc

# Install latest LTS Node.js
nvm install --lts
nvm use --lts

# Verify installation
node --version
npm --version
```

#### 2. Install Project Dependencies

```bash
# Navigate to project directory
cd /path/to/abs_scrape

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium
```

#### 3. Configure Environment Variables

Create a `.env` file in the project root:

```bash
# Create .env file
nano .env
```

Add the following content (replace with your actual values):

```env
# ABS Login Credentials
ABS_USER=your_username
ABS_PASS=your_password
ABS_LOGIN_URL=https://abs.brightstarcare.com/Account/Login

# Monday.com Integration (optional)
MONDAY_API_TOKEN=your_monday_api_token
MONDAY_MSM_BOARD_ID=your_board_id
```

#### 4. Make Scripts Executable

```bash
# Make the cron scheduler script executable
chmod +x cron_scheduler_mac.sh

# Test the script
./cron_scheduler_mac.sh msm
```

#### 5. Install Cron Job

```bash
# Install the cron job (runs every 15 minutes)
./cron_scheduler_mac.sh install
```

#### 6. Verify Installation

```bash
# Check if cron job was installed
crontab -l

# You should see something like:
# */15 * * * * cd /path/to/abs_scrape && ./cron_scheduler_mac.sh msm >> /path/to/abs_scrape/logs/cron-msm.log 2>&1
```

### Manual Operations

**Run Scraper Manually:**
```bash
# Run the MSM scraper once
./cron_scheduler_mac.sh msm

# Or use npm script
npm run cron-msm-mac
```

**Check Logs:**
```bash
# View recent logs
tail -f logs/cron-msm.log

# View all log files
ls -la logs/
```

**Uninstall Cron Job:**
```bash
# Remove the cron job
./cron_scheduler_mac.sh uninstall
```

### Linux Troubleshooting

**Common Issues:**

1. **Permission Denied:**
   ```bash
   chmod +x cron_scheduler_mac.sh
   ```

2. **Node.js Not Found:**
   - Make sure Node.js is in your PATH
   - Try using full path: `/usr/bin/node` or `/usr/local/bin/node`

3. **Playwright Issues:**
   ```bash
   # Reinstall Playwright browsers
   npx playwright install chromium
   ```

4. **Cron Job Not Running:**
   - Check if cron service is running: `sudo systemctl status cron`
   - Check cron logs: `sudo journalctl -u cron`
   - Verify the cron job exists: `crontab -l`

5. **Authentication Issues:**
   - Verify your credentials in the `.env` file
   - Check if the ABS website is accessible
   - Look for login errors in the logs

**Log Locations:**
- **Cron logs**: `logs/cron-msm.log`
- **System cron logs**: `/var/log/cron` or `/var/log/syslog`
- **Application logs**: `logs/cron-YYYY-MM-DD.log`

**Monitoring:**
```bash
# Monitor cron job execution
tail -f logs/cron-msm.log

# Check if cron job is scheduled
crontab -l

# View system cron logs
sudo tail -f /var/log/cron
```

### Security Considerations

1. **File Permissions**: Ensure the `.env` file has restricted permissions:
   ```bash
   chmod 600 .env
   ```

2. **User Account**: Consider running the cron job under a dedicated user account:
   ```bash
   # Create dedicated user
   sudo useradd -m -s /bin/bash abs_scraper
   
   # Switch to that user and set up the project
   sudo su - abs_scraper
   ```

3. **Log Rotation**: Set up log rotation to prevent logs from growing too large:
   ```bash
   # Create logrotate configuration
   sudo nano /etc/logrotate.d/abs_scraper
   ```
   
   Add:
   ```
   /path/to/abs_scrape/logs/*.log {
       daily
       missingok
       rotate 30
       compress
       notifempty
       create 644 abs_scraper abs_scraper
   }
   ```

### System Requirements

- **RAM**: Minimum 2GB, recommended 4GB+
- **Disk Space**: At least 1GB free space for logs and data
- **Network**: Stable internet connection
- **OS**: Linux (Ubuntu, CentOS, RHEL, Debian, etc.)

### Support

If you encounter issues:

1. Check the logs first: `tail -f logs/cron-msm.log`
2. Verify your environment variables are correct
3. Test the scraper manually: `./cron_scheduler_mac.sh msm`
4. Check system resources (memory, disk space)
5. Verify network connectivity to the ABS website
