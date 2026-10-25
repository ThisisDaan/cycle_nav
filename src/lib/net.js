// One request manager for every call to a free public service: a queue per service with a
// concurrency cap and a minimum gap between request starts, a pause (backoff) when a service says
// "slow down", and small caches so the same question is not asked twice.
// No imports on purpose: it also runs under node for scripts/test-net.mjs.

// max = parallel requests, gap = ms between request starts, backoff = pause lengths for consecutive "slow down" answers
const STEPS = [30000, 60000, 120000, 300000];
const POLICY = {
  brouter:    { max: 2, gap: 1000 },
  nominatim:  { max: 1, gap: 1100 },   // their usage policy: 1 request per second at most
  photon:     { max: 2, gap: 300 },
  overpass:   { max: 1, gap: 1000 },
  wikidata:   { max: 1, gap: 1000 },
  openmeteo:  { max: 2, gap: 600 },
  buienradar: { max: 2, gap: 600 },
  rainviewer: { max: 1, gap: 1000 },
};

let doFetch = (url, opts) => fetch(url, opts);
const svc = {};
const listeners = new Set();

function state(name) {
  return svc[name] ||= { ...(POLICY[name] || { max: 2, gap: 1000 }), backoff: STEPS, active: 0, last: 0, queue: [], until: 0, strikes: 0, fails: 0, timer: null };
}

function abortError() { return new DOMException('Aborted', 'AbortError'); }
export function busyError(service, retryAt) {
  const e = new Error(`${service} is busy`);
  e.name = 'Busy'; e.service = service; e.retryAt = retryAt;
  return e;
}
export const isBusy = e => e?.name === 'Busy';

// ms left of the pause for a service (0 = free to use)
export function busyFor(name) { return Math.max(0, state(name).until - Date.now()); }

export function busyMap() {
  const out = {};
  for (const [k, s] of Object.entries(svc)) if (s.until > Date.now()) out[k] = s.until;
  return out;
}
export function onBusyChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() {
  const m = busyMap();
  listeners.forEach(fn => { try { fn(m); } catch { /* listener errors must not stall the queue */ } });
}

// the service said slow down: pause it, longer each time in a row
function penalize(name) {
  const s = state(name);
  const wait = s.backoff[Math.min(s.strikes, s.backoff.length - 1)];
  s.strikes++;
  s.fails = 0;
  s.until = Date.now() + wait;
  emit();
  setTimeout(emit, wait + 20);           // lets the UI clear its message when the pause is over
  // whatever was waiting in the queue would only hit the server again
  const q = s.queue.splice(0);
  q.forEach(j => { j.cleanup(); j.reject(busyError(name, s.until)); });
  return s.until;
}
function succeeded(name) {
  const s = state(name);
  s.fails = 0;
  if (s.strikes) { s.strikes = 0; }
}

function pump(name) {
  const s = state(name);
  clearTimeout(s.timer); s.timer = null;
  while (s.queue.length) {
    // queued requests whose caller gave up (a newer keystroke, leaving the screen) are never sent
    const job = s.queue[0];
    if (job.signal?.aborted) { s.queue.shift(); job.cleanup(); job.reject(abortError()); continue; }
    if (s.active >= s.max) return;
    const wait = s.last + s.gap - Date.now();
    if (wait > 0) { s.timer = setTimeout(() => pump(name), wait); return; }
    s.queue.shift();
    job.cleanup();
    start(name, s, job);
  }
}

async function start(name, s, job) {
  s.active++;
  s.last = Date.now();
  const { opts } = job;
  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  job.signal?.addEventListener('abort', onAbort);
  const timer = opts.timeout ? setTimeout(() => ctl.abort(), opts.timeout) : null;
  try {
    const { timeout, busyBody, send, signal, ...init } = opts;
    const res = await (send ? send(job.url, ctl.signal) : doFetch(job.url, { ...init, signal: ctl.signal }));
    let slow = res.status === 429 || res.status === 503;
    if (!slow && busyBody) slow = busyBody.test((await res.clone().text()).slice(0, 200));
    if (slow) { job.reject(busyError(name, penalize(name))); return; }
    if (res.status < 500) succeeded(name);
    job.resolve(res);
  } catch (e) {
    if (job.signal?.aborted) job.reject(abortError());
    else {
      // repeated network errors (not our own timeout of a slow answer alone) count as a soft signal
      if ((typeof navigator === 'undefined' || navigator.onLine !== false) && ++s.fails >= 3) { job.reject(e); penalize(name); return; }
      job.reject(e);
    }
  } finally {
    clearTimeout(timer);
    job.signal?.removeEventListener('abort', onAbort);
    s.active--;
    pump(name);
  }
}

