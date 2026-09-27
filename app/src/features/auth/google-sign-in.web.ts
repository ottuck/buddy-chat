import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

import { auth } from '@/lib/firebase';

export const googleSignInSupported = true;

export async function signInWithGoogle(): Promise<void> {
  await signInWithPopup(auth, new GoogleAuthProvider());
}
