#!/bin/bash

# DATABASE RESTORE SCRIPT
# Restores the database from a backup file

set -e

# Configuration
BACKUP_DIR="/home/dstrad/orthoandspinetools-main/backups"
CONTAINER_NAME="orthoandspinetools-postgres"
DB_NAME="orthoandspinetools"
DB_USER="postgres"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# List available backups
list_backups() {
    echo ""
    echo "Available backups:"
    echo "=========================================="
    
    if [[ -d "$BACKUP_DIR" ]]; then
        local backup_files
        backup_files=$(ls -t "$BACKUP_DIR"/backup_*.sql.gz 2>/dev/null || echo "")
        
        if [[ -z "$backup_files" ]]; then
            error "No backups found in $BACKUP_DIR"
        fi
        
        local count=1
        for backup in $backup_files; do
            local file_name
            file_name=$(basename "$backup")
            local file_size
            file_size=$(du -h "$backup" | cut -f1)
            local file_date
            file_date=$(stat -c %y "$backup" | cut -d' ' -f1,2 | cut -d'.' -f1)
            
            echo "[$count] $file_name"
            echo "     Size: $file_size | Date: $file_date"
            echo ""
            
            count=$((count + 1))
        done
        echo "=========================================="
    else
        error "Backup directory does not exist: $BACKUP_DIR"
    fi
}

# Verify backup file
verify_backup() {
    local backup_file="$1"
    
    if [[ ! -f "$backup_file" ]]; then
        error "Backup file does not exist: $backup_file"
    fi
    
    if [[ ! -s "$backup_file" ]]; then
        error "Backup file is empty: $backup_file"
    fi
    
    log "Verifying backup integrity..."
    if gunzip -t "$backup_file" 2>/dev/null; then
        success "Backup file is valid"
    else
        error "Backup file is corrupted or invalid"
    fi
}

# Restore database
restore_database() {
    local backup_file="$1"
    local temp_sql="/tmp/restore_$(date +%Y%m%d_%H%M%S).sql"
    
    log "Starting database restore..."
    
    # Extract and copy to container
    if gunzip -c "$backup_file" > "$temp_sql"; then
        log "Backup extracted successfully"
    else
        error "Failed to extract backup file"
    fi
    
    # Copy to container
    log "Copying backup to container..."
    if docker cp "$temp_sql" "$CONTAINER_NAME:/tmp/restore.sql"; then
        log "Backup copied to container"
    else
        error "Failed to copy backup to container"
    fi
    
    # Restore database
    log "Restoring database... (this may take a minute)"
    if docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -f /tmp/restore.sql > /dev/null 2>&1; then
        success "Database restored successfully"
    else
        error "Failed to restore database"
    fi
    
    # Cleanup
    rm -f "$temp_sql"
    docker exec "$CONTAINER_NAME" rm -f /tmp/restore.sql 2>/dev/null || true
    
    # Restart backend to refresh Prisma connection
    log "Restarting backend to refresh database connection..."
    docker restart orthoandspinetools-backend > /dev/null 2>&1
    sleep 5
    
    success "Restore completed successfully"
}

# Main function
main() {
    echo ""
    echo "=========================================="
    log "Database Restore Tool"
    echo "=========================================="
    echo ""
    
    # Check for command line argument
    if [[ -n "$1" ]]; then
        local selected_backup
        selected_backup=$(find "$BACKUP_DIR" -name "*$1*" | head -1)
        
        if [[ -z "$selected_backup" ]]; then
            error "Backup file not found matching: $1"
        fi
        
        verify_backup "$selected_backup"
        restore_database "$selected_backup"
    else
        # Interactive mode
        list_backups
        
        echo "Enter the backup number to restore (or 'q' to quit): "
        read -r selection
        
        if [[ "$selection" == "q" ]] || [[ "$selection" == "Q" ]]; then
            log "Restore cancelled"
            exit 0
        fi
        
        local backup_files
        backup_files=($(ls -t "$BACKUP_DIR"/backup_*.sql.gz 2>/dev/null))
        
        if [[ $selection -lt 1 ]] || [[ $selection -gt ${#backup_files[@]} ]]; then
            error "Invalid selection"
        fi
        
        local selected_backup
        selected_backup="${backup_files[$((selection - 1))]}"
        
        echo ""
        log "Selected backup: $(basename "$selected_backup")"
        echo ""
        
        echo "WARNING: This will overwrite the current database!"
        echo "Are you sure you want to continue? (yes/no): "
        read -r confirmation
        
        if [[ "$confirmation" == "yes" ]]; then
            verify_backup "$selected_backup"
            restore_database "$selected_backup"
        else
            log "Restore cancelled"
            exit 0
        fi
    fi
}

# Run the restore system
main "$@"

