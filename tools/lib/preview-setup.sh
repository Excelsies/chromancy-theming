#!/usr/bin/env bash
# Runs inside a preview sandbox session before the shell starts (CHROMANCY_PREVIEW_SETUP), so the apps
# open as a user who has used them would see them, with nothing personal on screen:
# - Chromancy Theming's launcher is installed in the sandbox, so its window can be captured;
# - Settings opens on Appearance (its default, Wi-Fi, lists nearby networks);
# - Ptyxis has a default profile, as its first run creates, so Apply has a profile to select a palette
#   in; it runs a plain bash with a neutral prompt (no user or host name) that shows the 16 terminal colors.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$here/../install.sh" >/dev/null
gsettings set org.gnome.Settings last-panel background
uuid=c0ffee00c0ffee00c0ffee00c0ffee00
profile="org.gnome.Ptyxis.Profile:/org/gnome/Ptyxis/Profiles/$uuid/"
gsettings set org.gnome.Ptyxis profile-uuids "['$uuid']"
gsettings set org.gnome.Ptyxis default-profile-uuid "$uuid"
gsettings set org.gnome.Ptyxis restore-session false
gsettings set "$profile" use-custom-command true
gsettings set "$profile" custom-command "bash --noprofile --rcfile $here/preview-bashrc"
