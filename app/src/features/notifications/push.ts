import AsyncStorage from '@react-native-async-storage/async-storage';
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

export const pushSupported = true;

// 'denied': the user said no to the system prompt; only the Settings app can change that now.
export type PushState = 'on' | 'off' | 'denied' | 'unavailable';

// The user's choice in the app's settings, per device. On unless turned off.
const ENABLED_KEY = 'push-enabled';

let registeredToken: string | null = null;

export async function pushEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(ENABLED_KEY)) !== 'off';
}

// Asks for permission (once; iOS remembers the answer) and tells the server this device's token,
// unless the user turned notifications off in the app.
export async function registerForPush(): Promise<PushState> {
  if (!(await pushEnabled())) return 'off';
  if (!Device.isDevice) return 'unavailable'; // simulators get no token
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) {
    console.warn('No EAS projectId in app config; push notifications are off.');
    return 'unavailable';
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return 'denied';
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await api<void>('/api/me/push-tokens', { method: 'POST', body: { token } });
  registeredToken = token;
  return 'on';
}

// The switch in settings. Turning off removes this device's token from the server, so nothing
// is sent at all (rather than sent and hidden).
export async function setPushEnabled(enabled: boolean): Promise<PushState> {
  await AsyncStorage.setItem(ENABLED_KEY, enabled ? 'on' : 'off');
  if (enabled) return registerForPush();
  await unregisterPush();
  return 'off';
}

// Before signing out, so the next person on this device does not get this user's messages.
export async function unregisterPush(): Promise<void> {
  if (!registeredToken) return;
  const token = registeredToken;
  registeredToken = null;
  await api<void>(`/api/me/push-tokens/${encodeURIComponent(token)}`, { method: 'DELETE' });
}
