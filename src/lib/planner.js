import * as store from './store.js';
import { search } from './geocode.js';
import { icon } from './icons.js';
import { t } from './i18n.js';
import { landscapeMQ, map } from './mapview.js';
import { editPin, pinBtn } from './pins.js';
import { pickGpxRoute } from './rides.js';
import { clearRoutes, drawStart, planRoute } from './routing-ui.js';
import { scheduleSession } from './session.js';
import { $, esc, S, toast } from './ui.js';
import { app, ME } from './state.svelte.js';

export { ME };


// ---------------------------------------------------------------- planner

export function setupPlanner() {
  // Keep the map buttons just below the search box as it grows with added points.
  new ResizeObserver(() => {
    const r = $('#planner').getBoundingClientRect();
    document.documentElement.style.setProperty('--planner-bottom', `${Math.round(r.bottom + 12)}px`);
  }).observe($('#planner'));
  // The From row stays folded away while it is just "My location"; it opens with a route, a custom
  // start, or on request, and folds again once the route is cleared.
  new MutationObserver(updateFromRow).observe($('#sheet'), { attributes: true, attributeFilter: ['hidden'] });
  $('#changeStartBtn').onclick = () => { fromAsked = true; updateFromRow(); $('#fromInput').focus({ preventScroll: true }); };
  $('#fromInput').addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== $('#fromInput')) { fromAsked = false; updateFromRow(); } }, 150));
  updateFromRow();
  for (const which of ['from', 'to']) {
    const input = $(`#${which}Input`);
    let timer, abort;
    input.addEventListener('focus', () => { input.select(); showSuggestions(which, input.value.trim()); });
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 3) { showSuggestions(which, ''); return; }
      timer = setTimeout(async () => {
        abort?.abort();
        abort = new AbortController();
        renderSuggestions(which, null, `<li class="s-head"><span class="spinner"></span>Searching…</li>`);
        try {
          const results = await search(q, app.me?.latlng || mapCenter(), abort.signal);
          renderSuggestions(which, results.length ? results : null, results.length ? '' : '<li class="s-head">Nothing found</li>');
        } catch (e) {
          if (e.name !== 'AbortError') renderSuggestions(which, null, '<li class="s-head">Search is unavailable right now</li>');
        }
      }, 300);
    });
    input.addEventListener('keydown', e => {
      const items = [...document.querySelectorAll('#suggestions li[data-i]')];
      const cur = items.findIndex(li => li.classList.contains('active'));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        items[cur]?.classList.remove('active');
        const next = (cur + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[next]?.classList.add('active');
      } else if (e.key === 'Enter') {
        (items[cur] || items[0])?.click();
      } else if (e.key === 'Escape') {
        hideSuggestions();
        input.blur();
      }
    });
  }
  $('#swapBtn').onclick = () => {
    pushUndo('Swapped');
    [app.from, app.to] = [app.to || ME, app.from];
    app.vias.reverse();
    if (app.to?.isMe && app.from?.isMe) app.to = null;
    syncInputs();
    planRoute();
  };
  $('#cancelRouteBtn').onclick = () => $('#clearBtn').click();
  $('#clearBtn').onclick = () => {
    if (app.to) pushUndo('Route cleared');
    app.from = ME; app.to = null;
    syncInputs();
    clearRoutes();
    updateFromRow();
  };
}

function mapCenter() { const c = map.getCenter(); return [c.lat, c.lng]; }

let suggestionItems = [];
function showSuggestions(which, q) {
  if (q.length >= 3) return; // a search is (or will be) running
  const items = [];
  if (which === 'from' || !app.from.isMe) items.push({ ...ME, icon: '◎', detail: app.me ? 'Use GPS' : 'Waiting for GPS…' });
  if (which === 'to') items.push({ name: 'Follow a GPX route…', detail: 'Open a .gpx file and navigate along it', icon: icon('folder_open', 20), action: 'gpx' });
  const recent = S().recent.map(r => ({ ...r, icon: icon('history', 20), recent: true }));
  renderSuggestions(which, [...items, ...recent], '', recent.length ? 'Recent' : '');
}

