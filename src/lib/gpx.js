// Following a GPX route: open the file (file picker, "Open with" on Android, drag and drop, an
// installed web app's file handler), lay guide points along the track so the router keeps to it,
// and let you choose where on the track you start and which way round you ride it.
//
// app.gpxRoute = { name, track, cum, len, loop, startAt, reversed, vias, edited }
//   track/cum/len  the file's line (simplified) and the distance along it
//   startAt        where on the track you start (metres along it); the flag on the map
//   reversed       ride it the other way
//   vias           the original guide points (each with .along = metres along the track), for "Undo my changes"
// Every guide point in app.vias carries gpx: true and its .along, so moving the start only reorders them.
import { t } from './i18n.js';
import { cumulative, dist, fmtDist, projectOnSegment, resample, simplify } from './geo.js';
import { icon } from './icons.js';
import { map } from './mapview.js';
import { isNative, onOpenFile, saveFile } from './native.js';
import { pushUndo, syncInputs } from './planner.js';
import { planRoute } from './routing-ui.js';
import { $, esc, pickFiles, toast } from './ui.js';
import { app, ME } from './state.svelte.js';

const GUIDE_STEP = 300;       // metres between guide points
const MAX_GUIDES = 100;       // keeps the router's URL and the number of dots sane
const LOOP_GAP = 300;         // start and end closer than this: it's a loop
const NEAR_START = 1000;      // a loop's own start further than this beyond its nearest point: start at the nearest point

let trackLayer = null, flag = null, finish = null;

// ---------------------------------------------------------------- reading files

export function parseGpx(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const pts = [...doc.querySelectorAll('trkpt, rtept')].map(el => ({
    latlng: [+el.getAttribute('lat'), +el.getAttribute('lon')],
    time: Date.parse(el.querySelector('time')?.textContent || '') || null,
  })).filter(p => Number.isFinite(p.latlng[0]) && Number.isFinite(p.latlng[1]));
  const name = doc.querySelector('metadata > name, trk > name, rte > name')?.textContent?.trim();
  return { pts, name };
}

export function pickGpxRoute() {
  pickFiles('.gpx,application/gpx+xml,application/octet-stream', false, files => openGpxFile(files[0]));
}

export async function openGpxFile(file) {
  openGpxText(await file.text(), file.name);
}

export function openGpxText(text, fileName = '') {
  let parsed;
  try { parsed = parseGpx(text); } catch { parsed = { pts: [] }; }
  const track = parsed.pts.map(p => p.latlng);
  if (track.length < 2) { toast('No route or track found in that GPX file'); return; }
  if (app.nav) { toast('Finish this ride first'); return; }
  followTrack(track, parsed.name || fileName.replace(/\.gpx$/i, '') || 'GPX');
}

// Files handed to the app from outside: Android "Open with" / share, the installed web app's file
// handler, or a .gpx dropped onto the window.
export function wireGpxOpening() {
  if (isNative) onOpenFile(f => f?.text && openGpxText(f.text, f.name || ''));
  if ('launchQueue' in window) {
    window.launchQueue.setConsumer(async params => {
      const h = params.files?.[0];
      if (h) openGpxFile(await h.getFile());
    });
  }
  const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
  addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  addEventListener('drop', e => {
    const f = [...(e.dataTransfer?.files || [])].find(f => /\.gpx$/i.test(f.name) || /gpx/.test(f.type));
    if (!f) return;
    e.preventDefault();
    openGpxFile(f);
  });
}

// ---------------------------------------------------------------- the track

function makeTrack(raw, name) {
  const track = simplify(raw.map(p => [+p[0].toFixed(6), +p[1].toFixed(6)]), 3);
  const cum = cumulative(track);
  const len = cum[cum.length - 1];
  const loop = len > 2000 && dist(track[0], track[track.length - 1]) < LOOP_GAP;
  return { name, track, cum, len, loop };
}