// request('nominatim', url, { timeout, signal, busyBody, send, ...fetch init }) -> Promise<Response>
//   busyBody  regexp; a response whose body matches counts as "slow down" whatever its status
//   send      (url, signal) -> Response, for transports other than fetch (native HTTP)
// Rejects with a Busy error (see isBusy) while the service is paused.
export function request(name, url, opts = {}) {
  const s = state(name);
  if (opts.signal?.aborted) return Promise.reject(abortError());
  if (s.until > Date.now()) return Promise.reject(busyError(name, s.until));
  return new Promise((resolve, reject) => {
    const job = { url, opts, signal: opts.signal, resolve, reject, cleanup: () => job.signal?.removeEventListener('abort', job.onQueuedAbort) };
    // a queued request notices its signal right away, it does not have to wait for its turn
    job.onQueuedAbort = () => {
      const i = s.queue.indexOf(job);
      if (i >= 0) { s.queue.splice(i, 1); job.cleanup(); reject(abortError()); }
    };
    opts.signal?.addEventListener('abort', job.onQueuedAbort);
    s.queue.push(job);
    pump(name);
  });
}

export async function text(name, url, opts) {
  const r = await request(name, url, opts);
  const body = await r.text();
  if (!r.ok) { const e = new Error(`${name} ${r.status}`); e.status = r.status; throw e; }
  return body;
}
export async function json(name, url, opts) { return JSON.parse(await text(name, url, opts)); }

// ---------------------------------------------------------------- cache
// In-memory LRU per namespace (Map keeps insertion order), optionally mirrored to sessionStorage
// so a reload does not ask again. Values must be JSON-able when session is on.
const caches = {};
const SKEY = 'cyclenav:net:';

function bucket(ns, session) {
  let c = caches[ns];
  if (c) return c;
  c = caches[ns] = new Map();
  if (session) {
    try { for (const [k, v] of JSON.parse(sessionStorage.getItem(SKEY + ns)) || []) c.set(k, v); } catch { /* none yet */ }
  }
  return c;
}
function persist(ns, c) {
  try { sessionStorage.setItem(SKEY + ns, JSON.stringify([...c])); } catch { /* full or unavailable */ }
}

export function cacheGet(ns, key, ttl, { session = false } = {}) {
  const c = bucket(ns, session);
  const hit = c.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > ttl) { c.delete(key); return undefined; }
  c.delete(key); c.set(key, hit);          // most recently used goes last
  return hit.v;
}
export function cacheSet(ns, key, v, { max = 50, session = false } = {}) {
  const c = bucket(ns, session);
  c.delete(key);
  c.set(key, { at: Date.now(), v });
  while (c.size > max) c.delete(c.keys().next().value);
  if (session) persist(ns, c);
}

// memo(ns, key, ttl, loader, { max, session }): cached value, else loader()'s result (stored on success).
// Concurrent calls with the same key share one loader run.
const pending = new Map();
export async function memo(ns, key, ttl, loader, o = {}) {
  const hit = cacheGet(ns, key, ttl, o);
  if (hit !== undefined) return hit;
  const pk = ns + '|' + key;
  if (pending.has(pk)) return pending.get(pk);
  const p = (async () => { const v = await loader(); if (v !== undefined) cacheSet(ns, key, v, o); return v; })()
    .finally(() => pending.delete(pk));
  pending.set(pk, p);
  return p;
}

// ---------------------------------------------------------------- for tests
export function _configure(name, over) { Object.assign(state(name), over); }
export function _setFetch(fn) { doFetch = fn; }
export function _reset() {
  for (const s of Object.values(svc)) clearTimeout(s.timer);
  for (const k of Object.keys(svc)) delete svc[k];
  for (const k of Object.keys(caches)) delete caches[k];
  pending.clear();
}
