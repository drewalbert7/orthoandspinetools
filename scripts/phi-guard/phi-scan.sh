#!/bin/sh
# phi-guard POSIX wrapper. Finds node (>= 18) and runs phi-scan.mjs next to this file.
# Fails CLOSED (exit 2) if node is missing, so a hook or deploy gate never silently passes.
#   sh scripts/phi-guard/phi-scan.sh [--staged | --all | paths...] [options]
set -eu
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
NODE=${PHI_GUARD_NODE:-node}
if ! command -v "$NODE" >/dev/null 2>&1; then
  echo "phi-guard: node not found (set PHI_GUARD_NODE or install Node >= 18). Refusing to skip the PHI check." >&2
  exit 2
fi
major=$("$NODE" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
if [ "$major" -lt 18 ]; then
  echo "phi-guard: node >= 18 required (found $major). Refusing to skip the PHI check." >&2
  exit 2
fi
exec "$NODE" "$here/phi-scan.mjs" "$@"
