#!/bin/bash

# DATABASE PROTECTION SYSTEM
# This script protects databases from accidental deletion or corruption

set -e

# Configuration
PROJECT_ROOT="/home/dstrad/orthoandspinetools-main"
DB_NAME="orthoandspinetools"
DB_USER="postgres"
BACKUP_DIR="/home/dstrad/orthoandspinetools-main/backups"
LOG_FILE="/tmp/database-protection.log"

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

# Create backup directory
create_backup_dir() {
    if [[ ! -d "$BACKUP_DIR" ]]; then
        mkdir -p "$BACKUP_DIR"
        log "Created backup directory: $BACKUP_DIR"
    fi
}

# Create full database backup
create_backup() {
    local backup_file="$BACKUP_DIR/backup_$(date +%Y%m%d_%H%M%S).sql"
    
    log "Creating database backup: $backup_file"
    
    if docker-compose exec -T postgres pg_dump -U "$DB_USER" -d "$DB_NAME" > "$backup_file"; then
        success "Database backup created successfully: $backup_file"
        
        # Compress backup
        gzip "$backup_file"
        success "Backup compressed: ${backup_file}.gz"
        
        return 0
    else
        error "Failed to create database backup"
        return 1
    fi
}

# Verify database integrity
verify_database() {
    log "Verifying database integrity..."
    
    # Check if database exists
    if ! docker-compose exec postgres psql -U "$DB_USER" -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
        error "Database $DB_NAME does not exist!"
        return 1
    fi
    
    # Check critical tables exist
    local critical_tables=("users" "communities" "posts" "comments")
    for table in "${critical_tables[@]}"; do
        if ! docker-compose exec postgres psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1 FROM $table LIMIT 1;" >/dev/null 2>&1; then
            error "Critical table $table is missing or corrupted!"
            return 1
        fi
    done
    
    success "Database integrity verified"
    return 0
}

# Check database permissions
check_permissions() {
    log "Checking database permissions..."
    
    # Check if postgres user has proper permissions
    local permissions
    permissions=$(docker-compose exec postgres psql -U "$DB_USER" -d "$DB_NAME" -c "\dp" 2>/dev/null)
    
    if [[ $? -eq 0 ]]; then
        success "Database permissions verified"
        return 0
    else
        error "Database permission check failed"
        return 1
    fi
}

# Monitor database size
monitor_database_size() {
    log "Monitoring database size..."
    
    local db_size
    db_size=$(docker-compose exec postgres psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT pg_size_pretty(pg_database_size('$DB_NAME'));" 2>/dev/null | tr -d ' ')
    
    if [[ -n "$db_size" ]]; then
        log "Database size: $db_size"
        return 0
    else
        error "Failed to get database size"
        return 1
    fi
}

# Count critical records
count_records() {
    log "Counting critical records..."
    
    local user_count
    local community_count
    local post_count
    
    user_count=$(docker-compose exec postgres psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM users;" 2>/dev/null | tr -d ' ')
    community_count=$(docker-compose exec postgres psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM communities;" 2>/dev/null | tr -d ' ')
    post_count=$(docker-compose exec postgres psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM posts;" 2>/dev/null | tr -d ' ')
    
    log "Users: $user_count, Communities: $community_count, Posts: $post_count"
    
    if [[ "$user_count" -gt 0 && "$community_count" -gt 0 ]]; then
        success "Critical records found"
        return 0
    else
        warning "Low record counts detected"
        return 1
    fi
}

# Emergency database recovery
emergency_recovery() {
    log "Starting emergency database recovery..."
    
    # Check if backup exists
    local latest_backup
    latest_backup=$(ls -t "$BACKUP_DIR"/*.sql.gz 2>/dev/null | head -1)
    
    if [[ -z "$latest_backup" ]]; then
        error "No backup found for recovery"
        return 1
    fi
    
    log "Found backup: $latest_backup"
    
    # Restore from backup
    if gunzip -c "$latest_backup" | docker-compose exec -T postgres psql -U "$DB_USER" -d "$DB_NAME"; then
        success "Database recovered from backup"
        return 0
    else
        error "Database recovery failed"
        return 1
    fi
}

# Database protection check
protection_check() {
    log "Running database protection check..."
    
    local overall_status=0
    
    # Run all checks
    verify_database || overall_status=1
    check_permissions || overall_status=1
    monitor_database_size || overall_status=1
    count_records || overall_status=1
    
    return $overall_status
}

# Main protection function
main() {
    log "Starting Database Protection System..."
    echo "=========================================="
    
    # Create backup directory
    create_backup_dir
    
    # Create backup
    if create_backup; then
        success "Backup created successfully"
    else
        error "Backup creation failed"
        exit 1
    fi
    
    # Run protection checks
    if protection_check; then
        success "All database protection checks passed!"
        log "Database is protected and healthy"
    else
        error "Database protection checks failed!"
        log "Database may be at risk"
        exit 1
    fi
    
    echo "=========================================="
    log "Database protection system completed"
}

# Run the protection system
main "$@"
