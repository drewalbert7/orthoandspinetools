#!/bin/bash

# PRODUCTION DATABASE BACKUP SCRIPT
# Local dump → Hetzner volume (primary) → Cloudflare R2 (off-site)

set -e

# Configuration
ROOT="/home/dstrad/orthoandspinetools-main"
VOLUME_BACKUP_DIR="/mnt/HC_Volume_106016238/orthoandspinetools-backups"
REPO_BACKUP_DIR="$ROOT/backups"

resolve_backup_dir() {
  if [[ -n "${BACKUP_DIR:-}" ]]; then
    echo "$BACKUP_DIR"
    return
  fi
  if [[ -d "$VOLUME_BACKUP_DIR" && -w "$VOLUME_BACKUP_DIR" ]]; then
    echo "$VOLUME_BACKUP_DIR"
    return
  fi
  if [[ -d "/mnt/HC_Volume_106016238" ]]; then
    mkdir -p "$VOLUME_BACKUP_DIR" 2>/dev/null || true
    if [[ -d "$VOLUME_BACKUP_DIR" && -w "$VOLUME_BACKUP_DIR" ]]; then
      echo "$VOLUME_BACKUP_DIR"
      return
    fi
  fi
  echo "$REPO_BACKUP_DIR"
}

BACKUP_DIR="$(resolve_backup_dir)"
RETENTION_DAYS=7
LOG_FILE="$ROOT/logs/database-backup.log"
CONTAINER_NAME="orthoandspinetools-postgres"
DB_NAME="orthoandspinetools"
DB_USER="postgres"
R2_UPLOAD_SCRIPT="$ROOT/scripts/backup-to-r2.js"
# Set SKIP_R2_BACKUP=1 to dump locally only
SKIP_R2_BACKUP="${SKIP_R2_BACKUP:-0}"

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

# Create full database backup; sets LAST_BACKUP_FILE to the .sql.gz path
create_backup() {
    local backup_file="$BACKUP_DIR/backup_$(date +%Y%m%d_%H%M%S).sql"
    LAST_BACKUP_FILE=""
    
    log "Creating database backup: $backup_file"
    
    if docker exec "$CONTAINER_NAME" pg_dump -U "$DB_USER" -d "$DB_NAME" > "$backup_file" 2>>"$LOG_FILE"; then
        success "Database backup created successfully: $backup_file"
        
        if [[ ! -s "$backup_file" ]]; then
            error "Backup file is empty: $backup_file"
            rm -f "$backup_file"
            return 1
        fi

        # Compress backup
        if gzip "$backup_file"; then
            LAST_BACKUP_FILE="${backup_file}.gz"
            success "Backup compressed: $LAST_BACKUP_FILE"
            
            local file_size
            file_size=$(du -h "$LAST_BACKUP_FILE" | cut -f1)
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

upload_to_r2() {
    local file="$1"
    if [[ "$SKIP_R2_BACKUP" == "1" ]]; then
        warning "Skipping R2 off-site upload (SKIP_R2_BACKUP=1)"
        return 0
    fi
    if [[ -z "$file" || ! -f "$file" ]]; then
        error "No backup file to upload to R2"
        return 1
    fi
    if [[ ! -f "$R2_UPLOAD_SCRIPT" ]]; then
        error "R2 upload script missing: $R2_UPLOAD_SCRIPT"
        return 1
    fi
    if ! command -v node >/dev/null 2>&1; then
        error "node is required to upload backups to R2"
        return 1
    fi

    log "Uploading off-site copy to Cloudflare R2..."
    if node "$R2_UPLOAD_SCRIPT" "$file" >>"$LOG_FILE" 2>&1; then
        success "Off-site R2 backup uploaded: $(basename "$file")"
        return 0
    fi
    error "R2 off-site upload failed (local backup kept at $file)"
    return 1
}

# Clean old backups
clean_old_backups() {
    log "Cleaning local backups older than $RETENTION_DAYS days..."
    
    local deleted_count
    deleted_count=$(find "$BACKUP_DIR" -name "backup_*.sql.gz" -type f -mtime +$RETENTION_DAYS -delete -print 2>/dev/null | wc -l)
    
    if [[ $deleted_count -gt 0 ]]; then
        success "Cleaned $deleted_count old local backups"
    else
        log "No old local backups to clean"
    fi
}

# Main backup function
main() {
    echo "=========================================="
    log "Starting Database Backup System..."
    log "Backup directory: $BACKUP_DIR"
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

    # Off-site copy (R2). Fail the job if upload fails so cron/logs surface it;
    # local dump remains on the volume either way.
    if ! upload_to_r2 "$LAST_BACKUP_FILE"; then
        exit 1
    fi
    
    # Clean old backups
    clean_old_backups
    
    # List recent backups
    log "Recent local backups:"
    ls -lht "$BACKUP_DIR"/backup_*.sql.gz 2>/dev/null | head -5 || log "No backups found"
    
    echo "=========================================="
    success "Database backup completed successfully (local + R2)"
    echo "=========================================="
}

# Run the backup system
main "$@"
