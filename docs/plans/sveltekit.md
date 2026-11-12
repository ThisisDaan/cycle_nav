# Moving Cycle Nav to SvelteKit

> **Status: partly done.** Phases 0 and 1 are done, and Phase 2 up to step 5 (`ColorSwatches`, `IconPicker`, `Sheet`, `PlaceSheet` + `PlacePills`, `RouteCard`, `Popover`). Steps 6–11 of Phase 2 and Phase 3 are still open: a good place to start if you want to help.

Goal: reusable Svelte components for the UI (sheets, cards, pickers, menus, dialogs), built to a
static site that GitHub Pages and the Android app load exactly like today. The map, GPS, routing and
navigation logic stay plain JavaScript modules; Svelte takes over the panels around the map.

Done in phases on a branch (`svelte`), each phase ending in an app that works on the phone, so `main`
stays shippable the whole time.

## Phase 0: same app, new build (no visible change)
- SvelteKit + Vite + Svelte 5, `@sveltejs/adapter-static` with `fallback: 'index.html'`,
  `export const ssr = false; export const prerender = true;` in the root layout (it's a browser-only
  map app: no server rendering).
- `paths.base` from an env var so the same build works at `/cycle_nav_live/` (GitHub Pages) and `/`
  (Capacitor). `capacitor.config.json` `webDir` → `build`.
- The body markup of `index.html` moves into `src/routes/+page.svelte` as plain markup; `styles.css`
  into `src/app.css`; the `js/` modules into `src/lib/` unchanged; `+page.svelte` calls the existing
  startup from `onMount`.
- Leaflet, MapLibre and maplibre-gl-leaflet come from npm (already in package.json) instead of
  `vendor/`; `pbf`/`vector-tile`/`point-geometry` too. `profiles/`, `icons/`, `manifest` → `static/`.
- Service worker → `src/service-worker.js` using `$service-worker` (`build`, `files`, `version`):
  the cache name and file list come from the build, so no more manual `CACHE` bumps.
- Scripts: `npm run build` = `vite build`; `sync` = build + `cap sync`; `publish-web.sh` copies
  `build/` instead of `www/`. `scripts/copy-web.mjs` goes away.
- Check: web build loads at the Pages path; APK on the phone: map, search, route, navigation,
  offline download, GPX import, saved routes, settings, back button.

## Phase 1: shared state
- `src/lib/state.svelte.js` with Svelte 5 runes (`$state`) for what the panels need: `from`, `to`,
  `vias`, `options`, `selected`, `nav`, `me`, settings. The current owner-module + setter pairs
  (`setFrom`, `setOptions`, …) become writes to this state, so the setters disappear.
- Plain modules read and write the same state object; components react to it automatically.

## Phase 2: components (one at a time, each its own commit, tested on the phone)
Order picked by how much repeated markup each removes:
1. `ColorSwatches` (bike + accent pickers share it), `IconPicker` (bike + pin icons)
2. `Sheet` (bottom sheet with drag, collapse and the slide animations) → used by the route sheet,
   place sheet, nav bar, pick sheet
3. `PlaceSheet` + `PlacePills`
4. `RouteCard` + route sheet
5. `Popover` → bike menu, nearby menu
6. `Dialog`, `Ask`, `Toast`
7. `Settings` with `Tabs`, `Toggle`, `Segmented` (Automatic/Light/Dark style rows)
8. `Drawer` (pins, routes, rides lists) with a shared `ListItem`
9. `Planner` (search rows, suggestions)
10. `NavBanner`, `NavBar`, nav details
11. `MapButtons` column with the More fold-out, `SimulatorPad`
Animations move into Svelte transitions (`fly`, `fade`, `slide`) with one shared timing, and
`prefers-reduced-motion` handled in one place.

## Phase 3: tidy up
- Remove leftover DOM-string rendering and `$('#id')` lookups the components replaced.
- i18n: a `t` that components can use reactively, so switching language updates without a reload.

## Not changing
Leaflet/MapLibre map code, rotation/tilt, GPS smoothing, router, navigator, offline storage,
weather, rain effects: these stay plain modules (Svelte wouldn't make them simpler).

## Risks to watch
- GitHub Pages base path and the service worker scope.
- Capacitor plugins are reached through `window.Capacitor`; must still be present before startup.
- Bundle size: Vite bundles MapLibre (~800 KB); keep it in its own chunk.
