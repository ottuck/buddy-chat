// No push notifications on the web (expo-notifications does not support it).

export const pushSupported = false;

export type PushState = 'on' | 'off' | 'denied' | 'unavailable';

export async function pushEnabled(): Promise<boolean> {
  return false;
}

export async function registerForPush(): Promise<PushState> {
  return 'unavailable';
}

export async function setPushEnabled(_enabled: boolean): Promise<PushState> {
  return 'unavailable';
}

export async function unregisterPush(): Promise<void> {}
