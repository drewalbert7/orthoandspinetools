#!/usr/bin/env python3
"""db-guard: fail CI if a destructive database or volume operation enters the repo.

Audit 2026-10-17, items 3 and 7. Runs in the phi-guard CI job:
    python3 scripts/db-guard/db-guard.py            # scan every tracked file in scope
    python3 scripts/db-guard/db-guard.py FILE...    # scan only these files (tests, pre-commit)

Scope: shell scripts, deploy.sh, scripts/, ops/, backend/scripts/, compose files,
.github/workflows/, Prisma migrations and package.json npm scripts.

Blocked (rule ids):
  drop-database      DROP DATABASE, dropdb
  drop-schema        DROP SCHEMA
  truncate           TRUNCATE (SQL)
  prisma-reset       prisma migrate reset
  data-loss-flag     db push --force-reset / --accept-data-loss
  compose-down-v     docker compose down -v / --volumes
  volume-rm-prune    docker volume rm / remove / prune
  system-prune       docker system prune
  rm-pgdata          rm -r on a postgres data path or docker volume path

Comment lines (# or --) are ignored, so docs inside scripts can name the commands they forbid.
A real exception needs an entry in scripts/db-guard/allowlist.txt (path, rule, reason). Keep it
narrow: protective wrappers and CI-only throwaway databases. Adding an entry is a reviewed change.

Output is file:line:rule plus the matched text only. Exit 0 clean, 1 findings, 2 usage error.
"""
import fnmatch
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ALLOWLIST_FILE = os.environ.get("DB_GUARD_ALLOWLIST") or os.path.join(HERE, "allowlist.txt")

SCOPE_GLOBS = [
    "*.sh",
    "deploy.sh",
    "scripts/*",
    "ops/*",
    "backend/scripts/*",
    "docker-compose*.yml",
    "docker-compose*.yaml",
    ".github/workflows/*",
    "backend/prisma/migrations/*",
    "package.json",
    "*/package.json",
]
# Never scanned: this guard's own rule table, its test fixtures, and prose docs.
SELF_EXCLUDE = ["scripts/db-guard/*", "scripts/tests/db-guard.test.sh", "*.md", "*.mdc", "*.txt"]

I = re.IGNORECASE
RULES = [
    ("drop-database", re.compile(r"\bDROP\s+DATABASE\b", I)),
    ("drop-database", re.compile(r"(^|[\s;&|`(])dropdb\b")),
    ("drop-schema", re.compile(r"\bDROP\s+SCHEMA\b", I)),
    ("prisma-reset", re.compile(r"\bmigrate\s+reset\b", I)),
    ("data-loss-flag", re.compile(r"--force-reset\b|--accept-data-loss\b", I)),
    ("compose-down-v", re.compile(r"\bdocker[-\s]+compose\b[^\n]*\bdown\b[^\n]*(\s-[a-zA-Z]*v\b|--volumes\b)", I)),
    ("volume-rm-prune", re.compile(r"\bdocker\s+volume\s+(rm|remove|prune)\b", I)),
    ("system-prune", re.compile(r"\bdocker\s+system\s+prune\b", I)),
    ("rm-pgdata", re.compile(
        r"\brm\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*[rR][a-zA-Z]*\b[^\n]*"
        r"(postgres(ql)?[_-]?data|pgdata|/var/lib/postgresql|/var/lib/docker/volumes)", I)),
]
SQL_TRUNCATE = re.compile(r"\bTRUNCATE\b", I)
# Outside .sql files only SQL-shaped TRUNCATE counts (not `truncate -s 0 file` or prose).
CODE_TRUNCATE = re.compile(r"\bTRUNCATE\s+(TABLE\b|ONLY\b|[\"\w.]+\s*(;|CASCADE|RESTART|,))|\btruncate\s+table\b", re.M)
COMMENT = re.compile(r"^\s*(#|--|//)")


def tracked():
    out = subprocess.run(["git", "ls-files", "-z"], check=True, capture_output=True).stdout
    return [p for p in out.decode().split("\0") if p]


def in_scope(path):
    if any(fnmatch.fnmatch(path, g) for g in SELF_EXCLUDE):
        return False
    return any(fnmatch.fnmatch(path, g) for g in SCOPE_GLOBS)


def load_allowlist():
    entries = []
    with open(ALLOWLIST_FILE, encoding="utf-8") as fh:
        for no, raw in enumerate(fh, 1):
            line = raw.rstrip("\n")
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            parts = [p.strip() for p in line.split("|")]
            if len(parts) != 3 or not all(parts):
                print(f"db-guard: allowlist.txt:{no}: need 'path | rule | reason'", file=sys.stderr)
                sys.exit(2)
            entries.append((parts[0], parts[1]))
    return entries


def allowed(path, rule, allow):
    return any(fnmatch.fnmatch(path, p) and r in (rule, "*") for p, r in allow)


def scan_file(path, allow):
    try:
        with open(path, encoding="utf-8") as fh:
            lines = fh.read().splitlines()
    except (UnicodeDecodeError, FileNotFoundError, IsADirectoryError):
        return []
    is_sql = path.endswith(".sql")
    hits = []
    for no, line in enumerate(lines, 1):
        if COMMENT.match(line):
            continue
        found = [(rid, rx.search(line)) for rid, rx in RULES]
        found.append(("truncate", (SQL_TRUNCATE if is_sql else CODE_TRUNCATE).search(line)))
        for rid, m in found:
            if m and not allowed(path, rid, allow):
                hits.append(f"{path}:{no}: {rid}: {m.group(0).strip()[:80]}")
    return hits


def main(argv):
    allow = load_allowlist()
    files = argv if argv else [p for p in tracked() if in_scope(p)]
    hits = []
    for path in files:
        hits.extend(scan_file(path, allow))
    if hits:
        print("\n".join(hits))
        print(
            f"\ndb-guard: {len(hits)} destructive operation(s) found. These need Drew's explicit OK via CEO."
            "\nRemove the operation. Only a protective wrapper or a CI-only throwaway database may be"
            "\nallowlisted in scripts/db-guard/allowlist.txt, as a reviewed change.",
            file=sys.stderr,
        )
        return 1
    print(f"db-guard: OK ({len(files)} files scanned, {len(allow)} allowlist entries)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
