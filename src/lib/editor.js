// Route editor: shape a GPX route (and, later, a route from scratch) piece by piece.
//
// A route here is a chain of points with a stretch ("leg") between each pair:
//   file      the GPX's own line, exactly as it came
//   roads     found by the router on the map's paths
//   straight  drawn by hand, for trails that aren't on the map
// An opened GPX starts as one long file stretch. Every edit cuts the chain and replaces pieces of it,
// so whatever you didn't touch stays exactly as the file had it.
import * as store from './store.js';
import { newRideId } from './store.js';
import { fetchRoute } from './router.js';
import { t } from './i18n.js';
import { cumulative, dist, fmtDist, projectOnSegment, simplify } from './geo.js';
import { map } from './mapview.js';
import { pushUndo } from './planner.js';
import { drawRoutes, gpxBike } from './routing-ui.js';
import { clearGpx, drawGpx, followEdited, trackPath } from './gpx.js';
import { reloadRides } from './rides.js';
import { $, askConfirm, esc, toast } from './ui.js';
import { app } from './state.svelte.js';

const RESHAPE = 150;        // dragging the line re-plans this far on each side of where you pressed
const COLORS = { file: '#7b4fd6', roads: '#1e8e3e', straight: '#f08c00' };

let ed = null;              // { name, pts, legs, snap, adding, sel, undo, redo, changed }
let layer = null;

// ---------------------------------------------------------------- open / close

export function openEditor() {
  const g = app.gpxRoute;
  if (!g || app.nav) return;
  // you edit the route the way you ride it: from the flag, in the direction you chose
  const line = trackPath(g);
  ed = { name: g.name, pts: [line[0], line[line.length - 1]], legs: [{ kind: 'file', coords: line }], snap: true, adding: false, sel: null, undo: [], redo: [], changed: false };
  app.editing = true;
  document.body.classList.add('editing');
  map.removeLayer(app.routeLayer);
  map.removeLayer(app.viaLayer);
  clearGpx(); // the editor draws its own start and end
  map.closePopup();
  layer ||= L.layerGroup();
  layer.addTo(map);
  $('#edBar').hidden = $('#edTop').hidden = false;
  wireUi();
  render();
  map.fitBounds(L.latLngBounds(line), { paddingTopLeft: [24, 80], paddingBottomRight: [24, $('#edBar').offsetHeight + 24], animate: false });
}

function closeEditor() {
  ed = null;
  app.editing = false;
  document.body.classList.remove('editing');
  layer?.clearLayers(); layer?.remove();
  map.closePopup();
  $('#edBar').hidden = $('#edTop').hidden = true;
  app.routeLayer.addTo(map);
  app.viaLayer.addTo(map);
}

async function cancel() {
  if (ed.changed && !await askConfirm(t('Throw away your changes?'), { ok: 'Discard', cancel: 'Keep editing', danger: true })) return;
  closeEditor();
  drawRoutes();
  drawGpx();
}

async function done() {
  if (ed.legs.some(l => l.pending)) { toast('Still finding a way for one bit — a moment'); return; }
  if (!ed.changed) { closeEditor(); drawRoutes(); drawGpx(); return; }
  const line = fullLine();
  const name = ed.name;
  closeEditor();
  pushUndo('Route edited');
  await followEdited(line, name);
}

// Keep the edited route in Saved routes (it rides exactly like a GPX from there).
export async function saveRoute(line, name) {
  const pts = simplify(line, 1.5).map(p => [+p[0].toFixed(6), +p[1].toFixed(6)]);
  await store.rides.put({
    id: newRideId(), bikeId: store.activeBike().id, name,
    startedAt: Date.now(), endedAt: Date.now(),
    distance: Math.round(cumulative(pts).at(-1)), movingTime: 0, points: pts, source: 'planned',
  });
  await reloadRides();
  toast(t('Saved “{0}” in your routes', name));
}

// ---------------------------------------------------------------- the line and positions on it

const legLen = l => cumulative(l.coords).at(-1) || 0;

