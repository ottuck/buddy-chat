import { onIdTokenChanged, type User } from 'firebase/auth';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';

import { auth } from '@/lib/firebase';

type AuthState = {
  user: User | null;
  // True until Firebase has restored (or ruled out) the saved session.
  initializing: boolean;
};

const AuthContext = createContext<AuthState>({ user: null, initializing: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, initializing: true });

  // Id token rather than auth state: linking Google to a guest keeps the same user signed in and
  // only issues a new token, and the screens need to see the account is no longer anonymous.
  useEffect(() => onIdTokenChanged(auth, (user) => setState({ user, initializing: false })), []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
