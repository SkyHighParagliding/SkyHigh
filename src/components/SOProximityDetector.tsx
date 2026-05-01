import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Shield, LogIn, X, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCachedLocation } from "@/lib/cachedLocation";

const SO_TEST_MODE_KEY = "so_test_mode";
const PORTSEA_LAT = -38.3167;
const PORTSEA_LON = 144.7167;
const PROXIMITY_THRESHOLD_M = 500;

function haversineDistanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface SiteLocation {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export function SOProximityDetector() {
  const { isAuthenticated, user, token, login, setSoSession, isSoSession } = useAuth();
  const navigate = useNavigate();

  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [showBindPrompt, setShowBindPrompt] = useState(false);
  const [nearestSite, setNearestSite] = useState<SiteLocation | null>(null);
  const [detectedCoords, setDetectedCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [testMode, setTestMode] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("so_test") === "true") {
      localStorage.setItem(SO_TEST_MODE_KEY, "true");
      setTestMode(true);
    } else if (urlParams.get("so_test") === "false") {
      localStorage.removeItem(SO_TEST_MODE_KEY);
      setTestMode(false);
    } else {
      setTestMode(localStorage.getItem(SO_TEST_MODE_KEY) === "true");
    }
  }, []);

  const checkProximity = useCallback(async (latitude: number, longitude: number) => {
    try {
      const res = await fetch("/api/sites?public=true");
      const sites = await res.json();
      const sitesWithCoords: SiteLocation[] = sites
        .filter((s: any) => s.lat && s.lon)
        .map((s: any) => ({ id: s.id, name: s.name, lat: parseFloat(s.lat), lon: parseFloat(s.lon) }));

      let closest: SiteLocation | null = null;
      let closestDist = Infinity;

      for (const site of sitesWithCoords) {
        const dist = haversineDistanceM(latitude, longitude, site.lat, site.lon);
        if (dist < closestDist) {
          closestDist = dist;
          closest = site;
        }
      }

      if (closest && closestDist <= PROXIMITY_THRESHOLD_M) {
        setNearestSite(closest);
        setDetectedCoords({ lat: latitude, lon: longitude });
        if (!isAuthenticated && !dismissed) {
          setShowLoginPrompt(true);
        } else if (isAuthenticated && user?.isSafetyCommittee && user?.soAuthorised && token && !dismissed) {
          setShowBindPrompt(true);
        }
      }
    } catch (e) {
      console.error("Failed to check site proximity:", e);
    }
  }, [isAuthenticated, user, token, dismissed]);

  useEffect(() => {
    if (isSoSession) return;
    if (dismissed) return;

    if (testMode) {
      checkProximity(PORTSEA_LAT, PORTSEA_LON);
      return;
    }

    getCachedLocation(
      (lat, lon) => {
        checkProximity(lat, lon);
      },
      () => {},
      { timeout: 10000 }
    );
  }, [testMode, checkProximity, isSoSession, dismissed]);

  const handleSOLogin = async () => {
    setLoginError("");
    setLoginLoading(true);
    try {
      const err = await login(loginEmail, loginPassword, true, nearestSite?.id, detectedCoords?.lat, detectedCoords?.lon);
      if (err) {
        setLoginError(err);
        return;
      }
      setShowLoginPrompt(false);
      if (nearestSite) {
        setSoSession(nearestSite.id);
        navigate(`/sites/${nearestSite.id}`);
      }
    } catch {
      setLoginError("Login failed");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleBindSession = async () => {
    if (!nearestSite || !detectedCoords || !token) return;
    setLoginLoading(true);
    try {
      const bindRes = await fetch("/api/auth/bind-so-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ soSiteId: nearestSite.id, latitude: detectedCoords.lat, longitude: detectedCoords.lon }),
      });
      if (bindRes.ok) {
        setSoSession(nearestSite.id);
        setShowBindPrompt(false);
        navigate(`/sites/${nearestSite.id}`);
      } else {
        const data = await bindRes.json();
        setLoginError(data.error || "Failed to bind session");
      }
    } catch {
      setLoginError("Failed to bind SO session");
    } finally {
      setLoginLoading(false);
    }
  };

  const dismiss = () => {
    setDismissed(true);
    setShowLoginPrompt(false);
    setShowBindPrompt(false);
  };

  return (
    <>
      {testMode && (
        <div className="fixed bottom-4 left-4 z-40 bg-amber-100 border border-amber-300 text-amber-800 px-3 py-1.5 rounded-full text-xs font-medium shadow-lg flex items-center gap-1.5">
          <MapPin className="w-3 h-3" />
          Test Mode: Portsea
          <button
            onClick={() => { localStorage.removeItem(SO_TEST_MODE_KEY); setTestMode(false); }}
            className="ml-1 hover:text-amber-900"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {showLoginPrompt && nearestSite && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card p-6 rounded-xl shadow-2xl max-w-sm w-full">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-orange" />
                <h3 className="text-lg font-bold text-navy">Safety Officer Login</h3>
              </div>
              <button onClick={dismiss} className="p-1 hover:bg-muted rounded-lg">
                <X className="w-5 h-5 text-foreground-faint" />
              </button>
            </div>

            <p className="text-sm text-foreground-secondary mb-1">
              You're near <span className="font-semibold text-navy">{nearestSite.name}</span>.
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Log in with your Safety Officer credentials to manage this site.
            </p>

            {loginError && (
              <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-3">{loginError}</div>
            )}

            <div className="space-y-3">
              <input
                type="email"
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
                placeholder="Email"
                autoComplete="username"
                className="w-full p-2.5 border border-border rounded-lg focus:ring-1 focus:ring-sky focus:border-sky text-sm"
              />
              <input
                type="password"
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                onKeyDown={e => e.key === "Enter" && handleSOLogin()}
                className="w-full p-2.5 border border-border rounded-lg focus:ring-1 focus:ring-sky focus:border-sky text-sm"
              />
              <Button
                onClick={handleSOLogin}
                disabled={loginLoading}
                className="w-full bg-navy hover:bg-navy-light text-white"
              >
                <LogIn className="w-4 h-4 mr-2" />
                {loginLoading ? "Logging in..." : "Log In"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showBindPrompt && nearestSite && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card p-6 rounded-xl shadow-2xl max-w-sm w-full">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-orange" />
                <h3 className="text-lg font-bold text-navy">Enter SO Mode</h3>
              </div>
              <button onClick={dismiss} className="p-1 hover:bg-muted rounded-lg">
                <X className="w-5 h-5 text-foreground-faint" />
              </button>
            </div>

            <p className="text-sm text-foreground-secondary mb-1">
              You're near <span className="font-semibold text-navy">{nearestSite.name}</span>.
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Switch to Safety Officer mode for this site? Your session will be restricted to this site only.
            </p>

            {loginError && (
              <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-3">{loginError}</div>
            )}

            <div className="flex gap-3">
              <Button
                onClick={dismiss}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleBindSession}
                disabled={loginLoading}
                className="flex-1 bg-navy hover:bg-navy-light text-white"
              >
                <Shield className="w-4 h-4 mr-2" />
                {loginLoading ? "Binding..." : "Enter SO Mode"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
