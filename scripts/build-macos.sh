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
binary=target/release/bundle/macos/RHFiles.app/Contents/MacOS/rhfiles
test -x "$binary"
codesign --verify --deep --strict target/release/bundle/macos/RHFiles.app
# A build can link successfully on CI but fail to launch on a clean Mac.
if otool -L "$binary" | tail -n +2 | awk '{print $1}' | grep -vE '^(/System/Library/|/usr/lib/|@executable_path/|@loader_path/|@rpath/)' ; then
  echo 'Non-system dynamic library dependency found; refusing to ship this build.' >&2
  exit 1
fi
ditto -c -k --sequesterRsrc --keepParent target/release/bundle/macos/RHFiles.app "target/release/bundle/RHFiles-macos-$(uname -m).app.zip"
