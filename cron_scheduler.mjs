#!/usr/bin/env node

/**
 * Cron Job Scheduler for ABS Scrapers
 * 
 * This script provides multiple scheduling options:
 * 1. Windows Task Scheduler integration
 * 2. Node.js cron job runner
 * 3. Manual execution with logging
 * 
 * Usage:
 * - node cron_scheduler.mjs --schedule-schedule    # Run schedule scraper
 * - node cron_scheduler.mjs --schedule-msm         # Run MSM scraper
 * - node cron_scheduler.mjs --schedule-both        # Run both scrapers
 * - node cron_scheduler.mjs --install-windows      # Install Windows Task Scheduler tasks
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  logDir: path.join(__dirname, 'logs'),
  maxLogFiles: 30, // Keep last 30 log files
  timeout: 30 * 60 * 1000, // 30 minutes timeout
  retries: 3,
  retryDelay: 5000, // 5 seconds
  wakeUpDelay: 30000, // 30 seconds to wake up
  maxWakeUpAttempts: 3 // Try to wake up 3 times
};

class CronScheduler {
  constructor() {
    this.ensureLogDirectory();
  }

  async ensureLogDirectory() {
    try {
      await fs.mkdir(CONFIG.logDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create log directory:', error.message);
    }
  }

  async log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;
    
    console.log(logMessage);
    
    // Write to log file
    const logFile = path.join(CONFIG.logDir, `cron-${new Date().toISOString().split('T')[0]}.log`);
    try {
      await fs.appendFile(logFile, logMessage + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error.message);
    }
  }

  async runScript(scriptName, args = []) {
    const scriptPath = path.join(__dirname, scriptName);
    const command = `node "${scriptPath}" ${args.join(' ')}`;
    
    this.log(`Starting ${scriptName}...`);
    
    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: CONFIG.timeout,
        cwd: __dirname
      });
      
      if (stdout) {
        this.log(`${scriptName} output: ${stdout.trim()}`);
      }
      if (stderr) {
        this.log(`${scriptName} stderr: ${stderr.trim()}`, 'WARN');
      }
      
      this.log(`${scriptName} completed successfully`);
      return { success: true, output: stdout, error: stderr };
      
    } catch (error) {
      this.log(`${scriptName} failed: ${error.message}`, 'ERROR');
      return { success: false, error: error.message };
    }
  }

  async runWithRetry(scriptName, args = []) {
    for (let attempt = 1; attempt <= CONFIG.retries; attempt++) {
      this.log(`Attempt ${attempt}/${CONFIG.retries} for ${scriptName}`);
      
      const result = await this.runScript(scriptName, args);
      
      if (result.success) {
        return result;
      }
      
      if (attempt < CONFIG.retries) {
        this.log(`Retrying ${scriptName} in ${CONFIG.retryDelay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, CONFIG.retryDelay));
      }
    }
    
    this.log(`${scriptName} failed after ${CONFIG.retries} attempts`, 'ERROR');
    return { success: false, error: 'Max retries exceeded' };
  }

  async runScheduleScraper() {
    this.log('=== Running Schedule Scraper ===');
    
    // Ensure computer is awake before running
    await this.ensureComputerIsAwake();
    
    return await this.runWithRetry('schedule_scrape.mjs');
  }

  async runMSMScraper() {
    this.log('=== Running MSM Scraper ===');
    
    // Ensure computer is awake before running
    await this.ensureComputerIsAwake();
    
    return await this.runWithRetry('mobile_shift_maintenance_scrape.mjs');
  }

  async runBothScrapers() {
    this.log('=== Running Both Scrapers ===');
    
    // Ensure computer is awake before running
    await this.ensureComputerIsAwake();
    
    const results = {
      schedule: await this.runScheduleScraper(),
      msm: await this.runMSMScraper()
    };
    
    const successCount = Object.values(results).filter(r => r.success).length;
    this.log(`Completed ${successCount}/2 scrapers successfully`);
    
    return results;
  }

  async installWindowsTasks() {
    this.log('=== Installing Windows Task Scheduler Tasks ===');
    
    const scriptPath = path.join(__dirname, 'cron_scheduler.mjs');
    const nodePath = process.execPath;
    
    const tasks = [
      {
        name: 'ABS-Schedule-Scraper',
        description: 'Run ABS Schedule Scraper with Monday.com sync',
        command: `"${nodePath}" "${scriptPath}" --schedule-schedule`,
        schedule: '0 8 * * 1-5' // 8 AM weekdays
      },
      {
        name: 'ABS-MSM-Scraper',
        description: 'Run ABS MSM Scraper with Monday.com sync',
        command: `"${nodePath}" "${scriptPath}" --schedule-msm`,
        schedule: '0 9 * * 1-5' // 9 AM weekdays
      }
    ];

    for (const task of tasks) {
      try {
        // Create the task
        const createCommand = `schtasks /create /tn "${task.name}" /tr "${task.command}" /sc weekly /d MON,TUE,WED,THU,FRI /st 08:00 /f`;
        await execAsync(createCommand);
        this.log(`Created Windows task: ${task.name}`);
      } catch (error) {
        this.log(`Failed to create task ${task.name}: ${error.message}`, 'ERROR');
      }
    }
    
    this.log('Windows Task Scheduler setup completed');
  }

  async wakeUpComputer() {
    const platform = os.platform();
    this.log(`Attempting to wake up computer (${platform})...`);
    
    try {
      if (platform === 'win32') {
        // Windows: Use powercfg to prevent sleep and wake up
        await execAsync('powercfg /change -standby-timeout-ac 0');
        await execAsync('powercfg /change -standby-timeout-dc 0');
        await execAsync('powercfg /change -hibernate-timeout-ac 0');
        await execAsync('powercfg /change -hibernate-timeout-dc 0');
        
        // Send a wake-up signal (simulate user activity)
        await execAsync('echo wakeup > nul');
        
        this.log('Windows wake-up commands executed');
      } else if (platform === 'darwin') {
        // macOS: Use caffeinate to prevent sleep
        await execAsync('caffeinate -u -t 1');
        this.log('macOS wake-up command executed');
      } else if (platform === 'linux') {
        // Linux: Use systemctl to wake up
        try {
          await execAsync('systemctl suspend-then-hibernate --dry-run');
        } catch (error) {
          // Fallback: simulate user activity
          await execAsync('touch /tmp/wakeup_signal');
        }
        this.log('Linux wake-up command executed');
      }
      
      // Wait for system to fully wake up
      this.log(`Waiting ${CONFIG.wakeUpDelay/1000} seconds for system to wake up...`);
      await new Promise(resolve => setTimeout(resolve, CONFIG.wakeUpDelay));
      
      return true;
    } catch (error) {
      this.log(`Wake-up attempt failed: ${error.message}`, 'WARN');
      return false;
    }
  }

  async ensureComputerIsAwake() {
    this.log('Checking if computer is awake...');
    
    for (let attempt = 1; attempt <= CONFIG.maxWakeUpAttempts; attempt++) {
      try {
        // Test if system is responsive by checking system uptime
        const uptime = os.uptime();
        const lastBoot = new Date(Date.now() - uptime * 1000);
        const timeSinceBoot = Date.now() - lastBoot.getTime();
        
        // If system was booted more than 5 minutes ago, assume it's awake
        if (timeSinceBoot > 5 * 60 * 1000) {
          this.log('Computer appears to be awake');
          return true;
        }
        
        this.log(`Attempt ${attempt}/${CONFIG.maxWakeUpAttempts}: Computer may be sleeping, attempting wake-up...`);
        
        if (await this.wakeUpComputer()) {
          this.log('Wake-up successful');
          return true;
        }
        
        if (attempt < CONFIG.maxWakeUpAttempts) {
          this.log(`Wake-up attempt ${attempt} failed, retrying in 10 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
        
      } catch (error) {
        this.log(`Wake-up check failed: ${error.message}`, 'WARN');
      }
    }
    
    this.log('Could not ensure computer is awake, proceeding anyway...', 'WARN');
    return false;
  }

  async cleanupOldLogs() {
    try {
      const files = await fs.readdir(CONFIG.logDir);
      const logFiles = files
        .filter(file => file.startsWith('cron-') && file.endsWith('.log'))
        .sort()
        .reverse();
      
      if (logFiles.length > CONFIG.maxLogFiles) {
        const filesToDelete = logFiles.slice(CONFIG.maxLogFiles);
        for (const file of filesToDelete) {
          await fs.unlink(path.join(CONFIG.logDir, file));
          this.log(`Deleted old log file: ${file}`);
        }
      }
    } catch (error) {
      this.log(`Failed to cleanup old logs: ${error.message}`, 'WARN');
    }
  }
}

// Main execution
async function main() {
  const scheduler = new CronScheduler();
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  const command = args[0];
  
  try {
    switch (command) {
      case '--schedule-schedule':
        await scheduler.runScheduleScraper();
        break;
        
      case '--schedule-msm':
        await scheduler.runMSMScraper();
        break;
        
      case '--schedule-both':
        await scheduler.runBothScrapers();
        break;
        
      case '--install-windows':
        await scheduler.installWindowsTasks();
        break;
        
      default:
        console.log(`
ABS Scraper Cron Scheduler

Usage:
  node cron_scheduler.mjs --schedule-schedule    # Run schedule scraper
  node cron_scheduler.mjs --schedule-msm         # Run MSM scraper  
  node cron_scheduler.mjs --schedule-both        # Run both scrapers
  node cron_scheduler.mjs --install-windows      # Install Windows Task Scheduler tasks

Examples:
  # Run schedule scraper now
  node cron_scheduler.mjs --schedule-schedule
  
  # Run both scrapers now
  node cron_scheduler.mjs --schedule-both
  
  # Install Windows scheduled tasks
  node cron_scheduler.mjs --install-windows
        `);
        break;
    }
    
    // Cleanup old logs
    await scheduler.cleanupOldLogs();
    
  } catch (error) {
    scheduler.log(`Fatal error: ${error.message}`, 'ERROR');
    process.exit(1);
  }
}

// Run if called directly
if (process.argv[1] && process.argv[1].includes('cron_scheduler.mjs')) {
  main();
}

export default CronScheduler;
