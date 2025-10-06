#!/bin/bash

# Pre-Deployment Voting System Checklist
# Run this before every deployment to ensure voting system won't break

set -e

# Configuration
API_BASE_URL="https://orthoandspinetools.com"
PROJECT_ROOT="/home/dstrad/orthoandspinetools-main"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if VoteButton component exists and is correct
check_vote_component() {
    log "Checking VoteButton component..."
    
    local component_file="${PROJECT_ROOT}/frontend/src/components/VoteButton.tsx"
    
    if [[ ! -f "$component_file" ]]; then
        error "VoteButton component file not found"
        return 1
    fi
    
    # Check for proper upvote and downvote handlers
    if ! grep -q "handleVote('upvote')" "$component_file"; then
        error "Upvote handler not found in VoteButton component"
        return 1
    fi
    
    if ! grep -q "handleVote('downvote')" "$component_file"; then
        error "Downvote handler not found in VoteButton component"
        return 1
    fi
    
    # Check for proper vote logic
    if ! grep -q "voteType === 'upvote' ? 1 : -1" "$component_file"; then
        error "Proper vote value logic not found in VoteButton component"
        return 1
    fi
    
    success "VoteButton component is correct"
    return 0
}

# Check database column names in backend code
check_database_columns() {
    log "Checking database column names in backend code..."
    
    local backend_dir="${PROJECT_ROOT}/backend/src"
    local issues_found=false
    
    # Check for snake_case column names in raw SQL queries
    if grep -r "user_id\|community_id\|visit_date" "$backend_dir" --include="*.ts" --include="*.js" 2>/dev/null; then
        error "Found snake_case column names in backend code"
        issues_found=true
    fi
    
    # Check for proper camelCase usage
    if ! grep -r '"userId"\|"communityId"\|"visitDate"' "$backend_dir" --include="*.ts" --include="*.js" 2>/dev/null; then
        warning "No camelCase column names found - this might indicate missing proper column references"
    fi
    
    if [[ "$issues_found" == false ]]; then
        success "Database column names are correct"
    else
        return 1
    fi
    
    return 0
}

# Check if all pages use VoteButton component
check_vote_usage() {
    log "Checking VoteButton usage across all pages..."
    
    local pages=(
        "${PROJECT_ROOT}/frontend/src/pages/Home.tsx"
        "${PROJECT_ROOT}/frontend/src/pages/Community.tsx"
        "${PROJECT_ROOT}/frontend/src/pages/PostDetail.tsx"
    )
    
    for page in "${pages[@]}"; do
        if [[ -f "$page" ]]; then
            if grep -q "VoteButton" "$page"; then
                success "VoteButton found in $(basename "$page")"
            else
                error "VoteButton not found in $(basename "$page")"
                return 1
            fi
        else
            error "Page file not found: $(basename "$page")"
            return 1
        fi
    done
    
    return 0
}

# Test API endpoints
test_api_endpoints() {
    log "Testing API endpoints..."
    
    # Test communities API
    if curl -s -f "${API_BASE_URL}/api/communities" > /dev/null; then
        success "Communities API is responding"
    else
        error "Communities API is not responding"
        return 1
    fi
    
    # Test posts API
    if curl -s -f "${API_BASE_URL}/api/posts" > /dev/null; then
        success "Posts API is responding"
    else
        error "Posts API is not responding"
        return 1
    fi
    
    return 0
}

# Check if backend needs to be rebuilt
check_backend_build() {
    log "Checking if backend needs to be rebuilt..."
    
    local backend_dir="${PROJECT_ROOT}/backend"
    local dist_dir="${backend_dir}/dist"
    
    if [[ ! -d "$dist_dir" ]]; then
        warning "Backend dist directory not found - needs build"
        return 1
    fi
    
    # Check if source files are newer than dist files
    local source_newer=false
    for ts_file in "$backend_dir/src"/*.ts; do
        if [[ -f "$ts_file" ]]; then
            local dist_file="${dist_dir}/$(basename "${ts_file%.ts}.js")}"
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

# Check if frontend needs to be rebuilt
check_frontend_build() {
    log "Checking if frontend needs to be rebuilt..."
    
    local frontend_dir="${PROJECT_ROOT}/frontend"
    local dist_dir="${frontend_dir}/dist"
    
    if [[ ! -d "$dist_dir" ]]; then
        warning "Frontend dist directory not found - needs build"
        return 1
    fi
    
    # Check if source files are newer than dist files
    local source_newer=false
    for tsx_file in "$frontend_dir/src"/*.tsx; do
        if [[ -f "$tsx_file" ]]; then
            if [[ "$tsx_file" -nt "$dist_dir" ]]; then
                source_newer=true
                break
            fi
        fi
    done
    
    if [[ "$source_newer" == true ]]; then
        warning "Frontend source files are newer than compiled files - needs rebuild"
        return 1
    fi
    
    success "Frontend build is up to date"
    return 0
}

# Main checklist function
main() {
    log "Starting Pre-Deployment Voting System Checklist..."
    echo "=========================================="
    
    local overall_status=0
    
    # Run all checks
    check_vote_component || overall_status=1
    check_database_columns || overall_status=1
    check_vote_usage || overall_status=1
    test_api_endpoints || overall_status=1
    check_backend_build || overall_status=1
    check_frontend_build || overall_status=1
    
    echo "=========================================="
    
    if [[ $overall_status -eq 0 ]]; then
        success "All pre-deployment checks passed!"
        log "Safe to deploy - voting system should work correctly"
        echo ""
        echo "Next steps:"
        echo "1. Deploy your changes"
        echo "2. Run post-deployment verification"
        echo "3. Test voting functionality manually"
    else
        error "Some pre-deployment checks failed!"
        log "Please fix the issues above before deploying"
        echo ""
        echo "Common fixes:"
        echo "1. Rebuild backend: docker-compose build backend"
        echo "2. Rebuild frontend: docker-compose build frontend"
        echo "3. Fix database column names in raw SQL queries"
        echo "4. Ensure VoteButton component is properly implemented"
        exit 1
    fi
}

# Run the checklist
main "$@"
