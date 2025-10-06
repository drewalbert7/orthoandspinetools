#!/bin/bash

# AUTOMATED COMMUNITIES MONITORING
# This script runs continuously to monitor and prevent communities from breaking

set -e

# Configuration
PROJECT_ROOT="/home/dstrad/orthoandspinetools-main"
API_BASE_URL="https://orthoandspinetools.com"
CHECK_INTERVAL=300  # 5 minutes
LOG_FILE="/tmp/communities-monitor.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

# Check communities API health
check_api_health() {
    local response
    response=$(curl -s -w "%{http_code}" "${API_BASE_URL}/api/communities" 2>/dev/null)
    local http_code="${response: -3}"
    local body="${response%???}"
    
    if [[ "$http_code" == "200" ]]; then
        if echo "$body" | grep -q '"success":true' && echo "$body" | grep -q '"data":\['; then
            return 0
        fi
    fi
    return 1
}

# Check backend logs for errors
check_backend_errors() {
    local log_output
    log_output=$(cd "$PROJECT_ROOT" && docker-compose logs backend --tail=20 2>/dev/null)
    
    if echo "$log_output" | grep -q "column.*does not exist"; then
        return 1
    fi
    return 0
}

# Run protection system
run_protection() {
    log "Running communities protection check..."
    
    if ! check_api_health; then
        error "Communities API health check failed"
        return 1
    fi
    
    if ! check_backend_errors; then
        error "Backend error check failed"
        return 1
    fi
    
    success "All protection checks passed"
    return 0
}

# Main monitoring loop
main() {
    log "Starting Communities Monitoring System..."
    log "Check interval: ${CHECK_INTERVAL} seconds"
    
    while true; do
        if ! run_protection; then
            error "Protection checks failed - running emergency recovery"
            
            # Run the protection script
            if "$PROJECT_ROOT/scripts/communities-protection.sh"; then
                success "Emergency recovery completed"
            else
                error "Emergency recovery failed - alerting"
                # Here you could add email alerts, Slack notifications, etc.
            fi
        fi
        
        log "Sleeping for ${CHECK_INTERVAL} seconds..."
        sleep "$CHECK_INTERVAL"
    done
}

# Handle script termination
cleanup() {
    log "Monitoring system stopped"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Run the monitoring system
main "$@"
