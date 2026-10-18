#!/usr/bin/env bash
# OST Postgres daily backup: consistent pg_dump (custom format) as the read-only ost_backup role,
# public-key encrypted to the fleet backup key, copied immutably to R2, verified by download.
# Audit items 0 (immutable/copy-only, no deletes), 5 (encryption), 6 (daily + checkable status).
#
# Runs on the OST host as root (systemd ost-db-backup.timer). Replaces the R2 leg of
# scripts/database-backup-production.sh + scripts/backup-to-r2.js (plaintext, public bucket, deletes).
#
# The server holds ONLY the fleet PUBLIC key: it can encrypt but never decrypt.
# Nothing on the remote is ever deleted or overwritten by this script (rclone copy --immutable into
# a new dated prefix). Remote retention = R2 lifecycle rules + bucket lock (see README).
#
# Usage: ost-db-backup.sh            # dump + encrypt + upload + verify
#        ost-db-backup.sh --check    # exit 2 if the last good run is older than MAX_AGE_HOURS
set -euo pipefail
umask 077

ENV_FILE="${OST_BACKUP_ENV_FILE:-/etc/ost-backup/ost-db-backup.env}"
if [[ -f "$ENV_FILE" ]]; then
	# shellcheck disable=SC1090
	source "$ENV_FILE"
fi

DOCKER="${DOCKER:-docker}"
CONTAINER="${OST_PG_CONTAINER:-orthoandspinetools-postgres}"
DB_NAME="${OST_DB_NAME:-orthoandspinetools}"
DB_USER="${OST_BACKUP_DB_USER:-ost_backup}"   # read-only role from roles.sql; local socket (no password)
LOCAL_DIR="${OST_BACKUP_LOCAL_DIR:-/mnt/HC_Volume_106016238/ost-db-backups}"
LOCAL_KEEP_DAYS="${OST_BACKUP_LOCAL_KEEP_DAYS:-7}"
RCLONE="${RCLONE:-rclone}"
export RCLONE_CONFIG="${RCLONE_CONFIG:-/etc/ost-backup/rclone.conf}"
REMOTE="${OST_BACKUP_REMOTE:-ost-r2}"
BUCKET="${OST_BACKUP_BUCKET:-drewalbertmd-backups}"
PREFIX="${OST_BACKUP_PREFIX:-ost-db}"
WEEKLY_PREFIX="${OST_BACKUP_WEEKLY_PREFIX:-ost-db-weekly}"
MONTHLY_PREFIX="${OST_BACKUP_MONTHLY_PREFIX:-ost-db-monthly}"
export GNUPGHOME="${OST_BACKUP_GNUPGHOME:-/etc/ost-backup/gnupg}"
GPG_RECIPIENT="${BACKUP_GPG_RECIPIENT:-FE5BBFD0F32C8A8C824D8E4468ECF93C1F8C7391}"
LOG="${OST_BACKUP_LOG:-/var/log/ost-db-backup.log}"
RCLONE_LOG="${OST_BACKUP_RCLONE_LOG:-/var/log/ost-db-backup-rclone.log}"
STATUS_FILE="${OST_BACKUP_STATUS_FILE:-$LOCAL_DIR/.status.json}"
MAX_AGE_HOURS="${OST_BACKUP_MAX_AGE_HOURS:-26}"
LOCK_FILE="${OST_BACKUP_LOCK:-/run/ost-db-backup.lock}"

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$LOG" >&2; }
write_status() { # state detail
	local tmp
	tmp="$(mktemp "$LOCAL_DIR/.status.XXXXXX")"
	printf '{"state":"%s","detail":"%s","at":"%s","epoch":%s,"remote":"%s"}\n' \
		"$1" "$2" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(date +%s)" "${REMOTE}:${BUCKET}/${PREFIX}" >"$tmp"
	mv -f "$tmp" "$STATUS_FILE"
}
die() {
	log "ERROR: $*"
	if [[ -d "$LOCAL_DIR" ]]; then write_status failed "$*" || true; fi
	exit 1
}

