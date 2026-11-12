# Releasing the Android app

Releases are built by GitHub Actions ([.github/workflows/release.yml](../.github/workflows/release.yml)):
push a tag and a signed APK appears on the repo's [Releases](https://github.com/ThisisDaan/cycle_nav/releases) page.

## Once: the signing key

Android only installs an update when it's signed with the same key as the version already on the
phone. So all releases use one key, kept as GitHub secrets and never in the repo.

1. Make the key (needs Java's `keytool`, which comes with any JDK, and `openssl`; Git Bash has it):
   ```bash
   sh scripts/make-release-key.sh
   ```
   It writes the key and four small text files to `~/cyclenav-release-key/`.
2. On GitHub: the repo → **Settings → Secrets and variables → Actions → New repository secret**.
   Add four secrets, each named after a text file (without `.txt`) with that file's contents:
   `CYCLENAV_KEYSTORE_BASE64`, `CYCLENAV_KEYSTORE_PASSWORD`, `CYCLENAV_KEY_ALIAS`, `CYCLENAV_KEY_PASSWORD`.
3. **Back up `~/cyclenav-release-key/`** (password manager, USB stick, anywhere that isn't only this
   laptop). Lose it and people can't update; they'd have to uninstall, losing their rides.

## Every release

```bash
git tag v1.1.0
git push origin v1.1.0
```

A few minutes later the release is there with `CycleNav-v1.1.0.apk` and notes made from the commits
since the last tag. The version name comes from the tag, the version code from the workflow run number,
so every release counts up.

## Building a signed APK on your own computer

Set the same four values as environment variables (`CYCLENAV_KEYSTORE` is the path to the `.jks` file
instead of its base64), then `npm run sync` and `cd android && ./gradlew assembleRelease`.
Without them, `npm run apk` makes a debug build as before, signed with your computer's own debug key:
fine for testing, but it can't update a release install (or the other way round).
