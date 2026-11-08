#!/usr/bin/env bash
# Adds Chromancy Theming to the app grid for this user (a desktop entry pointing at this checkout),
# and links the shell extension. --remove takes both away again.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
apps="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
exts="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions"
entry="$apps/io.github.excelsies.ChromancyTheming.desktop"
ext="$exts/chromancy-theming@excelsies"
if [[ "${1:-}" == --remove ]]; then
    rm -f "$entry"
    [[ -L "$ext" ]] && rm -f "$ext"
    echo "removed $entry and the extension link (disable it with: gnome-extensions disable chromancy-theming@excelsies)"
    exit 0
fi
mkdir -p "$apps" "$exts"
cat > "$entry" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Chromancy Theming
Comment=One palette and font set for GNOME, its apps and the shell
Exec=$root/bin/chromancy-theming
Icon=preferences-desktop-theme
Categories=Settings;DesktopSettings;GTK;
Keywords=theme;colors;palette;accent;fonts;
StartupNotify=true
DBusActivatable=false
DESKTOP
[[ -e "$ext" ]] || ln -s "$root/extension" "$ext"
echo "installed $entry"
echo "extension: $ext -> $(readlink "$ext")"
