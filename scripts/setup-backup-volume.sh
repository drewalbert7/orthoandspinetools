#!/usr/bin/env bash
# One-time setup: create orthoandspinetools-backups on Hetzner volume (106016238).
# Safe to re-run. Uses Docker if volume mount is root-owned.
set -euo pipefail

VOLUME_MOUNT="${VOLUME_MOUNT:-/mnt/HC_Volume_106016238}"
BACKUP_DIR="${BACKUP_DIR:-$VOLUME_MOUNT/orthoandspinetools-backups}"
UID_TARGET="${UID_TARGET:-1000}"
GID_TARGET="${GID_TARGET:-1000}"

if [[ ! -d "$VOLUME_MOUNT" ]]; then
  echo "Volume not mounted at $VOLUME_MOUNT"
  exit 1
fi

if [[ -d "$BACKUP_DIR" && -w "$BACKUP_DIR" ]]; then
  echo "Backup directory already ready: $BACKUP_DIR"
  exit 0
fi

if mkdir -p "$BACKUP_DIR" 2>/dev/null; then
  chown "$UID_TARGET:$GID_TARGET" "$BACKUP_DIR" 2>/dev/null || true
else
  echo "Creating $BACKUP_DIR via Docker (volume mount is root-owned)..."
  docker run --rm \
    -v "$VOLUME_MOUNT:/volume" \
    alpine sh -c "mkdir -p /volume/orthoandspinetools-backups && chown $UID_TARGET:$GID_TARGET /volume/orthoandspinetools-backups"
fi

echo "Backup directory ready: $BACKUP_DIR"
ls -la "$VOLUME_MOUNT"
