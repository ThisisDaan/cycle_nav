# Cycle Nav

Calm bicycle navigation built on OpenStreetMap. It sticks to bike paths and straightforward roads with cycle lanes, and it avoids zig-zagging through neighbourhoods just to save a minute.

## What it does

- **Calm routing.** Routes come from [BRouter](https://brouter.de) using a custom profile ([profiles/calm.brf](profiles/calm.brf)). The profile is based on BRouter's "trekking" profile, with three changes:
  - Turns cost much more (`turn_penalty`), so it prefers to stay on one road.
  - Residential streets without real bike infrastructure cost more (`neighbourhood_penalty`).
  - Busy roads without a bike lane cost more (`mainroad_penalty`).
  The app also re-ranks BRouter's alternatives by turns, busy road and bike-path share. Each route card shows "% bike paths/lanes · N turns".
- **Remembers how you ride.** Save a ride after you navigate, or record one with the red button. When you later plan a trip between the same places, you get **"Your usual way"**, routed along your old track, and other routes over roads you know get a higher rank. You can import old rides from Strava, Garmin or Komoot as GPX files (Settings → Rides).
- **Shape the route yourself.** Press on the route line and drag it to the road you'd rather take . You can also tap it to drop a point you can drag later, or long-press the map and choose "Go via here". Tap a point to remove it, or use "Undo my changes". Swipe the route panel down, or tap its handle, to see the whole map.
- **Pointer follows your phone.** When you stand still or walk, the position marker turns with the compass. While you ride, it follows your direction of travel.
- **Calm map.** Soft, Apple Maps-like colours on OpenFreeMap vector tiles, with bike paths drawn in green. There's a dark version and the classic OSM/CyclOSM maps in Settings → Look.
- **Follow a GPX route.** Open a .gpx file with Cycle Nav ("Open with" or share on Android, drop it on the window, or choose "Follow a GPX route…" in the destination field), and Cycle Nav routes you along it turn by turn. A green flag marks where you start: drag it along the route to start somewhere else, tap "Start nearest to me", or ride it the other way round. For a loop that you approach from far away, it starts where the loop is closest to you. The file's own line shows dashed under the route; at street zoom, drag the small dots on it to send the route another way, then export the result as GPX. Rides can be exported as GPX too.
- **Several bikes.** Each bike has its own name, icon, colour, type, route style (Calm / Balanced / Direct), hill preference and speed. Arrival times use that bike's average moving speed, which it learns from your saved rides.
- **Your look.** Choose light/dark/auto, an accent colour (presets or any custom colour), the map style (OSM, CyclOSM bike map, dimmed night map, soft or topo map), your position marker (arrow, dot or the bike's icon) and the app icon.
- **Turn-by-turn.** You get a big instruction banner with a "then…" hint, spoken directions, automatic rerouting when you leave the route, and the screen stays on while you ride.
- **Demo mode** (Settings → More) simulates riding a route so you can try navigation at your desk.

All your data (bikes, settings, rides) stays in the browser on your device. Settings → More has backup export and restore.

## Run it locally

It's plain HTML/JS. The map libraries get copied into `vendor/` once:

```bash
npm install
npm run build
python scripts/serve.py 8137
```

Then open http://localhost:8137.

## Android app

The Android app wraps the same web code with [Capacitor](https://capacitorjs.com) (the `android/` folder). Inside the app it adds native spoken directions, keeps the screen on while you ride, handles the back button, and opens the share sheet for backups.

You need Node.js, a JDK (17+) and the Android SDK (Android Studio installs it). Then:

```bash
npm install
npm run apk
```

The APK ends up in `android/app/build/outputs/apk/debug/app-debug.apk`. To put it on a phone:
- Copy it to the phone and open it. Android asks you to allow installing apps from that source.
- Or, with USB debugging on, run `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`.

After you change the web code, run `npm run sync` (or `npm run apk` to rebuild). To open the project in Android Studio, run `npx cap open android`.

Navigation runs while the app is on screen. The app keeps the screen on, but if you switch apps or lock the phone, GPS tracking pauses.

## Or use it as a web app

Your phone only lets the app use GPS over HTTPS, so host it somewhere. GitHub Pages is the easiest:

1. Push this folder to a GitHub repository.
2. Go to Settings → Pages → "Deploy from a branch", pick `main` and `/ (root)`.
3. Open the `https://<you>.github.io/<repo>/` URL on your phone, then use **Add to Home Screen**. It then opens full-screen like a normal app.

## Services used

These are all free, public services. Please use them fairly:

- Map tiles: OpenFreeMap (default), openstreetmap.org, CyclOSM, OSM France (HOT), OpenTopoMap
- Routing: brouter.de
- Search: photon.komoot.io
