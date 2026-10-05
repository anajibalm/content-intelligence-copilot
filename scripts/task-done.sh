#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if [[ $# -lt 1 ]]; then
  printf 'usage: %s <issue-number-or-url> --paths path1,path2 --commit-message "message" [--title "PR title"]\n' "$0" >&2
  exit 2
fi
exec node "$SCRIPT_DIR/terminal-workflow.mjs" task-done "$@"
