import { createContext, useContext, useEffect, useState } from "react";
import { getMe, MeResponse } from "@/api/auth";
import { api } from "@/api/client";
import { USE_MOCK_DATA } from "@/config";
import { requestAndSubscribe } from "@/utils/pushNotifications";
import i18n from "@/i18n";

// PAD-40: apply the user's persisted language globally so it drives the whole UI,
// not just the Settings screen. Called on both silent session restore and login.
function applyUserLanguage(user: MeResponse | null) {
  const lang = user?.language ?? "pt";
  if (i18n.language !== lang) {
    void i18n.changeLanguage(lang);
  }
}

type AuthContextType = {
  token: string | null;
  user: MeResponse | null;
  isAuthenticated: boolean;
  login: (token: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
  /**
   * Re-reads /auth/me and updates the session in place — used when something
   * the router keys on changes without a new login (a club was created, a
   * join request went pending, the LevApp admin approved the coach). Resolves
   * with the fresh user, or `null` if the read failed (session left as is).
   */
  refreshUser: () => Promise<MeResponse | null>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    USE_MOCK_DATA ? "mock-token" : localStorage.getItem("accessToken")
  );
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    getMe()
      .then((userData) => {
        setUser(userData);
        applyUserLanguage(userData);
        // Refresh push subscription on every silent restore
        if (!USE_MOCK_DATA) {
          void requestAndSubscribe(token);
        }
      })
      .catch(() => {
        if (!USE_MOCK_DATA) {
          localStorage.removeItem("accessToken");
          setToken(null);
        }
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token]);

  const login = async (newToken: string) => {
    localStorage.setItem("accessToken", newToken);
    setToken(newToken);

    try {
      const userData = await getMe();
      setUser(userData);
      applyUserLanguage(userData);
      // Subscribe to push after successful login
      if (!USE_MOCK_DATA) {
        void requestAndSubscribe(newToken);
      }
    } catch (error) {
      logout();
      throw error;
    }
  };

  const refreshUser = async (): Promise<MeResponse | null> => {
    try {
      const userData = await getMe();
      setUser(userData);
      applyUserLanguage(userData);
      return userData;
    } catch {
      return null;
    }
  };

  const logout = () => {
    const currentToken = localStorage.getItem("accessToken");
    if (currentToken && !USE_MOCK_DATA) {
      // Best-effort server-side invalidation — don't await to avoid blocking UI
      api.post("/auth/logout").catch(() => undefined);
    }
    localStorage.removeItem("accessToken");
    setToken(USE_MOCK_DATA ? "mock-token" : null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        loading,
        isAuthenticated: !loading && !!user,
        login,
        logout,
        refreshUser,
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
