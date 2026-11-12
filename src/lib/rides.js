import * as store from './store.js';
import { newRideId } from './store.js';
import { buildIndex } from './memory.js';
import { Recorder } from './nav.js';
import { t } from './i18n.js';
import { dist, fmtDist, fmtDuration } from './geo.js';
import { renderBikeChip } from './bikes.js';
import { parseGpx } from './gpx.js';
import { map } from './mapview.js';
import { $, closeDialog, esc, openDialog, S, toast } from './ui.js';

export let rideLayer;

export let rideList = [], cells = new Set();

export async function reloadRides() {
  try { rideList = await store.rides.all(); } catch { rideList = []; }
  cells = buildIndex(rideList);
  renderBikeChip();
  if (rideLayer) showRiddenRoads(true);
}

// ---------------------------------------------------------------- rides

export function offerSaveRide(session, arrived) {
  const rec = session.recorder;
  const bike = store.activeBike();
  openDialog(`
    <h2>${arrived ? 'You made it!' : 'Save this ride?'}</h2>
    <p>${session.sim ? 'This was a simulated demo ride — you probably want to discard it.' : 'Saved rides teach Cycle Nav your favourite ways and your real speed.'}</p>
    <div class="stat-row">
      <div><b>${fmtDist(rec.distance)}</b><span>distance</span></div>
      <div><b>${fmtDuration(rec.movingTime)}</b><span>moving</span></div>
      <div><b>${rec.speedKmh ? rec.speedKmh.toFixed(1) : '–'}</b><span>km/h avg</span></div>
    </div>
    <label class="field"><span>Ridden on</span>
      <select id="saveBike">${S().bikes.map(b => `<option value="${b.id}" ${b.id === bike.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
    </label>
    <label class="field"><span>Name (optional)</span>
      <input type="text" id="saveName" placeholder="${esc(session.dest?.name ? t('To {0}', session.dest.name) : t('Ride'))}">
    </label>
    <div class="dialog-actions">
      <button class="secondary-btn" id="discardRide">Discard</button>
      <button class="primary-btn" id="saveRide">Save ride</button>
    </div>`);
  $('#discardRide').onclick = closeDialog;
  $('#saveRide').onclick = async () => {
    const name = $('#saveName').value.trim() || (session.dest?.name ? t('To {0}', session.dest.name) : t('Ride'));
    const ride = rec.toRide(newRideId(), $('#saveBike').value, name);
    if (session.sim) ride.movingTime = 0; // don't learn speed from a simulation
    await store.rides.put(ride);
    closeDialog();
    await reloadRides();
    toast('Ride saved — I’ll remember this way');
  };
}

// following a GPX route lives in gpx.js
export { followTrack, pickGpxRoute } from './gpx.js';

// A ride as a GPX track (with timestamps when it was really ridden).
export function toGpx(ride) {
  const x = s => esc(s);
  const pts = ride.points.map(p => {
    const time = p[2] != null && ride.source !== 'planned' ? `<time>${new Date(ride.startedAt + p[2] * 1000).toISOString()}</time>` : '';
    return `<trkpt lat="${p[0]}" lon="${p[1]}">${time}</trkpt>`;
  }).join('\n      ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Cycle Nav" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${x(ride.name || 'Ride')}</name><time>${new Date(ride.startedAt).toISOString()}</time></metadata>
  <trk>
    <name>${x(ride.name || 'Ride')}</name>
    <type>cycling</type>
    <trkseg>
      ${pts}
    </trkseg>
  </trk>
</gpx>
`;
}

export async function importGpx(files) {
  const bike = store.activeBike();
  let ok = 0;
  for (const file of files) {
    try {
      const { pts, name } = parseGpx(await file.text());
      if (pts.length < 2) continue;
      const rec = new Recorder();
      const timed = pts.every(p => p.time);
      let t = timed ? pts[0].time : Date.now();
      rec.startedAt = t;
      for (let i = 0; i < pts.length; i++) {
        if (timed) t = pts[i].time;
        else if (i) t += dist(pts[i - 1].latlng, pts[i].latlng) / (bike.speed / 3.6) * 1000;
        rec.add(pts[i].latlng, 5, t);
      }
      const ride = rec.toRide(newRideId(), bike.id, name || file.name.replace(/\.gpx$/i, ''));
      ride.endedAt = t;
      ride.source = 'gpx';
      if (!timed) ride.movingTime = 0; // no real timing info, don't learn speed from it
      await store.rides.put(ride);
      ok++;
    } catch { /* skip broken file */ }
  }
  await reloadRides();
  toast(ok ? t('Imported {0} rides for {1}', ok, bike.name) : t('No usable GPX tracks found'));
}

export function showRiddenRoads(on) {
  rideLayer?.remove();
  rideLayer = null;
  if (!on) return;
  rideLayer = L.layerGroup(rideList.map(r => L.polyline(r.points, {
    color: S().bikes.find(b => b.id === r.bikeId)?.color || S().theme.accent,
    weight: 4, opacity: .45, interactive: false,
  }))).addTo(map);
}
