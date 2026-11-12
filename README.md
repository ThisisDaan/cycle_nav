<div align="center">

<img src="static/icons/icon.svg" alt="Cycle Nav logo" width="96" height="96">

# Cycle Nav

**Bike navigation that avoids busy roads. Held together by vibes and zip ties.**

[![License: GPL v3+](https://img.shields.io/badge/license-GPL--3.0--or--later-blue.svg)](LICENSE)
[![Download APK](https://img.shields.io/github/v/release/ThisisDaan/cycle_nav?label=download%20APK&color=2f9e6e)](https://github.com/ThisisDaan/cycle_nav/releases/latest)
[![Try it](https://img.shields.io/badge/try%20it-in%20your%20browser-2f9e6e.svg)](https://thisisdaan.github.io/cycle_nav_live/)
![Code quality: vibes](https://img.shields.io/badge/code%20quality-vibes-ff69b4.svg)
![Works on my bike](https://img.shields.io/badge/works%20on-my%20bike-success.svg)

[Download](#try-it) · [What it does](#what-it-does) · [Build it](#build-it-yourself) · [Contributing](CONTRIBUTING.md)

</div>

---

Cycle Nav gets you from A to B on a bike without dragging you through every residential cul-de-sac in the province to save eleven seconds. It likes bike paths, straight roads and not turning. It dislikes busy roads without a bike lane. It's basically a sat-nav with the personality of a Dutch grandparent on an omafiets.

It also follows GPX files (yes, including that MTB route you downloaded), lets you hack those routes apart in an editor, remembers how you usually ride, tells you when it's about to rain on you, and talks to you in English or Dutch.

> 🛠️ **Yes, it's vibe coded. Yes, the code is garbage.** An AI wrote it while we yelled "no, the *other* left". But it gets you home on the nice bike path, and honestly, that's the whole point. Go ride.

## Try it

- **In your browser:** [thisisdaan.github.io/cycle_nav_live](https://thisisdaan.github.io/cycle_nav_live/). On your phone, use **Add to Home Screen** and it opens full screen like a normal app.
- **On Android:** grab `CycleNav-….apk` from the [latest release](https://github.com/ThisisDaan/cycle_nav/releases/latest) on your phone and open it. Android will ask if you trust your browser to install apps. You do. Or build it yourself (see [below](#android-app)).

No account, no tracking, no subscription. Your bikes, rides and settings stay on your device.

## What it does

**Routing**
- **Calm routes.** Routes come from [BRouter](https://brouter.de) with a custom profile ([profiles/calm.brf](profiles/calm.brf)), based on BRouter's "trekking" profile but with a grudge against turns, residential shortcuts and busy roads without a bike lane. The app then re-ranks the alternatives itself. Every route card shows the share of bike paths, quiet streets and busy road, the turns, traffic lights and risky crossings.
- **Shape it yourself.** Drag the route line to the road you'd rather take, tap it to drop a point, or long-press the map and choose "Go via here". Undo is always one tap away.
- **Several bikes.** Each bike has its own route style (Calm, Balanced, Direct, Off-road), hill preference, speed and icon. Arrival times use the speed it learns from your rides.
- **Weather.** It checks the rain along your route and tells you whether to go now, wait a bit, or bring a jacket.

**GPX routes**
- **Open a .gpx straight from your phone** with "Open with" or share, drop it on the window, or pick "Follow a GPX route…".
- **Exact line by default.** You ride the file's own line point for point, singletracks and unmapped trails included. Only the ride to the start is planned on the map's roads. Turn instructions come from the bends in the line.
- **Start where it suits you.** A flag marks the start: drag it along the route, tap "Start nearest to me", or ride it the other way round. If you approach a loop from far away, it starts where the loop is closest to you, so you don't ride to the far side just to "begin".
- **Route editor.** Tap where a bit you don't like starts and ends, then remove it and bridge the gap via roads or a straight line. Drag the line to reshape one spot, move or remove points, extend the route, and undo or redo anything. Save the result to your routes or export it as GPX.
- **Follow roughly, on roads** is still there if you'd rather the router tidied up someone's wobbly recording.

**Riding**
- **Turn-by-turn** with a big banner, a "then…" hint, spoken directions, automatic rerouting, and the screen kept on.
- **Remembers how you ride.** Save or record rides, and next time you get **"Your usual way"**. You can import old rides from Strava, Garmin or Komoot as GPX.
- **Calm map.** Soft colours on OpenFreeMap vector tiles with bike paths in green, plus a dark version and the classic OSM, CyclOSM and topo maps.
- **Offline routing** on Android with downloaded regions, for when the signal gives up in the forest.
- **Demo mode** simulates a ride so you can test navigation from the sofa.

## Build it yourself

You need [Node.js](https://nodejs.org) (or [Bun](https://bun.sh)).

```bash
git clone https://github.com/ThisisDaan/cycle_nav.git
cd cycle_nav
npm install
npm run dev
```

Then open the address it prints. `npm run build` makes the static site in `build/`, and `npm run serve` previews that build on port 8137.

### Android app

The Android app wraps the same web code with [Capacitor](https://capacitorjs.com) (the `android/` folder), and adds native spoken directions, screen-on while riding, the back button, the share sheet, opening GPX files and an embedded copy of BRouter for offline routing.

You also need a JDK (17 or newer) and the Android SDK (Android Studio installs it). Then:

```bash
npm install
npm run apk
```

The APK ends up in `android/app/build/outputs/apk/debug/app-debug.apk`. Copy it to your phone and open it, or with USB or wireless debugging on:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Releases are signed and built by GitHub Actions when a version tag is pushed; see [docs/releasing.md](docs/releasing.md).

After changing the web code, run `npm run sync` (or `npm run apk` to rebuild). `npx cap open android` opens the project in Android Studio.

Navigation runs while the app is on screen. If you lock the phone or switch apps, GPS tracking pauses. (Yes, we know. It's on the list. The list is long.)

### Host the web app yourself

Phones only allow GPS over HTTPS, so the web app needs to be hosted somewhere. `npm run publish` builds it and copies it to a separate repository for GitHub Pages; see [scripts/publish-web.sh](scripts/publish-web.sh). Any static host works.

## Services used

All free, public services. Please use them fairly, and don't point a thousand users at them without asking:

- Map tiles: [OpenFreeMap](https://openfreemap.org) (default), openstreetmap.org, CyclOSM, OSM France (HOT), OpenTopoMap
- Routing: [brouter.de](https://brouter.de)
- Search: [Photon](https://photon.komoot.io) by Komoot
- Places: Overpass API, Nominatim (OpenStreetMap) and Wikidata
- Weather and rain radar: Open-Meteo, Buienradar and RainViewer

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.

## License

Cycle Nav is free software under the [GNU General Public License v3.0 or later](LICENSE). You may use, study, change and share it; modified versions must be shared under the same license.

The embedded routing engine in `android/brouter-*` is [BRouter](https://github.com/abrensch/brouter), under the MIT license ([android/BROUTER-LICENSE.txt](android/BROUTER-LICENSE.txt)).

Built with love, an AI, and an unreasonable number of test rides. Now go cycle. 🚲
