import * as store from './store.js';
import { t } from './i18n.js';
import { bearing, dist } from './geo.js';
import { landscapeMQ, map } from './mapview.js';
import { handleFix } from './position.js';
import { fetchRoute } from './router.js';
import { $, S } from './ui.js';
import { app } from './state.svelte.js';

// Movement simulator: you are the GPS. Tap the map and your position rides there along the streets
// (tap again to change course), long-press or right-click to jump there at once. Fixes go through
// handleFix, the same door real GPS uses; position.js ignores real GPS while this is on.

const SPEEDS = { walk: 5, bike: 18 };  // km/h

let on = false, pad = null, tick = 0, padTimer = 0;
let pos = null, heading = 0, mode = 'bike';
let path = null, leg = 0;              // the street path being ridden and the index of the point we head for
let goToken = 0, lastFixAt = 0, lastTick = 0;

export function initSimulate() { if (S().simulate && !S().demo) setSimulate(true); }

export function setSimulate(v) {
  if (v === on) return;
  on = v;
  app.simulating = on;
  if (on) start(); else stop();
}

function start() {
  pos = app.me?.latlng ? [...app.me.latlng] : (c => [c.lat, c.lng])(map.getCenter());
  heading = app.me?.heading ?? 0;
  path = null;
  buildPad();
  map.on('click', onTap);
  map.on('contextmenu', onJump);
  lastTick = Date.now();
  tick = setInterval(step, 100);
  emit(0);
}

function stop() {
  clearInterval(tick); clearInterval(padTimer);
  goToken++; path = null;
  map.off('click', onTap);
  map.off('contextmenu', onJump);
  const p = pad; pad = null;
  p?.classList.add('leaving');
  setTimeout(() => p?.remove(), 250);
}

const speedMs = () => SPEEDS[mode] / 3.6;
const moving = () => !!path;

function emit(speed) {
  lastFixAt = Date.now();
  try { handleFix({ latlng: [...pos], accuracy: 5, heading, speed, time: lastFixAt, sim: true }); } catch (e) { console.error(e); }
}

// runs every 100 ms: glide along the path, send a fix about every second
// (every two seconds when standing still, like a GPS that has nothing new to say)
function step() {
  const now = Date.now(), dt = (now - lastTick) / 1000;
  lastTick = now;
  if (path) advance(speedMs() * dt);
  if (now - lastFixAt >= (moving() ? 1000 : 2000)) emit(moving() ? speedMs() : 0);
}

function advance(m) {
  while (path && m > 0) {
    const target = path[leg], d = dist(pos, target);
    if (d > 0.5) heading = bearing(pos, target);
    if (d <= m) {
      pos = [...target]; m -= d;
      if (++leg >= path.length) { path = null; syncPad(); emit(0); }
    } else {
      const f = m / d;
      pos = [pos[0] + (target[0] - pos[0]) * f, pos[1] + (target[1] - pos[1]) * f];
      m = 0;
    }
  }
}

// tap: ride there along the streets (the router picks the way); a straight line if it can't
async function onTap(e) {
  const to = [e.latlng.lat, e.latlng.lng], token = ++goToken;
  setStatus(t('Finding the way…'));
  let pts;
  try { pts = (await fetchRoute([pos, to], store.activeBike())).coords; } catch { pts = [to]; }
  if (token !== goToken || !on) return;
  path = pts.map(p => [p[0], p[1]]);
  leg = 0;
  syncPad();
}

function onJump(e) {
  goToken++; path = null;
  pos = [e.latlng.lat, e.latlng.lng];
  syncPad();
  emit(0);
}

function halt() {
  goToken++; path = null;
  syncPad();
  emit(0);
}

// ---- the pad: what's happening, the speed and a stop button

function buildPad() {
  pad?.remove();
  pad = document.createElement('div');
  pad.id = 'simPad';
  pad.className = 'card';
  pad.innerHTML = `<span class="sim-badge">${t('Simulating')}</span>
    <span class="sim-hint"></span>
    <div class="sim-row"><button type="button" data-k="speed"></button><button type="button" data-k="stop">${t('Stop')}</button></div>`;
  document.body.appendChild(pad);
  pad.oncontextmenu = e => e.preventDefault();
  pad.querySelector('[data-k="speed"]').onclick = () => { mode = mode === 'bike' ? 'walk' : 'bike'; syncPad(); };
  pad.querySelector('[data-k="stop"]').onclick = halt;
  syncPad();
  placePad();
  padTimer = setInterval(placePad, 400);
}

function setStatus(text) { const h = pad?.querySelector('.sim-hint'); if (h) h.textContent = text; }

function syncPad() {
  if (!pad) return;
  pad.querySelector('[data-k="speed"]').textContent = `${t(mode === 'bike' ? 'Bike' : 'Walk')} ${SPEEDS[mode]} km/h`;
  pad.querySelector('[data-k="stop"]').disabled = !moving();
  setStatus(moving() ? t('Riding there… tap elsewhere to change course') : t('Tap the map to ride there, hold to jump'));
}

// sit just above whichever bottom sheet is showing (side by side in landscape, where the panels
// live in the left column, so the pad moves to the right)
function placePad() {
  if (!pad) return;
  const land = landscapeMQ.matches;
  pad.classList.toggle('land', land);
  // only panels that share the pad's strip of screen push it up (on wide screens the sheets float on the left)
  let bottom = 16;
  const pr = pad.getBoundingClientRect();
  for (const id of ['sheet', 'navBar', 'placeSheet']) {
    const el = $(`#${id}`);
    if (!el || el.hidden || !el.getClientRects().length) continue; // (offsetParent is always null for fixed panels)
    const r = el.getBoundingClientRect();
    if (r.left < pr.right && r.right > pr.left) bottom = Math.max(bottom, innerHeight - r.top + 12);
  }
  pad.style.bottom = `${Math.round(bottom)}px`;
}
