import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { adminApi, type AdminRoleName, type AdminSession, clearSession, readSession, storeSession, UNAUTHORIZED_EVENT } from "./api";

interface AuthValue {
  session: AdminSession | null;
  signInWithCredential: (credential: string) => Promise<void>;
  signOut: () => Promise<void>;
  can: (minimum: AdminRoleName) => boolean;
}

const ORDER: AdminRoleName[] = ["support", "operator", "owner"];
const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AdminSession | null>(() => readSession());

  useEffect(() => {
    const onUnauthorized = () => setSession(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  // Rule 3: no silent refresh — when the 12 hours are up the session simply ends.
  useEffect(() => {
    if (!session) return;
    const ms = new Date(session.expiresAt).getTime() - Date.now();
    const timer = window.setTimeout(() => {
      clearSession();
      setSession(null);
    }, Math.max(ms, 0));
    return () => window.clearTimeout(timer);
  }, [session]);

  const signInWithCredential = useCallback(async (credential: string) => {
    const r = await adminApi.signIn(credential);
    const next: AdminSession = { email: r.email, role: r.role, roleId: r.roleId, expiresAt: r.expiresAt };
    storeSession(r.token, next);
    setSession(next);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await adminApi.signOut();
    } catch {
      // the token is discarded either way
    }
    clearSession();
    setSession(null);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      signInWithCredential,
      signOut,
      can: (minimum) => !!session && ORDER.indexOf(session.role) >= ORDER.indexOf(minimum),
    }),
    [session, signInWithCredential, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth outside AuthProvider");
  return value;
}
