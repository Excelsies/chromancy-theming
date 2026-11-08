#!/usr/bin/env bash
# Builds the release tarball, dist/chromancy-theming-<version>.tar.gz, from the committed tree (HEAD): what
# runs (app, bin, data, extension, lib, vendor, tools/install.sh) with the licenses and docs, under one
# chromancy-theming/ folder. The folder name carries no version, so an update replaces it in place and the
# launcher, the extension link and the blacklist's launchers keep pointing at the right files.
# usage: tools/pack.sh
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
version="$(git show HEAD:package.json | python3 -I -c 'import json,sys; print(json.load(sys.stdin)["version"])')"
ext_version="$(git show HEAD:extension/metadata.json | python3 -I -c 'import json,sys; print(json.load(sys.stdin)["version-name"])')"
[[ "$version" == "$ext_version" ]] || { echo "package.json is $version but extension/metadata.json is $ext_version" >&2; exit 1; }
mkdir -p dist
out="dist/chromancy-theming-$version.tar.gz"
git archive --format=tar.gz --prefix=chromancy-theming/ -o "$out" HEAD \
    app bin data extension lib vendor tools/install.sh LICENSE README.md THIRD_PARTY_NOTICES.md docs/architecture.md
echo "$out ($(du -h "$out" | cut -f1), from $(git rev-parse --short HEAD))"
