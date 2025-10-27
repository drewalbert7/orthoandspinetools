#!/bin/bash

# PRODUCTION DATABASE BACKUP SCRIPT
# This script safely backs up the database without breaking the running system

set -e

# Configuration
BACKUP_DIR="/home/dstrad/orthoandspinetools-main/backups"
RETENTION_DAYS=7
LOG_FILE="/home/dstrad/orthoandspinetools-main/logs/database-backup.log"
CONTAINER_NAME="orthoandspinetools-postgres"
DB_NAME="orthoandspinetools"
DB_USER="postgres"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Create necessary directories
mkdir -p "$BACKUP_DIR"
mkdir -p "$(dirname "$LOG_FILE")"

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

# Check if container is running
check_container() {
    if ! docker ps | grep -q "$CONTAINER_NAME"; then
        error "PostgreSQL container is not running"
        return 1
    fi
    return 0
}

# Create full database backup
create_backup() {
    local backup_file="$BACKUP_DIR/backup_$(date +%Y%m%d_%H%M%S).sql"
    
    log "Creating database backup: $backup_file"
    
    if docker exec "$CONTAINER_NAME" pg_dump -U "$DB_USER" -d "$DB_NAME" > "$backup_file" 2>>"$LOG_FILE"; then
        success "Database backup created successfully: $backup_file"
        
        # Compress backup
        if gzip "$backup_file"; then
            success "Backup compressed: ${backup_file}.gz"
            
            # Get file size
            local file_size
            file_size=$(du -h "${backup_file}.gz" | cut -f1)
            log "Backup size: $file_size"
            
            return 0
        else
            error "Failed to compress backup"
            return 1
        fi
    else
        error "Failed to create database backup"
        return 1
    fi
}

# Clean old backups
clean_old_backups() {
    log "Cleaning backups older than $RETENTION_DAYS days..."
    
    local deleted_count
    deleted_count=$(find "$BACKUP_DIR" -name "backup_*.sql.gz" -type f -mtime +$RETENTION_DAYS -delete -print 2>/dev/null | wc -l)
    
    if [[ $deleted_count -gt 0 ]]; then
        success "Cleaned $deleted_count old backups"
    else
        log "No old backups to clean"
    fi
}

# Main backup function
main() {
    echo "=========================================="
    log "Starting Database Backup System..."
    echo "=========================================="
    
    # Check if container is running
    if ! check_container; then
        error "Cannot create backup - container not running"
        exit 1
    fi
    
    # Create backup
    if ! create_backup; then
        error "Backup creation failed"
        exit 1
    fi
    
    # Clean old backups
    clean_old_backups
    
    # List recent backups
    log "Recent backups:"
    ls -lht "$BACKUP_DIR"/backup_*.sql.gz 2>/dev/null | head -5 || log "No backups found"
    
    echo "=========================================="
    success "Database backup completed successfully"
    echo "=========================================="
}

# Run the backup system
main "$@"

