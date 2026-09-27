// Native Google sign-in needs a native module, which Expo Go does not include. It arrives with
// the development build (CLAUDE.md, Auth); until then the button is hidden on phones.
export const googleSignInSupported = false;

export async function signInWithGoogle(): Promise<void> {
  throw new Error('Google sign-in is not available in this build yet.');
}
