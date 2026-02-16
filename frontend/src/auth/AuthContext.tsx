import { createContext, useContext, useEffect, useState } from "react";
import { getMe, MeResponse } from "@/api/auth";
import { USE_MOCK_DATA } from "@/config";

type AuthContextType = {
  token: string | null;
  user: MeResponse | null;
  isAuthenticated: boolean;
  login: (token: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
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
      .then(setUser)
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
    } catch (error) {
      logout();
      throw error;
    }
  };

  const logout = () => {
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
