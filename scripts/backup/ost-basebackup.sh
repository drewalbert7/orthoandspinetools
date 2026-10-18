#!/usr/bin/env bash
# Daily encrypted base backup for PITR (audit item 9). Root, systemd timer 02:35 UTC.
# pg_basebackup (tar, gzip, WAL fetched into the tar = self-contained) streamed straight into gpg
# (fleet PUBLIC key): no plaintext copy touches disk. Uploaded copy-only/immutable to
# <bucket>/ost-base/YYYY-MM-DD/, verified by download.
set -euo pipefail
umask 077
ENV_FILE="${OST_BACKUP_ENV_FILE:-/etc/ost-backup/ost-db-backup.env}"
if [[ -f "$ENV_FILE" ]]; then
	# shellcheck disable=SC1090
	source "$ENV_FILE"
fi
DOCKER="${DOCKER:-docker}"
CONTAINER="${OST_PG_CONTAINER:-orthoandspinetools-postgres}"
STAGE="${OST_BASE_STAGE:-/mnt/HC_Volume_106016238/ost-base-stage}"
RCLONE="${RCLONE:-rclone}"
export RCLONE_CONFIG="${RCLONE_CONFIG:-/etc/ost-backup/rclone.conf}"
REMOTE="${OST_BACKUP_REMOTE:-ost-r2}"
BUCKET="${OST_BACKUP_BUCKET:-drewalbertmd-backups}"
BASE_PREFIX="${OST_BASE_PREFIX:-ost-base}"
export GNUPGHOME="${OST_BACKUP_GNUPGHOME:-/etc/ost-backup/gnupg}"
GPG_RECIPIENT="${BACKUP_GPG_RECIPIENT:-FE5BBFD0F32C8A8C824D8E4468ECF93C1F8C7391}"
LOG="${OST_BASE_LOG:-/var/log/ost-basebackup.log}"
RCLONE_LOG="${OST_BASE_RCLONE_LOG:-/var/log/ost-basebackup-rclone.log}"

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$LOG" >&2; }
die() { log "ERROR: $*"; exit 1; }

mkdir -p "$STAGE" "$(dirname "$LOG")"
chmod 700 "$STAGE"
exec 9>"${OST_BASE_LOCK:-/run/ost-basebackup.lock}"
flock -n 9 || die "another base backup is running"
gpg --batch --list-keys "$GPG_RECIPIENT" >/dev/null 2>&1 || die "fleet public key missing"
if gpg --batch --list-secret-keys "$GPG_RECIPIENT" >/dev/null 2>&1; then die "secret key present on server; refusing"; fi
[[ "$($DOCKER exec "$CONTAINER" psql -U postgres -qAtc 'show archive_mode')" == on ]] || die "archive_mode is not on"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DAY="$(date -u +%Y-%m-%d)"
W="$(mktemp -d "$STAGE/.w.XXXXXX")"
trap 'rm -rf -- "$W"' EXIT
OUT="$W/ost-base_${STAMP}.tar.gz.gpg"
log "base backup $STAMP start"
$DOCKER exec "$CONTAINER" pg_basebackup -U postgres -D - -Ft -z -X fetch --checkpoint=fast -l "ost-base_${STAMP}" 2>>"$LOG" |
	gpg --batch --quiet --trust-model always --encrypt --recipient "$GPG_RECIPIENT" --compress-algo none --output "$OUT" ||
	die "pg_basebackup | gpg failed"
[[ -s "$OUT" ]] || die "empty base backup"
(cd "$W" && sha256sum -- "$(basename "$OUT")" >"ost-base_${STAMP}.SHA256SUMS")
DEST="${REMOTE}:${BUCKET}/${BASE_PREFIX}/${DAY}/"
"$RCLONE" copy --immutable --s3-no-check-bucket --retries 5 --low-level-retries 20 --log-file "$RCLONE_LOG" --log-level INFO "$W/" "$DEST" ||
	die "rclone copy failed"
"$RCLONE" check --one-way --download --log-file "$RCLONE_LOG" --log-level INFO "$W/" "$DEST" || die "rclone check mismatch"
log "base backup $STAMP ok ($(stat -c%s "$OUT") bytes) -> $DEST"
