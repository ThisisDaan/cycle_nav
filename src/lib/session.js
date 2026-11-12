import * as store from './store.js';
import { t } from './i18n.js';
import { simplify } from './geo.js';
import { applyBike } from './bikes.js';
import { startRecording } from './navigation.js';
import { ME, syncInputs } from './planner.js';
import { drawStart, planRoute } from './routing-ui.js';
import { askConfirm } from './ui.js';
import { app } from './state.svelte.js';

// ---------------------------------------------------------------- session (survives reloads / app kills)

export const PLAN_KEY = 'cyclenav-session', NAV_KEY = 'cyclenav-nav-session';
const SESSION_MAX_AGE = 6 * 3600 * 1000;

let sessionTimer;
const packPlace = p => p && (p.isMe ? { isMe: true } : { name: p.name, detail: p.detail, latlng: p.latlng });
export const packVias = list => list.map(v => ({ ll: [v[0], v[1]], gpx: v.gpx, along: v.along, entry: v.entry, moved: v.moved, name: v.name, city: v.city }));
export const unpackVias = list => (list || []).map(v => Object.assign([v.ll[0], v.ll[1]], { gpx: v.gpx, along: v.along, entry: v.entry, moved: v.moved, name: v.name, city: v.city }));
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
export const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };

export function saveNavSession() {
  if (!app.nav) return;
  const r = app.nav.recorder;
  lsSet(NAV_KEY, {
    savedAt: Date.now(),
    dest: packPlace(app.nav.dest),
    vias: packVias(app.nav.vias || []),
    startedAt: r.startedAt,
    recordOnly: !!app.nav.recordOnly,
    bikeId: store.activeBike().id,
    rec: { distance: r.distance, movingTime: r.movingTime, points: simplify(r.points, 4) },
  });
}

export function savePlanSession(keepIfEmpty) {
  if (app.nav) return;
  if (!app.to) { if (!keepIfEmpty) lsSet(PLAN_KEY, null); return; }
  lsSet(PLAN_KEY, {
    from: packPlace(app.from), to: packPlace(app.to), vias: packVias(app.vias),
    gpx: app.gpxRoute ? { ...app.gpxRoute, vias: packVias(app.gpxRoute.vias) } : null,
    selected: app.selected, bikeId: store.activeBike().id,
  });
}

export function scheduleSession() {
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(savePlanSession, 300);
}

export function restoreSession() {
  const ns = lsGet(NAV_KEY);
  if (ns && Date.now() - ns.savedAt < SESSION_MAX_AGE && ns.rec) {
    const name = ns.dest?.name;
    const text = ns.recordOnly || !ns.dest ? t('Resume recording?') : t('Resume your ride to {0}?', ns.dest.isMe ? t('My location') : name);
    askConfirm(text, { ok: 'Resume', cancel: 'Discard' }).then(yes => {
      if (!yes) { lsSet(NAV_KEY, null); return; }
      applyBike(ns.bikeId);
      if (ns.recordOnly || !ns.dest) { startRecording(ns); return; }
      const lastPt = ns.rec.points[ns.rec.points.length - 1];
      app.from = app.me || !lastPt ? ME : { name: t('Start'), detail: '', latlng: [lastPt[0], lastPt[1]] }; app.to = ns.dest; app.vias = unpackVias(ns.vias); app.gpxRoute = null;
      app.resumeNav = ns;
      syncInputs();
      planRoute({ fit: false });
    });
    return;
  }
  lsSet(NAV_KEY, null);
  const ps = lsGet(PLAN_KEY);
  if (!ps?.to) return;
  applyBike(ps.bikeId);
  app.from = ps.from || ME; app.to = ps.to;
  app.vias = unpackVias(ps.vias);
  // a plan from before GPX starts could be moved has no track: show it, just without the start controls
  app.gpxRoute = ps.gpx?.track ? { ...ps.gpx, vias: unpackVias(ps.gpx.vias) } : null;
  app.restoreSel = ps.selected;
  syncInputs();
  if (!app.from.isMe) drawStart(app.from.latlng);
  planRoute({ fit: false });
}
