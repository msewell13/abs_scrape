#!/bin/bash

# ABS Scraper Cron Scheduler - macOS/Linux Version
# 
# This script provides cron job functionality for macOS and Linux systems
# 
# Usage:
# - ./cron_scheduler_mac.sh schedule    # Run schedule scraper
# - ./cron_scheduler_mac.sh msm         # Run MSM scraper
# - ./cron_scheduler_mac.sh both        # Run both scrapers
# - ./cron_scheduler_mac.sh install     # Install cron jobs

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"
MAX_LOG_FILES=30
TIMEOUT=1800  # 30 minutes in seconds
RETRIES=3
RETRY_DELAY=5
WAKE_UP_DELAY=30  # 30 seconds to wake up
MAX_WAKE_UP_ATTEMPTS=3

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Logging function
log() {
    local level="$1"
    local message="$2"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    case $level in
        "ERROR") echo -e "${RED}[$timestamp] [ERROR] $message${NC}" ;;
        "WARN")  echo -e "${YELLOW}[$timestamp] [WARN] $message${NC}" ;;
        "INFO")  echo -e "${GREEN}[$timestamp] [INFO] $message${NC}" ;;
        *)       echo -e "${BLUE}[$timestamp] [$level] $message${NC}" ;;
    esac
    
    # Write to log file
    local log_file="$LOG_DIR/cron-$(date +%Y-%m-%d).log"
    echo "[$timestamp] [$level] $message" >> "$log_file"
}

# Wake up computer
wake_up_computer() {
    log "INFO" "Attempting to wake up computer..."
    
    # Detect OS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS: Use caffeinate to prevent sleep
        caffeinate -u -t 1
        log "INFO" "macOS wake-up command executed"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux: Try to wake up from suspend
        if command -v systemctl >/dev/null 2>&1; then
            systemctl suspend-then-hibernate --dry-run 2>/dev/null || true
        fi
        # Fallback: simulate user activity
        touch /tmp/wakeup_signal 2>/dev/null || true
        log "INFO" "Linux wake-up command executed"
    else
        log "WARN" "Unknown OS, cannot wake up computer"
        return 1
    fi
    
    # Wait for system to fully wake up
    log "INFO" "Waiting $WAKE_UP_DELAY seconds for system to wake up..."
    sleep $WAKE_UP_DELAY
    
    return 0
}

# Ensure computer is awake
ensure_computer_is_awake() {
    log "INFO" "Checking if computer is awake..."
    
    for ((attempt=1; attempt<=MAX_WAKE_UP_ATTEMPTS; attempt++)); do
        # Check if system is responsive by testing a simple command
        if uptime >/dev/null 2>&1; then
            log "INFO" "Computer appears to be awake"
            return 0
        fi
        
        log "INFO" "Attempt $attempt/$MAX_WAKE_UP_ATTEMPTS: Computer may be sleeping, attempting wake-up..."
        
        if wake_up_computer; then
            log "INFO" "Wake-up successful"
            return 0
        fi
        
        if [ $attempt -lt $MAX_WAKE_UP_ATTEMPTS ]; then
            log "INFO" "Wake-up attempt $attempt failed, retrying in 10 seconds..."
            sleep 10
        fi
    done
    
    log "WARN" "Could not ensure computer is awake, proceeding anyway..."
    return 1
}

# Run script with timeout and retries
run_script() {
    local script_name="$1"
    local script_path="$SCRIPT_DIR/$script_name"
    local attempt=1
    
    log "INFO" "Starting $script_name..."
    
    while [ $attempt -le $RETRIES ]; do
        log "INFO" "Attempt $attempt/$RETRIES for $script_name"
        
        # Run with timeout
        if timeout $TIMEOUT node "$script_path" 2>&1; then
            log "INFO" "$script_name completed successfully"
            return 0
        else
            local exit_code=$?
            if [ $exit_code -eq 124 ]; then
                log "ERROR" "$script_name timed out after $TIMEOUT seconds"
            else
                log "ERROR" "$script_name failed with exit code $exit_code"
            fi
            
            if [ $attempt -lt $RETRIES ]; then
                log "INFO" "Retrying $script_name in $RETRY_DELAY seconds..."
                sleep $RETRY_DELAY
            fi
        fi
        
        attempt=$((attempt + 1))
    done
    
    log "ERROR" "$script_name failed after $RETRIES attempts"
    return 1
}

