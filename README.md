## ABS Scrapers

This repo contains two Playwright-based scrapers for the ABS portal:
- `mobile_shift_maintenance_scrape.mjs`: scrapes the Mobile Shift Maintenance grid
- `scrape_with_login.mjs`: scrapes Month Block view from Schedule Master

Both load credentials from a `.env` file and save a reusable Playwright `storageState.json` after login.

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
```env
ABS_USER=your_username
ABS_PASS=your_password
```

Alternative: set env vars in the shell for one session

- Windows (PowerShell):
```powershell
$env:ABS_USER="your_username"; $env:ABS_PASS="your_password"
```

- macOS/Linux (bash/zsh):
```bash
export ABS_USER="your_username" ABS_PASS="your_password"
```

Notes:
- Keep `.env` private (do not commit it).
- Shell env vars override `.env` for that session.

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

## Script 2: Schedule Month Block scraper

File: `scrape_with_login.mjs`

What it does:
- Logs in (using `.env`), goes to Schedule Master, switches to Month tab → Month Block view, scrapes all visible cards with date inference.

Outputs:
- `month_block.json`
- `month_block.csv`
- `storageState.json`

Run:

- Windows (PowerShell)
```powershell
node .\scrape_with_login.mjs
```

- macOS/Linux (bash/zsh)
```bash
node ./scrape_with_login.mjs
```

---

## Troubleshooting

- Node is not recognized in Cursor terminal:
  - Ensure `C:\\Program Files\\nodejs\\` is on PATH inside Cursor, or run with full path to `node.exe`.
- Blocked by WAF/Cloudflare:
  - Run from your normal/trusted network.
- Login issues:
  - Verify `.env` values and that the login page still uses `#UserName` / `#Password` fields.
- Partial/empty results (Mobile Shift Maintenance):
  - The script automatically selects all exceptions and paginates the grid.
  - Verify the date range is the month you expect.
