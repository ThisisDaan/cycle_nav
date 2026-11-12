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
import { bearing, cumulative, dist, fmtDist, projectOnSegment, resample, simplify } from './geo.js';
import { icon } from './icons.js';
import { map } from './mapview.js';
import { isNative, onOpenFile, saveFile } from './native.js';
import { pushUndo, syncInputs } from './planner.js';
import { planRoute } from './routing-ui.js';
import { $, esc, pickFiles, toast } from './ui.js';
import { app, ME } from './state.svelte.js';
import { locationOff } from './position.js';
import { openEditor, saveRoute } from './editor.js';

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
  if (isNative) onOpenFile(f => (f?.text || f?.name) && openGpxText(f.text || '', f.name || ''));
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
  // You set off from where you are, or from the place you typed in the start field. Only when your
  // location is off does the route begin at the GPX's own start. (Still waiting for a first fix:
  // the planner waits for it, and plans again from here when it arrives.)
  if (!app.from || app.from.gpxStart) app.from = ME;
  if (app.from.isMe && !app.me && locationOff) app.from = { name: t('Start of {0}', g.name), detail: 'GPX', latlng: start, gpxStart: true };
  const origin = app.from.isMe ? app.me?.latlng : app.from.latlng;
  const ride = origin && dist(origin, start) > 150; // first ride to the flag, then follow the file
  app.to = { name: g.name, detail: t(g.loop ? 'Back at the start' : 'End of GPX route'), latlng: pointAt(g, endAt(g)) };
  app.vias = ride ? [Object.assign(start.slice(), { gpx: true, entry: true, along: g.startAt }), ...ordered] : ordered;
  app.gpxRoute = g;
  syncInputs();
}

// Before every plan: bring the start in line with what is known now (your first GPS fix may have
// arrived, or you typed another start point). A loop whose start you haven't chosen yourself is
// joined where it's closest to where you set off.
export function refreshGpx() {
  let g = app.gpxRoute;
  const origin = app.from?.isMe || app.from?.gpxStart ? app.me?.latlng : app.from?.latlng;
  if (g.autoStart && origin) {
    g = { ...g, autoStart: false };
    const near = alongTrack(g, origin);
    if (g.loop && dist(origin, pointAt(g, g.startAt)) - near.d > NEAR_START) {
      g.startAt = near.at;
      toast(t('Starting {0} where the loop is closest to you', g.name));
    }
  }
  layout(g);
}

// Plan a route that sticks to a recorded or imported track.
export async function followTrack(raw, name, edited = false) {
  const g = makeTrack(raw, name);
  const n = Math.max(1, Math.min(MAX_GUIDES, Math.round(g.len / GUIDE_STEP)));
  const step = g.len / (n + 1);
  g.vias = resample(g.track, step).slice(1, n + 1).map((p, k) => Object.assign([p[0], p[1]], { gpx: true, along: (k + 1) * step }));
  g.startAt = 0;
  g.reversed = false;
  g.autoStart = !edited; // riding to a loop from far away: join it where it's closest (see refreshGpx); an edited route starts where you made it start
  g.edited = edited;
  g.exact = true;     // ride the file's own line; false: route along it on the map's roads
  app.from = ME;
  layout(g, g.vias);
  toast(edited ? t('Route edited ({0})', fmtDist(g.len)) : t('Following {0} ({1})', name, fmtDist(g.len)));
  await planRoute();
}

// The editor's result: ride it like a GPX of its own (exact line, starting where it starts).
export function followEdited(line, name) {
  return followTrack(line, name, true);
}

// ---------------------------------------------------------------- changing start and direction

// A button moved the start: show the whole new route with the flag, and say where you start now.
// (Dragging the flag already shows it, so that keeps the map where it is.)
function changeStart(patch, label, button = true) {
  const g = app.gpxRoute;
  if (!g) return;
  pushUndo(label);
  const before = pointAt(g, g.startAt);
  layout({ ...g, autoStart: false, ...patch });
  const s = pointAt(app.gpxRoute, app.gpxRoute.startAt);
  if (button && dist(before, s) > 30) toast(app.me ? t('Start moved: {0} from you', fmtDist(dist(app.me.latlng, s))) : t('Start moved'));
  planRoute({ fit: button });
}

export const setStartAt = (at, button = false) => changeStart({ startAt: at }, 'Start moved', button);
const startNearMe = () => app.me && setStartAt(alongTrack(app.gpxRoute, app.me.latlng).at, true);
const officialStart = () => changeStart({ startAt: 0, reversed: false }, 'Start moved');
export function reverse() {
  const g = app.gpxRoute;
  // a line ridden the other way starts at its other end; a loop keeps its start and goes the other way round
  changeStart(g.loop ? { reversed: !g.reversed } : { reversed: !g.reversed, startAt: g.reversed ? 0 : g.len }, 'Direction changed');
}