function fullLine() {
  const out = [];
  for (const l of ed.legs) for (const p of l.coords) if (!out.length || dist(out[out.length - 1], p) > 0.3) out.push(p);
  return out;
}

// where p is on the route: { li (leg), si (segment in it), q (the point on the line), along (metres from the start), d }
function locate(p) {
  let best = null, base = 0;
  ed.legs.forEach((l, li) => {
    const cum = cumulative(l.coords);
    for (let si = 0; si < l.coords.length - 1; si++) {
      const r = projectOnSegment(p, l.coords[si], l.coords[si + 1]);
      if (!best || r.d < best.d) {
        const a = l.coords[si], b = l.coords[si + 1];
        best = { li, si, d: r.d, q: [a[0] + (b[0] - a[0]) * r.t, a[1] + (b[1] - a[1]) * r.t], along: base + cum[si] + r.t * (cum[si + 1] - cum[si]) };
      }
    }
    base += cum.at(-1) || 0;
  });
  return best;
}

// the place `along` metres from the start, as a locate() result
function at(along) {
  let base = 0;
  for (let li = 0; li < ed.legs.length; li++) {
    const l = ed.legs[li], cum = cumulative(l.coords), len = cum.at(-1) || 0;
    if (along <= base + len || li === ed.legs.length - 1) {
      const x = Math.max(0, Math.min(len, along - base));
      let si = 0;
      while (si < cum.length - 2 && cum[si + 1] < x) si++;
      const seg = cum[si + 1] - cum[si], f = seg ? (x - cum[si]) / seg : 0, a = l.coords[si], b = l.coords[si + 1] || a;
      return { li, si, q: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], along: base + x };
    }
    base += len;
  }
}

const pointAlong = k => ed.legs.slice(0, k).reduce((s, l) => s + legLen(l), 0);
const total = () => pointAlong(ed.legs.length);

// Put a point on the line at `loc` (the stretch it's on becomes two of the same kind). Returns its index;
// an existing point within 5 m is reused.
function splitAt(loc) {
  for (let k = 0; k < ed.pts.length; k++) if (Math.abs(pointAlong(k) - loc.along) < 5) return k;
  const l = ed.legs[loc.li];
  const a = { kind: l.kind, coords: [...l.coords.slice(0, loc.si + 1), loc.q] };
  const b = { kind: l.kind, coords: [loc.q, ...l.coords.slice(loc.si + 1)] };
  ed.legs.splice(loc.li, 1, a, b);
  ed.pts.splice(loc.li + 1, 0, loc.q);
  return loc.li + 1;
}

// ---------------------------------------------------------------- edits

function snapshot() {
  ed.undo.push({ pts: ed.pts.slice(), legs: ed.legs.map(l => ({ ...l })) });
  if (ed.undo.length > 60) ed.undo.shift();
  ed.redo = [];
  ed.changed = true;
}
function restore(from, to) {
  const s = from.pop();
  if (!s) return;
  to.push({ pts: ed.pts.slice(), legs: ed.legs.map(l => ({ ...l })) });
  ed.pts = s.pts; ed.legs = s.legs;
  ed.sel = null;
  ed.legs.forEach((l, i) => { if (l.pending) routeLeg(i); });
  render();
}

const newLeg = () => ({ kind: ed.snap ? 'roads' : 'straight', coords: [], pending: true });

// Re-plan stretch i between its two points (roads: ask the router; straight: just the line).
async function routeLeg(i) {
  const leg = ed.legs[i], a = ed.pts[i], b = ed.pts[i + 1];
  leg.coords = [a, b];
  if (leg.kind !== 'roads') { leg.pending = false; return; }
  leg.pending = true;
  try {
    const r = await fetchRoute([a, b], gpxBike(store.activeBike()));
    if (!ed || !ed.legs.includes(leg)) return;
    leg.coords = [a, ...r.coords, b];
  } catch {
    if (!ed || !ed.legs.includes(leg)) return;
    leg.kind = 'straight';
    toast('No path found there, so that bit is a straight line');
  }
  leg.pending = false;
  render();
}

