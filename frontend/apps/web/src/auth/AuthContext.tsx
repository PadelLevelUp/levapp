import { createContext, useContext, useEffect, useState } from "react";
import { QueryClientContext } from "@tanstack/react-query";
import { getMe, MeResponse } from "@/api/auth";
import { api } from "@/api/client";
import { USE_MOCK_DATA } from "@/config";
import { requestAndSubscribe } from "@/utils/pushNotifications";
import i18n from "@/i18n";
import { emailPromptSession, legalCatchUpSession } from "@levelup/config";
import { endViewAs, getViewAsToken, isViewingAs } from "@/lib/viewAs";

// PAD-40: apply the user's persisted language globally so it drives the whole UI,
// not just the Settings screen. Called on both silent session restore and login.
// client.route-loading rule 6 (PAD-585): a language other than pt is a lazy chunk, so the
// restore and the login wait for it; a signed-in English user never sees Portuguese first.
// A failed load keeps the current language rather than blocking the session.
async function applyUserLanguage(user: MeResponse | null): Promise<void> {
  const lang = user?.language ?? "pt";
  if (i18n.language !== lang) {
    try {
      await i18n.changeLanguage(lang);
    } catch {
      // keep the current language
    }
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
    USE_MOCK_DATA ? "mock-token" : getViewAsToken() ?? localStorage.getItem("accessToken")
  );
  const [user, setUser] = useState<MeResponse | null>(null);
  // auth.logout rule 6 (PAD-716): the app's query cache, cleared when a session ends or starts. Read
  // through the context (not useQueryClient) so a provider-less test render still mounts.
  const queryClient = useContext(QueryClientContext);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    getMe()
      .then(async (userData) => {
        await applyUserLanguage(userData);
        setUser(userData);
        // Refresh push subscription on every silent restore (never while viewing as: PAD-532)
        if (!USE_MOCK_DATA && !isViewingAs()) {
          void requestAndSubscribe(token);
        }
      })
      .catch(() => {
        if (!USE_MOCK_DATA) {
          if (isViewingAs()) endViewAs();
          else localStorage.removeItem("accessToken");
          setToken(null);
        }
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token]);

  const login = async (newToken: string) => {
    // auth.logout rule 6 (PAD-716): the new account starts from an empty cache.
    queryClient?.clear();
    localStorage.setItem("accessToken", newToken);
    setToken(newToken);

    try {
      const userData = await getMe();
      await applyUserLanguage(userData);
      setUser(userData);
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
      await applyUserLanguage(userData);
      setUser(userData);
      return userData;
    } catch {
      return null;
    }
  };

  const logout = () => {
    // PAD-482 (auth.email-verification rule 14): the next sign-in asks for a missing email again.
    emailPromptSession.reset();
    // PAD-637 (auth.legal-catch-up rule 4): the next sign-in shows the catch-up again.
    legalCatchUpSession.reset();
    if (isViewingAs()) {
      // PAD-532: leaving a view-as discards its token only; the tab's own session is untouched.
      endViewAs();
      setToken(USE_MOCK_DATA ? "mock-token" : localStorage.getItem("accessToken"));
      // auth.logout rule 6: what was cached belongs to the viewed account.
      queryClient?.clear();
      setUser(null);
      return;
    }
    const currentToken = localStorage.getItem("accessToken");
    if (currentToken && !USE_MOCK_DATA) {
      // Best-effort server-side invalidation — don't await to avoid blocking UI
      api.post("/auth/logout").catch(() => undefined);
    }
    localStorage.removeItem("accessToken");
    setToken(USE_MOCK_DATA ? "mock-token" : null);
    // auth.logout rule 6 (PAD-716, B-601): the next account in this tab must not be served this one's
    // cached answers (60 s fresh), and the web signs out without a reload. After the token is gone.
    queryClient?.clear();
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
