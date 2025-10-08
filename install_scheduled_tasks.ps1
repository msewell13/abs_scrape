# ABS Scraper - Windows Task Scheduler Installation
# This PowerShell script creates scheduled tasks for the scrapers

param(
    [switch]$Force,
    [string]$ScheduleTime = "08:00",
    [string]$MSMTime = "09:00",
    [string]$MSMSchedule = $env:MSM_SCHEDULE ?? "daily"
)

Write-Host "ABS Scraper - Windows Task Scheduler Setup" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
Write-Host ""

# Check if running as administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")

if (-not $isAdmin) {
    Write-Host "WARNING: Not running as administrator. Some tasks may not be created properly." -ForegroundColor Yellow
    Write-Host "Consider running PowerShell as administrator for full functionality." -ForegroundColor Yellow
    Write-Host ""
}

# Get current directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodePath = (Get-Command node).Source
$cronScript = Join-Path $scriptDir "cron_scheduler.mjs"

Write-Host "Script Directory: $scriptDir" -ForegroundColor Cyan
Write-Host "Node Path: $nodePath" -ForegroundColor Cyan
Write-Host "Cron Script: $cronScript" -ForegroundColor Cyan
Write-Host ""

# Function to create a scheduled task
function Create-ScheduledTask {
    param(
        [string]$TaskName,
        [string]$Description,
        [string]$Command,
        [string]$Arguments,
        [string]$ScheduleTime,
        [string]$Days = "MON,TUE,WED,THU,FRI",
        [string]$ScheduleType = "Daily"
    )
    
    Write-Host "Creating task: $TaskName" -ForegroundColor Yellow
    
    try {
        # Check if task already exists
        $existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        
        if ($existingTask -and -not $Force) {
            Write-Host "Task '$TaskName' already exists. Use -Force to overwrite." -ForegroundColor Yellow
            return
        }
        
        if ($existingTask) {
            Write-Host "Removing existing task: $TaskName" -ForegroundColor Yellow
            Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        }
        
        # Create the action
        $action = New-ScheduledTaskAction -Execute $Command -Argument $Arguments -WorkingDirectory $scriptDir
        
        # Create the trigger based on schedule type
        if ($ScheduleType -eq "Hourly") {
            $trigger = New-ScheduledTaskTrigger -Once -At $ScheduleTime -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Days 365)
        } else {
            $trigger = New-ScheduledTaskTrigger -Daily -At $ScheduleTime
        }
        
        # Create the settings with wake-up capabilities
        $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RunOnlyIfNetworkAvailable -WakeToRun
        
        # Create the principal (run as current user)
        $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive
        
        # Register the task
        Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description $Description
        
        Write-Host "✅ Successfully created task: $TaskName" -ForegroundColor Green
        
    } catch {
        Write-Host "❌ Failed to create task '$TaskName': $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Determine schedule based on environment variable
$scheduleType = if ($MSMSchedule -eq "hourly") { "Hourly" } else { "Daily" }
$scheduleDescription = if ($MSMSchedule -eq "hourly") { "Every hour starting at 9:00 AM" } else { "Daily at 9:00 AM" }

Write-Host "MSM Schedule: $MSMSchedule ($scheduleDescription)" -ForegroundColor Cyan
Write-Host ""

# Create tasks
Write-Host "Creating scheduled task..." -ForegroundColor Cyan
Write-Host ""

# MSM Scraper Task
Create-ScheduledTask -TaskName "ABS-MSM-Scraper" -Description "Run ABS Mobile Shift Maintenance scraper with Monday.com sync ($scheduleDescription)" -Command $nodePath -Arguments "`"$cronScript`" --schedule-msm" -ScheduleTime "09:00" -ScheduleType $scheduleType

Write-Host ""
Write-Host "Scheduled Task Installation Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Created task:" -ForegroundColor Cyan
Write-Host "- ABS-MSM-Scraper (Schedule: $scheduleDescription)" -ForegroundColor White
Write-Host ""
Write-Host "Environment Variable:" -ForegroundColor Cyan
Write-Host "- MSM_SCHEDULE=$MSMSchedule" -ForegroundColor White
Write-Host ""
Write-Host "To manage tasks:" -ForegroundColor Cyan
Write-Host "- Open Task Scheduler (taskschd.msc)" -ForegroundColor White
Write-Host "- Look for 'ABS-*' tasks in the Task Scheduler Library" -ForegroundColor White
Write-Host ""
Write-Host "To test tasks manually:" -ForegroundColor Cyan
Write-Host "- Right-click task → Run" -ForegroundColor White
Write-Host "- Or run: node cron_scheduler.mjs --schedule-msm" -ForegroundColor White
