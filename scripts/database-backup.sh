#!/bin/bash

# DATABASE BACKUP AUTOMATION
# This script creates automated backups and manages retention

set -e

# Configuration
PROJECT_ROOT="/home/dstrad/orthoandspinetools-main"
DB_NAME="orthoandspinetools"
DB_USER="postgres"
BACKUP_DIR="/home/dstrad/orthoandspinetools-main/backups"
RETENTION_DAYS=30
LOG_FILE="/tmp/database-backup.log"

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

# Create schema-only backup
create_schema_backup() {
    local schema_file="$BACKUP_DIR/schema_$(date +%Y%m%d_%H%M%S).sql"
    
    log "Creating schema backup: $schema_file"
    
    if docker-compose exec -T postgres pg_dump -U "$DB_USER" -d "$DB_NAME" --schema-only > "$schema_file"; then
        success "Schema backup created successfully: $schema_file"
        
        # Compress backup
        gzip "$schema_file"
        success "Schema backup compressed: ${schema_file}.gz"
        
        return 0
    else
        error "Failed to create schema backup"
        return 1
    fi
}

# Create data-only backup
create_data_backup() {
    local data_file="$BACKUP_DIR/data_$(date +%Y%m%d_%H%M%S).sql"
    
    log "Creating data backup: $data_file"
    
    if docker-compose exec -T postgres pg_dump -U "$DB_USER" -d "$DB_NAME" --data-only > "$data_file"; then
        success "Data backup created successfully: $data_file"
        
        # Compress backup
        gzip "$data_file"
        success "Data backup compressed: ${data_file}.gz"
        
        return 0
    else
        error "Failed to create data backup"
        return 1
    fi
}

# Clean old backups
clean_old_backups() {
    log "Cleaning backups older than $RETENTION_DAYS days..."
    
    local deleted_count
    deleted_count=$(find "$BACKUP_DIR" -name "*.sql.gz" -type f -mtime +$RETENTION_DAYS -delete -print | wc -l)
    
    if [[ $deleted_count -gt 0 ]]; then
        success "Cleaned $deleted_count old backups"
    else
        log "No old backups to clean"
    fi
}

# List available backups
list_backups() {
    log "Available backups:"
    
    if [[ -d "$BACKUP_DIR" ]]; then
        ls -la "$BACKUP_DIR"/*.sql.gz 2>/dev/null | while read -r line; do
            log "  $line"
        done
    else
        warning "No backup directory found"
    fi
}

# Verify backup integrity
verify_backup() {
    local backup_file="$1"
    
    if [[ -z "$backup_file" ]]; then
        error "No backup file specified"
        return 1
    fi
    
    log "Verifying backup integrity: $backup_file"
    
    # Check if file exists and is not empty
    if [[ ! -f "$backup_file" ]]; then
        error "Backup file does not exist: $backup_file"
        return 1
    fi
    
    if [[ ! -s "$backup_file" ]]; then
        error "Backup file is empty: $backup_file"
        return 1
    fi
    
    # Check if it's a valid SQL file
    if gunzip -c "$backup_file" | head -1 | grep -q "PostgreSQL database dump"; then
        success "Backup file is valid"
        return 0
    else
        error "Backup file is not a valid PostgreSQL dump"
        return 1
    fi
}

# Main backup function
main() {
    log "Starting Database Backup System..."
    echo "=========================================="
    
    # Create backup directory
    create_backup_dir
    
    # Create backups
    if create_backup; then
        success "Full backup created successfully"
    else
        error "Full backup creation failed"
        exit 1
    fi
    
    if create_schema_backup; then
        success "Schema backup created successfully"
    else
        error "Schema backup creation failed"
        exit 1
    fi
    
    if create_data_backup; then
        success "Data backup created successfully"
    else
        error "Data backup creation failed"
        exit 1
    fi
    
    # Clean old backups
    clean_old_backups
    
    # List backups
    list_backups
    
    echo "=========================================="
    success "Database backup system completed"
}

# Run the backup system
main "$@"
