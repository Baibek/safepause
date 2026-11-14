#!/usr/bin/env bash
# Installs the Android SDK command-line tools and the packages this project builds with.
set -euo pipefail
SDK="${ANDROID_HOME:-$HOME/android-sdk}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
if [ ! -x "$SDK/cmdline-tools/latest/bin/sdkmanager" ]; then
  mkdir -p "$SDK/cmdline-tools"
  tmp="$(mktemp -d)"
  curl -sSL -o "$tmp/clt.zip" https://dl.google.com/android/repository/commandlinetools-linux-16111833_latest.zip
  unzip -q "$tmp/clt.zip" -d "$tmp"
  rm -rf "$SDK/cmdline-tools/latest"
  mv "$tmp/cmdline-tools" "$SDK/cmdline-tools/latest"
  rm -rf "$tmp"
fi
# sdkmanager is deprecated in favour of the `android` CLI shipped in the same folder
"$SDK/cmdline-tools/latest/bin/android" --sdk="$SDK" sdk install "platform-tools" "platforms;android-37.0" "build-tools;35.0.0"
test -d "$SDK/platforms/android-37.0" || { echo "SDK install failed" >&2; exit 1; }
echo "sdk.dir=$SDK" > "$HERE/local.properties"
echo "Android SDK ready at $SDK"
