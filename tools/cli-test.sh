#!/usr/bin/env bash
# Runs bin/chromancy-theming the way a user does, in a private D-Bus session with a temporary home and
# in-memory settings, and checks exit statuses: for a command handled in the process itself, and for
# one forwarded to an instance that is already running.
set -uo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d -t chromancy-cli-XXXXXX)
trap 'rm -rf "$tmp"' EXIT
GSETTINGS_BACKEND=memory XDG_CONFIG_HOME="$tmp/config" XDG_DATA_HOME="$tmp/data" XDG_STATE_HOME="$tmp/state" \
timeout 120 dbus-run-session -- bash -c '
    fails=0
    expect() { local want=$1; shift; "$@" >/dev/null 2>&1; local got=$?
        if [ "$got" = "$want" ]; then echo "ok: $* -> $got"; else echo "FAIL: $* -> $got, expected $want"; fails=1; fi; }
    expect 0 bin/chromancy-theming list
    expect 2 bin/chromancy-theming bogus
    expect 2 bin/chromancy-theming apply no-such-palette
    bin/chromancy-theming apply jeweltone-dark >/dev/null 2>&1 &
    first=$!
    sleep 0.3
    expect 2 bin/chromancy-theming bogus
    expect 0 bin/chromancy-theming list
    wait $first; got=$?
    if [ "$got" = 0 ]; then echo "ok: the running apply -> 0"; else echo "FAIL: the running apply -> $got"; fails=1; fi
    expect 0 bin/chromancy-theming restore
    exit $fails
' 2>&1 | grep -E '^(ok|FAIL):'
exit "${PIPESTATUS[0]}"
