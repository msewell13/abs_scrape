# ABS Mobile Shift Maintenance Scraper

This repo contains a Playwright-based scraper for the ABS portal:
- `mobile_shift_maintenance_scrape.mjs`: scrapes the Mobile Shift Maintenance grid
- Sends data directly to Monday.com
- Runs automatically every 15 minutes via cron job

The scraper loads credentials from a `.env` file and saves a reusable Playwright `storageState.json` after login.


## 🚀 Quick Start Guide

Get the ABS scrapers up and running in just a few minutes! This guide will walk you through everything step-by-step.

### 🎯 Automated Installation (Recommended)

**For the easiest setup, use our universal installer:**

#### **📥 Step 1: Download the Installer**

**Download the installer script:**

**Option 1: Direct Download**
- **Click:** [install.js](https://raw.githubusercontent.com/msewell13/abs_scrape/main/install.js)
- **Right-click** → **Save As** → Save as `install.js`

**Option 2: Command Line**
```bash
# Using curl
curl -O https://raw.githubusercontent.com/msewell13/abs_scrape/main/install.js

# Using wget
wget https://raw.githubusercontent.com/msewell13/abs_scrape/main/install.js
```

> **Note:** Replace `your-username` with your actual GitHub username in the download link above.

#### **📋 Step 2: Install Node.js (Required)**

**Before running the installer, you need Node.js installed:**

1. **Go to [nodejs.org](https://nodejs.org/)**
2. **Download the LTS version** (recommended)
3. **Run the installer** and follow the instructions
4. **Restart your terminal/command prompt** after installation

**Verify Node.js is installed:**
```bash
node --version
npm --version
```

#### **🚀 Step 3: Run the Installer**

**Once Node.js is installed, run the installer:**

```bash
# Navigate to where you saved install.js
cd /path/to/installer

# Run the installer
node install.js

# Or with options
node install.js --test    # Test mode (check requirements only)
node install.js --help    # Show help and usage information
```

#### **📋 What the Installer Does**

The installer will:
- ✅ Detect your operating system automatically
- ✅ Install Git if needed
- ✅ Download the latest code
- ✅ Install all dependencies
- ✅ Ask for your credentials
- ✅ Set up Monday.com boards automatically
- ✅ Test the installation

**That's it!** The installer handles everything automatically.

---

### 📋 Manual Installation (Alternative)

If you prefer to set up manually or the automated installer doesn't work:

### Step 1: Install Node.js
1. Go to [nodejs.org](https://nodejs.org/)
2. Download and install the **LTS version** (recommended)
3. Restart your computer after installation

### Step 2: Download the Scraper
1. Download this repository as a ZIP file
2. Extract it to a folder on your computer (e.g., `C:\abs_scrape`)

### Step 3: Install Dependencies
1. Open Command Prompt (Windows) or Terminal (Mac/Linux)
2. Navigate to the scraper folder:
   ```bash
   cd C:\abs_scrape
   ```
3. Install the required packages:
   ```bash
   npm install
   ```

### Step 4: Set Up Your Credentials
1. Copy the sample environment file:
   ```bash
   copy .env.sample .env
   ```
   (On Mac/Linux: `cp .env.sample .env`)

2. Open the `.env` file in a text editor and fill in your abs username/password

### Step 5: Get Your Monday.com API Token
1. Go to [Monday.com](https://monday.com) and log in
2. Click your profile picture (top right) → **Developers**
3. Click **Generate new token**
4. Give it a name like "ABS Scraper"
5. Copy the token and paste it in your `.env` file

### Step 6: Create Your Monday.com Boards
Run this command to automatically create all the boards you need (the script will automatically add the board id's to your .env file):
```bash
npm run setup-boards
```

This will create:
- **Employees** board (for employee lookup)
- **MSM Shift Data** board (for shift data)
- **ABS Shift Data** board (for schedule data)

### Step 7: Connect the Boards (One-time setup)
1. Go to your Monday.com workspace
2. Open the **MSM Shift Data** board
3. Click on the **Employee** column header
4. Change it to **Board Relation** type
5. Connect it to your **Employees** board

### Step 8: Add Some Employees
1. Go to your **Employees** board
2. Add a few employees with their names and details
3. This will be used for linking shift data to employees

### Step 9: Test the Scraper
Run the scraper to test everything:
```bash
npm run scrape-msm
```

You should see it:
1. Open a browser window
2. Log into the ABS portal
3. Scrape the data
4. Send it to Monday.com

### Step 10: You're Done! 🎉
Your scraper is now set up and working! The data will appear in your Monday.com boards.

---

## 📋 What This Does

This scraper automatically:
- Logs into the ABS portal
- Scrapes Mobile Shift Maintenance data
- Sends the data directly to Monday.com
- Links employees between boards
- Runs on a schedule (optional)

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

### Linux Setup

For Linux systems, follow the [Quick Start Guide](#-quick-start-guide) above. The steps are the same across all platforms.

---
## 🔧 Advanced Features

For advanced features like scheduling and automation, see the sections below.

**Debug and Feature Flags:**
- `DEBUG`: Set to `True` to run scrapers in visible browser mode, `False` for headless mode
- `CALL_LOGGER_NOTES`: Set to `True` to log employee comments in call logger, `False` to skip this step

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
- **Blocked by WAF/Cloudflare**:
  - Run from your normal/trusted network.
- **Login issues**:
  - Verify `.env` values and that the login page still uses `#UserName` / `#Password` fields.
- **Monday.com board creation issues:**
  - If board import fails: Ensure the board is named exactly "MSM Shift Data"
  - If sync fails: Check that `MONDAY_MSM_BOARD_ID` is set correctly in `.env`
- **Partial/empty results (Mobile Shift Maintenance)**:
  - The script automatically selects all exceptions and paginates the grid.
  - Verify the date range is the last 8 days as expected.

---

### Support

If you encounter issues:

1. Check the logs first: `tail -f logs/cron-msm.log`
2. Verify your environment variables are correct
3. Test the scraper manually: `./cron_scheduler_mac.sh msm`
4. Check system resources (memory, disk space)
5. Verify network connectivity to the ABS website
