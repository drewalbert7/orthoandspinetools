#!/usr/bin/env python3
"""Fail if any non-blank line of the base ref's todo file is missing from the current todo.md.

Rule: nothing in todo.md is ever deleted, only moved to History.
Usage: check-todo-preserved.py [BASE_REF]   (default origin/main)
"""
import os
import subprocess
import sys

NAMES = ("todo.md", "TODO.md", "Todo.md")


def norm(line):
    return " ".join(line.split())


def base_content(ref):
    for name in NAMES:
        r = subprocess.run(["git", "show", f"{ref}:{name}"], capture_output=True, text=True)
        if r.returncode == 0:
            return name, r.stdout
    return None, None


def main():
    ref = sys.argv[1] if len(sys.argv) > 1 else "origin/main"
    name, base = base_content(ref)
    if base is None:
        print(f"No todo file found at {ref}; nothing to check.")
        return 0
    cur_path = next((n for n in NAMES if os.path.isfile(n)), None)
    if cur_path is None:
        print("FAIL: todo.md missing from working tree")
        return 1
    with open(cur_path, encoding="utf-8") as f:
        current = {norm(l) for l in f}
    missing = []
    for i, l in enumerate(base.splitlines(), 1):
        n = norm(l)
        if n and n not in current:
            missing.append((i, l))
    print(f"Base: {ref}:{name}  Current: {cur_path}  Missing lines: {len(missing)}")
    for i, l in missing:
        print(f"  {name}:{i}: {l}")
    if missing:
        print("FAIL: lines were deleted from the todo file. Move them to History instead.")
        return 1
    print("OK: all base todo lines preserved.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
