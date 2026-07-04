import { authApi } from "@levelup/api";
import { router } from "expo-router";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { api, secureTokenStorage, setUnauthorizedHandler } from "@/lib/api";
import { getPushRegistrar } from "@/lib/push";

export type AuthUser = authApi.MeResponse;

type AuthContextType = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  /** Persists the token, hydrates the user via GET /auth/me. */
  login: (token: string) => Promise<void>;
  /** Best-effort server invalidation, clears token + state, routes to login. */
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Silent restore: if a token is in SecureStore, hydrate the user.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
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
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      router.replace("/login");
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

  const logout = useCallback(async () => {
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
