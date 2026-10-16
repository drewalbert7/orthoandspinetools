#!/usr/bin/env bash
#
# disk-alert.sh — Alert when disk usage exceeds threshold
#
# Usage: ./disk-alert.sh
#
# Checks:
#   - Root filesystem (/)
#   - Docker data root (default: /var/lib/docker)
#
# Alert threshold: 85% (configurable via DISK_ALERT_THRESHOLD)
#
# Alert delivery:
#   - Always logs to DISK_ALERT_LOG (default: /var/log/disk-alert.log)
#   - If DISK_ALERT_WEBHOOK is set, POSTs JSON payload to that URL
#
# Environment variables:
#   DISK_ALERT_THRESHOLD  - Percentage threshold (default: 85)
#   DISK_ALERT_LOG        - Log file path (default: /var/log/disk-alert.log)
#   DISK_ALERT_WEBHOOK    - Webhook URL for alerts (optional)
#   DOCKER_DATA_ROOT      - Docker data directory (default: /var/lib/docker)
#
# Cron example (every 15 minutes):
#   */15 * * * * /path/to/disk-alert.sh
#
# See: scripts/ops/DISK_ALERT_SETUP.md

set -euo pipefail

THRESHOLD="${DISK_ALERT_THRESHOLD:-85}"
LOG_FILE="${DISK_ALERT_LOG:-/var/log/disk-alert.log}"
WEBHOOK_URL="${DISK_ALERT_WEBHOOK:-}"
DOCKER_ROOT="${DOCKER_DATA_ROOT:-/var/lib/docker}"
HOSTNAME="${HOSTNAME:-$(hostname)}"

log_alert() {
  local msg="$1"
  local timestamp
  timestamp="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  echo "[$timestamp] ALERT: $msg" >> "$LOG_FILE"
}

log_info() {
  local msg="$1"
  local timestamp
  timestamp="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  echo "[$timestamp] INFO: $msg" >> "$LOG_FILE"
}

send_webhook() {
  local mount="$1"
  local usage="$2"
  local available="$3"
  
  if [[ -z "$WEBHOOK_URL" ]]; then
    return 0
  fi
  
  local payload
  payload=$(cat <<EOF
{
  "host": "$HOSTNAME",
  "mount": "$mount",
  "usage_percent": $usage,
  "available": "$available",
  "threshold": $THRESHOLD,
  "timestamp": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "message": "Disk usage on $mount is at ${usage}% (threshold: ${THRESHOLD}%)"
}
EOF
)
  
  if ! curl -sS -X POST \
       -H "Content-Type: application/json" \
       -d "$payload" \
       "$WEBHOOK_URL" \
       --max-time 10 \
       -o /dev/null; then
    log_info "Failed to send webhook for $mount"
  fi
}

check_mount() {
  local mount="$1"
  local label="$2"
  
  if [[ ! -d "$mount" ]]; then
    return 0
  fi
  
  local df_output
  df_output=$(df -h "$mount" 2>/dev/null | tail -1) || return 0
  
  local usage_pct available
  usage_pct=$(echo "$df_output" | awk '{print $5}' | tr -d '%')
  available=$(echo "$df_output" | awk '{print $4}')
  
  if [[ -z "$usage_pct" ]] || ! [[ "$usage_pct" =~ ^[0-9]+$ ]]; then
    return 0
  fi
  
  if (( usage_pct >= THRESHOLD )); then
    log_alert "$label ($mount) at ${usage_pct}% — ${available} free (threshold: ${THRESHOLD}%)"
    send_webhook "$mount" "$usage_pct" "$available"
  fi
}

main() {
  # Ensure log directory exists
  mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true
  
  # Check root filesystem
  check_mount "/" "Root filesystem"
  
  # Check Docker data root
  check_mount "$DOCKER_ROOT" "Docker data root"
  
  # Check any additional Hetzner volumes (common mount points)
  for vol in /mnt/HC_Volume_*; do
    if [[ -d "$vol" ]]; then
      check_mount "$vol" "Hetzner volume"
    fi
  done
}

main "$@"
