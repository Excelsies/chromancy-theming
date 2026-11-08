#!/usr/bin/env bash
# Screenshots of real apps (GTK 4/libadwaita and GTK 3) and the main shell views with palettes applied,
# next to stock, from a headless shell in Ubuntu's session mode. Everything runs in a sandbox (config,
# data, settings and HOME), so the desktop is untouched and no logout is needed.
# usage: tools/ui-preview.sh <out-dir> <palette>...
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ $# -ge 2 ]] || { echo "usage: $0 <out-dir> <palette>..." >&2; exit 2; }
out=$(realpath -m "$1"); shift
mkdir -p "$out"
export CHROMANCY_SHOT_DIR="$out"
# The previews show the shell as this user has it: the extensions they turned off (Ubuntu Dock, desktop
# icons...) stay off in the sandbox too. Read from the real settings; nothing is written there.
CHROMANCY_DISABLED_EXTENSIONS="$(gsettings get org.gnome.shell disabled-extensions 2>/dev/null || true)"
export CHROMANCY_DISABLED_EXTENSIONS CHROMANCY_SHELL_MODE=ubuntu CHROMANCY_SANDBOX_HOME=1
status=0
for name in stock "$@"; do
    if [[ $name == stock ]]; then palette=""; else palette=$name; fi
    log=$(mktemp)
    CHROMANCY_SHOT_PREFIX="$name-" CHROMANCY_PREVIEW_PALETTE="$palette" "$root/tools/shell-test.sh" "$root/tools/ui-preview-script.js" >"$log" 2>&1 \
        || status=1
    grep -E 'screenshot|not ok|not installed|FAILED|^    ' "$log" || true
    rm -f "$log"
done
exit $status
