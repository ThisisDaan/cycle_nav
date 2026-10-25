// Network-first cache of the app shell so Cycle Nav still opens with a bad connection.
/// <reference lib="webworker" />
import { immutable, assets, prerendered } from '$app/manifest';
import { version } from '$app/env';

const CACHE = `cyclenav-${version}`;
// manifest paths are relative to the base path; the worker's scope is the base path (with trailing slash)
const SCOPE = self.registration.scope;
const SHELL = [...new Set([SCOPE, ...[...immutable, ...assets, ...prerendered].map(f => SCOPE + f.path.replace(/^\//, ''))])];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    // revalidate with the server: GitHub Pages lets browsers cache files for 10 minutes
    fetch(e.request, { cache: 'no-cache' })
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