if [[ "${1:-}" == "--check" ]]; then
	[[ -f "$STATUS_FILE" ]] || { echo "CRITICAL: no status file $STATUS_FILE"; exit 2; }
	state="$(sed -n 's/.*"state":"\([^"]*\)".*/\1/p' "$STATUS_FILE")"
	epoch="$(sed -n 's/.*"epoch":\([0-9]*\).*/\1/p' "$STATUS_FILE")"
	age_h=$((($(date +%s) - ${epoch:-0}) / 3600))
	[[ "$state" == ok ]] || { echo "CRITICAL: last run $state (${age_h}h ago)"; exit 2; }
	((age_h <= MAX_AGE_HOURS)) || { echo "CRITICAL: last good run ${age_h}h ago (max ${MAX_AGE_HOURS}h)"; exit 2; }
	echo "OK: last good run ${age_h}h ago"
	exit 0
fi

mkdir -p "$LOCAL_DIR" "$(dirname "$LOG")"
chmod 700 "$LOCAL_DIR"
exec 9>"$LOCK_FILE"
flock -n 9 || die "another ost-db-backup run holds $LOCK_FILE"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DAY="$(date -u +%Y-%m-%d)"
BASE="ost-db_${STAMP}"
WORK="$(mktemp -d "$LOCAL_DIR/.work.XXXXXX")"
COPROC_PID=""
cleanup() {
	local rc=$?
	if [[ -n "$COPROC_PID" ]] && kill -0 "$COPROC_PID" 2>/dev/null; then kill "$COPROC_PID" 2>/dev/null || true; fi
	# WORK holds only encrypted files + a plaintext manifest of table names/counts; plaintext dump lives in LOCAL_DIR.
	rm -rf -- "$WORK"
	((rc == 0)) || log "run failed rc=$rc"
}
trap cleanup EXIT

log "======== ost-db-backup start ($BASE) ========"
log "container=$CONTAINER db=$DB_NAME role=$DB_USER local=$LOCAL_DIR remote=${REMOTE}:${BUCKET}/${PREFIX}/${DAY}/"

# ---- preflight ----------------------------------------------------------------------------------
command -v gpg >/dev/null || die "gpg not installed"
command -v "$RCLONE" >/dev/null || die "rclone not installed"
command -v flock >/dev/null || die "flock not installed"
[[ "$($DOCKER ps --format '{{.Names}}' | grep -cx "$CONTAINER" || true)" == 1 ]] || die "container $CONTAINER not running"
fpr="$(gpg --batch --with-colons --fingerprint "$GPG_RECIPIENT" 2>/dev/null | awk -F: '/^fpr/{print $10; exit}')"
[[ "$fpr" == "$GPG_RECIPIENT" ]] || die "fleet public key $GPG_RECIPIENT not in $GNUPGHOME"
if gpg --batch --list-secret-keys "$GPG_RECIPIENT" >/dev/null 2>&1; then
	die "a SECRET key for $GPG_RECIPIENT is present in $GNUPGHOME; the server must hold the public key only"
fi
[[ "$($DOCKER exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -qAtc 'select pg_has_role(current_user,'"'"'pg_read_all_data'"'"','"'"'MEMBER'"'"') and not rolsuper from pg_roles where rolname=current_user')" == t ]] ||
	die "role $DB_USER missing, not in pg_read_all_data, or is superuser (apply roles.sql first)"
"$RCLONE" lsf --max-depth 1 "${REMOTE}:${BUCKET}/" >/dev/null 2>>"$RCLONE_LOG" || die "rclone cannot list ${REMOTE}:${BUCKET}/ (see $RCLONE_LOG)"
avail_kb="$(df -Pk "$LOCAL_DIR" | awk 'NR==2{print $4}')"
((avail_kb > 1048576)) || die "less than 1 GiB free in $LOCAL_DIR"

# ---- consistent snapshot: counts + dump from ONE exported snapshot --------------------------------
coproc PSQL { $DOCKER exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -qAtX -v ON_ERROR_STOP=1 2>&1; }
COPROC_PID="$PSQL_PID"
psql_send() { printf '%s\n' "$*" >&"${PSQL[1]}"; }
psql_read_until_end() { local line; while IFS= read -r -t 120 line <&"${PSQL[0]}"; do [[ "$line" == "__END__" ]] && return 0; printf '%s\n' "$line"; done; return 1; }

psql_send "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;"
psql_send "SELECT pg_export_snapshot();"
psql_send "SELECT '__END__';"
SNAP="$(psql_read_until_end)" || die "could not export snapshot"
[[ "$SNAP" =~ ^[0-9A-F]+-[0-9A-F]+-[0-9]+$ ]] || die "unexpected snapshot id output"
log "snapshot exported"

# Exact per-table row counts in the same snapshot the dump sees (names + counts only, no row data).
psql_send "SELECT format('SELECT %L || chr(9) || count(*) FROM %I.%I;', n.nspname||'.'||c.relname, n.nspname, c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' ORDER BY 1 \\gexec"
psql_send "SELECT '__END__';"
MANIFEST="$WORK/${BASE}.manifest.tsv"
{
	printf '# ost-db manifest %s db=%s server=%s\n' "$STAMP" "$DB_NAME" "$($DOCKER exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -qAtc 'show server_version')"
	psql_read_until_end
} >"$MANIFEST" || die "row-count query failed"
grep -q $'\t' "$MANIFEST" || die "manifest empty"
TABLES="$(grep -c $'\t' "$MANIFEST")"
ROWS="$(awk -F'\t' '!/^#/{s+=$2} END{print s+0}' "$MANIFEST")"
log "manifest: $TABLES tables, $ROWS rows"

DUMP="$LOCAL_DIR/${BASE}.dump"
$DOCKER exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --snapshot="$SNAP" -Fc -Z 6 >"$DUMP.partial" 2>>"$LOG" ||
	die "pg_dump failed"
psql_send "COMMIT;"
psql_send "\\q"
wait "$COPROC_PID" 2>/dev/null || true
COPROC_PID=""
mv -f "$DUMP.partial" "$DUMP"
chmod 600 "$DUMP"
[[ -s "$DUMP" ]] || die "dump is empty"

# Structural check: TOC readable and one TABLE DATA entry per table in the manifest.
TOC_TABLES="$($DOCKER exec -i "$CONTAINER" pg_restore -l <"$DUMP" | grep -c ' TABLE DATA ')" || die "pg_restore -l could not read the dump"
[[ "$TOC_TABLES" == "$TABLES" ]] || die "dump has $TOC_TABLES TABLE DATA entries, manifest has $TABLES tables"
DUMP_SHA="$(sha256sum "$DUMP" | awk '{print $1}')"
printf '# plaintext_dump_sha256 %s\n' "$DUMP_SHA" >>"$MANIFEST"
log "dump ok: $(stat -c%s "$DUMP") bytes, $TOC_TABLES tables in TOC"

# ---- encrypt (public key only) -------------------------------------------------------------------
gpg_enc() { gpg --batch --yes --quiet --trust-model always --encrypt --recipient "$GPG_RECIPIENT" --compress-algo none --output "$2" "$1"; }
gpg_enc "$DUMP" "$WORK/${BASE}.dump.gpg" || die "gpg encrypt (dump) failed"
gpg_enc "$MANIFEST" "$WORK/${BASE}.manifest.tsv.gpg" || die "gpg encrypt (manifest) failed"
rm -f -- "$MANIFEST"
(cd "$WORK" && sha256sum -- "${BASE}.dump.gpg" "${BASE}.manifest.tsv.gpg" >"${BASE}.SHA256SUMS")
# Guard rail: nothing unencrypted except the checksum list may leave this host.
for f in "$WORK"/*; do
	case "$f" in *.gpg | *.SHA256SUMS) ;; *) die "refusing to upload non-encrypted file $(basename "$f")" ;; esac
done

# ---- upload (copy-only, immutable) + verify by download ------------------------------------------
RC_FLAGS=(--immutable --s3-no-check-bucket --s3-upload-cutoff 1G --retries 5 --low-level-retries 20
	--log-file "$RCLONE_LOG" --log-level INFO --stats-one-line --stats 0)
ship() { # dest-path
	local dest="${REMOTE}:${BUCKET}/$1"
	log "upload -> $dest"
	"$RCLONE" copy "${RC_FLAGS[@]}" "$WORK/" "$dest/" || die "rclone copy to $dest failed (see $RCLONE_LOG)"
	"$RCLONE" check --one-way --download --log-file "$RCLONE_LOG" --log-level INFO "$WORK/" "$dest/" ||
		die "rclone check --download mismatch at $dest (see $RCLONE_LOG)"
	log "verified (download compare) $dest"
}
ship "${PREFIX}/${DAY}"
if [[ "$(date -u +%u)" == 7 ]]; then ship "${WEEKLY_PREFIX}/${DAY}"; fi
if [[ "$(date -u +%d)" == 01 ]]; then ship "${MONTHLY_PREFIX}/$(date -u +%Y-%m)"; fi

# ---- local retention (this directory only; plaintext dumps stay root-only 600) ----------------------
find "$LOCAL_DIR" -maxdepth 1 -type f -name 'ost-db_*.dump' -mtime "+$LOCAL_KEEP_DAYS" -print -delete | while read -r f; do log "pruned local $(basename "$f")"; done

write_status ok "$BASE tables=$TABLES rows=$ROWS"
log "======== ost-db-backup ok ($BASE, tables=$TABLES rows=$ROWS) ========"
