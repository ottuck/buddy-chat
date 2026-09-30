// Registered on start, so the site can be installed and notifications can arrive (public/sw.js).
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('service worker', e));
}