export function pointAt(g, at) {
  at = Math.max(0, Math.min(g.len, at));
  let i = 1;
  while (i < g.cum.length - 1 && g.cum[i] < at) i++;
  const a = g.track[i - 1], b = g.track[i], seg = g.cum[i] - g.cum[i - 1];
  const f = seg ? (at - g.cum[i - 1]) / seg : 0;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

// Closest point on the track to p: { at (metres along it), d (metres away) }
export function alongTrack(g, p) {
  let best = { d: Infinity, at: 0 };
  for (let i = 0; i < g.track.length - 1; i++) {
    const r = projectOnSegment(p, g.track[i], g.track[i + 1]);
    if (r.d < best.d) best = { d: r.d, at: g.cum[i] + r.t * (g.cum[i + 1] - g.cum[i]) };
  }
  return best;
}

// How far you ride from the start to reach `at`, and the length of the whole ride.
const ahead = (g, at) => {
  const d = g.reversed ? g.startAt - at : at - g.startAt;
  return g.loop ? ((d % g.len) + g.len) % g.len : d;
};
const span = g => g.loop ? g.len : g.reversed ? g.startAt : g.len - g.startAt;
const endAt = g => g.loop ? g.startAt : g.reversed ? 0 : g.len;

// Put start, guide points and end in place for the current start and direction, then plan.
// `points` = the guide points to use (default: the ones on the map now, with your edits).
function layout(g, points = app.vias) {
  const guides = points.filter(v => !v.entry).map(v => v.along != null ? v : Object.assign(v, { along: alongTrack(g, v).at }));
  const total = span(g);
  const ordered = guides
    .map(v => ({ v, k: ahead(g, v.along) }))
    .filter(o => o.k > 60 && o.k < total - 60)
    .sort((a, b) => a.k - b.k)
    .map(o => o.v);
  const start = pointAt(g, g.startAt);
  const fromMe = app.me && dist(app.me.latlng, start) > 150;
  app.from = app.me ? ME : { name: t('Start of {0}', g.name), detail: 'GPX', latlng: start };
  app.to = { name: g.name, detail: t(g.loop ? 'Back at the start' : 'End of GPX route'), latlng: pointAt(g, endAt(g)) };
  app.vias = fromMe ? [Object.assign(start.slice(), { gpx: true, entry: true, along: g.startAt }), ...ordered] : ordered;
  app.gpxRoute = g;
  syncInputs();
}

// Plan a route that sticks to a recorded or imported track.
export async function followTrack(raw, name) {
  const g = makeTrack(raw, name);
  const n = Math.max(1, Math.min(MAX_GUIDES, Math.round(g.len / GUIDE_STEP)));
  const step = g.len / (n + 1);
  g.vias = resample(g.track, step).slice(1, n + 1).map((p, k) => Object.assign([p[0], p[1]], { gpx: true, along: (k + 1) * step }));
  g.startAt = 0;
  g.reversed = false;
  // Riding to a loop from far away: join it where it's closest to you instead of at its "official" start.
  let msg = t('Following {0} ({1})', name, fmtDist(g.len));
  if (g.loop && app.me) {
    const near = alongTrack(g, app.me.latlng);
    if (dist(app.me.latlng, g.track[0]) - near.d > NEAR_START) {
      g.startAt = near.at;
      msg = t('Starting {0} where the loop is closest to you', name);
    }
  }
  layout(g, g.vias);
  toast(msg);
  await planRoute();
}

// ---------------------------------------------------------------- changing start and direction

function changeStart(patch, label) {
  const g = app.gpxRoute;
  if (!g) return;
  pushUndo(label);
  layout({ ...g, ...patch });
  planRoute({ fit: false });
}

export const setStartAt = at => changeStart({ startAt: at }, 'Start moved');
const startNearMe = () => app.me && setStartAt(alongTrack(app.gpxRoute, app.me.latlng).at);
const officialStart = () => changeStart({ startAt: 0, reversed: false }, 'Start moved');
function reverse() {
  const g = app.gpxRoute;
  // a line ridden the other way starts at its other end; a loop keeps its start and goes the other way round
  changeStart(g.loop ? { reversed: !g.reversed } : { reversed: !g.reversed, startAt: g.reversed ? 0 : g.len }, 'Direction changed');
}

// "Undo my changes": the file's own guide points, keeping the start you chose.
export function resetGpx() {
  pushUndo('Route reset');
  layout({ ...app.gpxRoute, edited: false }, app.gpxRoute.vias);
  planRoute();
}

// A guide point dragged somewhere else or removed: the route still follows the file elsewhere.
export function markEdited() {
  if (app.gpxRoute && !app.gpxRoute.edited) app.gpxRoute = { ...app.gpxRoute, edited: true };
}

async function exportRoute() {
  const r = app.options[app.selected]?.route, g = app.gpxRoute;
  if (!r || !g) return;
  const { toGpx } = await import('./rides.js');
  const file = `${(g.name || 'route').replace(/[^\w\- ]+/g, '').trim() || 'route'}.gpx`;
  const text = toGpx({ name: g.name, startedAt: Date.now(), source: 'planned', points: simplify(r.coords, 2) });
  try { await saveFile(file, text, 'application/gpx+xml'); } catch { toast('Could not export the GPX'); }
}

// ---------------------------------------------------------------- on the map and in the route sheet

// The file's own line (dashed, under the route), the start flag you can slide along it, and the
// controls above the route cards.
export function drawGpx() {
  const g = app.gpxRoute;
  renderBar();
  if (!g) return clearGpx();
  if (!map.getPane('gpxTrack')) map.createPane('gpxTrack').style.zIndex = 390;
  trackLayer?.remove();
  trackLayer = L.polyline(g.track, { pane: 'gpxTrack', color: '#5b3fa8', weight: 4, opacity: .55, dashArray: '2 8', lineCap: 'round', interactive: false }).addTo(map);

  const start = pointAt(g, g.startAt);
  if (!flag) {
    flag = L.marker(start, { draggable: true, autoPan: true, zIndexOffset: 800, icon: flagIcon('start') }).addTo(map);
    // the flag only moves along the track
    flag.on('drag', () => flag.setLatLng(pointAt(app.gpxRoute, alongTrack(app.gpxRoute, latlngOf(flag)).at)));
    flag.on('dragend', () => setStartAt(alongTrack(app.gpxRoute, latlngOf(flag)).at));
    flag.on('click', () => toast('Drag the flag along the route to start somewhere else'));
  } else flag.setLatLng(start);
  finish?.remove(); finish = null;
  if (!g.loop) finish = L.marker(pointAt(g, endAt(g)), { interactive: false, zIndexOffset: 700, icon: flagIcon('finish') }).addTo(map);
}

const latlngOf = m => { const ll = m.getLatLng(); return [ll.lat, ll.lng]; };
const flagIcon = kind => L.divIcon({
  className: '', iconSize: [34, 40], iconAnchor: [6, 38],
  html: `<div class="gpx-flag gpx-${kind}"><svg viewBox="0 0 24 28" width="34" height="40"><path d="M5 2v25" stroke="#1d2a33" stroke-width="2.4" stroke-linecap="round"/><path d="M6 3h14l-3.5 5L20 13H6z" fill="${kind === 'start' ? 'var(--accent)' : '#1d2a33'}" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg></div>`,
});

export function clearGpx() {
  trackLayer?.remove(); trackLayer = null;
  flag?.remove(); flag = null;
  finish?.remove(); finish = null;
  renderBar();
}

function renderBar() {
  const box = $('#gpxBar');
  if (!box) return;
  const g = app.gpxRoute;
  box.hidden = !g || !!app.nav;
  if (box.hidden) { box.innerHTML = ''; return; }
  const start = pointAt(g, g.startAt);
  const official = g.startAt < 50 && !g.reversed;
  const near = app.me ? alongTrack(g, app.me.latlng) : null;
  const toStart = app.me ? dist(app.me.latlng, start) : 0;
  const canNear = near && Math.abs(near.at - g.startAt) > 200 && (g.loop || !g.reversed);
  const where = official ? t('at the start of the file')
    : g.loop ? t('{0} into the loop', fmtDist(g.reversed ? (g.len - g.startAt) % g.len : g.startAt))
    : g.reversed && g.startAt > g.len - 50 ? t('at the end of the file (reversed)')
    : t('{0} into the route', fmtDist(g.reversed ? g.len - g.startAt : g.startAt));
  box.innerHTML = `
    <div class="gpx-line">${icon('flag', 18)}<span><b>${esc(t('Start'))}</b> ${esc(where)}${app.me && toStart > 150 ? ` · ${esc(t('{0} from you', fmtDist(toStart)))}` : ''}
      <small>${esc(g.loop ? t('Loop of {0}', fmtDist(g.len)) : t('{0} route', fmtDist(span(g))))} · ${esc(t('drag the flag to start elsewhere'))}</small></span></div>
    <div class="gpx-acts">
      ${canNear ? `<button class="place-pill gpx-pill" data-g="near">${icon('near_me', 16)} ${esc(t('Start nearest to me'))}</button>` : ''}
      ${official ? '' : `<button class="place-pill gpx-pill" data-g="official">${esc(t('Official start'))}</button>`}
      <button class="place-pill gpx-pill" data-g="reverse">⇄ ${esc(t('Other way round'))}</button>
      <button class="place-pill gpx-pill" data-g="export">${esc(t('Export GPX'))}</button>
    </div>`;
  box.querySelectorAll('[data-g]').forEach(b => b.onclick = () => ({ near: startNearMe, official: officialStart, reverse, export: exportRoute })[b.dataset.g]());
}
