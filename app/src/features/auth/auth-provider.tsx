import { onAuthStateChanged, type User } from 'firebase/auth';
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

  useEffect(() => onAuthStateChanged(auth, (user) => setState({ user, initializing: false })), []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
