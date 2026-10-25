import { t } from './i18n.js';
import { bearing, dist } from './geo.js';
import { landscapeMQ, map } from './mapview.js';
import { handleFix } from './position.js';
import { $, S } from './ui.js';
import { app } from './state.svelte.js';

// Movement simulator: you are the GPS. Tap the map and your position is there. Nothing moves by
// itself. Fixes go through handleFix, the same door real GPS uses; position.js ignores real GPS
// while this is on.

let on = false, pad = null, tick = 0, padTimer = 0;
let pos = null, heading = 0, speed = 0;  // speed: 0 until your first tap, then riding pace

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
  buildPad();
  map.on('click', onTap);
  map.on('contextmenu', onTap);
  // keep reporting where you are, like a GPS does, so navigation notices when you're off the route
  tick = setInterval(emit, 1000);
  emit();
}

function stop() {
  clearInterval(tick); clearInterval(padTimer);
  map.off('click', onTap);
  map.off('contextmenu', onTap);
  const p = pad; pad = null;
  p?.classList.add('leaving');
  setTimeout(() => p?.remove(), 250);
}

function emit() {
  try { handleFix({ latlng: [...pos], accuracy: 5, heading, speed, time: Date.now(), sim: true }); } catch (e) { console.error(e); }
}

// tap: you're there, facing the way you came from your last spot
function onTap(e) {
  const to = [e.latlng.lat, e.latlng.lng];
  if (dist(pos, to) > 2) heading = bearing(pos, to);
  pos = to;
  speed = 5; // counts as riding, so rerouting knows which way you were going
  emit();
}

// ---- the label: so it's clear real GPS is off

function buildPad() {
  pad?.remove();
  pad = document.createElement('div');
  pad.id = 'simPad';
  pad.className = 'card';
  pad.innerHTML = `<span class="sim-badge">${t('Simulating')}</span><span class="sim-hint">${t('Tap the map to put yourself there')}</span>`;
  document.body.appendChild(pad);
  placePad();
  padTimer = setInterval(placePad, 400);
}

// sit just above whichever bottom sheet is showing (side by side in landscape, where the panels
// live in the left column, so the label moves to the right)
function placePad() {
  if (!pad) return;
  const land = landscapeMQ.matches;
  pad.classList.toggle('land', land);
  // only panels that share the label's strip of screen push it up (on wide screens the sheets float on the left)
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
