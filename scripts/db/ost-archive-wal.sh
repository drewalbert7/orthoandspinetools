#!/bin/sh
# Postgres archive_command helper (audit item 9). Runs INSIDE orthoandspinetools-postgres as the
# postgres user (uid 70 on alpine). Bind-mounted read-only at /usr/local/bin/ost-archive-wal.sh.
#   archive_command = '/usr/local/bin/ost-archive-wal.sh %p %f'
# Copies one finished WAL segment (or .history/.backup file) into the host spool, atomically.
# Encryption + offsite shipping happen on the HOST (ost-wal-ship.sh), so no key or R2 token is ever
# inside the database container. Exit 0 only when the file is durably in the spool; non-zero makes
# Postgres keep the segment and retry (it never deletes an unarchived segment).
set -eu
src="$1"
name="$2"
spool="${OST_WAL_SPOOL:-/wal-spool}"
ready="$spool/ready/$name"
shipped="$spool/shipped/$name"
for existing in "$ready" "$shipped"; do
	if [ -f "$existing" ]; then
		# Retry after a crash: same bytes = already archived; different bytes = refuse (never overwrite).
		if cmp -s "$src" "$existing"; then exit 0; fi
		echo "ost-archive-wal: $name already archived with DIFFERENT content; refusing" >&2
		exit 1
	fi
done
tmp="$spool/incoming/$name.$$"
cp "$src" "$tmp"
sync "$tmp" 2>/dev/null || sync
mv "$tmp" "$ready"
