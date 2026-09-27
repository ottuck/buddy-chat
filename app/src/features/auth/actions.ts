import { FirebaseError } from 'firebase/app';
import { signInAnonymously, signOut as firebaseSignOut } from 'firebase/auth';

import { unregisterPush } from '@/features/notifications/push';
import { auth } from '@/lib/firebase';

// Development only: lets the app be used in Expo Go before real sign-in works on phones.
// Requires the Anonymous provider to be enabled in the Firebase console.
export async function signInAsGuest(): Promise<void> {
  await signInAnonymously(auth);
}

export async function signOut(): Promise<void> {
  // While still signed in: the server removes only the user's own tokens.
  await unregisterPush().catch((e) => console.warn('removing the push token failed', e));
  await firebaseSignOut(auth);
}

// The user closed the popup or started another one; not worth an error message.
export function isCancelledSignIn(error: unknown): boolean {
  return (
    error instanceof FirebaseError &&
    (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request')
  );
}
