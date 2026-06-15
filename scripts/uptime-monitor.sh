#!/bin/bash
# Uptime monitor for orthoandspinetools.com — checks public health + homepage, optional Docker health.
# Sends email alerts via SES (backend CLI) after consecutive failures; recovery email when back up.

set -euo pipefail

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

ROOT="/home/dstrad/orthoandspinetools-main"
COMPOSE_FILE="$ROOT/docker-compose.prod.yml"
LOG_FILE="$ROOT/logs/uptime-monitor.log"
STATE_FILE="$ROOT/logs/uptime-monitor.state"
LOCK_FILE="$ROOT/logs/uptime-monitor.lock"

BASE_URL="${UPTIME_BASE_URL:-https://orthoandspinetools.com}"
ALERT_TO="${UPTIME_ALERT_TO:-admin@orthoandspinetools.com}"
FAIL_THRESHOLD="${UPTIME_FAIL_THRESHOLD:-2}"
CURL_TIMEOUT="${UPTIME_CURL_TIMEOUT:-20}"
CHECK_DOCKER="${UPTIME_CHECK_DOCKER:-1}"
DRY_RUN="${UPTIME_DRY_RUN:-0}"

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  echo "[$(date -Iseconds)] $*" | tee -a "$LOG_FILE"
}

read_state() {
  FAIL_STREAK=0
  WAS_DOWN=0
  if [[ -f "$STATE_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$STATE_FILE"
  fi
}

write_state() {
  cat >"$STATE_FILE" <<EOF
FAIL_STREAK=${FAIL_STREAK:-0}
WAS_DOWN=${WAS_DOWN:-0}
LAST_CHECK_AT="$(date -Iseconds)"
EOF
}

send_alert() {
  local subject="$1"
  local body="$2"

  if [[ "$DRY_RUN" == "1" ]]; then
    log "DRY RUN alert → $ALERT_TO | $subject"
    printf '%s\n' "$body" | tee -a "$LOG_FILE"
    return 0
  fi

  if ! docker compose -f "$COMPOSE_FILE" ps --status running backend 2>/dev/null | grep -q backend; then
    log "ERROR: backend container not running; cannot send alert email"
    return 1
  fi

  if docker compose -f "$COMPOSE_FILE" exec -T \
    -e UPTIME_ALERT_TO="$ALERT_TO" \
    -e UPTIME_ALERT_SUBJECT="$subject" \
    backend node dist/cli/sendUptimeAlert.js "$ALERT_TO" "$subject" <<<"$body"; then
    log "Alert email sent to $ALERT_TO"
    return 0
  fi

  log "ERROR: failed to send alert email"
  return 1
}

check_url() {
  local name="$1"
  local url="$2"
  local expect="${3:-}"

  local code body
  body="$(curl -fsS --max-time "$CURL_TIMEOUT" -w '\n%{http_code}' "$url" 2>/dev/null || true)"
  code="$(printf '%s' "$body" | tail -n1)"
  body="$(printf '%s' "$body" | sed '$d')"

  if [[ "$code" != "200" ]]; then
    echo "$name: HTTP $code (expected 200) — $url"
    return 1
  fi

  if [[ -n "$expect" && "$body" != *"$expect"* ]]; then
    echo "$name: response missing '$expect' — $url"
    return 1
  fi

  return 0
}

check_docker() {
  [[ "$CHECK_DOCKER" == "1" ]] || return 0

  local bad=""
  while IFS='|' read -r name health state; do
    [[ -z "$name" ]] && continue
    if [[ "$health" == "unhealthy" || "$state" != "running" ]]; then
      bad="${bad}${name} health=${health:-n/a} state=${state}\n"
    fi
  done < <(
    cd "$ROOT" && docker compose -f "$COMPOSE_FILE" ps --format '{{.Name}}|{{.Health}}|{{.State}}' 2>/dev/null
  )

  if [[ -n "$bad" ]]; then
    echo -e "Docker: unhealthy or stopped containers:\n${bad}"
    return 1
  fi

  return 0
}

acquire_lock() {
  if [[ -f "$LOCK_FILE" ]]; then
    local pid age
    pid="$(cat "$LOCK_FILE" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      log "Another monitor run in progress (pid $pid); exiting"
      exit 0
    fi
  fi
  echo $$ >"$LOCK_FILE"
}

release_lock() {
  rm -f "$LOCK_FILE"
}

trap release_lock EXIT

acquire_lock
read_state

failures=()
while IFS= read -r msg; do
  [[ -n "$msg" ]] && failures+=("$msg")
done < <(
  check_url "API health" "$BASE_URL/api/health" "healthy" || true
  check_url "Homepage" "$BASE_URL/" "" || true
  check_docker || true
)

if ((${#failures[@]} > 0)); then
  FAIL_STREAK=$((FAIL_STREAK + 1))
  summary="$(printf '%s\n' "${failures[@]}")"
  log "FAIL ($FAIL_STREAK/$FAIL_THRESHOLD): $summary"

  if ((FAIL_STREAK >= FAIL_THRESHOLD)) && [[ "$WAS_DOWN" == "0" ]]; then
    host="$(hostname -f 2>/dev/null || hostname)"
    body="$(cat <<EOF
OrthoAndSpineTools appears DOWN.

Site: $BASE_URL
Host: $host
Time: $(date -Iseconds)
Consecutive failures: $FAIL_STREAK

Checks:
$summary
EOF
)"
    send_alert "[DOWN] OrthoAndSpineTools uptime alert" "$body" || true
    WAS_DOWN=1
  fi
else
  if [[ "$WAS_DOWN" == "1" ]]; then
    body="$(cat <<EOF
OrthoAndSpineTools is back UP.

Site: $BASE_URL
Time: $(date -Iseconds)
Downtime streak cleared after $FAIL_STREAK failed check(s).
EOF
)"
    send_alert "[RECOVERED] OrthoAndSpineTools is back up" "$body" || true
    log "RECOVERED: site healthy again"
  elif ((FAIL_STREAK > 0)); then
    log "OK (recovered before alert threshold)"
  else
    log "OK"
  fi
  FAIL_STREAK=0
  WAS_DOWN=0
fi

write_state
