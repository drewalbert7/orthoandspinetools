#!/bin/bash

# SETUP AUTOMATED DATABASE BACKUPS
# This script sets up a cron job for automatic database backups

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="$SCRIPT_DIR/database-backup-production.sh"
LOG_FILE="/home/dstrad/orthoandspinetools-main/logs/backup-cron.log"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

error() {
    echo "[ERROR] $1" >&2
}

success() {
    echo "[SUCCESS] $1"
}

# Create log directory
mkdir -p "$(dirname "$LOG_FILE")"

# Add backup script to cron (daily at 2 AM)
setup_cron() {
    log "Setting up automated backups..."
    
    # Check if cron job already exists
    if crontab -l 2>/dev/null | grep -q "database-backup-production.sh"; then
        log "Cron job already exists"
        return 0
    fi
    
    # Create temporary crontab file
    local temp_cron
    temp_cron=$(mktemp)
    
    # Get existing crontab
    crontab -l 2>/dev/null > "$temp_cron" || true
    
    # Add new cron job
    echo "0 2 * * * $BACKUP_SCRIPT >> $LOG_FILE 2>&1" >> "$temp_cron"
    
    # Install new crontab
    if crontab "$temp_cron"; then
        success "Automated backup scheduled (daily at 2 AM)"
        rm "$temp_cron"
        return 0
    else
        error "Failed to install cron job"
        rm "$temp_cron"
        return 1
    fi
}

# Show existing cron jobs
show_cron() {
    log "Current automated backups:"
    crontab -l 2>/dev/null | grep "database-backup-production.sh" || log "No automated backups found"
}

# Remove cron job
remove_cron() {
    log "Removing automated backups..."
    
    local temp_cron
    temp_cron=$(mktemp)
    
    # Get existing crontab
    crontab -l 2>/dev/null | grep -v "database-backup-production.sh" > "$temp_cron"
    
    # Install new crontab
    crontab "$temp_cron"
    rm "$temp_cron"
    
    success "Automated backups removed"
}

# Main function
main() {
    echo ""
    echo "=========================================="
    log "Automated Backup Setup"
    echo "=========================================="
    echo ""
    
    case "${1:-setup}" in
        setup)
            setup_cron
            ;;
        show)
            show_cron
            ;;
        remove)
            remove_cron
            ;;
        *)
            echo "Usage: $0 [setup|show|remove]"
            exit 1
            ;;
    esac
}

# Run the system
main "$@"

