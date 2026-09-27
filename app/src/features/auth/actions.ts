import { FirebaseError } from 'firebase/app';
import { signInAnonymously, signOut as firebaseSignOut } from 'firebase/auth';

import { unregisterPush } from '@/features/notifications/push';
import { auth } from '@/lib/firebase';

// "Start now": a Firebase anonymous account, so there is a uid for the server like any other
// sign-in. Google (or Apple) can be linked later without changing it (docs/product.md).
// Needs the Anonymous provider in the Firebase console, and its automatic clean-up of old
// anonymous accounts must stay off: it would delete guests along with their buddy.
export async function signInAsGuest(): Promise<void> {
  await signInAnonymously(auth);
}

// Leaves the guest account for an existing Google account (see GoogleAccountInUseError).
export async function switchAccount(switchTo: () => Promise<void>): Promise<void> {
  await unregisterPush().catch((e) => console.warn('removing the push token failed', e));
  await switchTo();
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
