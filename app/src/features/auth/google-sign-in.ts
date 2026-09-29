import type { AuthCredential } from 'firebase/auth';

// Native Google sign-in needs a native module, which Expo Go does not include. It arrives with
// the development build (CLAUDE.md, Auth); until then phones start as guests only.
export const googleSignInSupported = false;

export async function signInWithGoogle(): Promise<void> {
  throw new Error('Google sign-in is not available in this build yet.');
}

export class GoogleAccountInUseError extends Error {
  constructor(readonly credential: AuthCredential) {
    super('This Google account is already in use.');
  }
}

export async function linkGoogle(): Promise<void> {
  throw new Error('Google sign-in is not available in this build yet.');
}

export async function switchToGoogle(_credential: AuthCredential): Promise<void> {
  throw new Error('Google sign-in is not available in this build yet.');
}

export async function reauthenticateGoogle(): Promise<void> {
  throw new Error('Google sign-in is not available in this build yet.');
}
