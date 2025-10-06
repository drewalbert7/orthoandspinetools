#!/bin/bash

# Voting System Health Check Script
# This script monitors the voting system to prevent future breakages

set -e

# Configuration
API_BASE_URL="https://orthoandspinetools.com"
TEST_POST_ID="post2"
VERBOSE=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --verbose)
      VERBOSE=true
      shift
      ;;
    *)
      echo "Unknown option $1"
      exit 1
      ;;
  esac
done

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

# Test API endpoint availability
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

# Test voting functionality
test_voting_functionality() {
    log "Testing voting functionality..."
    
    # Get a valid JWT token (you may need to adjust this)
    # For now, we'll test without authentication to see if the endpoint exists
    local vote_response
    
    # Test upvote endpoint
    vote_response=$(curl -s -w "%{http_code}" -X POST "${API_BASE_URL}/api/posts/${TEST_POST_ID}/vote" \
        -H "Content-Type: application/json" \
        -d '{"type":"upvote"}' 2>/dev/null)
    
    local http_code="${vote_response: -3}"
    
    if [[ "$http_code" == "401" ]]; then
        success "Vote endpoint exists (authentication required)"
    elif [[ "$http_code" == "200" ]]; then
        success "Vote endpoint is working"
    else
        error "Vote endpoint returned HTTP $http_code"
        return 1
    fi
    
    return 0
}

# Check database column names in backend code
check_database_columns() {
    log "Checking database column names in backend code..."
    
    local backend_dir="/home/dstrad/orthoandspinetools-main/backend/src"
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

# Check VoteButton component integrity
check_vote_component() {
    log "Checking VoteButton component integrity..."
    
    local component_file="/home/dstrad/orthoandspinetools-main/frontend/src/components/VoteButton.tsx"
    
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
    
    success "VoteButton component integrity verified"
    return 0
}

# Check frontend deployment
check_frontend_deployment() {
    log "Checking frontend deployment..."
    
    local frontend_response
    frontend_response=$(curl -s -w "%{http_code}" "${API_BASE_URL}/" 2>/dev/null)
    local http_code="${frontend_response: -3}"
    
    if [[ "$http_code" == "200" ]]; then
        success "Frontend is deployed and accessible"
        
        # Check if VoteButton component is included in the build
        if curl -s "${API_BASE_URL}/" | grep -q "VoteButton\|vote"; then
            success "Voting components detected in frontend"
        else
            warning "Voting components not clearly detected in frontend HTML"
        fi
    else
        error "Frontend returned HTTP $http_code"
        return 1
    fi
    
    return 0
}

# Check backend logs for errors
check_backend_logs() {
    log "Checking backend logs for voting-related errors..."
    
    local log_output
    log_output=$(cd /home/dstrad/orthoandspinetools-main && docker-compose logs backend --tail=50 2>/dev/null)
    
    # Check for database column errors
    if echo "$log_output" | grep -q "column.*does not exist"; then
        error "Database column errors found in backend logs"
        if [[ "$VERBOSE" == true ]]; then
            echo "$log_output" | grep "column.*does not exist"
        fi
        return 1
    fi
    
    # Check for voting API errors
    if echo "$log_output" | grep -q "vote.*error\|Error.*vote"; then
        warning "Voting-related errors found in backend logs"
        if [[ "$VERBOSE" == true ]]; then
            echo "$log_output" | grep -i "vote.*error\|error.*vote"
        fi
    fi
    
    success "No critical voting errors found in backend logs"
    return 0
}

# Main health check function
main() {
    log "Starting Voting System Health Check..."
    echo "=========================================="
    
    local overall_status=0
    
    # Run all checks
    test_api_endpoints || overall_status=1
    test_voting_functionality || overall_status=1
    check_database_columns || overall_status=1
    check_vote_component || overall_status=1
    check_frontend_deployment || overall_status=1
    check_backend_logs || overall_status=1
    
    echo "=========================================="
    
    if [[ $overall_status -eq 0 ]]; then
        success "All voting system checks passed!"
        log "Voting system is healthy and functioning correctly"
    else
        error "Some voting system checks failed!"
        log "Please review the errors above and fix them before deployment"
        exit 1
    fi
}

# Run the health check
main "$@"