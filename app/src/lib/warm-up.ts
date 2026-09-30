import { Platform } from 'react-native';

import { apiUrl } from './api-url';

// The server stays on (docs/server-design.md, 인프라), but right after a deploy or a restart the
// first visit waits for it to start. Poking it as soon as the app opens lets it start while the
// user is still reading the first screen or restoring their session. Nothing is
// read from the answer; on the web the health check sends no CORS headers, so the request is
// opaque on purpose.
export function warmUpServer(): void {
  let url: string;
  try {
    url = `${apiUrl()}/actuator/health`;
  } catch {
    return; // no server address configured
  }
  fetch(url, Platform.OS === 'web' ? { mode: 'no-cors' } : undefined).catch(() => {
    // Offline or still starting: the real requests retry on their own.
  });
}
