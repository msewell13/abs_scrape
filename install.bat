@echo off
REM ABS Scraper Installer - Windows Batch Script
echo Installing ABS Scraper...

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Node.js is not installed. Please install it from https://nodejs.org/
    echo After installation, restart your terminal and run this script again.
    pause
    exit /b 1
)

REM Run the main installer
node install.mjs

pause
