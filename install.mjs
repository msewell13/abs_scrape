#!/usr/bin/env node
/**
 * ABS Scraper Universal Installer
 * 
 * This is a single, platform-agnostic installer that works on Windows, macOS, and Linux.
 * It combines the functionality of install.bat, install.sh, and install.mjs into one file.
 * 
 * Usage: 
 *   node install.mjs
 *   ./install.mjs (on Unix systems after making executable)
 *   install.mjs (on Windows)
 */

import { execSync, spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'fs';
import { platform, arch } from 'os';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get the directory of this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

// Make script executable on Unix systems
function makeExecutable() {
  if (platform() !== 'win32') {
    try {
      chmodSync(__filename, '755');
      log.info('Made installer executable');
    } catch (error) {
      log.warn('Could not make installer executable (this is normal)');
    }
  }
}


// Check Node.js installation
function checkNodeJS() {
  log.step('Checking Node.js installation...');
  
  if (!commandExists('node')) {
    log.error('Node.js is not installed!');
    log.info('\nPlease install Node.js first:');
    log.info('1. Go to https://nodejs.org/');
    log.info('2. Download the LTS version (recommended)');
    log.info('3. Run the installer and follow the instructions');
    log.info('4. Restart your terminal and run this script again');
    log.info('\nVerify installation with: node --version');
    process.exit(1);
  }
  
  try {
    const version = execSync('node --version', { encoding: 'utf8' }).trim();
    const majorVersion = parseInt(version.replace('v', '').split('.')[0]);
    
    if (majorVersion >= 16) {
      log.success(`Node.js ${version} is installed and compatible`);
    } else {
      log.error(`Node.js ${version} is too old. Need version 16 or higher.`);
      log.info('Please update Node.js from https://nodejs.org/');
      process.exit(1);
    }
  } catch (error) {
    log.error('Could not determine Node.js version');
    process.exit(1);
  }
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
    log.info('Project files not found, cloning repository...');
    
    const repoUrl = 'https://github.com/msewell13/abs_scrape.git';
    const projectDir = 'abs_scrape';
    
    try {
      // Clone the repository
      log.info(`Cloning repository from ${repoUrl}...`);
      execSync(`git clone ${repoUrl} ${projectDir}`, { stdio: 'inherit' });
      
      // Change to the project directory
      process.chdir(projectDir);
      log.info(`Changed to project directory: ${process.cwd()}`);
      
      log.success('Repository cloned successfully');
    } catch (error) {
      log.error('Failed to clone repository');
      log.info('Please download the project files manually:');
      log.info('1. Go to https://github.com/msewell13/abs_scrape');
      log.info('2. Download as ZIP or clone with git');
      log.info('3. Extract to a folder');
      log.info('4. Run this installer from within that folder');
      process.exit(1);
    }
  }
  
  log.success('Repository setup complete');
}

// Fix npm permissions (Linux/macOS)
async function fixNpmPermissions() {
  const platform = process.platform;
  
  if (platform === 'linux' || platform === 'darwin') {
    log.info('Checking npm permissions...');
    
    try {
      // Try to fix npm cache permissions
      const npmCacheDir = execSync('npm config get cache', { encoding: 'utf8' }).trim();
      if (npmCacheDir && npmCacheDir !== 'undefined') {
        log.info('Fixing npm cache permissions...');
        execSync(`sudo chown -R $(id -u):$(id -g) "${npmCacheDir}"`, { stdio: 'inherit' });
        log.success('npm cache permissions fixed');
      }
    } catch (error) {
      log.warn('Could not fix npm permissions automatically');
      log.info('If you encounter permission errors, run: sudo chown -R $(id -u):$(id -g) ~/.npm');
    }
  }
}

// Install dependencies
async function installDependencies() {
  log.step('Installing dependencies...');
  
  // Fix npm permissions first
  await fixNpmPermissions();
  
  log.info('Installing npm packages...');
  try {
    execSync('npm install', { stdio: 'inherit' });
  } catch (error) {
    log.warn('npm install failed, trying with cache clean...');
    try {
      execSync('npm cache clean --force', { stdio: 'inherit' });
      execSync('npm install', { stdio: 'inherit' });
    } catch (retryError) {
      log.error('npm install failed even after cache clean');
      log.info('Please try running these commands manually:');
      log.info('  sudo chown -R $(id -u):$(id -g) ~/.npm');
      log.info('  npm cache clean --force');
      log.info('  npm install');
      throw retryError;
    }
  }
  
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
    
    console.log('\n--- ConnectTeam Integration (Optional) ---');
    console.log('ConnectTeam integration allows sending notifications to employees about shift issues.');
    const enableConnectTeam = await askQuestion(rl, 'Enable ConnectTeam notifications? (y/n): ');
    
    let ctApiKey = '';
    let ctSenderId = '';
    let ctNotificationsEnabled = 'False';
    
    if (enableConnectTeam.toLowerCase() === 'y' || enableConnectTeam.toLowerCase() === 'yes') {
      ctApiKey = await askQuestion(rl, 'ConnectTeam API Key: ');
      ctSenderId = await askQuestion(rl, 'ConnectTeam Sender ID: ');
      ctNotificationsEnabled = 'True';
    }
    
    console.log('\n--- Call Logger Settings ---');
    const callLoggerNotes = await askQuestion(rl, 'Enable Call Logger Notes? (y/n): ');
    const callLoggerEnabled = (callLoggerNotes.toLowerCase() === 'y' || callLoggerNotes.toLowerCase() === 'yes') ? 'True' : 'False';
    
    console.log('\n--- Schedule Configuration ---');
    console.log('How often should the MSM scraper run?');
    console.log('  daily  - Run once per day at 9:00 AM (recommended)');
    console.log('  hourly - Run every hour starting at 9:00 AM');
    const scheduleChoice = await askQuestion(rl, 'Choose schedule (daily/hourly) [daily]: ');
    const msmSchedule = scheduleChoice.toLowerCase() === 'hourly' ? 'hourly' : 'daily';
    
    rl.close();
    
    return { 
      absUser, 
      absPass, 
      mondayToken, 
      ctApiKey, 
      ctSenderId, 
      ctNotificationsEnabled,
      callLoggerEnabled,
      msmSchedule
    };
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

# ConnectTeam API Configuration
CT_API_KEY=${credentials.ctApiKey}
CT_SENDER_ID=${credentials.ctSenderId}

# Debug and Feature Flags
DEBUG=False
CALL_LOGGER_NOTES=${credentials.callLoggerEnabled}
CT_NOTIFICATIONS_ENABLED=${credentials.ctNotificationsEnabled}

# Schedule Configuration
MSM_SCHEDULE=${credentials.msmSchedule}

# Instructions:
# 1. Replace the placeholder values above with your actual Monday.com API token and board IDs
# 2. Set DEBUG=True to run scrapers in visible browser mode, DEBUG=False for headless mode
# 3. Set CALL_LOGGER_NOTES=True to log employee comments in call logger, CALL_LOGGER_NOTES=False to skip
# 4. Set CT_NOTIFICATIONS_ENABLED=True to enable ConnectTeam notifications, CT_NOTIFICATIONS_ENABLED=False to disable
# 5. EMPLOYEE_BOARD_ID is the Monday.com board ID for the employee lookup board
# 6. MSM_SCHEDULE controls how often the scraper runs: 'daily' (9:00 AM) or 'hourly' (every hour)
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
    
    // Run employee sync after board creation
    await syncEmployees();
  } catch (error) {
    log.error('Failed to create Monday.com boards');
    log.warn('You can run this manually later with: npm run setup-boards');
  }
}

