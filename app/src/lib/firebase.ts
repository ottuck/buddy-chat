import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from 'firebase/app';
// @ts-expect-error Exists only in firebase's React Native build; its published types are web-only.
import { getReactNativePersistence, initializeAuth } from 'firebase/auth';

import { firebaseConfig } from './firebase-config';

// Native: keep the session in AsyncStorage so the user stays signed in between launches.
const app = initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});
