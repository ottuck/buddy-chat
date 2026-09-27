import Constants from 'expo-constants';
import { Platform } from 'react-native';

const DEV_SERVER_PORT = 8080;

// The backend's base URL (http[s]://host:port, no trailing slash). Resolved on use rather than
// at import: web pages are also pre-rendered in Node, where there is no window.
export function apiUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/$/, '');
  if (!__DEV__) throw new Error('EXPO_PUBLIC_API_URL is not set.');
  // Development: the same machine that serves the JS bundle runs the Spring server.
  const host =
    Platform.OS === 'web'
      ? window.location.hostname
      : (Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost');
  return `http://${host}:${DEV_SERVER_PORT}`;
}

export const wsUrl = () => `${apiUrl().replace(/^http/, 'ws')}/ws`;
