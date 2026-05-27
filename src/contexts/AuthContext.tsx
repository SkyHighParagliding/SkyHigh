import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";

interface AdminUser {
  id: number;
  name: string;
  email: string;
  isSafetyCommittee?: boolean;
  soAuthorised?: boolean;
  isAdmin?: boolean;
}

interface AuthContextType {
  user: AdminUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string, soLogin?: boolean, soSiteId?: string, latitude?: number, longitude?: number) => Promise<string | null>;
  logout: () => void;
  isAuthenticated: boolean;
  isSoSession: boolean;
  soSiteId: string | null;
  setSoSession: (siteId: string | null) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  loading: true,
  login: async () => null,
  logout: () => {},
  isAuthenticated: false,
  isSoSession: false,
  soSiteId: null,
  setSoSession: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("adminToken"));
  const [loading, setLoading] = useState(true);
  const [soSiteId, setSoSiteId] = useState<string | null>(() => localStorage.getItem("soSiteId"));

  const isSoSession = !!soSiteId;

  const setSoSession = useCallback((siteId: string | null) => {
    setSoSiteId(siteId);
    if (siteId) {
      localStorage.setItem("soSiteId", siteId);
    } else {
      localStorage.removeItem("soSiteId");
    }
  }, []);

  useEffect(() => {
    fetch("/api/dev-mode")
      .then((r) => r.json())
      .then((data) => {
        if (data.active) {
          setUser({ id: 0, name: "Dev Admin", email: "dev@localhost", isAdmin: true });
          setToken("dev-bypass");
          setLoading(false);
          return;
        }
        if (token) {
          return fetch("/api/auth/me", {
            headers: { Authorization: `Bearer ${token}` },
          })
            .then((res) => {
              if (!res.ok) throw new Error("Invalid session");
              return res.json();
            })
            .then((meData) => {
              setUser(meData);
              if (meData.soSiteId) {
                setSoSiteId(meData.soSiteId);
                localStorage.setItem("soSiteId", meData.soSiteId);
              } else if (soSiteId && !meData.soSiteId) {
                setSoSiteId(null);
                localStorage.removeItem("soSiteId");
              }
              setLoading(false);
            })
            .catch(() => {
              localStorage.removeItem("adminToken");
              localStorage.removeItem("soSiteId");
              setToken(null);
              setUser(null);
              setSoSiteId(null);
              setLoading(false);
            });
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        setLoading(false);
      });
  }, [token, soSiteId]);

  const login = async (email: string, password: string, soLogin?: boolean, loginSoSiteId?: string, latitude?: number, longitude?: number): Promise<string | null> => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email, password, soLogin: !!soLogin,
          soSiteId: loginSoSiteId || undefined,
          latitude, longitude,
        }),
      });
      const data = await res.json();
      if (!res.ok) return data.error || "Login failed";
      localStorage.setItem("adminToken", data.token);
      setToken(data.token);
      setUser(data.user);
      if (data.soSiteId) {
        setSoSiteId(data.soSiteId);
        localStorage.setItem("soSiteId", data.soSiteId);
      }
      return null;
    } catch {
      return "Connection error";
    }
  };

  const logout = () => {
    if (token) {
      fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem("adminToken");
    localStorage.removeItem("soSiteId");
    setToken(null);
    setUser(null);
    setSoSiteId(null);
  };

  const providerValue = useMemo(() => ({
    user,
    token,
    loading,
    login,
    logout,
    isAuthenticated: !!user,
    isSoSession,
    soSiteId,
    setSoSession,
  }), [user, token, loading, login, logout, isSoSession, soSiteId, setSoSession]);

  return (
    <AuthContext.Provider value={providerValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
