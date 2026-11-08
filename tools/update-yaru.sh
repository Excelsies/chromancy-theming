#!/usr/bin/env bash
# Replaces vendor/yaru with the parts of Yaru (https://github.com/ubuntu/yaru) that Chromancy
# rebuilds: the GTK 3 and GNOME Shell SCSS sources, their image sources, and the licenses.
# Usage: tools/update-yaru.sh <commit> <debian-version>
#   e.g. tools/update-yaru.sh f01c3e9a25 26.04.5.1ubuntu
# Pick the commit whose debian/changelog starts with the Yaru version installed
# (dpkg-query -W yaru-theme-gtk), so the rebuild matches the theme on the system.
set -euo pipefail
[ $# -eq 2 ] || { sed -n '2,7p' "$0" >&2; exit 2; }
commit=$1 version=$2
cd "$(dirname "$0")/.."
work=$(mktemp -d -t chromancy-yaru-XXXXXX)
trap 'rm -rf "$work"' EXIT
gh api "repos/ubuntu/yaru/tarball/$commit" > "$work/yaru.tar.gz"
mkdir "$work/x"
tar -xzf "$work/yaru.tar.gz" -C "$work/x"
src=$(echo "$work"/x/*/)
head -1 "$src/debian/changelog" | grep -qF "($version)" \
    || { echo "commit $commit is not Yaru $version: $(head -1 "$src/debian/changelog")" >&2; exit 1; }
full=$(gh api "repos/ubuntu/yaru/commits/$commit" --jq .sha)

rm -rf vendor/yaru
mkdir -p vendor/yaru
copy() { (cd "$src" && find "$@" -type f ! -name '*.png' ! -name 'meson.build' -print0) \
    | (cd "$src" && xargs -0 cp --parents -t "$OLDPWD/vendor/yaru"); }
copy common
copy gtk/src/default/gtk-3.0
copy gnome-shell/src gnome-shell/upstream/theme
cp "$src"/{COPYING,LICENSE_CCBYSA,AUTHORS} vendor/yaru/
cat > vendor/yaru/SOURCE <<INFO
repository: https://github.com/ubuntu/yaru
commit: $full
version: $version
INFO
echo "vendor/yaru: Yaru $version ($full), $(find vendor/yaru -type f | wc -l) files, $(du -sh vendor/yaru | cut -f1)"
