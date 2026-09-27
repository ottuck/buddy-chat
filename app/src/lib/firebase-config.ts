import type { FirebaseOptions } from 'firebase/app';

// Public client config (not secrets), read from app/.env.local. EXPO_PUBLIC_* values are inlined
// at build time, so each one has to be referenced by its full name.
const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

for (const [key, value] of Object.entries(config)) {
  if (!value) {
    throw new Error(`Missing Firebase config "${key}". Copy app/.env.example to app/.env.local.`);
  }
}

export const firebaseConfig = config as FirebaseOptions;
