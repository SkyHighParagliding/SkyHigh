import { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSettings } from "@/contexts/SettingsContext";
import { ArrowLeft, Calendar, MapPin, Clock, Mountain, Gauge, Route, TrendingUp, TrendingDown, ChevronRight, Download, X, Plane, FileText, Trash2, LogOut, LogIn, Map, ChevronDown, ChevronUp, Flag, Zap, AlertTriangle } from "lucide-react";
import { usePilotAuth } from "@/contexts/PilotAuthContext";
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useFlights, useDeleteFlightMutation, flightKeys } from "@/hooks/api";
import { api } from "@/lib/apiClient";
import { useQueryClient } from "@tanstack/react-query";
import type { Flight, FlightDetail, Breadcrumb } from "@/types/api";

interface PointOfInterest {
  label: string;
  value: string;
  lat: number;
  lon: number;
  color: string;
  icon: string;
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function metersToFeet(m: number): number {
  return Math.round(m * 3.28084);
}

function mpsToKmh(mps: number): number {
  return Math.round(mps * 3.6);
}

function distanceDisplay(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

function computePointsOfInterest(flight: FlightDetail): PointOfInterest[] {
  const crumbs = flight.breadcrumbs;
  if (!crumbs || crumbs.length < 2) return [];
  const pois: PointOfInterest[] = [];

  const start = crumbs[0];
  pois.push({
    label: "Launch",
    value: formatTimestamp(start.timestamp) + ` · ${metersToFeet(start.altitude)} ft`,
    lat: start.lat,
    lon: start.lon,
    color: "#30d158",
    icon: "🚀",
  });

  const end = crumbs[crumbs.length - 1];
  pois.push({
    label: "Landing",
    value: (flight.endedAt ? formatTimestamp(end.timestamp) : "—") + ` · ${metersToFeet(end.altitude)} ft`,
    lat: end.lat,
    lon: end.lon,
    color: "#ff3b30",
    icon: "🏁",
  });

  let maxAltIdx = 0;
  for (let i = 1; i < crumbs.length; i++) {
    if (crumbs[i].altitude > crumbs[maxAltIdx].altitude) maxAltIdx = i;
  }
  if (crumbs[maxAltIdx].altitude > 0) {
    pois.push({
      label: "Max Altitude",
      value: `${metersToFeet(crumbs[maxAltIdx].altitude)} ft AGL`,
      lat: crumbs[maxAltIdx].lat,
      lon: crumbs[maxAltIdx].lon,
      color: "#ff9500",
      icon: "⛰️",
    });
  }

  let maxClimb = 0;
  let maxClimbIdx = -1;
  let maxSink = 0;
  let maxSinkIdx = -1;
  for (let i = 1; i < crumbs.length; i++) {
    const dt = (crumbs[i].timestamp - crumbs[i - 1].timestamp) / 1000;
    if (dt <= 0) continue;
    const vSpeed = (crumbs[i].altitude - crumbs[i - 1].altitude) / dt;
    if (vSpeed > maxClimb) {
      maxClimb = vSpeed;
      maxClimbIdx = i;
    }
    if (vSpeed < maxSink) {
      maxSink = vSpeed;
      maxSinkIdx = i;
    }
  }

  if (maxClimbIdx >= 0 && maxClimb > 0.2) {
    pois.push({
      label: "Best Climb",
      value: `+${maxClimb.toFixed(1)} m/s · ${metersToFeet(crumbs[maxClimbIdx].altitude)} ft`,
      lat: crumbs[maxClimbIdx].lat,
      lon: crumbs[maxClimbIdx].lon,
      color: "#34c759",
      icon: "📈",
    });
  }

  if (maxSinkIdx >= 0 && maxSink < -0.5) {
    pois.push({
      label: "Max Sink",
      value: `${maxSink.toFixed(1)} m/s · ${metersToFeet(crumbs[maxSinkIdx].altitude)} ft`,
      lat: crumbs[maxSinkIdx].lat,
      lon: crumbs[maxSinkIdx].lon,
      color: "#ff453a",
      icon: "📉",
    });
  }

  let maxSpeedIdx = 0;
  for (let i = 1; i < crumbs.length; i++) {
    if (crumbs[i].speed > crumbs[maxSpeedIdx].speed) maxSpeedIdx = i;
  }
  if (crumbs[maxSpeedIdx].speed > 2) {
    pois.push({
      label: "Max Speed",
      value: `${mpsToKmh(crumbs[maxSpeedIdx].speed)} km/h`,
      lat: crumbs[maxSpeedIdx].lat,
      lon: crumbs[maxSpeedIdx].lon,
      color: "#af52de",
      icon: "💨",
    });
  }

  return pois;
}

function generateIGC(flight: FlightDetail): string {
  const lines: string[] = [];
  const d = new Date(flight.startedAt);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yy = String(d.getUTCFullYear() % 100).padStart(2, "0");

  lines.push("AXSK SkyHigh Flight Tracker");
  lines.push(`HFDTE${dd}${mm}${yy}`);
  lines.push(`HFPLTPILOTINCHARGE:${flight.pilotId || "Unknown"}`);
  lines.push(`HFSITSITE:${flight.siteName || "Unknown"}`);
  lines.push("HFFTYFRTYPE:SkyHigh GPS Tracker");
  lines.push("HFGPSRECEIVER:Phone GPS");

  for (const b of flight.breadcrumbs) {
    const t = new Date(b.timestamp);
    const hh = String(t.getUTCHours()).padStart(2, "0");
    const mi = String(t.getUTCMinutes()).padStart(2, "0");
    const ss = String(t.getUTCSeconds()).padStart(2, "0");

    const latDeg = Math.floor(Math.abs(b.lat));
    const latMin = ((Math.abs(b.lat) - latDeg) * 60000).toFixed(0).padStart(5, "0");
    const latDir = b.lat >= 0 ? "N" : "S";

    const lonDeg = Math.floor(Math.abs(b.lon));
    const lonMin = ((Math.abs(b.lon) - lonDeg) * 60000).toFixed(0).padStart(5, "0");
    const lonDir = b.lon >= 0 ? "E" : "W";

    const altGps = Math.round(b.altitude);
    const altPress = altGps;

    lines.push(
      `B${hh}${mi}${ss}${String(latDeg).padStart(2, "0")}${latMin}${latDir}${String(lonDeg).padStart(3, "0")}${lonMin}${lonDir}A${String(Math.max(0, altPress)).padStart(5, "0")}${String(Math.max(0, altGps)).padStart(5, "0")}`
    );
  }

  return lines.join("\r\n") + "\r\n";
}

function generateGPX(flight: FlightDetail): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<gpx version="1.1" creator="SkyHigh Flight Tracker"');
  lines.push('  xmlns="http://www.topografix.com/GPX/1/1">');
  lines.push("  <trk>");
  lines.push(`    <name>${flight.siteName} - ${formatDate(flight.startedAt)}</name>`);
  lines.push("    <trkseg>");

  for (const b of flight.breadcrumbs) {
    const t = new Date(b.timestamp).toISOString();
    lines.push(`      <trkpt lat="${b.lat}" lon="${b.lon}">`);
    lines.push(`        <ele>${b.altitude.toFixed(1)}</ele>`);
    lines.push(`        <time>${t}</time>`);
    lines.push(`        <speed>${b.speed.toFixed(1)}</speed>`);
    lines.push("      </trkpt>");
  }

  lines.push("    </trkseg>");
  lines.push("  </trk>");
  lines.push("</gpx>");

  return lines.join("\n");
}

function generateKML(flight: FlightDetail): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<kml xmlns="http://www.opengis.net/kml/2.2">');
  lines.push("  <Document>");
  lines.push(`    <name>${flight.siteName} - ${formatDate(flight.startedAt)}</name>`);
  lines.push("    <Style id=\"flightPath\"><LineStyle><color>ff0000ff</color><width>3</width></LineStyle></Style>");
  lines.push("    <Placemark>");
  lines.push(`      <name>Flight Track</name>`);
  lines.push("      <styleUrl>#flightPath</styleUrl>");
  lines.push("      <LineString>");
  lines.push("        <altitudeMode>absolute</altitudeMode>");
  lines.push("        <coordinates>");

