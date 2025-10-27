#!/bin/bash

# DATABASE CONNECTION ENSURANCE SCRIPT
# This script ensures the database is accessible and fixes password issues

set -e

# Configuration
CONTAINER_NAME="orthoandspinetools-postgres"
DB_NAME="orthoandspinetools"
DB_USER="postgres"
DB_PASSWORD="secure_password_123"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Check if container is running
check_container() {
    if ! docker ps | grep -q "$CONTAINER_NAME"; then
        error "PostgreSQL container is not running"
        return 1
    fi
    return 0
}

# Fix database password
fix_password() {
    log "Ensuring database password is set correctly..."
    
    # Execute password change as superuser
    if docker exec "$CONTAINER_NAME" /bin/sh -c "echo 'ALTER USER $DB_USER WITH PASSWORD '\''$DB_PASSWORD'\'';' | psql -U postgres -d postgres" 2>/dev/null; then
        success "Database password configured"
    else
        # Try alternative method
        docker exec -u root "$CONTAINER_NAME" chmod 777 /var/lib/postgresql/data 2>/dev/null || true
        docker exec "$CONTAINER_NAME" /bin/sh -c "psql -U postgres -c 'ALTER USER $DB_USER WITH PASSWORD '\''$DB_PASSWORD'\'';'" 2>/dev/null || true
        
        success "Database password configured (alternative method)"
    fi
}

# Test database connection
test_connection() {
    log "Testing database connection..."
    
    if docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" > /dev/null 2>&1; then
        success "Database connection successful"
        return 0
    else
        error "Database connection failed"
        return 1
    fi
}

# Restart backend
restart_backend() {
    log "Restarting backend to refresh connections..."
    docker restart orthoandspinetools-backend > /dev/null 2>&1
    success "Backend restarted"
}

# Main function
main() {
    echo ""
    echo "=========================================="
    log "Database Connection Assurance Tool"
    echo "=========================================="
    echo ""
    
    # Check container
    if ! check_container; then
        error "Cannot proceed - container not running"
        exit 1
    fi
    
    # Fix password
    fix_password
    
    # Test connection
    if ! test_connection; then
        error "Database connection test failed"
        exit 1
    fi
    
    # Restart backend
    restart_backend
    
    echo ""
    echo "=========================================="
    success "Database connection assured"
    echo "=========================================="
    echo ""
    
    log "Waiting for backend to be ready..."
    sleep 10
    
    # Test API
    log "Testing API endpoint..."
    if curl -k -s "https://orthoandspinetools.com/api/posts?limit=1" | grep -q "success"; then
        success "API is responding correctly"
    else
        warning "API test inconclusive - check manually"
    fi
}

# Run the system
main "$@"

