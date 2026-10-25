import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    sveltekit({
      adapter: adapter({ pages: 'build', assets: 'build', fallback: 'index.html' }),
      // '' for the Android app (served from the root), '/cycle_nav_live' for the web publish (BASE_PATH env var)
      paths: { base: process.env.BASE_PATH ?? '' },
      // registered by hand in src/lib/app.js: not in the Android app or on localhost
      serviceWorker: { register: false },
    }),
  ],
});
