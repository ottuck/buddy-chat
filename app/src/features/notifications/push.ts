import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

import { api } from '@/lib/api';

// Push notifications for new messages (docs/server-design.md, 푸시 알림). Needs a development
// build: Expo Go has no push on SDK 53+.

// While the app is open the chat already shows new messages, so no banner or sound on top.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let registeredToken: string | null = null;

// Asks for permission (once; iOS remembers the answer) and tells the server this device's token.
export async function registerForPush(): Promise<void> {
  if (!Device.isDevice) return; // simulators get no token
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) {
    console.warn('No EAS projectId in app config; push notifications are off.');
    return;
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await api<void>('/api/me/push-tokens', { method: 'POST', body: { token } });
  registeredToken = token;
}

// Before signing out, so the next person on this device does not get this user's messages.
export async function unregisterPush(): Promise<void> {
  if (!registeredToken) return;
  const token = registeredToken;
  registeredToken = null;
  await api<void>(`/api/me/push-tokens/${encodeURIComponent(token)}`, { method: 'DELETE' });
}