// Dragged the line from `loc` to `ll`: that bit (and only that bit) now goes via ll.
function reshape(loc, ll) {
  snapshot();
  const [kA, kB] = pointsAround(loc.along - RESHAPE, loc.along + RESHAPE);
  replaceBetween(kA, kB, [ll]);
}

// Points at `lo` and `hi` metres along the route (the start/end when beyond them): [kA, kB].
// Splitting doesn't change the line, so splitting the nearer one first keeps both positions right.
function pointsAround(lo, hi) {
  const kA = lo <= 1 ? 0 : splitAt(at(lo));
  const kB = hi >= total() - 1 ? ed.pts.length - 1 : splitAt(at(hi));
  return [kA, kB];
}

// Points kA..kB stay; everything between them is replaced by `via` points with new stretches.
function replaceBetween(kA, kB, via, kind) {
  const legs = [...via, null].map(() => kind ? { kind, coords: [], pending: kind === 'roads' } : newLeg());
  ed.pts.splice(kA + 1, kB - kA - 1, ...via);
  ed.legs.splice(kA, kB - kA, ...legs);
  ed.sel = null;
  render();
  legs.forEach(l => routeLeg(ed.legs.indexOf(l)));
}

// Moved point k: the stretches next to it are re-planned. A long GPX stretch next to it only
// gives up its last 150 m, so the rest of the file stays as it was.
function movePoint(k, ll) {
  snapshot();
  const here = pointAlong(k);
  if (k < ed.legs.length && ed.legs[k].kind === 'file' && legLen(ed.legs[k]) > 2 * RESHAPE) splitAt(at(here + RESHAPE));
  if (k > 0 && ed.legs[k - 1].kind === 'file' && legLen(ed.legs[k - 1]) > 2 * RESHAPE) { splitAt(at(here - RESHAPE)); k++; }
  ed.pts[k] = ll;
  const near = [k - 1, k].filter(i => i >= 0 && i < ed.legs.length);
  for (const i of near) ed.legs[i] = newLeg();
  render();
  near.forEach(routeLeg);
}

function removePoint(k) {
  if (ed.pts.length <= 2) { toast('A route needs a start and an end'); return; }
  snapshot();
  if (k === 0) { ed.pts.shift(); ed.legs.shift(); }
  else if (k === ed.pts.length - 1) { ed.pts.pop(); ed.legs.pop(); }
  else {
    const a = ed.legs[k - 1], b = ed.legs[k];
    ed.pts.splice(k, 1);
    // two untouched pieces of the file just join up again
    if (a.kind === 'file' && b.kind === 'file') ed.legs.splice(k - 1, 2, { kind: 'file', coords: [...a.coords, ...b.coords.slice(1)] });
    else { ed.legs.splice(k - 1, 2, newLeg()); routeLeg(k - 1); }
  }
  render();
}

// Remove the selected bit. At the start or end of the route that just shortens it; in the middle
// the gap is bridged by roads (or a straight line).
function cutSelection(kind) {
  const { a, b } = ed.sel;
  const lo = Math.min(a, b), hi = Math.max(a, b), len = total();
  if (hi - lo < 10) { ed.sel = null; render(); return; }
  snapshot();
  const atStart = lo < 20, atEnd = hi > len - 20;
  if (atStart && atEnd) { ed.undo.pop(); toast('That would remove the whole route'); return; }
  const [kA, kB] = pointsAround(atStart ? 0 : lo, atEnd ? Infinity : hi);
  if (atStart) { ed.pts.splice(0, kB); ed.legs.splice(0, kB); }
  else if (atEnd) { ed.pts.splice(kA + 1); ed.legs.splice(kA); }
  else return replaceBetween(kA, kB, [], kind);
  ed.sel = null;
  render();
}

