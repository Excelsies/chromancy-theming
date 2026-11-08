#!/usr/bin/env bash
# Runs GNOME Shell automation scripts (tests/shell/*.js) in a headless shell with the extension enabled:
# no window, its own D-Bus session, and temporary XDG config/data/state/cache directories, so the running
# desktop, the real settings and the real files are never touched. Each script gets a fresh sandbox.
# usage: tools/shell-test.sh [tests/shell/<script>.js ...]    CHROMANCY_TEST_VERBOSE=1 prints the full logs
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
uuid="$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["uuid"])' "$root/extension/metadata.json")"
scripts=("$@")
[[ ${#scripts[@]} -eq 0 ]] && scripts=("$root"/tests/shell/*.js)

sandbox_pids() {
    grep -l -a -s -F -- "CHROMANCY_SANDBOX=$1" /proc/[0-9]*/environ 2>/dev/null | cut -d/ -f3 || true
}
# The nested session's helpers can outlive the shell; wait for them, then end the stragglers. Only
# processes carrying this sandbox's marker are ever signaled.
reap() {
    local i pids
    for i in $(seq 1 20); do
        pids="$(sandbox_pids "$1")"
        [[ -z "$pids" ]] && return 0
        sleep 0.5
    done
    kill -TERM $pids 2>/dev/null || true
    sleep 1
    pids="$(sandbox_pids "$1")"
    [[ -n "$pids" ]] && kill -KILL $pids 2>/dev/null || true
    return 0
}

status=0
for script in "${scripts[@]}"; do
    script="$(realpath "$script")"
    sandbox="$(mktemp -d "${TMPDIR:-/var/tmp}/chromancy-shelltest.XXXXXX")"
    export XDG_CONFIG_HOME="$sandbox/config" XDG_DATA_HOME="$sandbox/data" XDG_STATE_HOME="$sandbox/state" XDG_CACHE_HOME="$sandbox/cache"
    mkdir -p "$XDG_CONFIG_HOME" "$XDG_STATE_HOME" "$XDG_CACHE_HOME" "$XDG_DATA_HOME/gnome-shell/extensions" "$XDG_DATA_HOME/applications"
    ln -s "$root/extension" "$XDG_DATA_HOME/gnome-shell/extensions/$uuid"
    printf '[Desktop Entry]\nType=Application\nName=Chromancy Test Window\nExec=gjs -m %s\nDBusActivatable=false\n' \
        "$root/tests/shell/fixtures/test-window.js" > "$XDG_DATA_HOME/applications/io.github.excelsies.ChromancyTheming.TestWindow.desktop"
    log="$sandbox/shell.log"
    echo "== $(basename "$script")"
    set +e
    CHROMANCY_TEST_ROOT="$root" CHROMANCY_TEST_UUID="$uuid" timeout --kill-after=5 120 env CHROMANCY_SANDBOX="$sandbox" dbus-run-session -- bash -c '
        set -e
        gsettings set org.gnome.shell enabled-extensions "['"'"'$1'"'"']"
        gsettings set org.gnome.shell disable-user-extensions false
        gsettings set org.gnome.shell welcome-dialog-last-shown-version "999"
        exec gnome-shell --headless --wayland --no-x11 --virtual-monitor 1600x1000 --automation-script="$2"
    ' _ "$uuid" "$script" >"$log" 2>&1
    rc=$?
    set -e
    reap "$sandbox"
    [[ -n "${CHROMANCY_TEST_VERBOSE:-}" ]] && cat "$log"
    grep -E '(: |^)(ok|not ok|#) |\[chromancy-theming\]|JS ERROR|Extension .*(error|Error)' "$log" || true
    if ! crit="$(gjs -m "$root/tools/criticals-cli.js" "$log")"; then
        crit="criticals classifier failed on $log"
    fi
    if [[ -n "$crit" ]]; then
        echo "FAILED ($(basename "$script")): runtime criticals in the shell log:"
        sed 's/^/    /' <<<"$crit" | head -n 20
        (( rc == 0 )) && rc=3
    fi
    if (( rc != 0 )); then
        echo "FAILED ($(basename "$script"), exit $rc); last lines of the shell log:"
        tail -n 25 "$log"
        status=1
    fi
    rm -rf "$sandbox" 2>/dev/null || true
done
exit "$status"
