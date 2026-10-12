#!/usr/bin/env bash
# Compiles the Android app natively in a cloud sandbox, without an emulator
# or committing android/. Prebuilds into a scratch copy of the repo, installs
# the Android SDK if missing, and runs Gradle.
#
#   scripts/sandbox/build-android.sh [scratch-dir] [gradle-task]
#
# Defaults: a temp dir and assembleDebug (assembleRelease also bundles and
# Hermes-compiles the JS). arm64 only, to save time. Needs Java 17+ and
# `npm install` already run in the repo.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="${1:-$(mktemp -d)}"
TASK="${2:-assembleDebug}"
export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"

# Maven Central answers 429 to the sandbox at times; use Google's mirror.
mkdir -p ~/.gradle/init.d
cp "$REPO/scripts/sandbox/maven-central-mirror.gradle" ~/.gradle/init.d/

if [ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
  zip=$(curl -fsS https://dl.google.com/android/repository/repository2-3.xml |
    grep -o 'commandlinetools-linux-[0-9]*_latest.zip' | sort -t- -k3 -n -u | tail -1)
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  curl -fsSo /tmp/cmdline-tools.zip "https://dl.google.com/android/repository/$zip"
  unzip -qo /tmp/cmdline-tools.zip -d "$ANDROID_HOME/cmdline-tools"
  rm -rf "$ANDROID_HOME/cmdline-tools/latest"
  mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
fi
SDKMANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
yes | "$SDKMANAGER" --licenses >/dev/null || true
# Versions React Native 0.86 / Expo SDK 57 ask for; Gradle fetches others it needs.
"$SDKMANAGER" --sdk_root="$ANDROID_HOME" "platform-tools" "platforms;android-36" \
  "build-tools;36.0.0" "ndk;27.1.12297006" "cmake;3.22.1" >/dev/null

# A scratch copy of the last commit (uncommitted changes are left out),
# sharing node_modules by hard links.
mkdir -p "$WORK/app"
git -C "$REPO" archive HEAD | tar -x -C "$WORK/app"
[ -e "$WORK/app/node_modules" ] || cp -al "$REPO/node_modules" "$WORK/app/node_modules"
cd "$WORK/app"
npx expo prebuild --no-install --platform android
echo "sdk.dir=$ANDROID_HOME" > android/local.properties

cd android
./gradlew "$TASK" -PreactNativeArchitectures=arm64-v8a --console=plain
find app/build/outputs -name '*.apk' -exec ls -la {} \;