// Exact: the file's own line. Roads: the router finds a route through points along it.
function setExact(on) {
  const g = app.gpxRoute;
  if (!g || !!g.exact === on) return;
  app.gpxRoute = { ...g, exact: on };
  toast(on ? 'Following the GPX line exactly' : 'Following the GPX on the map’s roads — drag the dots to change it');
  planRoute({ fit: false });
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
  } else {
    const was = flag.getLatLng();
    flag.setLatLng(start);
    // moved by a button: a little hop so you see where it went
    if (dist([was.lat, was.lng], start) > 30) {
      const el = flag.getElement()?.querySelector('.gpx-flag');
      el?.classList.remove('hop'); void el?.offsetWidth; el?.classList.add('hop');
    }
  }
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
  // only offered when it really saves riding to the start
  const canNear = near && toStart - near.d > 300 && (g.loop || !g.reversed)
    && !(dist(pointAt(g, near.at), g.track[0]) < 150 && !official); // that's the official start: its own button says so
  const where = official ? t('at the start of the file')
    : g.loop ? t('{0} into the loop', fmtDist(g.reversed ? (g.len - g.startAt) % g.len : g.startAt))
    : g.reversed && g.startAt > g.len - 50 ? t('at the end of the file (reversed)')
    : t('{0} into the route', fmtDist(g.reversed ? g.len - g.startAt : g.startAt));
  box.innerHTML = `
    <div class="gpx-line">${icon('flag', 18)}<span><b>${esc(t('Start'))}</b> ${esc(where)}${app.me && toStart > 150 ? ` · ${esc(t('{0} from you', fmtDist(toStart)))}` : ''}
      <small>${esc(g.loop ? t('Loop of {0}', fmtDist(g.len)) : t('{0} route', fmtDist(span(g))))} · ${esc(t('drag the flag to start elsewhere'))}</small></span></div>
    <div class="gpx-mode" role="radiogroup">
      <button role="radio" aria-checked="${!!g.exact}" data-g="exact">${esc(t('Exact GPX line'))}</button>
      <button role="radio" aria-checked="${!g.exact}" data-g="roads">${esc(t('Follow roughly, on roads'))}</button>
    </div>
    <div class="gpx-acts">
      ${canNear ? `<button class="place-pill gpx-pill" data-g="near">${icon('near_me', 16)} ${esc(t('Start nearest to me'))}</button>` : ''}
      ${official ? '' : `<button class="place-pill gpx-pill" data-g="official">${esc(t('Official start'))}</button>`}
      <button class="place-pill gpx-pill" data-g="reverse">⇄ ${esc(t('Other way round'))}</button>
      <button class="place-pill gpx-pill gpx-edit" data-g="edit">${icon('edit', 16)} ${esc(t('Edit route'))}</button>
      <button class="place-pill gpx-pill" data-g="save">${esc(t('Save'))}</button>
      <button class="place-pill gpx-pill" data-g="export">${esc(t('Export GPX'))}</button>
    </div>`;
  box.querySelectorAll('[data-g]').forEach(b => b.onclick = () => ({ near: startNearMe, official: officialStart, reverse, export: exportRoute, exact: () => setExact(true), roads: () => setExact(false), edit: openEditor, save: () => saveRoute(trackPath(app.gpxRoute), app.gpxRoute.name) })[b.dataset.g]());
}

// ---------------------------------------------------------------- exact mode: ride the file's own line

// The GPX part of the ride: the track from the flag in the chosen direction to the end (a loop all
// the way round back to the flag), as [lat, lon] points.
export function trackPath(g) {
  const s = g.startAt, out = [pointAt(g, s)];
  const idx = []; // track vertices strictly between two distances, in riding order
  const between = (a, b) => g.cum.forEach((c, i) => { if (c > a && c < b) idx.push(i); });
  if (!g.reversed) {
    between(s, g.len);
    if (g.loop) { between(-1, s); }
    else idx.push(g.track.length - 1);
  } else {
    const back = [];
    g.cum.forEach((c, i) => { if (c < s && c > 0) back.push(i); });
    idx.push(...back.reverse());
    if (g.loop) { const rest = []; g.cum.forEach((c, i) => { if (c > s && c < g.len) rest.push(i); }); idx.push(...rest.reverse()); }
    else idx.push(0);
  }
  for (const i of idx) out.push(g.track[i]);
  if (g.loop) out.push(pointAt(g, s));
  return out.filter((p, i) => !i || dist(p, out[i - 1]) > 0.5);
}

