// Prepares `expo export -p web` output for Azure Static Web Apps (docs/server-design.md, 인프라).
// Expo writes a page per route as <route>.html, but Static Web Apps looks for <route>/index.html,
// so each route gets a rewrite. Run after exporting: node scripts/static-web-app-config.mjs dist
import fs from 'node:fs';
import path from 'node:path';

const dist = process.argv[2] ?? 'dist';

// Expo Router's route list is a development aid; it has no place on the public site.
fs.rmSync(path.join(dist, '_sitemap.html'), { force: true });

const pages = fs
  .readdirSync(dist)
  .filter((file) => file.endsWith('.html') && file !== 'index.html' && !file.startsWith('+'))
  .map((file) => file.slice(0, -'.html'.length));

const config = {
  routes: [
    ...pages.map((page) => ({ route: `/${page}`, rewrite: `/${page}.html` })),
    // Browsers check the service worker for updates; it must not be served stale.
    { route: '/sw.js', headers: { 'Cache-Control': 'no-cache' } },
  ],
  mimeTypes: { '.webmanifest': 'application/manifest+json' },
  responseOverrides: { 404: { rewrite: '/+not-found.html' } },
  globalHeaders: {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  },
};

fs.writeFileSync(path.join(dist, 'staticwebapp.config.json'), JSON.stringify(config, null, 2));
console.log(`staticwebapp.config.json: ${pages.map((page) => `/${page}`).join(', ')}`);
