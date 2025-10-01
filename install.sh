#!/bin/bash
# ABS Scraper Installer - Unix Shell Script

echo "Installing ABS Scraper..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed. Please install it from https://nodejs.org/"
    echo "After installation, restart your terminal and run this script again."
    exit 1
fi

# Make the script executable
chmod +x install.mjs

# Run the main installer
node install.mjs
