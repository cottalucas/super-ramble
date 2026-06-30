import { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut
} from 'firebase/auth';
import { auth, firebaseReady } from '../firebase.js';

const AuthContext = createContext(null);

const LOCAL_PREVIEW = import.meta.env.VITE_ENABLE_LOCAL_PREVIEW === 'true';
// Local mode runs when preview is on or no Firebase config is present, so the
// app boots and persists without keys. See docs/architecture.md.
const LOCAL_MODE = LOCAL_PREVIEW || !firebaseReady;
const LOCAL_USER = { uid: 'local-preview', displayName: 'You', email: null, isLocal: true };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(LOCAL_MODE ? LOCAL_USER : null);
  const [loading, setLoading] = useState(!LOCAL_MODE);

  useEffect(() => {
    if (LOCAL_MODE) return undefined;
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ? { uid: u.uid, displayName: u.displayName, email: u.email, isLocal: false } : null);
      setLoading(false);
    });
    return unsub;
  }, []);

  async function signIn() {
    if (LOCAL_MODE) {
      setUser(LOCAL_USER);
      return;
    }
    await signInWithPopup(auth, new GoogleAuthProvider());
  }

  async function signOut() {
    if (LOCAL_MODE) return;
    await fbSignOut(auth);
  }

  return (
    <AuthContext.Provider value={{ user, loading, isLocal: LOCAL_MODE, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
