#!/bin/bash

# DATABASE VOLUME PROTECTION SYSTEM
# This script prevents accidental deletion of database volumes
# It must be run before any docker volume operations

set -e

# Configuration
PROJECT_ROOT="/home/dstrad/orthoandspinetools-main"
BACKUP_DIR="/home/dstrad/orthoandspinetools-main/backups"
PROTECTED_VOLUMES=(
    "orthoandspinetools-main_postgres_data"
    "orthoandspinetools-medical-platform_postgres_data"
)
LOG_FILE="/tmp/database-volume-protection.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
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

# Check if a volume is protected
is_protected_volume() {
    local volume_name="$1"
    for protected in "${PROTECTED_VOLUMES[@]}"; do
        if [[ "$volume_name" == "$protected" ]]; then
            return 0
        fi
    done
    return 1
}

# Create emergency backup before any dangerous operation
create_emergency_backup() {
    log "Creating emergency backup before volume operation..."
    
    local backup_file="$BACKUP_DIR/emergency_backup_$(date +%Y%m%d_%H%M%S).sql.gz"
    
    if docker exec orthoandspinetools-postgres pg_dump -U postgres -d orthoandspinetools 2>/dev/null | gzip > "$backup_file"; then
        success "Emergency backup created: $backup_file"
        return 0
    else
        error "Failed to create emergency backup!"
        return 1
    fi
}

# Verify volume exists and is in use
verify_volume() {
    local volume_name="$1"
    
    log "Verifying volume: $volume_name"
    
    # Check if volume exists
    if ! docker volume inspect "$volume_name" >/dev/null 2>&1; then
        error "Volume $volume_name does not exist!"
        return 1
    fi
    
    # Check if volume is in use
    local containers
    containers=$(docker ps -a --filter volume="$volume_name" --format "{{.Names}}" 2>/dev/null)
    
    if [[ -n "$containers" ]]; then
        warning "Volume $volume_name is in use by containers: $containers"
        return 1
    fi
    
    success "Volume $volume_name verified"
    return 0
}

# Prevent volume deletion with confirmation
prevent_volume_deletion() {
    local volume_name="$1"
    
    echo ""
    echo -e "${BOLD}${RED}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${RED}║  🚨 CRITICAL: DATABASE VOLUME DELETION PREVENTION 🚨      ║${NC}"
    echo -e "${BOLD}${RED}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${RED}You are attempting to delete a PROTECTED database volume!${NC}"
    echo ""
    echo -e "${YELLOW}Volume: ${BOLD}$volume_name${NC}"
    echo ""
    echo -e "${RED}This action will:${NC}"
    echo -e "  • ${RED}Permanently delete ALL database data${NC}"
    echo -e "  • ${RED}Delete ALL users, posts, comments, and communities${NC}"
    echo -e "  • ${RED}This action CANNOT be undone${NC}"
    echo ""
    echo -e "${YELLOW}To proceed, you must:${NC}"
    echo -e "  1. Create a backup first (automatic backup will be created)"
    echo -e "  2. Type the full volume name to confirm: ${BOLD}$volume_name${NC}"
    echo ""
    read -p "Type the volume name to confirm deletion: " confirmation
    
    if [[ "$confirmation" != "$volume_name" ]]; then
        error "Confirmation failed. Volume deletion CANCELLED."
        log "Volume deletion cancelled - incorrect confirmation"
        return 1
    fi
    
    # Create emergency backup
    if ! create_emergency_backup; then
        error "Cannot proceed without backup. Volume deletion CANCELLED."
        return 1
    fi
    
    echo ""
    read -p "Are you ABSOLUTELY SURE you want to delete this volume? (type 'DELETE' to confirm): " final_confirmation
    
    if [[ "$final_confirmation" != "DELETE" ]]; then
        error "Final confirmation failed. Volume deletion CANCELLED."
        log "Volume deletion cancelled - final confirmation failed"
        return 1
    fi
    
    warning "Proceeding with volume deletion after double confirmation..."
    return 0
}

