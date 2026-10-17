#!/bin/bash

# Thin wrapper for the main deploy script
# All logic lives in the root deploy.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

exec "$REPO_ROOT/deploy.sh" "$@"