  const coords = flight.breadcrumbs.map(b => `${b.lon},${b.lat},${b.altitude.toFixed(1)}`);
  lines.push("          " + coords.join("\n          "));

  lines.push("        </coordinates>");
  lines.push("      </LineString>");
  lines.push("    </Placemark>");
  lines.push("  </Document>");
  lines.push("</kml>");

  return lines.join("\n");
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function StatCard({ icon: Icon, label, value, unit, color }: { icon: any; label: string; value: string | number; unit?: string; color: string }) {
  return (
    <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-3.5 h-3.5" style={{ color }} />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-lg font-bold" style={{ color: "#1d1d1f" }}>{value}</span>
        {unit && <span className="text-xs text-gray-400">{unit}</span>}
      </div>
    </div>
  );
}

function poiIcon(poi: PointOfInterest) {
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;background:${poi.color};border:2px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.35);font-size:13px;line-height:1">${poi.icon}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function FitBoundsOnce({ bounds }: { bounds: L.LatLngBounds }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [30, 30] });
  }, [map, bounds]);
  return null;
}

function PilotLoginForm() {
  const { login, register, logout, pilot } = usePilotAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isDevPilot = pilot?.id === "dev-0";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        if (!firstName.trim() || !lastName.trim()) {
          setError("First and last name are required");
          setSubmitting(false);
          return;
        }
        await register(email, password, firstName.trim(), lastName.trim());
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (isDevPilot) {
    return (
      <div className="max-w-md mx-auto">
        <div
          className="rounded-2xl p-6"
          style={{
            background: "rgba(255,255,255,0.9)",
            border: "1px solid rgba(0,0,0,0.06)",
            backdropFilter: "blur(20px) saturate(180%)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
          }}
        >
          <div className="text-center mb-4">
            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            </div>
            <h3 className="text-lg font-bold" style={{ color: "#1d1d1f" }}>Dev Mode Active</h3>
            <p className="text-sm text-gray-500 mt-1">
              You're logged in as Dev Pilot. Sign in with your real account to view your flights.
            </p>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-sky-500 text-white hover:bg-sky-600 transition-colors"
          >
            <LogOut className="w-4 h-4" /> Switch Account
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <div
        className="rounded-2xl p-6"
        style={{
          background: "rgba(255,255,255,0.9)",
          border: "1px solid rgba(0,0,0,0.06)",
          backdropFilter: "blur(20px) saturate(180%)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
        }}
      >
        <div className="text-center mb-5">
          <div className="w-12 h-12 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-3">
            <Plane className="w-6 h-6 text-sky-500" />
          </div>
          <h3 className="text-lg font-bold" style={{ color: "#1d1d1f" }}>Flight History</h3>
          <p className="text-sm text-gray-500 mt-1">
            Sign in to view your recorded flights
          </p>
        </div>

        <div className="flex rounded-lg bg-gray-100 p-0.5 mb-4">
          <button
            onClick={() => { setMode("login"); setError(""); }}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${
              mode === "login" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setMode("register"); setError(""); }}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${
              mode === "register" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"
            }`}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "register" && (
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="First name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400"
                required
              />
              <input
                type="text"
                placeholder="Last name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400"
                required
              />
            </div>
          )}
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400"
            required
          />
          {error && (
            <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-sky-500 text-white hover:bg-sky-600 transition-colors disabled:opacity-50"
          >
            <LogIn className="w-4 h-4" />
            {submitting ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
}

function FlightMapPanel({ flight, onClose }: { flight: FlightDetail; onClose: () => void }) {
  const positions = useMemo(() => {
    if (!flight?.breadcrumbs?.length) return [];
    return flight.breadcrumbs.map((b) => [b.lat, b.lon] as [number, number]);
  }, [flight]);

  const bounds = useMemo(() => {
    if (!flight?.breadcrumbs?.length) return null;
    const lats = flight.breadcrumbs.map((b) => b.lat);
    const lons = flight.breadcrumbs.map((b) => b.lon);
    return L.latLngBounds(
      [Math.min(...lats), Math.min(...lons)],
      [Math.max(...lats), Math.max(...lons)]
    );
  }, [flight]);

  const pois = useMemo(() => computePointsOfInterest(flight), [flight]);

  if (positions.length < 2 || !bounds) {
    return (
      <div className="fixed inset-0 z-[9998] bg-black/50 flex items-center justify-center" onClick={onClose}>
        <div className="bg-white rounded-2xl p-8 max-w-sm text-center" onClick={(e) => e.stopPropagation()}>
          <Map className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Not enough GPS data to display this flight track.</p>
          <button onClick={onClose} className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-sm font-medium transition-colors" style={{ touchAction: "manipulation" }}>
            <ArrowLeft className="w-4 h-4" /> Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9998]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 w-full sm:w-[480px] md:w-[560px] bg-white shadow-2xl flex flex-col animate-slide-in-right">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <div className="min-w-0">
            <h3 className="font-bold text-base truncate" style={{ color: "#1d1d1f" }}>
              {flight.siteName || "Unknown Site"}
            </h3>
            <p className="text-xs text-gray-500">
              {formatDate(flight.startedAt)} · {formatDuration(flight.startedAt, flight.endedAt)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium transition-colors shrink-0 ml-2"
            style={{ touchAction: "manipulation" }}
          >
            <X className="w-4 h-4" /> Close
          </button>
        </div>

        <div className="flex-1 relative min-h-0">
          <MapContainer
            center={[0, 0]}
            zoom={10}
            className="w-full h-full"
            zoomControl={true}
            attributionControl={false}
          >
            <FitBoundsOnce bounds={bounds} />
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Polyline
              positions={positions}
              pathOptions={{ color: "#007aff", weight: 3, opacity: 0.85 }}
            />
            {pois.map((poi, i) => (
              <Marker
                key={i}
                position={[poi.lat, poi.lon]}
                icon={poiIcon(poi)}
              >
                <Popup>
                  <div className="text-center">
                    <strong className="text-sm">{poi.label}</strong>
                    <br />
                    <span className="text-xs text-gray-600">{poi.value}</span>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        <div className="shrink-0 border-t border-gray-100 bg-white max-h-[40vh] overflow-y-auto">
          <div className="px-4 py-3">
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Points of Interest
            </h4>
            <div className="space-y-1.5">
              {pois.map((poi, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl bg-gray-50"
                >
                  <span className="text-base">{poi.icon}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold" style={{ color: poi.color }}>{poi.label}</span>
                    <p className="text-xs text-gray-500 truncate">{poi.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="px-4 pb-3">
            <div className="grid grid-cols-3 gap-2">
              <StatCard icon={Route} label="Distance" value={distanceDisplay(flight.totalDistance)} color="#34c759" />
              <StatCard icon={Mountain} label="Max Alt" value={metersToFeet(flight.maxAltitude)} unit="ft" color="#ff9500" />
              <StatCard icon={Gauge} label="Max Speed" value={mpsToKmh(flight.maxSpeed)} unit="km/h" color="#ff3b30" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FlightDetailView({ flightId, onBack, onDelete }: { flightId: string; onBack: () => void; onDelete: (id: string) => void }) {
  const { token } = usePilotAuth();
  const [flight, setFlight] = useState<FlightDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showExport, setShowExport] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [detailDeleteError, setDetailDeleteError] = useState(false);
  const [showMap, setShowMap] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get<FlightDetail>(`/api/flights/${flightId}`, token)
      .then((data) => setFlight(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [flightId, token]);

  const pois = useMemo(() => (flight ? computePointsOfInterest(flight) : []), [flight]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-3 border-sky-200 border-t-sky-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!flight) {
    return (
      <div className="text-center py-20 text-gray-500">
        <p>Flight not found</p>
        <button onClick={onBack} className="mt-4 text-sky-500 hover:text-sky-600 font-medium">Go back</button>
      </div>
    );
  }

  const duration = formatDuration(flight.startedAt, flight.endedAt);
  const safeFilename = `${flight.siteName?.replace(/[^a-zA-Z0-9]/g, "_") || "flight"}_${new Date(flight.startedAt).toISOString().slice(0, 10)}`;
  const hasTrack = (flight.breadcrumbs?.length || 0) > 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl bg-white border border-gray-200 text-sky-500 hover:text-sky-600 hover:bg-sky-50 text-sm font-medium shadow-sm transition-colors" style={{ touchAction: "manipulation" }}>
          <ArrowLeft className="w-4 h-4" /> All Flights
        </button>
        <div className="flex items-center gap-2">
          {hasTrack && (
            <button
              onClick={() => setShowMap(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white text-sky-600 border border-sky-200 hover:bg-sky-50 transition-colors"
            >
              <Map className="w-4 h-4" /> View Map
            </button>
          )}
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white text-red-500 border border-red-200 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-4 h-4" /> Delete
          </button>
          <div className="relative">
            <button
              onClick={() => setShowExport(!showExport)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-sky-500 text-white hover:bg-sky-600 transition-colors"
            >
              <Download className="w-4 h-4" /> Export
            </button>
            {showExport && (
              <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-xl border z-50 min-w-[160px] py-1">
                <button
                  onClick={() => { downloadFile(generateIGC(flight), `${safeFilename}.igc`, "application/octet-stream"); setShowExport(false); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                >
                  <FileText className="w-4 h-4 text-orange-500" /> IGC Format
                </button>
                <button
                  onClick={() => { downloadFile(generateGPX(flight), `${safeFilename}.gpx`, "application/gpx+xml"); setShowExport(false); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                >
                  <FileText className="w-4 h-4 text-green-500" /> GPX Format
                </button>
                <button
                  onClick={() => { downloadFile(generateKML(flight), `${safeFilename}.kml`, "application/vnd.google-earth.kml+xml"); setShowExport(false); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                >
                  <FileText className="w-4 h-4 text-blue-500" /> KML Format
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className="rounded-2xl p-4"
        style={{
          background: "rgba(255,255,255,0.85)",
          border: "1px solid rgba(255,255,255,0.3)",
          backdropFilter: "blur(20px) saturate(180%)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
        }}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold" style={{ color: "#1d1d1f" }}>{flight.siteName || "Unknown Site"}</h2>
            <p className="text-sm text-gray-500">{formatDate(flight.startedAt)} at {formatTime(flight.startedAt)}</p>
          </div>
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              flight.status === "completed" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
            }`}
          >
            {flight.status === "completed" ? "Completed" : flight.status}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
          <StatCard icon={Clock} label="Duration" value={duration} color="#007aff" />
          <StatCard icon={Route} label="Distance" value={distanceDisplay(flight.totalDistance)} color="#34c759" />
          <StatCard icon={Mountain} label="Max Alt" value={metersToFeet(flight.maxAltitude)} unit="ft" color="#ff9500" />
          <StatCard icon={Gauge} label="Max Speed" value={mpsToKmh(flight.maxSpeed)} unit="km/h" color="#ff3b30" />
          <StatCard icon={TrendingUp} label="Alt Gain" value={metersToFeet(flight.altitudeGain)} unit="ft" color="#30d158" />
          <StatCard icon={TrendingDown} label="Alt Loss" value={metersToFeet(flight.altitudeLoss)} unit="ft" color="#ff453a" />
        </div>
      </div>

      {pois.length > 0 && (
        <div
          className="rounded-2xl p-4"
          style={{
            background: "rgba(255,255,255,0.85)",
            border: "1px solid rgba(255,255,255,0.3)",
            backdropFilter: "blur(20px) saturate(180%)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
          }}
        >
          <h3 className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: "#86868b" }}>
            Points of Interest
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {pois.map((poi, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50/80">
                <span className="text-lg">{poi.icon}</span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold" style={{ color: poi.color }}>{poi.label}</span>
                  <p className="text-xs text-gray-500 truncate">{poi.value}</p>
                </div>
              </div>
            ))}
          </div>
          {hasTrack && (
            <button
              onClick={() => setShowMap(true)}
              className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-sky-500 text-white hover:bg-sky-600 transition-colors"
            >
              <Map className="w-4 h-4" /> View Flight on Map
            </button>
          )}
        </div>
      )}

      {flight.breadcrumbs?.length > 0 && (
        <div
          className="rounded-2xl p-4"
          style={{
            background: "rgba(255,255,255,0.85)",
            border: "1px solid rgba(255,255,255,0.3)",
            backdropFilter: "blur(20px) saturate(180%)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
          }}
        >
          <h3 className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#86868b" }}>
            Track Points
          </h3>
          <p className="text-sm text-gray-600">
            {flight.breadcrumbs.length} GPS points recorded over {duration}
          </p>
        </div>
      )}

      {showMap && flight && (
        <FlightMapPanel flight={flight} onClose={() => setShowMap(false)} />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4" onClick={() => !deleting && setConfirmDelete(false)}>
          <div
            className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-bold text-base" style={{ color: "#1d1d1f" }}>Delete Flight?</h3>
                <p className="text-sm text-gray-500">This cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-1">
              <strong>{flight.siteName || "Unknown Site"}</strong> — {formatDate(flight.startedAt)}
            </p>
            <p className="text-xs text-gray-400 mb-4">
              {flight.breadcrumbs?.length || 0} GPS points and all flight data will be permanently removed.
            </p>
            {detailDeleteError && (
              <p className="text-xs text-red-500 mb-3 bg-red-50 rounded-lg px-3 py-2">
                Failed to delete flight. Please try again.
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setConfirmDelete(false); setDetailDeleteError(false); }}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setDeleting(true);
                  setDetailDeleteError(false);
                  api.delete(`/api/flights/${flightId}`, token)
                    .then(() => {
                        onDelete(flightId);
                    })
                    .catch(() => {
                      setDetailDeleteError(true);
                    })
                    .finally(() => {
                      setDeleting(false);
                    });
                }}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete Flight"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function FlightHistory() {
  const { settings, loading: settingsLoading } = useSettings();
  const navigate = useNavigate();
  useEffect(() => {
    if (!settingsLoading && !settings.xcMapsEnabled) {
      navigate("/", { replace: true });
    }
  }, [settingsLoading, settings.xcMapsEnabled, navigate]);
  const { pilot, token, logout } = usePilotAuth();
  const { data: flights = [], isLoading: loading } = useFlights(token);
  const deleteMutation = useDeleteFlightMutation(token);
  const qc = useQueryClient();
  const [selectedFlight, setSelectedFlight] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Flight | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [mapFlight, setMapFlight] = useState<FlightDetail | null>(null);
  const [loadingMap, setLoadingMap] = useState<string | null>(null);
  const [showBulkExport, setShowBulkExport] = useState(false);
  const [exportingBulk, setExportingBulk] = useState<"csv" | "gpx" | null>(null);

  const handleBulkExport = async (format: "csv" | "gpx") => {
    if (!token) return;
    setShowBulkExport(false);
    setExportingBulk(format);
    try {
      const url = `/api/flights/export?format=${format}`;
      const response = await fetch(url, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "x-pilot-token": token,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to export flights");
      }

      const blob = await response.blob();
      
      const disposition = response.headers.get("Content-Disposition");
      let filename = `flights_export_${new Date().toISOString().slice(0, 10)}.${format}`;
      if (disposition && disposition.indexOf("attachment") !== -1) {
        const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
        const matches = filenameRegex.exec(disposition);
        if (matches != null && matches[1]) { 
          filename = matches[1].replace(/['"]/g, '');
        }
      }

      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Failed to export flights. Please try again.");
    } finally {
      setExportingBulk(null);
    }
  };

  const handleDeleteFlight = (id: string) => {
    qc.setQueryData<Flight[]>(flightKeys.all, (old) => old?.filter((f) => f.id !== id) ?? []);
    setSelectedFlight(null);
    setDeleteTarget(null);
  };

  const handleListDelete = () => {
    if (!deleteTarget || !token) return;
    setDeleting(true);
    setDeleteError(false);
    deleteMutation.mutateAsync(deleteTarget.id)
      .then(() => {
        handleDeleteFlight(deleteTarget.id);
      })
      .catch(() => {
        setDeleteError(true);
      })
      .finally(() => {
        setDeleting(false);
      });
  };

  const openMapForFlight = useCallback((flightId: string) => {
    if (!token) return;
    setLoadingMap(flightId);
    api.get<FlightDetail>(`/api/flights/${flightId}`, token)
      .then((data) => {
        if (data?.breadcrumbs) setMapFlight(data);
      })
      .catch(() => {})
      .finally(() => setLoadingMap(null));
  }, [token]);

  const isDevPilot = pilot?.id === "dev-0";

  if (!pilot || isDevPilot) {
    return (
      <div className="min-h-screen bg-[#f5f5f7]">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Link to="/xc/maps" className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl bg-white border border-gray-200 text-sky-500 hover:text-sky-600 hover:bg-sky-50 text-sm font-medium shadow-sm transition-colors mb-6" style={{ touchAction: "manipulation" }}>
            <ArrowLeft className="w-4 h-4" /> Back to XC Maps
          </Link>
          <h1 className="text-2xl font-bold mb-6 text-center" style={{ color: "#1d1d1f" }}>Flight History</h1>
          <PilotLoginForm />
        </div>
      </div>
    );
  }

  if (selectedFlight) {
    return (
      <div className="min-h-screen bg-[#f5f5f7]">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <FlightDetailView flightId={selectedFlight} onBack={() => setSelectedFlight(null)} onDelete={handleDeleteFlight} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <Link to="/xc/maps" className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl bg-white border border-gray-200 text-sky-500 hover:text-sky-600 hover:bg-sky-50 text-sm font-medium shadow-sm transition-colors mb-4" style={{ touchAction: "manipulation" }}>
          <ArrowLeft className="w-4 h-4" /> Back to XC Maps
        </Link>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "#1d1d1f" }}>Flight History</h1>
            <p className="text-sm text-gray-500 mt-1">{pilot.name}'s recorded flights</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">{flights.length} flight{flights.length !== 1 ? "s" : ""}</span>
            {flights.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowBulkExport(!showBulkExport)}
                  disabled={!!exportingBulk}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white text-sky-600 border border-sky-200 hover:bg-sky-50 transition-colors disabled:opacity-50 shadow-sm"
                  title="Export all flights"
                >
                  <Download className="w-3.5 h-3.5" />
                  {exportingBulk ? "Exporting..." : "Export All"}
                </button>
                {showBulkExport && (
                  <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-xl border z-50 min-w-[160px] py-1">
                    <button
                      onClick={() => handleBulkExport("csv")}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                    >
                      <FileText className="w-4 h-4 text-blue-500" /> CSV Format
                    </button>
                    <button
                      onClick={() => handleBulkExport("gpx")}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                    >
                      <FileText className="w-4 h-4 text-green-500" /> GPX Format
                    </button>
                  </div>
                )}
              </div>
            )}
            <button
              onClick={logout}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-red-500 hover:bg-red-50 border border-gray-200 transition-colors"
              title="Switch account"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-3 border-sky-200 border-t-sky-500 rounded-full animate-spin" />
          </div>
        ) : flights.length === 0 ? (
          <div className="text-center py-20">
            <Plane className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2" style={{ color: "#1d1d1f" }}>No flights yet</h3>
            <p className="text-gray-500">Start recording on the XC Maps page to build your flight history.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {flights.map((f) => (
              <div
                key={f.id}
                className="rounded-2xl p-4 transition-all hover:shadow-md group"
                style={{
                  background: "rgba(255,255,255,0.85)",
                  border: "1px solid rgba(255,255,255,0.3)",
                  backdropFilter: "blur(20px) saturate(180%)",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
                }}
              >
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setSelectedFlight(f.id)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <MapPin className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                      <span className="font-semibold text-sm truncate" style={{ color: "#1d1d1f" }}>
                        {f.siteName || "Unknown Site"}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
                          f.status === "completed" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {f.status === "completed" ? "Completed" : f.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
                      <Calendar className="w-3 h-3" />
                      {formatDate(f.startedAt)} at {formatTime(f.startedAt)}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-gray-400" />
                        {formatDuration(f.startedAt, f.endedAt)}
                      </span>
                      {f.totalDistance > 0 && (
                        <span className="flex items-center gap-1">
                          <Route className="w-3 h-3 text-gray-400" />
                          {distanceDisplay(f.totalDistance)}
                        </span>
                      )}
                      {f.maxAltitude > 0 && (
                        <span className="flex items-center gap-1">
                          <Mountain className="w-3 h-3 text-gray-400" />
                          {metersToFeet(f.maxAltitude)} ft
                        </span>
                      )}
                      {f.maxSpeed > 0 && (
                        <span className="flex items-center gap-1">
                          <Gauge className="w-3 h-3 text-gray-400" />
                          {mpsToKmh(f.maxSpeed)} km/h
                        </span>
                      )}
                    </div>
                  </button>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <button
                      onClick={() => openMapForFlight(f.id)}
                      className="p-1.5 rounded-lg text-gray-300 hover:text-sky-500 hover:bg-sky-50 transition-colors opacity-0 group-hover:opacity-100"
                      title="View on map"
                    >
                      {loadingMap === f.id ? (
                        <div className="w-4 h-4 border-2 border-sky-200 border-t-sky-500 rounded-full animate-spin" />
                      ) : (
                        <Map className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => setDeleteTarget(f)}
                      className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete flight"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => setSelectedFlight(f.id)}>
                      <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-sky-400 transition-colors" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {mapFlight && (
        <FlightMapPanel flight={mapFlight} onClose={() => setMapFlight(null)} />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4" onClick={() => !deleting && setDeleteTarget(null)}>
          <div
            className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-bold text-base" style={{ color: "#1d1d1f" }}>Delete Flight?</h3>
                <p className="text-sm text-gray-500">This cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-1">
              <strong>{deleteTarget.siteName || "Unknown Site"}</strong> — {formatDate(deleteTarget.startedAt)}
            </p>
            <p className="text-xs text-gray-400 mb-4">
              All GPS points and flight data will be permanently removed.
            </p>
            {deleteError && (
              <p className="text-xs text-red-500 mb-3 bg-red-50 rounded-lg px-3 py-2">
                Failed to delete flight. Please try again.
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setDeleteTarget(null); setDeleteError(false); }}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleListDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete Flight"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
