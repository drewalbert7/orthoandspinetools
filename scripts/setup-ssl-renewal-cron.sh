#!/bin/bash
# Install monthly cron for ./update-ssl-certs.sh (1st of month, 03:00 server time).

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RENEW_SCRIPT="$SCRIPT_DIR/ssl-renew-cron.sh"
LOG_FILE="/home/dstrad/orthoandspinetools-main/logs/ssl-renew-cron.log"
CRON_MARKER="ssl-renew-cron.sh"
# 03:00 on the 1st of each month (after daily DB backup at 02:00)
CRON_SCHEDULE="0 3 1 * *"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

error() {
    echo "[ERROR] $1" >&2
}

success() {
    echo "[SUCCESS] $1"
}

mkdir -p "$(dirname "$LOG_FILE")"
chmod +x "$RENEW_SCRIPT" "$SCRIPT_DIR/../update-ssl-certs.sh"

setup_cron() {
    log "Setting up monthly SSL renewal cron..."

    if crontab -l 2>/dev/null | grep -q "$CRON_MARKER"; then
        log "Cron job already exists"
        show_cron
        return 0
    fi

    local temp_cron
    temp_cron=$(mktemp)
    crontab -l 2>/dev/null \
        | grep -v "$CRON_MARKER" \
        | grep -v 'update-ssl-certs.sh' \
        | grep -v 'SSL Certificate Auto-Renewal' \
        | grep -v 'Run every Monday at 2:30 AM' \
        > "$temp_cron" || true
    echo "$CRON_SCHEDULE $RENEW_SCRIPT >> $LOG_FILE 2>&1" >> "$temp_cron"

    if crontab "$temp_cron"; then
        success "SSL renewal scheduled ($CRON_SCHEDULE)"
        log "Log file: $LOG_FILE"
        rm "$temp_cron"
        return 0
    fi

    error "Failed to install cron job"
    rm "$temp_cron"
    return 1
}

show_cron() {
    log "SSL renewal cron entries:"
    crontab -l 2>/dev/null | grep "$CRON_MARKER" || log "None installed"
}

remove_cron() {
    log "Removing SSL renewal cron..."
    local temp_cron
    temp_cron=$(mktemp)
    crontab -l 2>/dev/null \
        | grep -v "$CRON_MARKER" \
        | grep -v 'update-ssl-certs.sh' \
        | grep -v 'SSL Certificate Auto-Renewal' \
        | grep -v 'Run every Monday at 2:30 AM' \
        > "$temp_cron" || true
    crontab "$temp_cron"
    rm "$temp_cron"
    success "SSL renewal cron removed"
}

main() {
    echo ""
    echo "=========================================="
    log "SSL Renewal Cron Setup"
    echo "=========================================="
    echo ""

    case "${1:-setup}" in
        setup) setup_cron ;;
        show) show_cron ;;
        remove) remove_cron ;;
        *)
            echo "Usage: $0 [setup|show|remove]"
            exit 1
            ;;
    esac
}

main "$@"
