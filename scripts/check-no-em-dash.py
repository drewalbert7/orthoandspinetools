#!/usr/bin/env python3
"""Fail if an em dash (U+2014) or en dash (U+2013) appears in user-facing source.

House style: no em dashes in anything a surgeon reads. Use a comma, colon, period
or parentheses instead, and a plain hyphen for number ranges (3-7, 0-10).

Scope (tracked files only): frontend/src, frontend/public, frontend/index.html,
backend/src, backend/scripts and backend/prisma (schema, seed, migrations).
Code that must match a dash in outside data writes it as an escape (\\u2014).

Allowlist: only migrations that were already applied on prod before this check.
Prisma records a checksum per applied migration, so their bytes must not change.
Migration 20261018020000_remove_em_dashes_from_seeded_text rewrites the rows they
seeded. Do not add new entries for anything else.

Usage: python3 scripts/check-no-em-dash.py [paths...]   (no args = full scope)
"""
import subprocess
import sys

DASHES = {"\u2014": "em dash (U+2014)", "\u2013": "en dash (U+2013)"}
SCOPE = [
    "frontend/src",
    "frontend/public",
    "frontend/index.html",
    "backend/src",
    "backend/scripts",
    "backend/prisma",
]
ALLOWLIST = {
    # Applied on prod before 2026-10-17; content cleaned by 20261018020000.
    "backend/prisma/migrations/20261014020000_implant_search_seo_ingest/migration.sql",
    "backend/prisma/migrations/20261014030000_implant_all_specialties_seed/migration.sql",
    "backend/prisma/migrations/20261014050000_implant_ai_rating/migration.sql",
    "backend/prisma/migrations/20261014093000_technique_guide_stg_only/migration.sql",
    # Applied on prod 2026-10-19 (in _prisma_migrations); Prisma checksums it, so its bytes must not change.
    "backend/prisma/migrations/20261019010000_prodisc_c_line_specific/migration.sql",
}


def tracked(paths):
    out = subprocess.run(["git", "ls-files", "-z", "--", *paths], check=True, capture_output=True)
    return [p for p in out.stdout.decode().split("\0") if p]


def main(argv):
    files = tracked(argv or SCOPE)
    hits = 0
    for path in files:
        if path in ALLOWLIST:
            continue
        try:
            with open(path, encoding="utf-8") as fh:
                lines = fh.read().splitlines()
        except (UnicodeDecodeError, FileNotFoundError, IsADirectoryError):
            continue  # binary assets (images, fonts) or files removed in the work tree
        for no, line in enumerate(lines, 1):
            for ch, name in DASHES.items():
                col = line.find(ch)
                if col >= 0:
                    hits += 1
                    print(f"{path}:{no}:{col + 1}: {name}: {line.strip()[:160]}")
    if hits:
        print(
            f"\ncheck-no-em-dash: {hits} dash(es) found. Use a comma, colon, period or "
            "parentheses (or a hyphen for ranges). In code that must match a dash in "
            "outside data, write the escape \\u2014 or \\u2013.",
            file=sys.stderr,
        )
        return 1
    print(f"check-no-em-dash: OK ({len(files)} tracked files checked, {len(ALLOWLIST)} allowlisted applied migrations)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