// Sync employees from ConnectTeam to Monday.com
async function syncEmployees() {
  log.step('Syncing employees from ConnectTeam to Monday.com...');
  
  try {
    // Import the employee sync module
    const { default: EmployeeSync } = await import('./employee_sync.mjs');
    const employeeSync = new EmployeeSync();
    
    log.info('Starting employee synchronization...');
    const result = await employeeSync.syncEmployees();
    
    log.success(`Employee sync completed: ${result.created} created, ${result.updated} updated, ${result.errors} errors`);
  } catch (error) {
    log.error('Employee sync failed:', error.message);
    log.warn('You can run employee sync manually later');
  }
}

// Set up automated scheduling
async function setupScheduling(system, msmSchedule) {
  log.step('Setting up automated scheduling...');
  
  try {
    if (system.os === 'windows') {
      log.info('Installing Windows Task Scheduler tasks...');
      // Set the environment variable and run the installer
      const env = { ...process.env, MSM_SCHEDULE: msmSchedule };
      execSync('node cron_scheduler.mjs --install-windows', { stdio: 'inherit', env });
      log.success('Windows Task Scheduler tasks installed successfully');
      log.info(`MSM scraper will run ${msmSchedule === 'hourly' ? 'every hour' : 'daily at 9:00 AM'}`);
    } else if (system.os === 'macos' || system.os === 'linux') {
      log.info('Making shell script executable...');
      try {
        chmodSync('cron_scheduler_mac.sh', '755');
        log.info('Shell script is now executable');
      } catch (error) {
        log.warn('Could not make shell script executable (this is normal)');
      }
      
      log.info('Installing cron jobs...');
      // Set the environment variable and run the installer
      const env = { ...process.env, MSM_SCHEDULE: msmSchedule };
      execSync('./cron_scheduler_mac.sh install', { stdio: 'inherit', env });
      log.success('Cron jobs installed successfully');
      log.info(`MSM scraper will run ${msmSchedule === 'hourly' ? 'every hour' : 'daily at 9:00 AM'}`);
    } else {
      log.warn(`Scheduling not supported on ${system.os}`);
      log.info('Please set up scheduling manually:');
      if (system.os === 'windows') {
        log.info('  npm run install-tasks');
      } else {
        log.info('  ./cron_scheduler_mac.sh install');
      }
    }
  } catch (error) {
    log.error('Failed to set up automated scheduling');
    log.warn('You can set this up manually later:');
    if (system.os === 'windows') {
      log.info('  npm run install-tasks');
    } else {
      log.info('  ./cron_scheduler_mac.sh install');
    }
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
🚀 ABS Scraper Universal Installer

This installer works on Windows, macOS, and Linux systems.

Usage: 
  node install.mjs [options]
  ./install.mjs [options] (on Unix systems)

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
    
    log.title('🚀 ABS Scraper Universal Installer');
    
    const system = detectOS();
    log.info(`Detected system: ${system.os} (${system.arch})`);
    
    // Make script executable on Unix systems
    makeExecutable();
    
    // Check for test mode
    const isTestMode = process.argv.includes('--test');
    
    // Check Node.js installation
    checkNodeJS();
    
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
      await setupScheduling(system, credentials.msmSchedule);
      await testInstallation();
      
      log.title('🎉 Installation Complete!');
      log.success('Your ABS scraper is now installed and configured!');
      log.info('\nNext steps:');
      log.info('1. Add some employees to your Monday.com Employees board');
      log.info('2. Test the scraper: npm run scrape-msm');
      log.info(`3. The scraper is already scheduled to run ${credentials.msmSchedule === 'hourly' ? 'every hour' : 'daily at 9:00 AM'} automatically!`);
      log.info('\nFor more information, see the README.md file');
    }
    
  } catch (error) {
    log.error(`Installation failed: ${error.message}`);
    process.exit(1);
  }
}

// Run the installer
main();
