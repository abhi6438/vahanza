#!/usr/bin/env bash
# One command to build the Android test APK (Mac or Linux):
#
#   bash scripts/build-apk.sh
#
# What it does: finds Java 21 and the Android SDK, installs npm packages if needed,
# creates the Android project the first time, builds the next version (1.0.0.8, 1.0.0.9 ...)
# and opens the folder with the new APK (apk/vahanza-<version>.apk).
#
# Needs once on this computer: Node.js 20+. Java 21 and the Android SDK are taken from Android Studio
# if it is installed, otherwise downloaded once into ~/.vahanza-tools (no admin rights needed). Public app settings come from .env.apk in the project folder.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
say()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31m✖ %s\033[0m\n\n' "$*"; exit 1; }

# ---- Node.js
command -v node >/dev/null || fail "Node.js nahi mila. https://nodejs.org se LTS install karein, phir dobara chalayein."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || fail "Node.js 20 ya naya chahiye (abhi $(node -v)). https://nodejs.org se LTS install karein."

# Tools this script downloads itself when missing (no admin rights, no Homebrew needed)
TOOLS="$HOME/.vahanza-tools"
OS="$(uname)"; ARCH="$(uname -m)"
fetch() { curl -fL --retry 3 --progress-bar -o "$2" "$1" || fail "Download nahi hua: $1 (internet / office proxy check karein)"; }

# ---- Java 21 (Android Studio's own Java works; otherwise downloaded once into ~/.vahanza-tools)
# (Mac's /usr/bin/java is only a stub that opens an "install Java" pop-up: never run it)
java_ok() { [ -n "$1" ] && [ "$1" != "/usr" ] && [ -x "$1/bin/java" ] && "$1/bin/java" -version 2>&1 | grep -qE 'version "(2[1-9])'; }
find_java() {
  local c
  for c in "${JAVA_HOME:-}" \
    "$( [ -x /usr/libexec/java_home ] && /usr/libexec/java_home -v 21 2>/dev/null || true )" \
    "$( command -v java >/dev/null && dirname "$(dirname "$(python3 -c 'import os,shutil;print(os.path.realpath(shutil.which("java")))' 2>/dev/null || echo /x/x)")" || true )" \
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
    "$HOME/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
    "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home" \
    "/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home" \
    "$TOOLS"/jdk-21*/Contents/Home "$TOOLS"/jdk-21* \
    "/usr/lib/jvm/java-21-openjdk-amd64" "/usr/lib/jvm/java-21-openjdk" "/opt/android-studio/jbr"; do
    if java_ok "$c"; then echo "$c"; return; fi
  done
}
JAVA_HOME="$(find_java || true)"
if [ -z "$JAVA_HOME" ]; then
  say "Java 21 nahi mila: ek baar download kar rahe hain (~190 MB) → $TOOLS"
  mkdir -p "$TOOLS"
  case "$OS-$ARCH" in
    Darwin-arm64) J=mac/aarch64 ;; Darwin-*) J=mac/x64 ;; Linux-aarch64) J=linux/aarch64 ;; *) J=linux/x64 ;;
  esac
  fetch "https://api.adoptium.net/v3/binary/latest/21/ga/$J/jdk/hotspot/normal/eclipse" "$TOOLS/jdk21.tar.gz"
  tar -xzf "$TOOLS/jdk21.tar.gz" -C "$TOOLS" && rm -f "$TOOLS/jdk21.tar.gz"
  JAVA_HOME="$(find_java || true)"
  [ -n "$JAVA_HOME" ] || fail "Java 21 set nahi ho paya. $TOOLS folder delete karke dobara chalayein."
fi
export JAVA_HOME PATH="$JAVA_HOME/bin:$PATH"

# ---- Android SDK (Android Studio's, or downloaded once into ~/.vahanza-tools/android-sdk)
if [ -z "${ANDROID_HOME:-}" ] || [ ! -d "$ANDROID_HOME" ]; then
  ANDROID_HOME=""
  for c in "${ANDROID_SDK_ROOT:-}" "$HOME/Library/Android/sdk" "$HOME/Android/Sdk" "$TOOLS/android-sdk" "/opt/android"; do
    if [ -z "$ANDROID_HOME" ] && [ -n "$c" ] && { [ -d "$c/platforms" ] || [ -d "$c/cmdline-tools" ] || [ -d "$c/platform-tools" ]; }; then ANDROID_HOME="$c"; fi
  done
