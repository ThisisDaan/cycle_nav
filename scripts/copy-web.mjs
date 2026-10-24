// Copies third-party libraries into vendor/ and the web app into www/,
// which Capacitor bundles into the Android app.
import { cpSync, rmSync, mkdirSync } from 'node:fs';

const VENDOR = {
  'leaflet.js': 'leaflet/dist/leaflet.js',
  'leaflet.css': 'leaflet/dist/leaflet.css',
  'maplibre-gl.js': 'maplibre-gl/dist/maplibre-gl.js',
  'maplibre-gl.css': 'maplibre-gl/dist/maplibre-gl.css',
  'leaflet-maplibre-gl.js': '@maplibre/maplibre-gl-leaflet/leaflet-maplibre-gl.js',
  'capacitor.js': '@capacitor/core/dist/capacitor.js', // only loaded inside the Android app
};
mkdirSync('vendor', { recursive: true });
for (const [name, src] of Object.entries(VENDOR)) cpSync(`node_modules/${src}`, `vendor/${name}`);

const FILES = ['index.html', 'styles.css', 'manifest.webmanifest', 'sw.js', 'icons', 'js', 'profiles', 'vendor'];
rmSync('www', { recursive: true, force: true });
mkdirSync('www');
for (const f of FILES) cpSync(f, `www/${f}`, { recursive: true });
console.log('Copied web app to www/');
