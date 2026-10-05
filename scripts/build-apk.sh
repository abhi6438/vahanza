#!/usr/bin/env bash
# One command to build the Android test APK (Mac or Linux):
#
#   bash scripts/build-apk.sh
#
# What it does: finds Java 21 and the Android SDK, installs npm packages if needed,
# creates the Android project the first time, builds the next version (1.0.0.8, 1.0.0.9 ...)
# and opens the folder with the new APK (apk/vahanza-<version>.apk).
#
# Needs once on this computer: Node.js 20+ and Android Studio (open it once and finish the setup,
# that installs the Android SDK and Java). Public app settings come from .env.apk in the project folder.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
say()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31m✖ %s\033[0m\n\n' "$*"; exit 1; }

# ---- Node.js
command -v node >/dev/null || fail "Node.js nahi mila. https://nodejs.org se LTS install karein, phir dobara chalayein."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || fail "Node.js 20 ya naya chahiye (abhi $(node -v)). https://nodejs.org se LTS install karein."

# ---- Java 21 (Android Studio's own Java works)
java_ok() { [ -x "$1/bin/java" ] && "$1/bin/java" -version 2>&1 | grep -qE 'version "(2[1-9])'; }
if [ -z "${JAVA_HOME:-}" ] || ! java_ok "$JAVA_HOME"; then
  JAVA_HOME=""
  for c in \
    "$( [ -x /usr/libexec/java_home ] && /usr/libexec/java_home -v 21 2>/dev/null || true )" \
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
    "$HOME/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
    "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home" \
    "/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home" \
    "/usr/lib/jvm/java-21-openjdk-amd64" "/usr/lib/jvm/java-21-openjdk" "/opt/android-studio/jbr"; do
    if [ -n "$c" ] && java_ok "$c"; then JAVA_HOME="$c"; break; fi
  done
fi
[ -n "$JAVA_HOME" ] || fail "Java 21 nahi mila. Android Studio install karke ek baar kholein (usme Java hota hai), ya: brew install openjdk@21"
export JAVA_HOME PATH="$JAVA_HOME/bin:$PATH"

# ---- Android SDK
if [ -z "${ANDROID_HOME:-}" ] || [ ! -d "$ANDROID_HOME" ]; then
  ANDROID_HOME="${ANDROID_SDK_ROOT:-}"
  for c in "$HOME/Library/Android/sdk" "$HOME/Android/Sdk" "/opt/android"; do
    if [ -z "$ANDROID_HOME" ] && [ -d "$c/platforms" ]; then ANDROID_HOME="$c"; fi
  done
fi
[ -n "$ANDROID_HOME" ] && [ -d "$ANDROID_HOME" ] || fail "Android SDK nahi mila. Android Studio kholein → setup poora karein (SDK ~/Library/Android/sdk me aayega), phir dobara chalayein."
export ANDROID_HOME ANDROID_SDK_ROOT="$ANDROID_HOME"

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
