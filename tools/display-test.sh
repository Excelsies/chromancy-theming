#!/usr/bin/env bash
# Runs each tests/display/*.gjs.js inside its own headless Weston compositor and private D-Bus
# session, with temporary XDG config, data and state directories and in-memory GSettings, so nothing
# reaches the user's desktop, files or settings. CHROMANCY_SHOT_DIR, when set, collects screenshots. Usage: tools/display-test.sh [script...]
set -euo pipefail
cd "$(dirname "$0")/.."
command -v weston >/dev/null || { echo "display tests need weston" >&2; exit 2; }
scripts=("$@")
[ ${#scripts[@]} -eq 0 ] && scripts=(tests/display/*.gjs.js)
status=0
for script in "${scripts[@]}"; do
    tmp=$(mktemp -d -t chromancy-display-XXXXXX)
    socket="wl-chromancy-$$-$RANDOM"
    # GSETTINGS_BACKEND covers the whole private session, so services it starts (portals) never
    # read or write the user's settings either.
    if GSETTINGS_BACKEND=memory timeout --kill-after=5 120 dbus-run-session -- bash -c '
        weston --backend=headless --renderer=pixman --socket="$1" --idle-time=0 >"$2/weston.log" 2>&1 &
        weston_pid=$!
        trap "kill $weston_pid 2>/dev/null" EXIT
        for _ in $(seq 100); do [ -S "$XDG_RUNTIME_DIR/$1" ] && break; sleep 0.1; done
        [ -S "$XDG_RUNTIME_DIR/$1" ] || { echo "weston did not start: $(cat "$2/weston.log")" >&2; exit 2; }
        mkdir -p "$2/xdg/config" "$2/xdg/data" "$2/xdg/state"
        WAYLAND_DISPLAY="$1" GDK_BACKEND=wayland CHROMANCY_TEST_TMP="$2" \
            XDG_CONFIG_HOME="$2/xdg/config" XDG_DATA_HOME="$2/xdg/data" XDG_STATE_HOME="$2/xdg/state" \
            gjs -m "$3" 2>"$2/stderr.log"
    ' _ "$socket" "$tmp" "$script" 2>"$tmp/session.log"; then
        :
    else
        status=1
        echo "FAIL: $script (stderr below)" >&2
        cat "$tmp/stderr.log" >&2 || true
        grep -vE 'dbus-daemon|portal|SpiRegistry|fusermount|keyring|^$' "$tmp/session.log" >&2 || true
    fi
    # Helpers of the private session (portals, gvfs) can still be writing into it for a moment.
    for _ in 1 2 3 4 5; do rm -rf "$tmp" 2>/dev/null && break; sleep 1; done
    [[ -e "$tmp" ]] && echo "warning: could not remove $tmp" >&2
done
exit $status
