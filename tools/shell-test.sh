#!/usr/bin/env bash
# Runs GNOME Shell automation scripts (tests/shell/*.js) in a headless shell with the extension enabled:
# no window, its own D-Bus session, and temporary XDG config/data/state/cache directories, so the running
# desktop, the real settings and the real files are never touched. Each script gets a fresh sandbox.
# usage: tools/shell-test.sh [tests/shell/<script>.js ...]    CHROMANCY_TEST_VERBOSE=1 prints the full logs
#        CHROMANCY_PREVIEW_CSS=<file> puts that shell stylesheet where the extension loads it, in the sandbox
#        CHROMANCY_SHELL_MODE=ubuntu runs the shell in Ubuntu's session mode (Yaru) instead of GNOME's default
#        CHROMANCY_PREVIEW_PALETTE=<id> applies that palette inside the sandbox before the shell starts, with
#        HOME in the sandbox too (apps started by the script see no personal files)
#        CHROMANCY_SANDBOX_HOME=1 puts HOME in the sandbox without applying a palette
#        CHROMANCY_PREVIEW_SETUP=<script> runs that bash script inside the sandbox session before the shell starts
#        CHROMANCY_DISABLED_EXTENSIONS="['a@b', ...]" sets the sandbox's org.gnome.shell disabled-extensions
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
    run_home="$HOME"
    if [[ -n "${CHROMANCY_PREVIEW_PALETTE:-}${CHROMANCY_SANDBOX_HOME:-}" ]]; then
        run_home="$sandbox/home"
        mkdir -p "$run_home/Desktop"  # Ubuntu's desktop-icons extension expects it
    fi
    # GNOME Shell keeps session files in the runtime dir (the Wayland socket, the
    # gnome-shell-disable-extensions crash marker). A headless shell started by any other harness at the
    # same time would share the user's and remove files this shell still needs, so each gets its own.
    export XDG_RUNTIME_DIR="$sandbox/runtime"
    mkdir -m 700 -p "$XDG_RUNTIME_DIR"
    mkdir -p "$XDG_CONFIG_HOME" "$XDG_STATE_HOME" "$XDG_CACHE_HOME" "$XDG_DATA_HOME/gnome-shell/extensions" "$XDG_DATA_HOME/applications"
    ln -s "$root/extension" "$XDG_DATA_HOME/gnome-shell/extensions/$uuid"
    printf '[Desktop Entry]\nType=Application\nName=Chromancy Test Window\nExec=gjs -m %s\nDBusActivatable=false\n' \
        "$root/tests/shell/fixtures/test-window.js" > "$XDG_DATA_HOME/applications/io.github.excelsies.ChromancyTheming.TestWindow.desktop"
    if [[ -n "${CHROMANCY_PREVIEW_CSS:-}" ]]; then
        mkdir -p "$XDG_DATA_HOME/chromancy-theming/shell"
        cp "$CHROMANCY_PREVIEW_CSS" "$XDG_DATA_HOME/chromancy-theming/shell/gnome-shell.css"
    fi
    log="$sandbox/shell.log"
    echo "== $(basename "$script")"
    set +e
    HOME="$run_home" CHROMANCY_TEST_ROOT="$root" CHROMANCY_TEST_UUID="$uuid" timeout --kill-after=5 180 env CHROMANCY_SANDBOX="$sandbox" dbus-run-session -- bash -c '
        set -e
        gsettings set org.gnome.shell enabled-extensions "['"'"'$1'"'"']"
        gsettings set org.gnome.shell disable-user-extensions false
        gsettings set org.gnome.shell welcome-dialog-last-shown-version "999"
        if [[ -n "$7" ]]; then gsettings set org.gnome.shell disabled-extensions "$7"; fi
        if [[ -n "$6" ]]; then bash "$6"; fi
        if [[ -n "$4" ]]; then
            gsettings set org.gnome.desktop.interface gtk-theme Yaru-purple-dark
            gsettings set org.gnome.desktop.interface accent-color purple
            "$5/bin/chromancy-theming" apply "$4"
            # What environment.d gives a real session at the next login.
            export QT_QPA_PLATFORMTHEME=qt6ct
        fi
        exec gnome-shell --headless --wayland --no-x11 --virtual-monitor 1600x1000 ${3:+--mode=$3} --automation-script="$2"
    ' _ "$uuid" "$script" "${CHROMANCY_SHELL_MODE:-}" "${CHROMANCY_PREVIEW_PALETTE:-}" "$root" "${CHROMANCY_PREVIEW_SETUP:-}" \
        "${CHROMANCY_DISABLED_EXTENSIONS:-}" >"$log" 2>&1
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
