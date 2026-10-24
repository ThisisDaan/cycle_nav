# Cycle Nav – fully offline mode

Goal: the user downloads a region in-app. Map, search and routing then all work with no internet.
Online stays the default whenever a request succeeds; offline is the automatic fallback (and forced when `navigator.onLine === false`).

Stack reminder: Capacitor 8 Android app wrapping a plain ES-module web app (no bundler). Map = Leaflet + maplibre-gl 5.x (vendor/maplibre-gl.js, global `maplibregl`) via `L.maplibreGL` in `js/app.js:~122`, style built in `js/mapstyle.js` from `https://tiles.openfreemap.org/styles/liberty`. Routing = BRouter web API (`js/router.js`, `BASE=https://brouter.de/brouter`) with our custom profile `profiles/calm.brf` + `profile:` params. Geocoding = Photon (`js/geocode.js`). UI strings go through `t()` from `js/i18n.js` (add NL translations to its dictionary for every new string). Patch style: keep code idiom; check syntax with `cp js/x.js /tmp/x.mjs && node --check /tmp/x.mjs`.

Build: `npm run sync` then `(cd android && ./gradlew.bat assembleDebug -q)` then `cp android/app/build/outputs/apk/debug/app-debug.apk CycleNav.apk`. Bump `CACHE` in `sw.js` and add new js files to its `SHELL`.
Preview: `.claude/launch.json` dev server (port 8138), mobile viewport, demo mode.

## A. Embedded BRouter (files: `android/**`, new `js/brouter-native.js`, `js/router.js`)
1. Vendor BRouter (MIT) Java modules into the Android project as gradle library modules: brouter-util, brouter-codec, brouter-expressions, brouter-mapaccess, brouter-core (from github.com/abrensch/brouter, latest release tag). Keep them plain Java libs; drop anything server/AWT-specific.
2. Capacitor plugin `BRouter` (Java, registered in MainActivity):
   - `route({ lonlats: [[lon,lat],...], profile: <brf text>, params: {key:value}, alternativeidx })` → resolves `{ geojson: <string> }` identical in shape to the web API's `format=geojson` output (incl. `properties.messages`), so `parseRoute` in router.js is reused unchanged. Run on a background thread. Write the profile text to a file in cache dir; pass params via RoutingContext keyValues. Segments dir = `filesDir/brouter/segments4`.
   - `listSegments()` → `[{name, size}]`; `deleteSegment({name})`.
   - `downloadSegment({name})` from `https://brouter.de/brouter/segments4/<name>.rd5` to a `.part` file then rename; emits `segmentProgress` events `{name, loaded, total}`; resumable not required.
3. `js/brouter-native.js`: thin wrapper (`available()`, `route()`, `listSegments()`, `downloadSegment(name, onProgress)`, `deleteSegment()`, `segmentsFor(bounds)` → tile names like `E5_N50` covering 5°×5° cells, lon floor to multiple of 5, W/E and S/N prefixes).
4. `js/router.js`: if `navigator.onLine === false` or the web fetch fails (network error/timeout ~8 s), and native is available and the needed segments exist, compute via native with the same profile text + params + alternatives. Expose `routingMode()` → `'online'|'offline'|'none'` for the UI. Throw a clear `t()` error when offline without segments: "No offline routing data for this area".
Done when: APK builds; with phone in airplane mode and E5_N50 downloaded, planning + rerouting works.

## B. Offline map + search (files: new `js/offline.js`, `js/mapstyle.js`, `js/geocode.js`, small hook in `js/app.js` map setup)
1. Storage: IndexedDB db `cyclenav-offline` with stores `tiles` (key `z/x/y`), `assets` (style/glyph/sprite by URL), `places` (search index), `regions` (`{id, name, bounds, minZoom:0, maxZoom:14, tiles, bytes, date}`).
2. `maplibregl.addProtocol('cnoff', ...)`: mapstyle.js rewrites tile, glyph and sprite URLs to `cnoff://...`. Handler: try network (only if online, 6 s timeout) → store tile in a small "recently viewed" LRU (cap ~150 MB) → return; on failure serve from IndexedDB; missing tile → return empty data, never throw. The style JSON itself is cached in `assets` too so the map can boot offline. Fetch the TileJSON once and cache it as well.
3. `downloadRegion(name, bounds, onProgress)`: all vector tiles z0–14 inside bounds, glyph ranges used by the style (fonts in style × 0-255…65280-65535 ranges actually needed for Latin: 0-255, 256-511, 8192-8447 are enough), sprites (@1x/@2x json+png). 6 parallel fetches, retry ×2, cancellable, skip tiles already stored. `estimateRegion(bounds)` → tile count and ~bytes (assume 25 KB/tile at z13-14). `listRegions()`, `deleteRegion(id)` (only delete tiles not used by another region).
4. Offline search index: while downloading z14 tiles, decode them (vendor `pbf` + `@mapbox/vector-tile` as ES modules in `vendor/`) and collect names from layers `transportation_name` (streets), `place`, `poi`, `housenumber` (store housenumber with nearest street name from the same tile, within 60 m). Save to `places` `{name, norm, kind, lat, lon, city?, housenumber?}` deduped (same name within 150 m). `searchOffline(q, near)`: normalised (lowercase, strip accents) prefix/contains match, "Street 14" → housenumber hit else street; rank by match quality then distance to `near`.
5. `js/geocode.js`: search/reverse fall back to `searchOffline` / nearest street in `places` when offline or Photon fails. Same result shape as now.
Done when: in the preview with network blocked (devtools offline), a downloaded area renders and "Griend" search returns results.

## C. UI + integration (files: `js/app.js`, `index.html`, `styles.css`, `js/i18n.js`, `sw.js`)
1. Settings → new "Offline" section: list of downloaded regions (name, size, date, Delete, Refresh), "Download visible area" (shows estimate: tiles, MB for map + routing segments needed) and "Download my region" (≈40 km around current location). Progress bar with cancel; downloads map tiles + search index + needed BRouter segments in one go. Warn when not on Wi-Fi isn't possible from web — just show sizes.
2. Status chip on the map when offline: "Offline – using downloaded map" (and "no offline data here" when routing unavailable).
3. NL translations for all new strings; sw.js cache bump + new files in SHELL.
4. Build APK, install over wireless adb (see memory `wireless-adb`).
