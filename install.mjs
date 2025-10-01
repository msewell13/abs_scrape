#!/usr/bin/env node
/**
 * ABS Scraper Automated Installer
 * 
 * This script automatically installs and configures the ABS scraper on any platform.
 * It detects the operating system, installs dependencies, and guides the user through setup.
 * 
 * Usage: node install.mjs
 */

import { execSync, spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { platform, arch } from 'os';
import readline from 'readline';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Logging functions
const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  step: (msg) => console.log(`\n${colors.cyan}${colors.bright}${msg}${colors.reset}`),
  title: (msg) => console.log(`\n${colors.magenta}${colors.bright}${'='.repeat(60)}\n${msg}\n${'='.repeat(60)}${colors.reset}`)
};

// Detect operating system
function detectOS() {
  const os = platform();
  const architecture = arch();
  
  if (os === 'win32') {
    return { os: 'windows', arch: architecture, shell: 'powershell' };
  } else if (os === 'darwin') {
    return { os: 'macos', arch: architecture, shell: 'bash' };
  } else if (os === 'linux') {
    return { os: 'linux', arch: architecture, shell: 'bash' };
  } else {
    throw new Error(`Unsupported operating system: ${os}`);
  }
}

// Check if a command exists
function commandExists(command) {
  try {
    if (platform() === 'win32') {
      execSync(`where ${command}`, { stdio: 'ignore' });
    } else {
      execSync(`which ${command}`, { stdio: 'ignore' });
    }
    return true;
  } catch {
    return false;
  }
}

// Install Node.js
async function installNodeJS(system) {
  log.step('Installing Node.js...');
  
  if (commandExists('node')) {
    try {
      const version = execSync('node --version', { encoding: 'utf8' }).trim();
      const majorVersion = parseInt(version.replace('v', '').split('.')[0]);
      
      if (majorVersion >= 16) {
        log.success(`Node.js ${version} is already installed and compatible`);
        return;
      } else {
        log.warn(`Node.js ${version} is too old. Need version 16 or higher.`);
      }
    } catch (error) {
      log.warn('Could not determine Node.js version');
    }
  }
  
  log.info('Installing Node.js...');
  
  if (system.os === 'windows') {
    log.info('Please download and install Node.js from https://nodejs.org/');
    log.info('After installation, restart your terminal and run this script again.');
    process.exit(1);
  } else if (system.os === 'macos') {
    if (commandExists('brew')) {
      log.info('Installing Node.js via Homebrew...');
      execSync('brew install node', { stdio: 'inherit' });
    } else {
      log.info('Please install Homebrew first: https://brew.sh/');
      log.info('Then run: brew install node');
      process.exit(1);
    }
  } else if (system.os === 'linux') {
    log.info('Installing Node.js via package manager...');
    try {
      if (commandExists('apt-get')) {
        execSync('curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -', { stdio: 'inherit' });
        execSync('sudo apt-get install -y nodejs', { stdio: 'inherit' });
      } else if (commandExists('yum')) {
        execSync('curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -', { stdio: 'inherit' });
        execSync('sudo yum install -y nodejs', { stdio: 'inherit' });
      } else if (commandExists('dnf')) {
        execSync('curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -', { stdio: 'inherit' });
        execSync('sudo dnf install -y nodejs', { stdio: 'inherit' });
      } else {
        throw new Error('Unsupported package manager');
      }
    } catch (error) {
      log.error('Failed to install Node.js automatically');
      log.info('Please install Node.js manually from https://nodejs.org/');
      process.exit(1);
    }
  }
  
  log.success('Node.js installed successfully');
}

// Install Git
async function installGit(system) {
  log.step('Checking Git installation...');
  
  if (commandExists('git')) {
    log.success('Git is already installed');
    return;
  }
  
  log.info('Installing Git...');
  
  if (system.os === 'windows') {
    log.info('Please download and install Git from https://git-scm.com/');
    log.info('After installation, restart your terminal and run this script again.');
    process.exit(1);
  } else if (system.os === 'macos') {
    if (commandExists('brew')) {
      execSync('brew install git', { stdio: 'inherit' });
    } else {
      log.info('Please install Git from https://git-scm.com/');
      process.exit(1);
    }
  } else if (system.os === 'linux') {
    try {
      if (commandExists('apt-get')) {
        execSync('sudo apt-get update && sudo apt-get install -y git', { stdio: 'inherit' });
      } else if (commandExists('yum')) {
        execSync('sudo yum install -y git', { stdio: 'inherit' });
      } else if (commandExists('dnf')) {
        execSync('sudo dnf install -y git', { stdio: 'inherit' });
      } else {
        throw new Error('Unsupported package manager');
      }
    } catch (error) {
      log.error('Failed to install Git automatically');
      log.info('Please install Git manually from https://git-scm.com/');
      process.exit(1);
    }
  }
  
  log.success('Git installed successfully');
}