function renderSuggestions(which, items, extraHtml = '', head = '') {
  suggestionItems = items || [];
  const ul = $('#suggestions');
  ul.dataset.which = which;
  let html = extraHtml;
  suggestionItems.forEach((it, i) => {
    if (head && i === suggestionItems.findIndex(x => x.recent)) html += `<li class="s-head">${esc(head)}</li>`;
    html += `<li data-i="${i}"><span class="s-icon">${it.icon || icon('place', 20)}</span><span class="s-text"><div class="s-name">${esc(it.name)}</div>${it.detail ? `<div class="s-detail">${esc(it.detail)}</div>` : ''}</span>${(it.latlng || it.isMe) && !it.recent ? `${pinBtn(it)}` : ''}</li>`;
  });
  ul.innerHTML = html;
  ul.hidden = !html;
  ul.querySelectorAll('li[data-i]').forEach(li => {
    li.onmousedown = e => e.preventDefault(); // keep focus so blur doesn't eat the click
    const pb = li.querySelector('[data-pin]');
    if (pb) pb.onclick = e => {
      e.stopPropagation();
      const it = suggestionItems[+li.dataset.i];
      const latlng = it.isMe ? app.me?.latlng : it.latlng;
      if (!latlng) { toast('Waiting for your location…'); return; }
      hideSuggestions(); document.activeElement?.blur();
      editPin(null, { name: it.isMe ? '' : it.name, note: it.isMe ? '' : it.detail || '', latlng });
    };
    li.onclick = () => {
      const { icon, recent, action, ...place } = suggestionItems[+li.dataset.i];
      if (action === 'gpx') { hideSuggestions(); document.activeElement?.blur(); pickGpxRoute(); return; }
      choosePlace(ul.dataset.which, place);
    };
  });
}

export function hideSuggestions() { $('#suggestions').hidden = true; }

export function choosePlace(which, place) {
  hideSuggestions();
  document.activeElement?.blur();
  if (which === 'from') app.from = place; else app.to = place;
  app.vias = [];
  app.gpxRoute = null;
  scheduleSession();
  if (!place.isMe) store.addRecent({ name: place.name, detail: place.detail, latlng: place.latlng });
  syncInputs();
  if (app.to) planRoute(); else if (which === 'from') drawStart(resolve(app.from));
  // Show the place right away; once both ends are known the route fit takes over.
  const ll = resolve(place);
  if (ll && !(app.to && resolve(app.from) && resolve(app.to))) map.flyTo(ll, Math.max(map.getZoom(), 15), { duration: 0.8 });
}

let fromAsked = false;
function updateFromRow() {
  const show = fromAsked || !app.from.isMe || !!app.to || !$('#sheet').hidden;
  $('#plannerRows').classList.toggle('from-hidden', !show);
  $('#fromWrap').inert = !show;
}

export function syncInputs() {
  $('#fromInput').value = app.from?.isMe ? '' : app.from?.name || '';
  $('#toInput').value = app.to ? (app.to.isMe ? t('My location') : app.to.name) : '';
  updateFromRow();
}

export function resolve(place) { return place?.isMe ? app.me?.latlng : place?.latlng; }

// ---- undo for route edits

const undoStack = [];
let undoTimer = 0;
const snapPlan = () => ({ from: app.from, to: app.to, gpx: app.gpxRoute, vias: app.vias.map(v => Object.assign([v[0], v[1]], { gpx: v.gpx, along: v.along, entry: v.entry, moved: v.moved, name: v.name, city: v.city })) });

export function pushUndo(label) {
  undoStack.push(snapPlan());
  if (undoStack.length > 40) undoStack.shift();
  updateUndoUi();
  const bar = $('#undoBar');
  $('#undoMsg').textContent = t(label);
  bar.hidden = false;
  const sh = $('#sheet');
  if (!landscapeMQ.matches) {
    const place = () => { bar.style.bottom = `${sh.hidden ? 24 : Math.max(16, innerHeight - sh.getBoundingClientRect().top + 12)}px`; };
    place(); setTimeout(place, 360);
  } else bar.style.bottom = '';
  bar.classList.remove('show'); bar.offsetWidth; bar.classList.add('show');
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => { bar.classList.remove('show'); setTimeout(() => { bar.hidden = true; }, 250); }, 5000);
}

export function updateUndoUi() { $('#undoBtn').hidden = !undoStack.length || !!app.nav; }

export function undo() {
  const s = undoStack.pop();
  if (!s) return;
  clearTimeout(undoTimer);
  $('#undoBar').classList.remove('show'); $('#undoBar').hidden = true;
  app.from = s.from; app.to = s.to; app.gpxRoute = s.gpx;
  app.vias = s.vias.map(v => Object.assign([v[0], v[1]], { gpx: v.gpx, along: v.along, entry: v.entry, moved: v.moved, name: v.name, city: v.city }));
  syncInputs();
  updateUndoUi();
  if (app.to) planRoute({ fit: false }); else clearRoutes();
}