# Check for dangerous docker commands
check_dangerous_commands() {
    local command="$1"
    local volume_name="$2"
    
    # List of dangerous commands
    local dangerous_commands=(
        "docker volume rm"
        "docker volume prune"
        "docker-compose down -v"
        "docker compose down -v"
        "docker system prune --volumes"
    )
    
    for dangerous in "${dangerous_commands[@]}"; do
        if [[ "$command" == *"$dangerous"* ]]; then
            if [[ -n "$volume_name" ]] && is_protected_volume "$volume_name"; then
                return 0  # Dangerous command detected
            elif [[ "$command" == *"prune"* ]] || [[ "$command" == *"-v"* ]]; then
                return 0  # Prune or -v flag is dangerous
            fi
        fi
    done
    
    return 1  # Not dangerous
}

# Main protection function
protect_volume() {
    local volume_name="$1"
    local operation="${2:-delete}"
    
    if ! is_protected_volume "$volume_name"; then
        log "Volume $volume_name is not protected"
        return 0
    fi
    
    log "Protected volume detected: $volume_name"
    
    case "$operation" in
        "delete"|"rm"|"remove")
            if ! prevent_volume_deletion "$volume_name"; then
                exit 1
            fi
            ;;
        "prune")
            error "Volume prune operation detected on protected volume: $volume_name"
            error "This operation is BLOCKED to prevent accidental data loss"
            exit 1
            ;;
        *)
            warning "Unknown operation: $operation"
            ;;
    esac
}

# List protected volumes
list_protected_volumes() {
    echo ""
    echo -e "${BOLD}Protected Database Volumes:${NC}"
    echo ""
    for volume in "${PROTECTED_VOLUMES[@]}"; do
        if docker volume inspect "$volume" >/dev/null 2>&1; then
            local size
            size=$(docker volume inspect "$volume" --format '{{ .Mountpoint }}' | xargs du -sh 2>/dev/null | cut -f1 || echo "unknown")
            echo -e "  ${GREEN}✓${NC} $volume (Size: $size)"
        else
            echo -e "  ${YELLOW}⚠${NC} $volume (not found)"
        fi
    done
    echo ""
}

# Show protection status
show_status() {
    echo ""
    echo -e "${BOLD}${BLUE}Database Volume Protection Status${NC}"
    echo "=========================================="
    echo ""
    
    list_protected_volumes
    
    # Check backup status
    local backup_count
    backup_count=$(find "$BACKUP_DIR" -name "*.sql.gz" -type f 2>/dev/null | wc -l)
    
    if [[ $backup_count -gt 0 ]]; then
        local latest_backup
        latest_backup=$(ls -t "$BACKUP_DIR"/*.sql.gz 2>/dev/null | head -1)
        local backup_date
        backup_date=$(stat -c %y "$latest_backup" 2>/dev/null | cut -d' ' -f1 || echo "unknown")
        success "Backups available: $backup_count (Latest: $backup_date)"
    else
        warning "No backups found!"
    fi
    
    echo ""
    success "Protection system is ACTIVE"
    echo ""
}

# Main function
main() {
    case "${1:-status}" in
        "status")
            show_status
            ;;
        "list")
            list_protected_volumes
            ;;
        "protect")
            if [[ -z "$2" ]]; then
                error "Usage: $0 protect <volume_name> [operation]"
                exit 1
            fi
            protect_volume "$2" "${3:-delete}"
            ;;
        "backup")
            create_emergency_backup
            ;;
        *)
            echo "Usage: $0 {status|list|protect|backup}"
            echo ""
            echo "Commands:"
            echo "  status  - Show protection status"
            echo "  list    - List protected volumes"
            echo "  protect - Protect a volume operation"
            echo "  backup  - Create emergency backup"
            exit 1
            ;;
    esac
}

main "$@"

