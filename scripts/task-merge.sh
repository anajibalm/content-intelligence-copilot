#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if [[ $# -lt 1 ]]; then
  printf 'usage: %s <issue-number-or-url> --pr <number> --approved-head <sha> [--dry-run]\n' "$0" >&2
  exit 2
fi
exec node "$SCRIPT_DIR/terminal-workflow.mjs" task-merge "$@"
