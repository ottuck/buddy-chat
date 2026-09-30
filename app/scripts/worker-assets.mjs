// Prepares `expo export -p web` output for the Cloudflare Worker's static assets
// (app/wrangler.jsonc). Run after exporting: node scripts/worker-assets.mjs dist
import fs from 'node:fs';
import path from 'node:path';

const dist = process.argv[2] ?? 'dist';

// Expo Router's route list is a development aid; it has no place on the public site.
fs.rmSync(path.join(dist, '_sitemap.html'), { force: true });

// Unknown paths get Expo's not-found page (not_found_handling: "404-page").
fs.copyFileSync(path.join(dist, '+not-found.html'), path.join(dist, '404.html'));

// Browsers check the service worker for updates, so it must not be served stale.
fs.writeFileSync(
  path.join(dist, '_headers'),
  `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin

/sw.js
  Cache-Control: no-cache

/manifest.webmanifest
  Content-Type: application/manifest+json
`,
);
console.log('404.html and _headers written');
