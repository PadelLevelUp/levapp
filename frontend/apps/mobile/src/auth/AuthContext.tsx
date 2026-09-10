import { authApi } from "@levelup/api";
import { router } from "expo-router";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  api,
  purgeTokenOnFreshInstall,
  secureTokenStorage,
  setUnauthorizedHandler,
} from "@/lib/api";
import i18n from "@/lib/i18n";
import * as Notifications from "expo-notifications";
import { getPushRegistrar } from "@/lib/push";

export type AuthUser = authApi.MeResponse;

/**
 * auth.parental-consent rule 3 (PAD-198): an adult's sign-up signs in and
 * yields the user; a minor's yields where the guardian's mail went and no
 * session is stored.
 */
export type RegisterResult =
  | { user: AuthUser; guardianPending?: undefined }
  | { user?: undefined; guardianPending: authApi.GuardianPendingInfo };

type AuthContextType = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  /** Persists the token, hydrates the user via GET /auth/me. */
  login: (token: string) => Promise<void>;
  /**
   * auth.register: creates the account, then signs in exactly as `login`
   * does. Resolves with the hydrated user so the caller can route on
   * `coachApproval` / `clubs` without a second `/auth/me` — or, for a minor
   * waiting for a guardian (PAD-198), with `guardianPending` and no session.
   */
  register: (payload: authApi.RegisterPayload) => Promise<RegisterResult>;
  /** Re-reads /auth/me (e.g. after an approval) and updates the session. */
  refreshUser: () => Promise<AuthUser | null>;
  /** Best-effort server invalidation, clears token + state, routes to login. */
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Apply the signed-in user's persisted language preference (set via
  // Settings > Language, PATCH /auth/me) once it's known — on silent
  // restore and right after login. Overrides the device-locale default
  // i18n.ts picks at init.
  useEffect(() => {
    if (user?.language && user.language !== i18n.language) {
      void i18n.changeLanguage(user.language);
    }
  }, [user?.language]);

  // Silent restore: if a token is in SecureStore, hydrate the user.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await purgeTokenOnFreshInstall();
        const token = await secureTokenStorage.getToken();
        if (!token) return;
        const me = await authApi.getMe();
        if (!cancelled) setUser(me);
        // Refresh push registration on every silent restore (mirrors web).
        // Fire-and-forget: the registrar never throws.
        void getPushRegistrar().register();
      } catch {
        // Invalid/expired token — the 401 interceptor already removed it.
        await secureTokenStorage.removeToken().catch(() => undefined);
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // 401 anywhere → drop session and land on the login screen.
  // Guard: only navigate when a user was actually signed in. Without it,
  // every 401 (a wrong-password /auth/login, or queries retried right after
  // logout) re-replaces /login, remounting the screen and wiping form state
  // (typed credentials and the "invalid credentials" error message).
  const userRef = React.useRef<AuthUser | null>(null);
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (userRef.current !== null) {
        setUser(null);
        router.replace("/login");
      }
    });
  }, []);

  const login = useCallback(async (token: string) => {
    await secureTokenStorage.setToken(token);
    try {
      const me = await authApi.getMe();
      setUser(me);
      // Register for push after successful login (mirrors web's
      // requestAndSubscribe). Fire-and-forget: the registrar never throws.
      void getPushRegistrar().register();
    } catch (error) {
      await secureTokenStorage.removeToken().catch(() => undefined);
      setUser(null);
      throw error;
    }
  }, []);

  const register = useCallback(
    async (payload: authApi.RegisterPayload) => {
      const res = await authApi.register(payload);
      if (!res.accessToken) {
        return {
          guardianPending: {
            guardianEmail: res.guardianEmail ?? null,
            resendAvailableInSeconds: res.resendAvailableInSeconds ?? 60,
          },
        };
      }
      await secureTokenStorage.setToken(res.accessToken);
      try {
        const me = await authApi.getMe();
        setUser(me);
        void getPushRegistrar().register();
        return { user: me };
      } catch (error) {
        await secureTokenStorage.removeToken().catch(() => undefined);
        setUser(null);
        throw error;
      }
    },
    []
  );

  const refreshUser = useCallback(async () => {
    try {
      const me = await authApi.getMe();
      setUser(me);
      return me;
    } catch {
      return null;
    }
  }, []);

  const logout = useCallback(async () => {
    // Best-effort push token cleanup. Fire-and-forget (never awaited, the
    // registrar never throws) but must be kicked off before the token is
    // cleared below, since the DELETE call needs it for the auth header.
    void getPushRegistrar().unregister();
    // Clear the home-screen badge: the tabs layout (which keeps it in sync
    // with the unread count) is about to unmount, so nothing else would
    // reset it and the signed-out app would keep a stale count (PAD-147).
    void Notifications.setBadgeCountAsync(0).catch(() => undefined);
    // Best-effort server-side invalidation — ignore failures.
    await api.post("/auth/logout").catch(() => undefined);
    await secureTokenStorage.removeToken().catch(() => undefined);
    setUser(null);
    router.replace("/login");
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !loading && !!user,
        login,
        register,
        refreshUser,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return ctx;
}
