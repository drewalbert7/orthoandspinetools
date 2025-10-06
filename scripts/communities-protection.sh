#!/bin/bash

# EMERGENCY COMMUNITIES PROTECTION SYSTEM
# This script prevents communities from breaking by ensuring backend is always properly compiled

set -e

# Configuration
PROJECT_ROOT="/home/dstrad/orthoandspinetools-main"
API_BASE_URL="https://orthoandspinetools.com"
LOG_FILE="/tmp/communities-protection.log"

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

# Check if communities API is working
check_communities_api() {
    log "Checking communities API..."
    
    local response
    response=$(curl -s -w "%{http_code}" "${API_BASE_URL}/api/communities" 2>/dev/null)
    local http_code="${response: -3}"
    local body="${response%???}"
    
    if [[ "$http_code" == "200" ]]; then
        # Check if response contains valid JSON with communities
        if echo "$body" | grep -q '"success":true' && echo "$body" | grep -q '"data":\['; then
            success "Communities API is working correctly"
            return 0
        else
            error "Communities API returned invalid response"
            return 1
        fi
    else
        error "Communities API returned HTTP $http_code"
        return 1
    fi
}

# Check backend logs for database column errors
check_backend_logs() {
    log "Checking backend logs for database column errors..."
    
    local log_output
    log_output=$(cd "$PROJECT_ROOT" && docker-compose logs backend --tail=50 2>/dev/null)
    
    # Check for database column errors
    if echo "$log_output" | grep -q "column.*does not exist"; then
        error "Database column errors found in backend logs"
        echo "$log_output" | grep "column.*does not exist" | tee -a "$LOG_FILE"
        return 1
    fi
    
    success "No database column errors found in backend logs"
    return 0
}

# Check if backend needs to be rebuilt
check_backend_build() {
    log "Checking if backend needs to be rebuilt..."
    
    local backend_dir="$PROJECT_ROOT/backend"
    local dist_dir="$backend_dir/dist"
    
    if [[ ! -d "$dist_dir" ]]; then
        warning "Backend dist directory not found - needs build"
        return 1
    fi
    
    # Check if source files are newer than dist files
    local source_newer=false
    for ts_file in "$backend_dir/src"/*.ts; do
        if [[ -f "$ts_file" ]]; then
            local dist_file="${dist_dir}/$(basename "${ts_file%.ts}.js")"
            if [[ -f "$dist_file" ]]; then
                if [[ "$ts_file" -nt "$dist_file" ]]; then
                    source_newer=true
                    break
                fi
            else
                source_newer=true
                break
            fi
        fi
    done
    
    if [[ "$source_newer" == true ]]; then
        warning "Backend source files are newer than compiled files - needs rebuild"
        return 1
    fi
    
    success "Backend build is up to date"
    return 0
}

# Force rebuild backend
force_rebuild_backend() {
    log "Force rebuilding backend..."
    
    cd "$PROJECT_ROOT"
    
    # Build backend
    if docker-compose build backend; then
        success "Backend built successfully"
        
        # Restart backend
        if docker-compose up -d backend; then
            success "Backend restarted successfully"
            
            # Wait for backend to start
            sleep 10
            
            # Test API
            if check_communities_api; then
                success "Backend rebuild completed successfully"
                return 0
            else
                error "Backend rebuild failed - API not working"
                return 1
            fi
        else
            error "Failed to restart backend"
            return 1
        fi
    else
        error "Failed to build backend"
        return 1
    fi
}

# Emergency recovery procedure
emergency_recovery() {
    log "Starting emergency recovery procedure..."
    
    # Force rebuild backend
    if force_rebuild_backend; then
        success "Emergency recovery completed successfully"
        return 0
    else
        error "Emergency recovery failed"
        return 1
    fi
}

# Main protection check
main() {
    log "Starting Communities Protection System..."
    echo "=========================================="
    
    local overall_status=0
    
    # Run all checks
    check_communities_api || overall_status=1
    check_backend_logs || overall_status=1
    check_backend_build || overall_status=1
    
    echo "=========================================="
    
    if [[ $overall_status -eq 0 ]]; then
        success "All communities protection checks passed!"
        log "Communities system is healthy"
    else
        error "Communities protection checks failed!"
        log "Starting emergency recovery..."
        
        if emergency_recovery; then
            success "Emergency recovery completed successfully"
        else
            error "Emergency recovery failed - manual intervention required"
            exit 1
        fi
    fi
}

# Run the protection system
main "$@"
