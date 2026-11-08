#!/usr/bin/env bash
# Checks the release tarball the way a user installs it: extracts it, runs tools/install.sh, and runs the
# extracted bin/chromancy-theming (list, a GTK 3 and shell build with apply, restore). Everything happens in
# a temporary home with its own D-Bus session and in-memory settings, so the desktop is untouched.
# usage: tools/package-check.sh [dist/chromancy-theming-<version>.tar.gz]   (default: the newest in dist/)
set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tarball="$(realpath "${1:-$(ls -t "$root"/dist/chromancy-theming-*.tar.gz 2>/dev/null | head -1)}")"
[[ -f "$tarball" ]] || { echo "no tarball; run tools/pack.sh first" >&2; exit 2; }
tmp=$(mktemp -d -t chromancy-package-XXXXXX)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/opt" "$tmp/home/.local/state"
mkdir -m 700 "$tmp/runtime"
tar -xzf "$tarball" -C "$tmp/opt"
app="$tmp/opt/chromancy-theming"
for unwanted in tests tools/shell-test.sh node_modules docs/screenshots; do
    [[ -e "$app/$unwanted" ]] && { echo "FAIL: the tarball contains $unwanted"; exit 1; }
done
# A private runtime dir too: the session's helpers (gvfs, portals) keep their sockets and mounts there.
HOME="$tmp/home" XDG_RUNTIME_DIR="$tmp/runtime" GSETTINGS_BACKEND=memory XDG_CONFIG_HOME="$tmp/home/.config" XDG_DATA_HOME="$tmp/home/.local/share" \
XDG_STATE_HOME="$tmp/home/.local/state" timeout 300 dbus-run-session -- bash -c '
    app=$1 fails=0
    check() { if eval "$2"; then echo "ok: $1"; else echo "FAIL: $1"; fails=1; fi; }
    "$app/tools/install.sh" >/dev/null
    check "install.sh writes a launcher for the extracted app" \
        "grep -qx \"Exec=$app/bin/chromancy-theming\" \"\$XDG_DATA_HOME/applications/io.github.excelsies.ChromancyTheming.desktop\""
    check "and links the extension from it" \
        "[[ \$(readlink \"\$XDG_DATA_HOME/gnome-shell/extensions/chromancy-theming@excelsies\") == \"$app/extension\" ]]"
    check "the 50 palettes load" "[[ \$(\"$app/bin/chromancy-theming\" list 2>&1 | wc -l) == 50 ]]"
    gsettings set org.gnome.desktop.interface gtk-theme Yaru-purple-dark
    check "apply builds GTK 3 and the shell from the vendored Yaru" \
        "\"$app/bin/chromancy-theming\" apply jeweltone-dark --targets=gtk4,gtk3,shell >\"\$XDG_STATE_HOME/apply.log\" 2>&1"
    check "and writes their stylesheets" "[[ -s \$XDG_CONFIG_HOME/gtk-3.0/chromancy-theming.css && -s \$XDG_DATA_HOME/chromancy-theming/shell/gnome-shell.css ]]"
    check "restore puts it all back" "\"$app/bin/chromancy-theming\" restore >/dev/null 2>&1 && [[ ! -e \$XDG_CONFIG_HOME/gtk-3.0/chromancy-theming.css ]]"
    [[ $fails == 0 ]] || cat "$XDG_STATE_HOME/apply.log"
    exit $fails
' _ "$app" 2>"$tmp/session.log"
status=$?
(( status == 0 )) || { echo "session log:"; grep -vE 'dbus-daemon|portal|SpiRegistry|keyring|^$' "$tmp/session.log"; }
exit $status
