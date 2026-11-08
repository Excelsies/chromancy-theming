#!/usr/bin/env bash
# Screenshots of the shell themed with a palette, next to the stock theme, from a headless shell (nothing
# on the desktop changes and no logout is needed). usage: tools/shell-preview.sh <palette> <out-dir>
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ $# -eq 2 ]] || { echo "usage: $0 <palette> <out-dir>" >&2; exit 2; }
palette=$1 out=$(realpath -m "$2")
mkdir -p "$out"
tmp=$(mktemp -d -t chromancy-preview-XXXXXX)
trap 'rm -rf "$tmp"' EXIT
# Build the palette's shell stylesheet in a throwaway home, in-memory settings, private D-Bus.
GSETTINGS_BACKEND=memory XDG_CONFIG_HOME="$tmp/c" XDG_DATA_HOME="$tmp/d" XDG_STATE_HOME="$tmp/s" \
    dbus-run-session -- "$root/bin/chromancy-theming" apply "$palette" --targets=shell >/dev/null
export CHROMANCY_SHOT_DIR="$out"
# The previews show the shell as this user has it: the extensions they turned off (Ubuntu Dock, desktop
# icons...) stay off in the sandbox too. Read from the real settings; nothing is written there.
CHROMANCY_DISABLED_EXTENSIONS="$(gsettings get org.gnome.shell disabled-extensions 2>/dev/null || true)"
export CHROMANCY_DISABLED_EXTENSIONS
export CHROMANCY_SHELL_MODE=ubuntu  # the stock side is Ubuntu's own Yaru, as on the desktop
CHROMANCY_SHOT_PREFIX="stock-" "$root/tools/shell-test.sh" "$root/tools/preview-script.js" | grep -E 'screenshot|not ok|FAILED' || true
CHROMANCY_SHOT_PREFIX="$palette-" CHROMANCY_PREVIEW_CSS="$tmp/d/chromancy-theming/shell/gnome-shell.css" \
    "$root/tools/shell-test.sh" "$root/tools/preview-script.js" | grep -E 'screenshot|not ok|FAILED' || true
ls "$out"