function addPoint(ll) {
  snapshot();
  ed.pts.push(ll);
  ed.legs.push(newLeg());
  render();
  routeLeg(ed.legs.length - 1);
}

// ---------------------------------------------------------------- drawing

function render() {
  if (!ed) return;
  layer.clearLayers();
  for (const l of ed.legs) {
    const coords = l.coords.length > 1 ? l.coords : [];
    if (!coords.length) continue;
    L.polyline(coords, { color: '#fff', weight: 10, opacity: .9, interactive: false }).addTo(layer);
    L.polyline(coords, { color: l.pending ? '#7d8a90' : COLORS[l.kind], weight: 6, opacity: 1, interactive: false, dashArray: l.pending || l.kind === 'straight' ? '8 8' : null, lineCap: 'round' }).addTo(layer);
  }
  if (ed.sel) {
    const lo = Math.min(ed.sel.a, ed.sel.b ?? ed.sel.a), hi = Math.max(ed.sel.a, ed.sel.b ?? ed.sel.a);
    if (ed.sel.b != null) L.polyline(slice(lo, hi), { color: '#d93025', weight: 8, opacity: .95, interactive: false }).addTo(layer);
    for (const x of [ed.sel.a, ed.sel.b]) if (x != null) L.marker(at(x).q, { interactive: false, icon: L.divIcon({ className: '', html: '<div class="ed-cut"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }) }).addTo(layer);
  }
  const hit = L.polyline(fullLine(), { color: '#000', weight: 30, opacity: 0, className: 'route-hit' }).addTo(layer);
  lineEvents(hit.getElement());
  ed.pts.forEach((p, k) => {
    const end = k === 0 ? 'start' : k === ed.pts.length - 1 ? 'end' : '';
    const m = L.marker(p, {
      draggable: true, autoPan: true, zIndexOffset: end ? 900 : 600,
      icon: L.divIcon({ className: '', html: `<div class="ed-pt ${end}"></div>`, iconSize: [22, 22], iconAnchor: [11, 11] }),
    }).addTo(layer);
    m.on('dragend', () => { const ll = m.getLatLng(); movePoint(k, [ll.lat, ll.lng]); });
    m.on('click', () => {
      L.popup({ closeButton: false, offset: [0, -6] }).setLatLng(p)
        .setContent(`<div class="map-popup"><b>${esc(t(end === 'start' ? 'Start' : end === 'end' ? 'End' : 'Point'))}</b><small>${esc(t('Drag it to move the route'))}</small><button data-a="rm">${esc(t(end ? 'Remove (route gets shorter)' : 'Remove this point'))}</button></div>`)
        .openOn(map);
      document.querySelector('.map-popup [data-a="rm"]').onclick = () => { map.closePopup(); removePoint(k); };
    });
  });
  renderBar();
}

// part of the route between two distances
function slice(lo, hi) {
  const out = [at(lo).q];
  let base = 0;
  for (const l of ed.legs) {
    const cum = cumulative(l.coords);
    l.coords.forEach((p, i) => { const x = base + cum[i]; if (x > lo && x < hi) out.push(p); });
    base += cum.at(-1) || 0;
  }
  out.push(at(hi).q);
  return out;
}

function renderBar() {
  const sel = ed.sel, len = total();
  $('#edDist').textContent = fmtDist(len);
  $('#edUndo').disabled = !ed.undo.length;
  $('#edRedo').disabled = !ed.redo.length;
  $('#edSnap').setAttribute('aria-checked', String(ed.snap));
  $('#edAdd').setAttribute('aria-pressed', String(ed.adding));
  $('#edSel').hidden = !(sel && sel.b != null);
  const msg = ed.adding ? 'Tap the map to add to the end of the route'
    : sel && sel.b == null ? 'Now tap where the bit you want to remove ends'
    : sel ? (sel.edge ? 'Remove this bit? The route gets shorter.' : 'Remove this bit?')
    : 'Tap the route where a bit you don’t want starts, or drag the line to reshape it';
  $('#edMsg').textContent = t(msg);
  if (sel && sel.b != null) {
    const lo = Math.min(sel.a, sel.b), hi = Math.max(sel.a, sel.b);
    $('#edSelLen').textContent = fmtDist(hi - lo);
    $('#edBridge').hidden = $('#edStraight').hidden = !!sel.edge;
    $('#edTrim').hidden = !sel.edge;
    $('#edBridge').textContent = t('Remove, go via roads');
  }
}

// ---------------------------------------------------------------- input

// Press on the line: drag it to reshape that bit, or tap to mark the start/end of a bit to remove.
function lineEvents(el) {
  if (!el) return;
  L.DomEvent.on(el, 'touchstart mousedown click', L.DomEvent.stopPropagation);
  L.DomEvent.on(el, 'mousedown', L.DomEvent.preventDefault);
  el.addEventListener('pointerdown', down => {
    if (down.button > 0 || !ed) return;
    down.preventDefault(); down.stopPropagation();
    el.setPointerCapture(down.pointerId);
    map.dragging.disable();
    const start = [down.clientX, down.clientY];
    const ll0 = map.mouseEventToLatLng(down);
    const loc = locate([ll0.lat, ll0.lng]);
    let ghost = null, band = null, moved = false;
    const move = e => {
      if (!moved && Math.hypot(e.clientX - start[0], e.clientY - start[1]) < 8) return;
      moved = true;
      const ll = map.mouseEventToLatLng(e);
      const a = at(Math.max(0, loc.along - RESHAPE)).q, b = at(Math.min(total(), loc.along + RESHAPE)).q;
      if (!ghost) {
        band = L.polyline([a, ll, b], { color: COLORS[ed.snap ? 'roads' : 'straight'], weight: 4, dashArray: '6 8', interactive: false }).addTo(map);
        ghost = L.marker(ll, { interactive: false, icon: L.divIcon({ className: '', html: '<div class="ed-pt"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }) }).addTo(map);
      }
      ghost.setLatLng(ll); band.setLatLngs([a, ll, b]);
    };
    const up = e => {
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      map.dragging.enable();
      ghost?.remove(); band?.remove();
      if (e.type === 'pointercancel' || !ed) return;
      if (moved) { const ll = map.mouseEventToLatLng(e); reshape(loc, [ll.lat, ll.lng]); return; }
      tapLine(loc);
    };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  });
}

function tapLine(loc) {
  if (ed.adding) return;
  const len = total();
  if (!ed.sel || ed.sel.b != null) ed.sel = { a: loc.along };
  else {
    ed.sel.b = loc.along;
    const lo = Math.min(ed.sel.a, ed.sel.b), hi = Math.max(ed.sel.a, ed.sel.b);
    ed.sel.edge = lo < 20 || hi > len - 20;
    if (hi - lo < 10) ed.sel = { a: loc.along };
  }
  render();
}

// a tap on the map (not the line), passed on by mapview.js while the editor is open
export function editorTap(e) {
  if (!ed) return;
  if (ed.adding) return addPoint([e.latlng.lat, e.latlng.lng]);
  if (ed.sel) { ed.sel = null; render(); }
}

let wired = false;
function wireUi() {
  if (wired) return;
  wired = true;
  const on = (id, fn) => { $(id).onclick = () => ed && fn(); };
  on('#edCancel', cancel);
  on('#edDone', done);
  on('#edUndo', () => restore(ed.undo, ed.redo));
  on('#edRedo', () => restore(ed.redo, ed.undo));
  on('#edSnap', () => { ed.snap = !ed.snap; renderBar(); toast(ed.snap ? 'New bits follow paths on the map' : 'New bits are straight lines (for trails not on the map)'); });
  on('#edAdd', () => { ed.adding = !ed.adding; ed.sel = null; render(); });
  on('#edBridge', () => cutSelection('roads'));
  on('#edStraight', () => cutSelection('straight'));
  on('#edTrim', () => cutSelection());
  on('#edSelCancel', () => { ed.sel = null; render(); });
}
