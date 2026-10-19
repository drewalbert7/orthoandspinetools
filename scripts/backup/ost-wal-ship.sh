#!/usr/bin/env bash
# Host-side WAL shipper (audit item 9). Root, systemd timer every 2 min.
# spool/ready/<WAL>  --gpg (fleet PUBLIC key)-->  outbox/<WAL>.gpg  --rclone copy --immutable-->
#   R2 <bucket>/ost-wal/<WAL>.gpg  --rclone check --download-->  move spool file to shipped/
# Never deletes or overwrites anything remote. Local: shipped/ pruned after WAL_LOCAL_KEEP_DAYS.
#   ost-wal-ship.sh           ship everything ready
#   ost-wal-ship.sh --check   exit 2 if backlog is stuck (for fleetmon/uptime alerts)
set -euo pipefail
umask 077
ENV_FILE="${OST_BACKUP_ENV_FILE:-/etc/ost-backup/ost-db-backup.env}"
if [[ -f "$ENV_FILE" ]]; then
	# shellcheck disable=SC1090
	source "$ENV_FILE"
fi
SPOOL="${OST_WAL_SPOOL_HOST:-/mnt/HC_Volume_106016238/ost-wal-spool}"
OUTBOX="${OST_WAL_OUTBOX:-/mnt/HC_Volume_106016238/ost-wal-outbox}"
RCLONE="${RCLONE:-rclone}"
export RCLONE_CONFIG="${RCLONE_CONFIG:-/etc/ost-backup/rclone.conf}"
REMOTE="${OST_BACKUP_REMOTE:-ost-r2}"
BUCKET="${OST_BACKUP_BUCKET:-drewalbertmd-backups}"
WAL_PREFIX="${OST_WAL_PREFIX:-ost-wal}"
export GNUPGHOME="${OST_BACKUP_GNUPGHOME:-/etc/ost-backup/gnupg}"
GPG_RECIPIENT="${BACKUP_GPG_RECIPIENT:-FE5BBFD0F32C8A8C824D8E4468ECF93C1F8C7391}"
LOG="${OST_WAL_LOG:-/var/log/ost-wal-ship.log}"
RCLONE_LOG="${OST_WAL_RCLONE_LOG:-/var/log/ost-wal-ship-rclone.log}"
KEEP_DAYS="${WAL_LOCAL_KEEP_DAYS:-3}"
MAX_BACKLOG_MIN="${WAL_MAX_BACKLOG_MIN:-30}"
STATUS_FILE="${OST_WAL_STATUS_FILE:-$OUTBOX/.status.json}"
LOCK_FILE="${OST_WAL_LOCK:-/run/ost-wal-ship.lock}"

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >>"$LOG"; }
status() { printf '{"state":"%s","detail":"%s","epoch":%s}\n' "$1" "$2" "$(date +%s)" >"$STATUS_FILE.tmp" && mv -f "$STATUS_FILE.tmp" "$STATUS_FILE"; }
die() { log "ERROR: $*"; status failed "$*" || true; echo "ost-wal-ship: $*" >&2; exit 1; }

if [[ "${1:-}" == "--check" ]]; then
	oldest="$(find "$SPOOL/ready" -maxdepth 1 -type f -mmin "+$MAX_BACKLOG_MIN" | wc -l)"
	n="$(find "$SPOOL/ready" -maxdepth 1 -type f | wc -l)"
	((oldest == 0)) || { echo "CRITICAL: $oldest WAL file(s) waiting > ${MAX_BACKLOG_MIN}m (backlog $n)"; exit 2; }
	if [[ -f "$STATUS_FILE" ]] && grep -q '"state":"failed"' "$STATUS_FILE"; then echo "CRITICAL: last ship failed"; exit 2; fi
	echo "OK: backlog $n"
	exit 0
fi

mkdir -p "$OUTBOX" "$(dirname "$LOG")"
chmod 700 "$OUTBOX"
exec 9>"$LOCK_FILE"
flock -n 9 || exit 0 # previous run still shipping

mapfile -t files < <(find "$SPOOL/ready" -maxdepth 1 -type f -printf '%f\n' | sort)
if ((${#files[@]} == 0)); then
	status ok "idle"
	exit 0
fi
gpg --batch --list-keys "$GPG_RECIPIENT" >/dev/null 2>&1 || die "fleet public key missing in $GNUPGHOME"
if gpg --batch --list-secret-keys "$GPG_RECIPIENT" >/dev/null 2>&1; then die "secret key present on server; refusing"; fi

LIST="$(mktemp "$OUTBOX/.list.XXXXXX")"
trap 'rm -f -- "$LIST"' EXIT
for f in "${files[@]}"; do
	[[ "$f" =~ ^[0-9A-F]{24}(\.partial|\.[0-9A-F]{8}\.backup)?$|^[0-9A-F]{8}\.history$ ]] || die "unexpected file in spool: $f"
	if [[ ! -f "$OUTBOX/$f.gpg" ]]; then
		gpg --batch --yes --quiet --trust-model always --encrypt --recipient "$GPG_RECIPIENT" \
			--output "$OUTBOX/$f.gpg.partial" "$SPOOL/ready/$f" || die "encrypt $f failed"
		mv -f "$OUTBOX/$f.gpg.partial" "$OUTBOX/$f.gpg"
	fi
	printf '%s.gpg\n' "$f" >>"$LIST"
done
DEST="${REMOTE}:${BUCKET}/${WAL_PREFIX}/"
"$RCLONE" copy --immutable --s3-no-check-bucket --no-traverse --files-from "$LIST" --retries 5 --low-level-retries 20 \
	--log-file "$RCLONE_LOG" --log-level INFO "$OUTBOX/" "$DEST" || die "rclone copy failed (see $RCLONE_LOG)"
"$RCLONE" check --one-way --download --files-from "$LIST" --log-file "$RCLONE_LOG" --log-level INFO "$OUTBOX/" "$DEST" ||
	die "rclone check --download mismatch (see $RCLONE_LOG)"
for f in "${files[@]}"; do
	mv -f "$SPOOL/ready/$f" "$SPOOL/shipped/$f"
	rm -f -- "$OUTBOX/$f.gpg"
done
log "shipped ${#files[@]} file(s): ${files[0]} .. ${files[-1]}"
# Local pruning of already-shipped-and-verified segments only.
find "$SPOOL/shipped" -maxdepth 1 -type f -mtime "+$KEEP_DAYS" -delete
status ok "shipped ${#files[@]} last=${files[-1]}"