// Turn instructions from the shape of the line, for where there's no map data to ask: wherever the
// direction 20 m before a point differs enough from the direction 20 m after it. A long gentle
// bend is just following the trail; a cluster of points in one tight corner gives one instruction.
function shapeHints(coords, cum, from) {
  const back = (i, m) => { let j = i; while (j > 0 && cum[i] - cum[j] < m) j--; return j; };
  const fwd = (i, m) => { let j = i; while (j < coords.length - 1 && cum[j] - cum[i] < m) j++; return j; };
  const turns = [];
  for (let i = Math.max(1, from); i < coords.length - 1; i++) {
    const a = back(i, 20), b = fwd(i, 20);
    if (a === i || b === i || cum[i] - cum[a] < 8 || cum[b] - cum[i] < 8) continue;
    const ang = angleDelta(bearing(coords[a], coords[i]), bearing(coords[i], coords[b]));
    // a hairpin on a trail is a sharp turn; only coming back the same way is a U-turn
    if (Math.abs(ang) >= 40) turns.push({ i, ang, back: Math.abs(ang) > 170 && dist(coords[a], coords[b]) < 4 });
  }
  // one instruction per corner: the sharpest point of each run of same-way turning points
  const hints = [];
  for (const tu of turns) {
    const prev = hints[hints.length - 1];
    if (prev && cum[tu.i] - cum[prev.idx] < 25) {
      if (Math.sign(tu.ang) === Math.sign(prev.angle) && Math.abs(tu.ang) > Math.abs(prev.angle)) Object.assign(prev, hintFor(tu.i, tu.ang, tu.back));
      continue;
    }
    hints.push(hintFor(tu.i, tu.ang, tu.back));
  }
  return hints;
}
// BRouter's command numbers, so the banner, arrows and voice treat them like any other turn
function hintFor(idx, ang, back = false) {
  const a = Math.abs(ang), right = ang > 0;
  const cmd = back ? 10 : a > 130 ? (right ? 7 : 4) : a > 65 ? (right ? 5 : 2) : (right ? 6 : 3);
  return { idx, cmd, exit: 0, angle: Math.round(ang) };
}
const angleDelta = (from, to) => ((to - from + 540) % 360) - 180;

// Join two routes: `head` ridden first, then `tail` from its point `from` on. The tail keeps its
// own instructions and road colours; the joint gets an instruction from the shape if it's a turn.
export function spliceRoute(head, tail, from = 0) {
  const n = head.coords.length - 1;
  const rest = tail.coords.slice(from + 1);
  const coords = [...head.coords, ...rest];
  const cum = cumulative(coords);
  const shift = idx => idx - from + n;
  const hints = [
    ...head.hints.filter(h => h.idx < n),
    ...shapeHints(coords, cum, n).filter(h => cum[h.idx] - cum[n] < 30), // the turn onto the tail
    ...tail.hints.filter(h => h.idx > from).map(h => ({ ...h, idx: shift(h.idx) })),
  ].filter((h, i, all) => !all.slice(0, i).some(o => Math.abs(cum[o.idx] - cum[h.idx]) < 10)).sort((a, b) => a.idx - b.idx);
  const clip = (list, fn) => (list || []).map(fn).filter(Boolean);
  return {
    ...tail,
    coords, cum, hints,
    length: cum[cum.length - 1],
    segments: [
      ...clip(head.segments, s => s),
      ...clip(tail.segments, s => s.b <= from ? null : { ...s, a: shift(Math.max(s.a, from)), b: shift(s.b) }),
    ],
    events: [
      ...(head.events || []),
      ...clip(tail.events, e => e.idx > from ? { ...e, idx: shift(e.idx) } : null),
    ],
    longestBusy: null,
    ascend: (head.ascend || 0) + (tail.exact ? 0 : tail.ascend || 0),
    approach: (head.approach ?? head.length) + (tail.approach && from === 0 ? tail.approach : 0),
  };
}

// The exact route: ride (on the map's roads) from `origin` to the flag if you're not there yet,
// then the file's own line, point for point.
export async function exactRoute(origin, bike, fetchRoute) {
  const g = app.gpxRoute;
  const path = trackPath(g);
  const pcum = cumulative(path);
  const gpxPart = {
    exact: true, coords: path, cum: pcum, length: pcum[pcum.length - 1],
    hints: shapeHints(path, pcum, 1), segments: [{ a: 0, b: path.length - 1, cls: 'gpx' }], events: [], ascend: 0, approach: 0,
    stats: { bikeShare: 0, busyShare: 0, unpavedShare: 0, turns: 0, signals: 0, risky: 0 },
  };
  let route = gpxPart;
  if (origin && dist(origin, path[0]) > 30) {
    const leg = await fetchRoute([origin, path[0]], bike);
    route = spliceRoute({ ...leg, approach: leg.length }, gpxPart, 0);
    route.stats = { ...leg.stats, meters: undefined, turns: 0 };
  }
  route.exact = true;
  route.stats = { ...route.stats, turns: route.hints.filter(h => h.cmd !== 1 && h.cmd !== 13).length };
  return route;
}
