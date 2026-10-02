#!/bin/bash
set -euo pipefail
[[ "$(uname -s)" == Darwin ]] || { echo 'Build this package on macOS with Xcode command line tools.' >&2; exit 1; }
cd "$(dirname "$0")/.."
iconset="$(mktemp -d)/RHFiles.iconset"
mkdir -p "$iconset"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" src-tauri/icons/rhfiles-icon-v4.png --out "$iconset/icon_${size}x${size}.png" >/dev/null
  sips -z "$((size * 2))" "$((size * 2))" src-tauri/icons/rhfiles-icon-v4.png --out "$iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$iconset" -o src-tauri/icons/icon.icns
npx --yes @tauri-apps/cli@2.10.1 build --bundles app,dmg
ditto -c -k --sequesterRsrc --keepParent target/release/bundle/macos/RHFiles.app "target/release/bundle/RHFiles-macos-$(uname -m).app.zip"
