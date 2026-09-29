import { FirebaseError } from 'firebase/app';
import {
  type AuthCredential,
  GoogleAuthProvider,
  linkWithPopup,
  reauthenticateWithPopup,
  signInWithCredential,
  signInWithPopup,
} from 'firebase/auth';

import { auth } from '@/lib/firebase';

export const googleSignInSupported = true;

export async function signInWithGoogle(): Promise<void> {
  await signInWithPopup(auth, new GoogleAuthProvider());
}

// The Google account already belongs to another buddy-chat user. Linking would merge two users,
// which is not supported; the caller may switch to that account instead (switchToGoogle).
export class GoogleAccountInUseError extends Error {
  constructor(readonly credential: AuthCredential) {
    super('This Google account is already in use.');
  }
}

// Adds Google sign-in to the current guest account. The Firebase uid stays the same, so the
// server keeps the user, room and messages as they are.
export async function linkGoogle(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in.');
  try {
    await linkWithPopup(user, new GoogleAuthProvider());
  } catch (e) {
    if (e instanceof FirebaseError && e.code === 'auth/credential-already-in-use') {
      const credential = GoogleAuthProvider.credentialFromError(e);
      if (credential) throw new GoogleAccountInUseError(credential);
    }
    throw e;
  }
  // Refreshes the token so listeners see the account is no longer anonymous.
  await user.getIdToken(true);
}

// Leaves the guest account for an existing Google one. The guest's data stays on the server but
// can no longer be reached from this device.
export async function switchToGoogle(credential: AuthCredential): Promise<void> {
  await signInWithCredential(auth, credential);
}

// Signs in with Google again, just now. Firebase deletes an account only after a recent sign-in.
export async function reauthenticateGoogle(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in.');
  await reauthenticateWithPopup(user, new GoogleAuthProvider());
}
