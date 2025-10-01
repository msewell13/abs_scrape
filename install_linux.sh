#!/bin/bash

# ABS Mobile Shift Maintenance Scraper - Linux Installation Script
# This script automates the installation and setup process on Linux systems

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"

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
}

# Check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        log "WARN" "This script should not be run as root for security reasons"
        log "WARN" "Please run as a regular user and use sudo when needed"
        exit 1
    fi
}

# Detect Linux distribution
detect_distro() {
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        DISTRO=$ID
        VERSION=$VERSION_ID
    elif [[ -f /etc/redhat-release ]]; then
        DISTRO="rhel"
    elif [[ -f /etc/debian_version ]]; then
        DISTRO="debian"
    else
        DISTRO="unknown"
    fi
    
    log "INFO" "Detected distribution: $DISTRO $VERSION"
}

# Install Node.js
install_nodejs() {
    log "INFO" "Installing Node.js..."
    
    if command -v node >/dev/null 2>&1; then
        NODE_VERSION=$(node --version)
        log "INFO" "Node.js already installed: $NODE_VERSION"
        
        # Check if version is 16 or higher
        NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
        if [[ $NODE_MAJOR -ge 16 ]]; then
            log "INFO" "Node.js version is compatible"
            return 0
        else
            log "WARN" "Node.js version $NODE_VERSION is too old. Need version 16 or higher."
        fi
    fi
    
    # Install Node.js using NodeSource repository
    log "INFO" "Installing Node.js from NodeSource repository..."
    
    case $DISTRO in
        "ubuntu"|"debian")
            curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
            sudo apt-get install -y nodejs
            ;;
        "centos"|"rhel"|"fedora")
            curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
            if command -v dnf >/dev/null 2>&1; then
                sudo dnf install -y nodejs
            else
                sudo yum install -y nodejs
            fi
            ;;
        *)
            log "ERROR" "Unsupported distribution: $DISTRO"
            log "INFO" "Please install Node.js manually from https://nodejs.org/"
            exit 1
            ;;
    esac
    
    # Verify installation
    if command -v node >/dev/null 2>&1; then
        NODE_VERSION=$(node --version)
        log "INFO" "Node.js installed successfully: $NODE_VERSION"
    else
        log "ERROR" "Failed to install Node.js"
        exit 1
    fi
}

# Install project dependencies
install_dependencies() {
    log "INFO" "Installing project dependencies..."
    
    cd "$SCRIPT_DIR"
    
    # Install npm dependencies
    log "INFO" "Installing npm packages..."
    npm install
    
    # Install Playwright browsers
    log "INFO" "Installing Playwright browsers..."
    npx playwright install chromium
    
    log "INFO" "Dependencies installed successfully"
}

# Create environment file template
create_env_template() {
    log "INFO" "Creating .env template..."
    
    if [[ -f "$SCRIPT_DIR/.env" ]]; then
        log "INFO" ".env file already exists, skipping creation"
        return 0
    fi
    
    cat > "$SCRIPT_DIR/.env" << 'EOF'
# ABS Login Credentials
ABS_USER=your_username_here
ABS_PASS=your_password_here
ABS_LOGIN_URL=https://abs.brightstarcare.com/Account/Login

# Monday.com Integration (optional)
MONDAY_API_TOKEN=your_monday_api_token_here
MONDAY_MSM_BOARD_ID=your_board_id_here
EOF
    
    log "INFO" "Created .env template file"
    log "WARN" "Please edit .env file with your actual credentials"
}

# Set up log directory
setup_logs() {
    log "INFO" "Setting up log directory..."
    
    mkdir -p "$LOG_DIR"
    log "INFO" "Log directory created: $LOG_DIR"
}

# Make scripts executable
make_executable() {
    log "INFO" "Making scripts executable..."
    
    chmod +x "$SCRIPT_DIR/cron_scheduler_mac.sh"
    log "INFO" "Scripts made executable"
}

# Test the scraper
test_scraper() {
    log "INFO" "Testing the scraper..."
    
    cd "$SCRIPT_DIR"
    
    # Check if .env file has been configured
    if grep -q "your_username_here" "$SCRIPT_DIR/.env"; then
        log "WARN" "Please configure your credentials in .env file before testing"
        log "WARN" "Skipping scraper test"
        return 0
    fi
    
    # Test the scraper (dry run)
    log "INFO" "Running scraper test..."
    if ./cron_scheduler_mac.sh msm; then
        log "INFO" "Scraper test completed successfully"
    else
        log "WARN" "Scraper test failed - check your credentials and network connection"
    fi
}

# Install cron job
install_cron() {
    log "INFO" "Installing cron job..."
    
    cd "$SCRIPT_DIR"
    
    if ./cron_scheduler_mac.sh install; then
        log "INFO" "Cron job installed successfully"
        log "INFO" "MSM scraper will run every 15 minutes"
    else
        log "ERROR" "Failed to install cron job"
        return 1
    fi
}

# Set up log rotation
setup_log_rotation() {
    log "INFO" "Setting up log rotation..."
    
    # Create logrotate configuration
    sudo tee /etc/logrotate.d/abs_scraper > /dev/null << EOF
$LOG_DIR/*.log {
    daily
    missingok
    rotate 30
    compress
    notifempty
    create 644 $(whoami) $(whoami)
}
EOF
    
    log "INFO" "Log rotation configured"
}

# Main installation function
main() {
    log "INFO" "Starting ABS Mobile Shift Maintenance Scraper installation..."
    
    check_root
    detect_distro
    install_nodejs
    install_dependencies
    create_env_template
    setup_logs
    make_executable
    test_scraper
    
    # Ask user if they want to install cron job
    echo
    read -p "Do you want to install the cron job to run every 15 minutes? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        install_cron
        setup_log_rotation
    else
        log "INFO" "Cron job installation skipped"
        log "INFO" "You can install it later with: ./cron_scheduler_mac.sh install"
    fi
    
    log "INFO" "Installation completed successfully!"
    log "INFO" ""
    log "INFO" "Next steps:"
    log "INFO" "1. Edit .env file with your actual credentials"
    log "INFO" "2. Test the scraper: ./cron_scheduler_mac.sh msm"
    log "INFO" "3. Install cron job: ./cron_scheduler_mac.sh install"
    log "INFO" "4. Monitor logs: tail -f logs/cron-msm.log"
    log "INFO" ""
    log "INFO" "For more information, see linux_setup.md"
}

# Run main function
main "$@"

