// Tests for src/lib/net.js with a fake fetch and short timings.  node scripts/test-net.mjs
import * as net from '../src/lib/net.js';

let failed = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = (status = 200, body = '{}') => new Response(body, { status });

// concurrency + min interval
{
  net._reset();
  net._configure('brouter', { max: 2, gap: 60 });
  let active = 0, peak = 0; const starts = [];
  net._setFetch(async () => { active++; peak = Math.max(peak, active); starts.push(Date.now()); await sleep(150); active--; return res(); });
  await Promise.all([1, 2, 3, 4, 5].map(() => net.request('brouter', 'u')));
  ok(peak === 2, `concurrency capped at 2 (peak ${peak})`);
  const gaps = starts.slice(1).map((t, i) => t - starts[i]);
  ok(gaps.every(g => g >= 55), `gap between starts >= 60 ms (min ${Math.min(...gaps)})`);
}
// aborted queued request is never sent
{
  net._reset();
  net._configure('photon', { max: 1, gap: 0 });
  const sent = [];
  net._setFetch(async url => { sent.push(url); await sleep(80); return res(); });
  const ctl = new AbortController();
  const a = net.request('photon', 'first');
  const b = net.request('photon', 'second', { signal: ctl.signal });
  const c = net.request('photon', 'third');
  await sleep(10); ctl.abort();
  const rb = await b.then(() => 'sent', e => e.name);
  await Promise.all([a, c]);
  ok(rb === 'AbortError' && !sent.includes('second') && sent.length === 2, `aborted queued request dropped (sent: ${sent})`);
}
// backoff 429 -> Busy, then longer, success resets
{
  net._reset();
  net._configure('nominatim', { max: 1, gap: 0, backoff: [100, 200, 400] });
  let mode = 429, calls = 0;
  net._setFetch(async () => { calls++; return res(mode, mode === 429 ? 'slow' : 'ok'); });
  const e1 = await net.request('nominatim', 'u').catch(e => e);
  ok(net.isBusy(e1) && e1.service === 'nominatim' && e1.retryAt > Date.now(), 'first 429 -> Busy with retryAt');
  const before = calls;
  const e2 = await net.request('nominatim', 'u').catch(e => e);
  ok(net.isBusy(e2) && calls === before, 'while paused: fails fast, server not hit');
  ok(net.busyFor('nominatim') > 0 && net.busyMap().nominatim, 'busy state exposed');
  await sleep(120);
  ok(net.busyFor('nominatim') === 0, 'pause over after the first step');
  const e3 = await net.request('nominatim', 'u').catch(e => e);
  ok(net.isBusy(e3) && e3.retryAt - Date.now() > 120, `second pause is longer (${e3.retryAt - Date.now()} ms)`);
  await sleep(210);
  mode = 200;
  const r = await net.request('nominatim', 'u');
  ok(r.ok, 'request works after the pause');
  mode = 429;
  const e4 = await net.request('nominatim', 'u').catch(e => e);
  ok(net.isBusy(e4) && e4.retryAt - Date.now() <= 100, 'success reset the backoff to the first step');
}
// BRouter body "Please, retry later!" with HTTP 200
{
  net._reset();
  net._configure('brouter', { max: 1, gap: 0, backoff: [100] });
  net._setFetch(async () => res(200, 'Please, retry later!\n'));
  const e = await net.request('brouter', 'u', { busyBody: /retry later/i }).catch(e => e);
  ok(net.isBusy(e), 'busy body detected on a 200 answer');
}
// cache
{
  net._reset();
  let n = 0;
  const load = async () => ++n;
  const a = await net.memo('x', 'k', 1000, load), b = await net.memo('x', 'k', 1000, load);
  ok(a === 1 && b === 1 && n === 1, 'cache hit avoids the loader');
  await sleep(30);
  const c = await net.memo('x', 'k', 10, load);
  ok(c === 2, 'expired entry reloads');
  for (let i = 0; i < 5; i++) net.cacheSet('lru', i, i, { max: 3 });
  ok(net.cacheGet('lru', 0, 1000) === undefined && net.cacheGet('lru', 4, 1000) === 4, 'LRU keeps the newest');
}
net._reset();
if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log('all passed');
