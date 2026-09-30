import AsyncStorage from '@react-native-async-storage/async-storage';

import { api } from '@/lib/api';

// Web Push (docs/server-design.md, 웹 푸시): the browser subscribes with the server's key and the
// service worker (public/sw.js) shows what the server sends. Browsers ask for permission only
// when the user does something, so it is asked from the switch in settings, never on its own.
// An iPhone gets web notifications only from the app added to the home screen (iOS 16.4+).

export const pushSupported = true;

// 'needsInstall': an iPhone or iPad in Safari; add to the home screen first.
export type PushState = 'on' | 'off' | 'denied' | 'unavailable' | 'needsInstall';

// Off until turned on here, unlike the app: the browser asks first.
const ENABLED_KEY = 'push-enabled';

function supported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function isAppleMobile(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1)
  );
}

function installed(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function unsupportedState(): PushState {
  return isAppleMobile() && !installed() ? 'needsInstall' : 'unavailable';
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function sameKey(a: ArrayBuffer | null, b: Uint8Array): boolean {
  if (!a) return false;
  const bytes = new Uint8Array(a);
  return bytes.length === b.length && bytes.every((value, i) => value === b[i]);
}

// Registered on start (lib/web-app.ts) so the site can be installed; this waits for it.
async function registration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register('/sw.js');
  return navigator.serviceWorker.ready;
}

// Subscribes (again, if the server's key changed) and tells the server where to send.
async function subscribe(): Promise<void> {
  const { publicKey } = await api<{ publicKey: string }>('/api/me/web-push/key');
  const key = keyBytes(publicKey);
  const worker = await registration();
  let subscription = await worker.pushManager.getSubscription();
  if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await worker.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: key,
  });
  const { endpoint, keys } = subscription.toJSON();
  await api<void>('/api/me/web-push', {
    method: 'POST',
    body: { endpoint, p256dh: keys?.p256dh, auth: keys?.auth },
  });
}

export async function pushEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(ENABLED_KEY)) === 'on';
}

/** Where things stand, subscribing again if on (for this user, and the server's current key). */
export async function registerForPush(): Promise<PushState> {
  if (!supported()) return unsupportedState();
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted' || !(await pushEnabled())) return 'off';
  await subscribe();
  return 'on';
}

/** The switch in settings: the only place the browser's permission is asked for. */
export async function setPushEnabled(enabled: boolean): Promise<PushState> {
  if (!enabled) {
    await AsyncStorage.setItem(ENABLED_KEY, 'off');
    await unregisterPush();
    return 'off';
  }
  if (!supported()) return unsupportedState();
  // First, while still handling the tap: Safari refuses to ask otherwise.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  await AsyncStorage.setItem(ENABLED_KEY, 'on');
  await subscribe();
  return 'on';
}

// Before signing out, so the next person in this browser does not get this user's messages.
export async function unregisterPush(): Promise<void> {
  if (!supported()) return;
  const worker = await navigator.serviceWorker.getRegistration();
  const subscription = await worker?.pushManager.getSubscription();
  if (!subscription) return;
  await api<void>(`/api/me/web-push?endpoint=${encodeURIComponent(subscription.endpoint)}`, {
    method: 'DELETE',
  }).catch((e) => console.warn('removing the web push subscription failed', e));
  await subscription.unsubscribe();
}
