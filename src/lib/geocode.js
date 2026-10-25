// Place search via Photon (komoot), which is built on OpenStreetMap data.
import { isOffline, nearestStreet, searchOffline } from './offline.js';
import { dist } from './geo.js';
import * as net from './net.js';

const BASE = 'https://photon.komoot.io';

function label(props) {
  const street = [props.street, props.housenumber].filter(Boolean).join(' ');
  const main = props.name || street || props.city || 'Unnamed place';
  const sub = [props.name && street, props.postcode, props.city || props.town || props.village, props.country]
    .filter(Boolean).filter(s => s !== main);
  return { name: main, detail: [...new Set(sub)].join(', ') };
}

export async function search(query, near, signal) {
  const fallback = async () => searchOffline(query, near).catch(() => []);
  if (isOffline()) return fallback();
  try {
    const params = new URLSearchParams({ q: query, limit: near ? '15' : '6' });
    // lean hard on "near me": a street name exists in many towns, the one close by is almost always meant
    if (near) params.set('lat', near[0].toFixed(4)), params.set('lon', near[1].toFixed(4)), params.set('zoom', '12'), params.set('location_bias_scale', '0.05');
    // typing again aborts the signal: a request still waiting in the queue is then never sent
    const key = `${query.trim().toLowerCase()}|${near ? near.map(v => v.toFixed(2)) : ''}`;
    const found = await net.memo('photon', key, 10 * 60000, async () => {
      const json = await net.json('photon', `${BASE}/api/?${params}`, { signal, timeout: 8000 });
      return json.features.map((f, i) => ({
        ...label(f.properties),
        latlng: [f.geometry.coordinates[1], f.geometry.coordinates[0]],
        rank: i,
      }));
    }, { max: 40 });
    if (!near) return found.map(({ rank, ...r }) => r);
    // Photon's order, nudged by distance: each 10 km away counts like one place lower in the list
    return found
      .map(r => ({ r, score: r.rank + dist(near, r.latlng) / 10000 }))
      .sort((a, b) => a.score - b.score)
      .slice(0, 6)
      .map(({ r: { rank, ...r } }) => r);
  } catch (e) {
    if (signal?.aborted) throw e;
    const found = await fallback();
    if (found.length) return found;
    throw e;
  }
}

// `layer: 'street'` names the nearest street instead of the nearest shop or house.
export async function reverse(latlng, layer = '') {
  if (!isOffline()) {
    try {
      const json = await net.json('photon', `${BASE}/reverse?lat=${latlng[0]}&lon=${latlng[1]}&limit=1${layer ? `&layer=${layer}` : ''}`, { timeout: 8000 });
      const f = json.features[0];
      if (f) return { ...label(f.properties), latlng };
    } catch { /* fall through */ }
  }
  const street = await nearestStreet(latlng).catch(() => null);
  if (street) return street;
  return { name: `${latlng[0].toFixed(5)}, ${latlng[1].toFixed(5)}`, detail: 'Dropped pin', latlng };
}
