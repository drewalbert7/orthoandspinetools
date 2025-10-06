#!/bin/bash

# DATABASE ACCESS CONTROL SYSTEM
# This script manages database access permissions and security

set -e

# Configuration
PROJECT_ROOT="/home/dstrad/orthoandspinetools-main"
DB_NAME="orthoandspinetools"
DB_USER="postgres"
LOG_FILE="/tmp/database-access-control.log"

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

# Check database user permissions
check_user_permissions() {
    log "Checking database user permissions..."
    
    # Check if postgres user exists and has proper permissions
    local user_exists
    user_exists=$(docker-compose exec postgres psql -U "$DB_USER" -c "SELECT 1 FROM pg_user WHERE usename='$DB_USER';" 2>/dev/null | grep -c "1" || echo "0")
    
    if [[ "$user_exists" -eq 1 ]]; then
        success "Database user $DB_USER exists"
    else
        error "Database user $DB_USER does not exist"
        return 1
    fi
    
    # Check if user can create databases
    local can_create_db
    can_create_db=$(docker-compose exec postgres psql -U "$DB_USER" -c "SELECT 1 FROM pg_user WHERE usename='$DB_USER' AND usecreatedb=true;" 2>/dev/null | grep -c "1" || echo "0")
    
    if [[ "$can_create_db" -eq 1 ]]; then
        success "User $DB_USER can create databases"
    else
        warning "User $DB_USER cannot create databases"
    fi
    
    return 0
}

# Check database ownership
check_database_ownership() {
    log "Checking database ownership..."
    
    local db_owner
    db_owner=$(docker-compose exec postgres psql -U "$DB_USER" -c "SELECT datname, datdba FROM pg_database WHERE datname='$DB_NAME';" 2>/dev/null | grep "$DB_NAME" | awk '{print $3}')
    
    if [[ -n "$db_owner" ]]; then
        success "Database $DB_NAME is owned by user ID: $db_owner"
        return 0
    else
        error "Failed to get database ownership information"
        return 1
    fi
}

# Check table permissions
check_table_permissions() {
    log "Checking table permissions..."
    
    local critical_tables=("users" "communities" "posts" "comments")
    local all_good=true
    
    for table in "${critical_tables[@]}"; do
        # Check if table exists and user has access
        if docker-compose exec postgres psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1 FROM $table LIMIT 1;" >/dev/null 2>&1; then
            success "Table $table is accessible"
        else
            error "Table $table is not accessible"
            all_good=false
        fi
    done
    
    if [[ "$all_good" == true ]]; then
        success "All critical tables are accessible"
        return 0
    else
        error "Some critical tables are not accessible"
        return 1
    fi
}

# Check connection limits
check_connection_limits() {
    log "Checking connection limits..."
    
    local max_connections
    max_connections=$(docker-compose exec postgres psql -U "$DB_USER" -c "SHOW max_connections;" 2>/dev/null | grep -v "max_connections" | tr -d ' ')
    
    if [[ -n "$max_connections" ]]; then
        log "Maximum connections: $max_connections"
        success "Connection limits configured"
        return 0
    else
        error "Failed to get connection limits"
        return 1
    fi
}

# Check database security settings
check_security_settings() {
    log "Checking database security settings..."
    
    # Check if SSL is enabled
    local ssl_enabled
    ssl_enabled=$(docker-compose exec postgres psql -U "$DB_USER" -c "SHOW ssl;" 2>/dev/null | grep -v "ssl" | tr -d ' ')
    
    if [[ "$ssl_enabled" == "on" ]]; then
        success "SSL is enabled"
    else
        warning "SSL is not enabled"
    fi
    
    # Check password encryption
    local password_encryption
    password_encryption=$(docker-compose exec postgres psql -U "$DB_USER" -c "SHOW password_encryption;" 2>/dev/null | grep -v "password_encryption" | tr -d ' ')
    
    if [[ "$password_encryption" == "scram-sha-256" ]]; then
        success "Password encryption is enabled (scram-sha-256)"
    else
        warning "Password encryption: $password_encryption"
    fi
    
    return 0
}

# Create read-only user
create_readonly_user() {
    local readonly_user="readonly_user"
    local readonly_password="readonly_password_$(date +%s)"
    
    log "Creating read-only user: $readonly_user"
    
    # Create user
    if docker-compose exec postgres psql -U "$DB_USER" -c "CREATE USER $readonly_user WITH PASSWORD '$readonly_password';" 2>/dev/null; then
        success "Read-only user created: $readonly_user"
    else
        warning "Read-only user may already exist"
    fi
    
    # Grant read-only permissions
    if docker-compose exec postgres psql -U "$DB_USER" -d "$DB_NAME" -c "GRANT CONNECT ON DATABASE $DB_NAME TO $readonly_user;" 2>/dev/null; then
        success "Granted database connection to $readonly_user"
    fi
    
    if docker-compose exec postgres psql -U "$DB_USER" -d "$DB_NAME" -c "GRANT USAGE ON SCHEMA public TO $readonly_user;" 2>/dev/null; then
        success "Granted schema usage to $readonly_user"
    fi
    
    if docker-compose exec postgres psql -U "$DB_USER" -d "$DB_NAME" -c "GRANT SELECT ON ALL TABLES IN SCHEMA public TO $readonly_user;" 2>/dev/null; then
        success "Granted table read access to $readonly_user"
    fi
    
    log "Read-only user credentials: $readonly_user / $readonly_password"
    return 0
}

# Main access control function
main() {
    log "Starting Database Access Control System..."
    echo "=========================================="
    
    local overall_status=0
    
    # Run all checks
    check_user_permissions || overall_status=1
    check_database_ownership || overall_status=1
    check_table_permissions || overall_status=1
    check_connection_limits || overall_status=1
    check_security_settings || overall_status=1
    
    # Create read-only user
    create_readonly_user || overall_status=1
    
    echo "=========================================="
    
    if [[ $overall_status -eq 0 ]]; then
        success "All database access control checks passed!"
        log "Database access control is properly configured"
    else
        error "Some database access control checks failed!"
        log "Database access control needs attention"
        exit 1
    fi
}

# Run the access control system
main "$@"
