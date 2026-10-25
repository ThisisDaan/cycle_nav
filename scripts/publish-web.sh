#!/bin/sh
# Publishes only the built web app (build/) to a separate public repo served by GitHub Pages,
# so this source repo can stay private.  Usage: npm run publish
set -e
LIVE_REPO=${LIVE_REPO:-https://github.com/ThisisDaan/cycle_nav_live.git}
LIVE_DIR=${LIVE_DIR:-../cycle_nav_live}

export MSYS_NO_PATHCONV=1 # on Windows, keeps the leading slash of BASE_PATH from being rewritten into a drive path
BASE_PATH=/cycle_nav_live npm run build
[ -d "$LIVE_DIR/.git" ] || git clone "$LIVE_REPO" "$LIVE_DIR" || { mkdir -p "$LIVE_DIR" && git -C "$LIVE_DIR" init -q -b main; }
git -C "$LIVE_DIR" pull -q --ff-only 2>/dev/null || true
# replace everything except the git folder with the fresh build
find "$LIVE_DIR" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -r build/. "$LIVE_DIR/"
touch "$LIVE_DIR/.nojekyll"
git -C "$LIVE_DIR" add -A
git -C "$LIVE_DIR" commit -qm "Publish $(git rev-parse --short HEAD)" || { echo "Nothing changed"; exit 0; }
git -C "$LIVE_DIR" remote | grep -q . && git -C "$LIVE_DIR" push -q origin HEAD:main || echo "No remote yet: publish the folder with GitHub Desktop (public)"
echo "Done"
