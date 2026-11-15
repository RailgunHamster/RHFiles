#!/bin/bash
set -euo pipefail
[[ "$(uname -s):$(uname -m)" == Darwin:arm64 ]] || {
  echo 'This archive engine is for Apple Silicon macOS.' >&2
  exit 1
}
cd "$(dirname "$0")/.."
asset=7z2606-mac.tar.xz
checksum=b6f17920b4240940461dac8ef4009891881ac44d2a5ead625ede2ec8472185dd
destination="$PWD/src-tauri/thirdparty/7zip-macos"
work="$(mktemp -d)"
trap 'rm -f "$work/$asset" "$work/7zz" "$work/License.txt" "$work/readme.txt"; rmdir "$work"' EXIT
if [[ -n "${1:-}" ]]; then
  cp "$1" "$work/$asset"
else
  curl -fsSL --retry 2 --connect-timeout 15 --max-time 120 \
    "https://github.com/ip7z/7zip/releases/download/26.06/$asset" -o "$work/$asset"
fi
printf '%s  %s\n' "$checksum" "$work/$asset" | shasum -a 256 -c -
tar -xf "$work/$asset" -C "$work" 7zz License.txt readme.txt
[[ "$(lipo -archs "$work/7zz")" == arm64 ]] || { echo 'Unexpected 7-Zip architecture.' >&2; exit 1; }
mkdir -p "$destination"
install -m 755 "$work/7zz" "$destination/7zz"
install -m 644 "$work/License.txt" "$work/readme.txt" "$destination/"