fi
if [ -z "$ANDROID_HOME" ]; then
  ANDROID_HOME="$TOOLS/android-sdk"
  say "Android SDK nahi mila: ek baar bana rahe hain → $ANDROID_HOME"
fi
mkdir -p "$ANDROID_HOME"
# sdkmanager (Android "command-line tools"). Only a recent one works with Java 21: the old "tools/bin"
# sdkmanager and early cmdline-tools fail with "javax/xml/bind" errors — so use cmdline-tools/latest
# and replace it if it doesn't run.
SDKM_PATH="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
find_sdkm() { [ -x "$SDKM_PATH" ] && "$SDKM_PATH" --sdk_root="$ANDROID_HOME" --version >/dev/null 2>&1 && echo "$SDKM_PATH" || true; }
if [ -z "$(find_sdkm)" ]; then
  say "Android command-line tools download ho rahe hain (~150 MB, ek baar) → $ANDROID_HOME"
  mkdir -p "$ANDROID_HOME/cmdline-tools" "$TOOLS"
  [ "$OS" = "Darwin" ] && Z=mac || Z=linux
  fetch "https://dl.google.com/android/repository/commandlinetools-$Z-13114758_latest.zip" "$TOOLS/cmdline-tools.zip"
  rm -rf "$ANDROID_HOME/cmdline-tools/latest" "$ANDROID_HOME/cmdline-tools/cmdline-tools"
  unzip -q "$TOOLS/cmdline-tools.zip" -d "$ANDROID_HOME/cmdline-tools" && mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
  rm -f "$TOOLS/cmdline-tools.zip"
fi
export ANDROID_HOME ANDROID_SDK_ROOT="$ANDROID_HOME"
# the SDK parts this app needs (Android 16 / API 36); licences accepted once
SDKM="$(find_sdkm)"
if [ ! -d "$ANDROID_HOME/platforms/android-36" ] || [ ! -d "$ANDROID_HOME/build-tools/36.0.0" ]; then
  [ -n "$SDKM" ] || fail "sdkmanager chal nahi raha. $ANDROID_HOME/cmdline-tools/latest folder delete karke dobara chalayein."
  say "Android 36 SDK parts install ho rahe hain (~200 MB, ek baar)…"
  yes | "$SDKM" --sdk_root="$ANDROID_HOME" --licenses >/dev/null 2>&1 || true
  "$SDKM" --sdk_root="$ANDROID_HOME" "platform-tools" "platforms;android-36" "build-tools;36.0.0"
fi
[ -n "$SDKM" ] && { yes | "$SDKM" --sdk_root="$ANDROID_HOME" --licenses >/dev/null 2>&1 || true; }

[ -f "$ROOT/.env.apk" ] || printf '\n\033[1;33m! .env.apk nahi mila: APK live server (VITE_ values) ke bina banega. Project folder me .env.apk rakhein.\033[0m\n'

say "Java: $JAVA_HOME"
say "Android SDK: $ANDROID_HOME"

# ---- npm packages (first time, or after package.json changed)
cd "$ROOT/web"
if [ ! -d node_modules ] || [ package.json -nt node_modules ] || { [ -f package-lock.json ] && [ package-lock.json -nt node_modules ]; }; then
  say "npm packages install ho rahe hain…"
  npm install
  touch node_modules
fi

# ---- Android project (not in git: created once per computer)
if [ ! -d android ]; then
  say "Android project pehli baar ban raha hai…"
  node scripts/cap-config.mjs
  npx vite build --mode apk
  npx cap add android
fi
printf 'sdk.dir=%s\n' "$ANDROID_HOME" > android/local.properties
chmod +x android/gradlew 2>/dev/null || true

# ---- build
say "APK ban raha hai (pehli baar 5–10 minute lag sakte hain)…"
npm run apk

APK="$(ls -t "$ROOT"/apk/*.apk 2>/dev/null | head -1 || true)"
[ -n "$APK" ] || fail "APK file nahi mili, upar ka error dekhein."
printf '\n\033[1;32m✔ APK taiyaar: %s\033[0m\n\n' "$APK"
if [ "$(uname)" = "Darwin" ]; then open -R "$APK" || true; fi        # Mac: show the file in Finder
