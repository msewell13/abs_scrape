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
    run_script "schedule_scrape.mjs"
}

# Run MSM scraper
run_msm() {
    log "INFO" "=== Running MSM Scraper ==="
    run_script "mobile_shift_maintenance_scrape.mjs"
}

# Run both scrapers
run_both() {
    log "INFO" "=== Running Both Scrapers ==="
    
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
        "# ABS Schedule Scraper - Weekdays at 8:00 AM"
        "0 8 * * 1-5 cd $SCRIPT_DIR && $cron_script schedule >> $LOG_DIR/cron-schedule.log 2>&1"
        ""
        "# ABS MSM Scraper - Weekdays at 9:00 AM"
        "0 9 * * 1-5 cd $SCRIPT_DIR && $cron_script msm >> $LOG_DIR/cron-msm.log 2>&1"
        ""
        "# ABS Both Scrapers - Weekdays at 10:00 AM"
        "0 10 * * 1-5 cd $SCRIPT_DIR && $cron_script both >> $LOG_DIR/cron-both.log 2>&1"
    )
    
    # Check if cron jobs already exist
    if crontab -l 2>/dev/null | grep -q "ABS Schedule Scraper"; then
        log "WARN" "Cron jobs already exist. Use 'crontab -e' to edit manually."
        return 1
    fi
    
    # Add to crontab
    {
        crontab -l 2>/dev/null
        printf '%s\n' "${cron_entries[@]}"
    } | crontab -
    
    if [ $? -eq 0 ]; then
        log "INFO" "✅ Cron jobs installed successfully"
        log "INFO" "Schedule: Weekdays at 8:00 AM"
        log "INFO" "MSM: Weekdays at 9:00 AM"
        log "INFO" "Both: Weekdays at 10:00 AM"
        log "INFO" "Logs: $LOG_DIR/"
    else
        log "ERROR" "❌ Failed to install cron jobs"
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