# Run schedule scraper
run_schedule() {
    log "INFO" "=== Running Schedule Scraper ==="
    
    # Ensure computer is awake before running
    ensure_computer_is_awake
    
    run_script "schedule_scrape.mjs"
}

# Run MSM scraper
run_msm() {
    log "INFO" "=== Running MSM Scraper ==="
    
    # Ensure computer is awake before running
    ensure_computer_is_awake
    
    run_script "mobile_shift_maintenance_scrape.mjs"
}

# Run both scrapers
run_both() {
    log "INFO" "=== Running Both Scrapers ==="
    
    # Ensure computer is awake before running
    ensure_computer_is_awake
    
    local schedule_success=0
    local msm_success=0
    
    if run_schedule; then
        schedule_success=1
    fi
    
    if run_msm; then
        msm_success=1
    fi
    
    local total_success=$((schedule_success + msm_success))
    log "INFO" "Completed $total_success/2 scrapers successfully"
    
    return $((2 - total_success))
}

# Install cron jobs
install_cron() {
    log "INFO" "=== Installing Cron Jobs ==="
    
    local cron_script="$SCRIPT_DIR/cron_scheduler_mac.sh"
    
    # Create cron entries
    local cron_entries=(
        "# ABS Both Scrapers - Daily at midnight"
        "0 0 * * * cd $SCRIPT_DIR && $cron_script both >> $LOG_DIR/cron-both.log 2>&1"
    )
    
    # Check if cron jobs already exist
    if crontab -l 2>/dev/null | grep -q "ABS Both Scrapers"; then
        log "WARN" "Cron jobs already exist. Use 'crontab -e' to edit manually."
        return 1
    fi
    
    # Add to crontab
    {
        crontab -l 2>/dev/null
        printf '%s\n' "${cron_entries[@]}"
    } | crontab -
    
    if [ $? -eq 0 ]; then
        log "INFO" "✅ Cron job installed successfully"
        log "INFO" "Both Scrapers: Daily at midnight (00:00)"
        log "INFO" "Logs: $LOG_DIR/"
    else
        log "ERROR" "❌ Failed to install cron job"
        return 1
    fi
}

# Cleanup old logs
cleanup_logs() {
    log "INFO" "Cleaning up old log files..."
    
    if [ -d "$LOG_DIR" ]; then
        local log_count=$(find "$LOG_DIR" -name "cron-*.log" | wc -l)
        
        if [ $log_count -gt $MAX_LOG_FILES ]; then
            find "$LOG_DIR" -name "cron-*.log" -type f -printf '%T@ %p\n' | \
            sort -n | head -n $((log_count - MAX_LOG_FILES)) | \
            cut -d' ' -f2- | xargs rm -f
            
            log "INFO" "Cleaned up old log files (kept last $MAX_LOG_FILES)"
        fi
    fi
}

# Show usage
show_usage() {
    echo "ABS Scraper Cron Scheduler - macOS/Linux"
    echo ""
    echo "Usage:"
    echo "  $0 schedule    # Run schedule scraper"
    echo "  $0 msm         # Run MSM scraper"
    echo "  $0 both        # Run both scrapers"
    echo "  $0 install     # Install cron jobs"
    echo "  $0 uninstall   # Remove cron jobs"
    echo ""
    echo "Examples:"
    echo "  # Run schedule scraper now"
    echo "  $0 schedule"
    echo ""
    echo "  # Install cron jobs"
    echo "  $0 install"
    echo ""
    echo "  # View cron jobs"
    echo "  crontab -l"
}

# Uninstall cron jobs
uninstall_cron() {
    log "INFO" "=== Uninstalling Cron Jobs ==="
    
    # Remove ABS-related cron jobs
    crontab -l 2>/dev/null | grep -v "ABS" | crontab -
    
    if [ $? -eq 0 ]; then
        log "INFO" "✅ Cron jobs removed successfully"
    else
        log "ERROR" "❌ Failed to remove cron jobs"
        return 1
    fi
}

# Main execution
main() {
    local command="$1"
    
    case "$command" in
        "schedule")
            run_schedule
            ;;
        "msm")
            run_msm
            ;;
        "both")
            run_both
            ;;
        "install")
            install_cron
            ;;
        "uninstall")
            uninstall_cron
            ;;
        *)
            show_usage
            exit 1
            ;;
    esac
    
    # Cleanup old logs
    cleanup_logs
}

# Run main function with all arguments
main "$@"
