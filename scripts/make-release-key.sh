#!/bin/sh
# Makes the signing key for Cycle Nav's APK releases, once. Every release must be signed with the
# same key, or Android refuses to install it over the previous one, so keep the result safe
# (password manager, backup). It is written OUTSIDE the repo and never committed.
#   sh scripts/make-release-key.sh [folder]      (default: ~/cyclenav-release-key)
set -e
DIR=${1:-"$HOME/cyclenav-release-key"}
mkdir -p "$DIR"
KS="$DIR/cyclenav-release.jks"
[ -e "$KS" ] && { echo "There is already a key at $KS; not overwriting it."; exit 1; }
PASS=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)
ALIAS=cyclenav
keytool -genkeypair -v -keystore "$KS" -storetype PKCS12 -alias "$ALIAS" -keyalg RSA -keysize 4096 \
  -validity 10000 -storepass "$PASS" -keypass "$PASS" -dname "CN=Cycle Nav" >/dev/null 2>&1
base64 -w0 "$KS" > "$DIR/CYCLENAV_KEYSTORE_BASE64.txt" 2>/dev/null || base64 "$KS" | tr -d '\n' > "$DIR/CYCLENAV_KEYSTORE_BASE64.txt"
printf '%s' "$PASS" > "$DIR/CYCLENAV_KEYSTORE_PASSWORD.txt"
printf '%s' "$PASS" > "$DIR/CYCLENAV_KEY_PASSWORD.txt"
printf '%s' "$ALIAS" > "$DIR/CYCLENAV_KEY_ALIAS.txt"
echo "Key made in $DIR"
echo "Add each .txt file's contents as a repository secret with the same name (the file name without .txt):"
echo "GitHub → the repo → Settings → Secrets and variables → Actions → New repository secret."
echo "Then back up the whole folder somewhere safe. Lose it and you can't update the app for existing users."
