import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

import { firebaseConfig } from './firebase-config';

// Web: the default browser persistence (IndexedDB) keeps the session.
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