// Clone or update repository
async function setupRepository() {
  log.step('Setting up repository...');
  
  // Check if we're already in the project directory
  if (existsSync('package.json') && existsSync('mobile_shift_maintenance_scrape.mjs')) {
    log.info('Already in project directory, updating...');
    try {
      execSync('git pull origin main', { stdio: 'inherit' });
    } catch (error) {
      log.warn('Could not update repository (this is normal if not a git repo)');
    }
  } else {
    log.info('Please download the project files manually:');
    log.info('1. Go to the project repository');
    log.info('2. Download as ZIP or clone with git');
    log.info('3. Extract to a folder');
    log.info('4. Run this installer from within that folder');
    process.exit(1);
  }
  
  log.success('Repository setup complete');
}

// Install dependencies
async function installDependencies() {
  log.step('Installing dependencies...');
  
  log.info('Installing npm packages...');
  execSync('npm install', { stdio: 'inherit' });
  
  log.info('Installing Playwright browsers...');
  execSync('npx playwright install chromium', { stdio: 'inherit' });
  
  log.success('Dependencies installed successfully');
}

// Create readline interface for user input
function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

// Ask user for input
function askQuestion(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

// Get user credentials
async function getCredentials() {
  log.step('Setting up credentials...');
  
  const rl = createReadlineInterface();
  
  try {
    console.log('\nPlease provide the following information:');
    
    const absUser = await askQuestion(rl, 'ABS Username: ');
    const absPass = await askQuestion(rl, 'ABS Password: ');
    const mondayToken = await askQuestion(rl, 'Monday.com API Token: ');
    
    rl.close();
    
    return { absUser, absPass, mondayToken };
  } catch (error) {
    rl.close();
    throw error;
  }
}

// Create .env file
async function createEnvFile(credentials) {
  log.step('Creating .env file...');
  
  const envContent = `# ABS Login Credentials
ABS_USER=${credentials.absUser}
ABS_PASS=${credentials.absPass}
ABS_LOGIN_URL=https://abs.brightstarcare.com/Account/Login

# Monday.com Integration
MONDAY_API_TOKEN=${credentials.mondayToken}
MONDAY_SCHEDULE_BOARD_ID=your_schedule_board_id
MONDAY_MSM_BOARD_ID=your_msm_board_id
EMPLOYEE_BOARD_ID=your_employee_board_id

# Debug and Feature Flags
DEBUG=False
CALL_LOGGER_NOTES=True
`;

  writeFileSync('.env', envContent);
  log.success('.env file created successfully');
}

// Run Monday.com board setup
async function setupMondayBoards() {
  log.step('Setting up Monday.com boards...');
  
  log.info('Running automated board setup...');
  try {
    execSync('npm run setup-boards', { stdio: 'inherit' });
    log.success('Monday.com boards created successfully');
  } catch (error) {
    log.error('Failed to create Monday.com boards');
    log.warn('You can run this manually later with: npm run setup-boards');
  }
}

// Test the installation
async function testInstallation() {
  log.step('Testing installation...');
  
  log.info('Testing MSM scraper...');
  try {
    // Run a quick test (this will fail if credentials are wrong, but that's expected)
    execSync('node mobile_shift_maintenance_scrape.mjs', { stdio: 'pipe', timeout: 30000 });
    log.success('Installation test passed');
  } catch (error) {
    log.warn('Installation test failed (this is normal if credentials are incorrect)');
    log.info('You can test manually later with: npm run scrape-msm');
  }
}

// Main installation function
async function main() {
  try {
    // Check for help flag
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
      console.log(`
🚀 ABS Scraper Automated Installer

Usage: node install.mjs [options]

Options:
  --test    Run in test mode (skip credential collection and Monday.com setup)
  --help    Show this help message

Examples:
  node install.mjs           # Full installation with credential collection
  node install.mjs --test    # Test mode - check requirements only
  node install.mjs --help    # Show this help

For more information, see the README.md file.
      `);
      process.exit(0);
    }
    
    log.title('🚀 ABS Scraper Automated Installer');
    
    const system = detectOS();
    log.info(`Detected system: ${system.os} (${system.arch})`);
    
    // Check for test mode
    const isTestMode = process.argv.includes('--test');
    
    await installNodeJS(system);
    await installGit(system);
    await setupRepository();
    await installDependencies();
    
    if (isTestMode) {
      log.step('Test mode - skipping credential setup');
      log.info('In test mode, the installer will:');
      log.info('✓ Check system requirements');
      log.info('✓ Install dependencies');
      log.info('✓ Skip credential collection');
      log.info('✓ Skip Monday.com board setup');
      log.info('\nTo run the full installer, run: node install.mjs');
    } else {
      const credentials = await getCredentials();
      await createEnvFile(credentials);
      await setupMondayBoards();
      await testInstallation();
      
      log.title('🎉 Installation Complete!');
      log.success('Your ABS scraper is now installed and configured!');
      log.info('\nNext steps:');
      log.info('1. Add some employees to your Monday.com Employees board');
      log.info('2. Test the scraper: npm run scrape-msm');
      log.info('3. Set up scheduling: npm run install-tasks (Windows) or ./cron_scheduler_mac.sh install (Mac/Linux)');
      log.info('\nFor more information, see the README.md file');
    }
    
  } catch (error) {
    log.error(`Installation failed: ${error.message}`);
    process.exit(1);
  }
}

// Run the installer
main();
