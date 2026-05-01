import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { getDemoRole } from "@/lib/demoConfig";

interface Pilot {
  id: string;
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  garminMapshare: string | null;
  spotFeedId: string | null;
  zoleoImei: string | null;
}

interface PilotAuthContextType {
  pilot: Pilot | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName: string, lastName: string) => Promise<void>;
  logout: () => void;
  updateProfile: (updates: { garminMapshare?: string | null; spotFeedId?: string | null; zoleoImei?: string | null }) => Promise<void>;
}

const PilotAuthContext = createContext<PilotAuthContextType>({
  pilot: null,
  token: null,
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: () => {},
  updateProfile: async () => {},
});

export function PilotAuthProvider({ children }: { children: React.ReactNode }) {
  const demoRole = useMemo(() => getDemoRole(), []);
  const demoPilot = useMemo(() => {
    if (!demoRole) return null;
    const NAMES = ['Alex','Sam','Charlie','Taylor','Jordan','Casey','Riley','Morgan','Quinn','Avery','Blake','Drew','Emery','Finley','Harper','Kai','Lane','Micah','Nico','Parker','Reese','Sage','Skyler','Tatum','Val','Wren','Zion','Ash','Bay','Cruz'];
    const num = parseInt(demoRole.replace(/\D/g, '')) || 1;
    const isPilot = demoRole.startsWith('pilot');
    const isDuty = demoRole.startsWith('duty');
    const nameIdx = isDuty ? (4 + num - 1) % NAMES.length : isPilot ? (num - 1) % NAMES.length : (2 + num - 1) % NAMES.length;
    const id = isDuty ? `demo-duty-${num}` : `demo-${demoRole.replace(/(\d+)/, '-$1')}`;
    const tokenStr = isDuty ? `demo-token-duty-${num}` : `demo-token-${demoRole.replace(/(\d+)/, '-$1')}`;
    return {
      id,
      email: `${demoRole}@demo.local`,
      name: `${NAMES[nameIdx]} Demo`,
      firstName: NAMES[nameIdx],
      lastName: 'Demo',
      garminMapshare: null,
      spotFeedId: null,
      zoleoImei: null,
      token: tokenStr,
    };
  }, [demoRole]);

  const [devBypassed, setDevBypassed] = useState(() => sessionStorage.getItem("devBypassLoggedOut") === "true");
  const [pilot, setPilot] = useState<Pilot | null>(() => {
    if (demoPilot) {
      return { id: demoPilot.id, email: demoPilot.email, name: demoPilot.name, firstName: demoPilot.firstName, lastName: demoPilot.lastName, garminMapshare: demoPilot.garminMapshare, spotFeedId: demoPilot.spotFeedId, zoleoImei: demoPilot.zoleoImei };
    }
    return null;
  });
  const [token, setToken] = useState<string | null>(() => {
    if (demoPilot) return demoPilot.token;
    return localStorage.getItem("pilotToken");
  });
  const [loading, setLoading] = useState(() => !demoPilot);

  useEffect(() => {
    if (demoPilot) return;

    fetch("/api/dev-mode")
      .then((r) => r.json())
      .then((data) => {
        if (data.active && !devBypassed && !token) {
          setPilot({ id: "dev-0", email: "dev@localhost", name: "Dev Pilot", firstName: "Dev", lastName: "Pilot", garminMapshare: null, spotFeedId: null, zoleoImei: null });
          setToken("dev-bypass");
          setLoading(false);
          return;
        }
        if (!token) {
          setLoading(false);
          return;
        }
        if (token === "dev-bypass") {
          setPilot({ id: "dev-0", email: "dev@localhost", name: "Dev Pilot", firstName: "Dev", lastName: "Pilot", garminMapshare: null, spotFeedId: null, zoleoImei: null });
          setLoading(false);
          return;
        }
        return fetch("/api/pilot-auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((res) => {
            if (!res.ok) throw new Error("Invalid session");
            return res.json();
          })
          .then((meData) => {
            setPilot(meData.pilot);
            setLoading(false);
          })
          .catch(() => {
            localStorage.removeItem("pilotToken");
            setToken(null);
            setPilot(null);
            setLoading(false);
          });
      })
      .catch(() => {
        setLoading(false);
      });
  }, [token, demoPilot, devBypassed]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch("/api/pilot-auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Login failed");
    }
    const data = await res.json();
    localStorage.setItem("pilotToken", data.token);
    sessionStorage.removeItem("devBypassLoggedOut");
    setDevBypassed(false);
    setToken(data.token);
    setPilot(data.pilot);
  }, []);

  const register = useCallback(async (email: string, password: string, firstName: string, lastName: string) => {
    const res = await fetch("/api/pilot-auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, firstName, lastName }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Registration failed");
    }
    const data = await res.json();
    localStorage.setItem("pilotToken", data.token);
    sessionStorage.removeItem("devBypassLoggedOut");
    setDevBypassed(false);
    setToken(data.token);
    setPilot(data.pilot);
  }, []);

  const logout = useCallback(() => {
    if (token) {
      if (token !== "dev-bypass") {
        fetch("/api/pilot-auth/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
      }
    }
    localStorage.removeItem("pilotToken");
    sessionStorage.setItem("devBypassLoggedOut", "true");
    setDevBypassed(true);
    setToken(null);
    setPilot(null);
  }, [token]);

  const updateProfile = useCallback(async (updates: { garminMapshare?: string | null; spotFeedId?: string | null; zoleoImei?: string | null }) => {
    if (!token) throw new Error("Not authenticated");
    const res = await fetch("/api/pilot-auth/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-pilot-token": token },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Profile update failed");
    }
    const data = await res.json();
    setPilot(data.pilot);
  }, [token]);

  return (
    <PilotAuthContext.Provider value={{ pilot, token, loading, login, register, logout, updateProfile }}>
      {children}
    </PilotAuthContext.Provider>
  );
}

export function usePilotAuth() {
  return useContext(PilotAuthContext);
}
