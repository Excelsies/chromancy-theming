#!/usr/bin/env bash
# Regenerates the README screenshots in docs/screenshots: Chromancy Theming's window, a few apps and the
# main shell views with Jeweltone Dark and Jeweltone Light applied. Runs tools/ui-preview-script.js in a
# headless shell set up by tools/lib/preview-setup.sh, so the desktop is untouched. The apps still
# reach the system bus, so look over every image before committing it: nothing personal should show.
# usage: tools/screenshots.sh
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="$root/docs/screenshots"
keep=(chromancy settings files text-editor terminal qt6ct calendar)
mkdir -p "$out"
rm -f "$out"/*.png
export CHROMANCY_SHOT_DIR="$out" CHROMANCY_SHELL_MODE=ubuntu CHROMANCY_SHARE_SYSTEMD=1
export CHROMANCY_PREVIEW_SETUP="$root/tools/lib/preview-setup.sh"
# Not quick settings: it shows the Wi-Fi network.
export CHROMANCY_PREVIEW_APPS=io.github.excelsies.ChromancyTheming,org.gnome.Settings,org.gnome.Nautilus,org.gnome.TextEditor,org.gnome.Ptyxis,qt6ct
# The same extensions as this user's session: the ones turned off (Ubuntu Dock...) stay off.
CHROMANCY_DISABLED_EXTENSIONS="$(gsettings get org.gnome.shell disabled-extensions 2>/dev/null || true)"
export CHROMANCY_DISABLED_EXTENSIONS
status=0
for palette in jeweltone-dark jeweltone-light; do
    log=$(mktemp)
    CHROMANCY_SHOT_PREFIX="$palette-" CHROMANCY_PREVIEW_PALETTE="$palette" \
        "$root/tools/shell-test.sh" "$root/tools/ui-preview-script.js" >"$log" 2>&1 || status=1
    grep -E 'screenshot|not ok|not installed|FAILED' "$log" || true
    rm -f "$log"
done
for f in "$out"/*.png; do
    name=$(basename "$f" .png)
    name=${name#jeweltone-dark-}
    name=${name#jeweltone-light-}
    [[ " ${keep[*]} " == *" $name "* ]] || rm -f "$f"
done
ls -la "$out"
exit $status
