import { useState, useEffect, useCallback, useRef, useMemo, memo, type TouchEvent as ReactTouchEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Car, MapPin, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, Plus, Minus, Map as MapIcon, MessageCircle, Users, Navigation, X as XIcon, Shield } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { usePilotAuth } from '@/contexts/PilotAuthContext';
import { PilotLoginModal } from '@/components/PilotLoginModal';
import { MapMessaging } from '@/components/MapMessaging';
import { getDemoRole } from '@/lib/demoConfig';
import { useDataUsage, trackSSEMessage } from '@/hooks/useDataUsage';
import { api } from '@/lib/apiClient';
import 'leaflet/dist/leaflet.css';
import { BASEMAPS } from '@/lib/xcMapUtils';

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

interface RetrievalRecord {
  id: string;
  pilotId: string;
  pilotName: string;
  pilotLat: number | null;
  pilotLon: number | null;
  pilotUpdatedAt: number | null;
  driverId: string | null;
  driverName: string | null;
  driverLat: number | null;
  driverLon: number | null;
  driverUpdatedAt: number | null;
  status: 'awaiting' | 'claimed';
  createdAt: string;
  etaMinutes?: number | null;
  positionSource?: 'phone' | 'satellite';
}

interface LivePilotData {
  pilotId: string;
  firstName: string;
  lat: number;
  lon: number;
  altitude: number;
  speed: number;
  heading: number;
  verticalSpeed?: number;
  landed?: boolean;
}

function pilotRetrievalIcon(name: string, driverName?: string | null, positionSource?: 'phone' | 'satellite') {
  const safeName = escapeHtml(name);
  const safeDriverName = driverName ? escapeHtml(driverName) : null;
  const isSatellite = positionSource === 'satellite';
  const badge = safeDriverName ? `<div style="position:absolute;top:-18px;left:50%;transform:translateX(-50%);background:rgba(33,150,243,0.95);color:white;padding:1px 6px;border-radius:8px;font-size:9px;font-weight:600;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.2);">🚗 ${safeDriverName}</div>` : '';
  const satBadge = isSatellite ? `<div style="position:absolute;bottom:-14px;left:50%;transform:translateX(-50%);background:rgba(99,102,241,0.95);color:white;padding:0px 4px;border-radius:6px;font-size:8px;font-weight:600;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.2);">📡 SAT</div>` : '';
  return L.divIcon({
    className: 'retrieval-pilot-icon',
    html: `<div style="position:relative;width:36px;height:36px;">
      <div style="width:36px;height:36px;border-radius:50%;background:${isSatellite ? 'rgba(99,102,241,0.9)' : 'rgba(255,152,0,0.9)'};border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="5" fill="white"/></svg>
      </div>
      <div style="position:absolute;top:${safeDriverName ? '-36' : '-22'}px;left:50%;transform:translateX(-50%);background:${isSatellite ? 'rgba(99,102,241,0.95)' : 'rgba(255,152,0,0.95)'};color:white;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:600;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.2);">${safeName}</div>
      ${badge}
      ${satBadge}
    </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function driverIcon(name: string) {
  const safeName = escapeHtml(name);
  return L.divIcon({
    className: 'retrieval-driver-icon',
    html: `<div style="position:relative;width:36px;height:36px;">
      <div style="width:36px;height:36px;border-radius:50%;background:rgba(33,150,243,0.9);border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>
      </div>
      <div style="position:absolute;top:-22px;left:50%;transform:translateX(-50%);background:rgba(33,150,243,0.95);color:white;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:600;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.2);">${safeName}</div>
    </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function livePilotIcon(name: string, altitudeM: number, verticalSpeed?: number) {
  const safeName = escapeHtml(name);
  const altFt = Math.round(altitudeM * 3.28084);
  const altM = Math.round(altitudeM);
  const vspeedMps = verticalSpeed || 0;
  const vspeedFpm = Math.round(vspeedMps * 196.85);
  const vspeedColor = vspeedFpm > 0 ? '#4ade80' : vspeedFpm < 0 ? '#f87171' : '#fff';
  const vspeedSign = vspeedFpm > 0 ? '+' : '';
  return L.divIcon({
    className: 'live-pilot-icon',
    html: `<div style="position:relative;width:28px;height:28px;">
      <div style="width:28px;height:28px;border-radius:50%;background:rgba(34,197,94,0.9);border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>
      <div style="position:absolute;top:-22px;left:50%;transform:translateX(-50%);background:rgba(34,197,94,0.95);color:white;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:600;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.2);">${safeName}</div>
      <div style="position:absolute;top:30px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.7);color:white;padding:1px 5px;border-radius:6px;font-size:9px;font-weight:500;white-space:nowrap;">${altM}m / ${altFt}ft</div>
      <div style="position:absolute;top:46px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.75);color:${vspeedColor};padding:1px 5px;border-radius:6px;font-size:9px;font-weight:600;white-space:nowrap;">${vspeedSign}${vspeedFpm} ft/m</div>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function dutyPilotIcon() {
  return L.divIcon({
    className: 'duty-pilot-icon',
    html: `<div style="position:relative;width:32px;height:32px;">
      <div style="width:32px;height:32px;border-radius:50%;background:rgba(20,184,166,0.9);border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/></svg>
      </div>
      <div style="position:absolute;top:-22px;left:50%;transform:translateX(-50%);background:rgba(20,184,166,0.95);color:white;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:600;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.2);">Duty Pilot</div>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function MapResizer() {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 200);
    const handler = () => setTimeout(() => map.invalidateSize(), 100);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [map]);
  return null;
}

function MapControlBridge({ mapRef, onZoomIn, onZoomOut }: { mapRef: React.MutableRefObject<L.Map | null>; onZoomIn: React.MutableRefObject<() => void>; onZoomOut: React.MutableRefObject<() => void> }) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
    onZoomIn.current = () => map.zoomIn();
    onZoomOut.current = () => map.zoomOut();
    return () => { mapRef.current = null; };
  }, [map, mapRef, onZoomIn, onZoomOut]);
  return null;
}

function AutoFitAll({ livePilots, retrievals, dutyPos, disabled }: { livePilots: LivePilotData[]; retrievals: RetrievalRecord[]; dutyPos: { lat: number; lon: number } | null; disabled: boolean }) {
  const map = useMap();
  const prevCountRef = useRef(0);
  useEffect(() => {
    if (disabled) return;
    const points: [number, number][] = [];
    livePilots.filter(p => !p.landed).forEach(p => points.push([p.lat, p.lon]));
    retrievals.filter(r => r.pilotLat != null && r.pilotLon != null).forEach(r => points.push([r.pilotLat!, r.pilotLon!]));
    if (dutyPos) points.push([dutyPos.lat, dutyPos.lon]);
    const currentCount = livePilots.filter(p => !p.landed).length + retrievals.filter(r => r.pilotLat != null && r.pilotLon != null).length;
    if (points.length > 0 && (currentCount !== prevCountRef.current || prevCountRef.current === 0)) {
      const bounds = L.latLngBounds(points.map(p => L.latLng(p[0], p[1])));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
    prevCountRef.current = currentCount;
  }, [map, livePilots, retrievals, dutyPos, disabled]);
  return null;
}


type PanelTab = 'pilots' | 'retrievals' | 'drivers';

interface DriverInfo {
  id: string;
  name: string;
  lat: number | null;
  lon: number | null;
  assignments: string[];
}

function useOrientation() {
  const [isLandscape, setIsLandscape] = useState(() => window.innerWidth > window.innerHeight);
  useEffect(() => {
    const handler = () => setIsLandscape(window.innerWidth > window.innerHeight);
    window.addEventListener('resize', handler);
    window.addEventListener('orientationchange', handler);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('orientationchange', handler);
    };
  }, []);
  return isLandscape;
}

export function DutyPilotMap() {
  const { pilot, token } = usePilotAuth();
  const demoRole = useMemo(() => getDemoRole(), []);
  const isDemo = !!demoRole;
  const apiBase = '/api';
  useDataUsage();
  const isLandscape = useOrientation();
  const [showLogin, setShowLogin] = useState(false);
  const [retrievals, setRetrievals] = useState<RetrievalRecord[]>([]);
  const [livePilots, setLivePilots] = useState<LivePilotData[]>([]);
  const [activeTab, setActiveTab] = useState<PanelTab>('pilots');
  const [panelCollapsed, setPanelCollapsed] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dutyPos, setDutyPos] = useState<{ lat: number; lon: number } | null>(null);
  const [driverPositions, setDriverPositions] = useState<Map<string, { driverId: string; driverName: string; lat: number; lon: number }>>(new Map());
  const drawerTouchStartX = useRef<number | null>(null);
  const drawerTouchStartY = useRef<number | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const zoomInRef = useRef<() => void>(() => {});
  const zoomOutRef = useRef<() => void>(() => {});
  const [activeBasemap, setActiveBasemap] = useState('streets');
  const [autoFitDisabled, setAutoFitDisabled] = useState(false);
  const [composeTarget, setComposeTarget] = useState<{ pilotId: string; name: string } | null>(null);

  const demoSession = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('demoSession');
  }, []);

  useEffect(() => {
    const handleCompose = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.pilotId && detail?.name) {
        setComposeTarget({ pilotId: detail.pilotId, name: detail.name });
      }
    };
    window.addEventListener('map-compose-message', handleCompose);
    return () => window.removeEventListener('map-compose-message', handleCompose);
  }, []);

  useEffect(() => {
    if (!('wakeLock' in navigator)) return;
    let wl: WakeLockSentinel | null = null;
    let released = false;
    const acquire = async () => {
      if (released) return;
      try {
        wl = await (navigator as any).wakeLock.request('screen');
        wl!.addEventListener('release', () => { wl = null; });
      } catch {}
    };
    acquire();
    const onVisibility = () => { if (document.visibilityState === 'visible') acquire(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVisibility);
      wl?.release().catch(() => {});
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const mapHeaders = useCallback(() => {
    const h: Record<string, string> = {};
    if (token) {
      h['x-pilot-token'] = token;
    }
    if (isDemo) h['x-demo'] = 'true';
    if (demoSession) h['x-demo-session'] = demoSession;
    return h;
  }, [token, isDemo, demoSession]);

  const apiOpts = useCallback(() => ({ headers: mapHeaders() }), [mapHeaders]);

  const fetchRetrievals = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.get<any>(`${apiBase}/retrievals/unretrieved`, token, apiOpts());
      setRetrievals(data);
    } catch {}
  }, [token, apiOpts, apiBase]);

  const fetchLivePilots = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.get<any>(`${apiBase}/flights/live-pilots`, token, apiOpts());
      setLivePilots(data);
    } catch {}
  }, [token, apiOpts, apiBase]);

  useEffect(() => {
    if (!token) return;
    fetchRetrievals();
    fetchLivePilots();

    let eventSource: EventSource | null = null;
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;

    const setupSSE = async () => {
      try {
        const roleQ = isDemo ? '' : '?role=duty';
        const resp = await api.get<{ticket: string}>(`/api/retrievals/sse-ticket${roleQ}`, null, apiOpts());
        if (!token) return;
        const sseUrl = `/api/retrievals/events?ticket=${resp.ticket}`;
        eventSource = new EventSource(sseUrl);
      eventSource.onopen = () => {
        fetchRetrievals();
        if (!isDemo && fallbackInterval) { clearInterval(fallbackInterval); fallbackInterval = null; }
      };
      eventSource.onmessage = (event) => {
        try {
          trackSSEMessage(event.data);
          const msg = JSON.parse(event.data);
          if (msg.type === 'retrievals' && Array.isArray(msg.data)) setRetrievals(msg.data);
        } catch {}
      };
      eventSource.onerror = () => {
        if (!fallbackInterval) fallbackInterval = setInterval(fetchRetrievals, 5000);
      };
      } catch {
        if (!fallbackInterval) fallbackInterval = setInterval(fetchRetrievals, 5000);
      }
    };
    setupSSE();
    if (isDemo && !fallbackInterval) {
      fallbackInterval = setInterval(fetchRetrievals, 3000);
    }

    const livePilotInterval = setInterval(fetchLivePilots, 5000);

    return () => {
      if (eventSource) eventSource.close();
      if (fallbackInterval) clearInterval(fallbackInterval);
      clearInterval(livePilotInterval);
    };
  }, [token, fetchRetrievals, fetchLivePilots, isDemo, demoSession]);

  const dutyPosBroadcastRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isDemo) {
      const simPos = { lat: -36.18041, lon: 147.98305 };
      setDutyPos(simPos);
      return;
    }
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setDutyPos({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [isDemo]);

  useEffect(() => {
    if (!token || !dutyPos) return;
    const broadcast = () => {
      api.post(`${apiBase}/retrievals/duty-pilot-position`, { lat: dutyPos.lat, lon: dutyPos.lon }, token, apiOpts()).catch(() => {});
    };
    broadcast();
    dutyPosBroadcastRef.current = setInterval(broadcast, 30000);
    return () => {
      if (dutyPosBroadcastRef.current) clearInterval(dutyPosBroadcastRef.current);
    };
  }, [token, dutyPos, apiBase, apiOpts]);

  useEffect(() => {
    if (!token) return;
    const fetchDriverPositions = async () => {
      try {
        const data = await api.get<any[]>(`${apiBase}/retrievals/driver-positions`, token, apiOpts());
        const posMap = new Map<string, { driverId: string; driverName: string; lat: number; lon: number }>();
        for (const d of data) {
          posMap.set(d.driverId, d);
        }
        setDriverPositions(posMap);
      } catch {}
    };
    fetchDriverPositions();
    const interval = setInterval(fetchDriverPositions, 5000);
    return () => clearInterval(interval);
  }, [token, apiBase, apiOpts]);

  const drivers = useMemo<DriverInfo[]>(() => {
    const driverMap = new Map<string, DriverInfo>();
    for (const r of retrievals) {
      if (r.driverId && r.driverName) {
        const existing = driverMap.get(r.driverId);
        if (existing) {
          existing.assignments.push(r.pilotName);
          if (r.driverLat != null) { existing.lat = r.driverLat; existing.lon = r.driverLon; }
        } else {
          driverMap.set(r.driverId, {
            id: r.driverId,
            name: r.driverName,
            lat: r.driverLat,
            lon: r.driverLon,
            assignments: [r.pilotName],
          });
        }
      }
    }

    for (const [driverId, pos] of driverPositions) {
      const existing = driverMap.get(driverId);
      if (existing) {
        if (existing.lat == null) {
          existing.lat = pos.lat;
          existing.lon = pos.lon;
        }
      } else {
        driverMap.set(driverId, {
          id: driverId,
          name: pos.driverName,
          lat: pos.lat,
          lon: pos.lon,
          assignments: [],
        });
      }
    }

    return Array.from(driverMap.values());
  }, [retrievals, driverPositions]);

  const handleClaim = async (pilotId: string) => {
    setActionLoading(pilotId);
    setActionError(null);
    try {
      await api.post(`${apiBase}/retrievals/claim/${pilotId}`, {}, token, apiOpts());
      await fetchRetrievals();
    } catch (e: any) { setActionError(e?.message || 'Claim failed'); }
    setActionLoading(null);
  };

  const handleUnclaim = async (pilotId: string) => {
    setActionLoading(pilotId);
    setActionError(null);
    try {
      await api.post(`${apiBase}/retrievals/unclaim/${pilotId}`, {}, token, apiOpts());
      await fetchRetrievals();
    } catch (e: any) { setActionError(e?.message || 'Unclaim failed'); }
    setActionLoading(null);
  };

  const handleComplete = async (pilotId: string) => {
    setActionLoading(pilotId);
    setActionError(null);
    try {
      await api.post(`${apiBase}/retrievals/complete/${pilotId}`, {}, token, apiOpts());
      await fetchRetrievals();
    } catch (e: any) { setActionError(e?.message || 'Complete failed'); }
    setActionLoading(null);
  };

  const flyTo = useCallback((lat: number, lon: number) => {
    if (mapRef.current) mapRef.current.flyTo([lat, lon], 14, { duration: 0.5 });
  }, []);

  const zoomToAll = useCallback(() => {
    if (!mapRef.current) return;
    setAutoFitDisabled(true);
    const points: [number, number][] = [];
    livePilots.filter(p => !p.landed).forEach(p => points.push([p.lat, p.lon]));
    retrievals.filter(r => r.pilotLat != null && r.pilotLon != null).forEach(r => points.push([r.pilotLat!, r.pilotLon!]));
    drivers.filter(d => d.lat != null && d.lon != null).forEach(d => points.push([d.lat!, d.lon!]));
    if (dutyPos) points.push([dutyPos.lat, dutyPos.lon]);
    if (points.length > 0) {
      const bounds = L.latLngBounds(points.map(p => L.latLng(p[0], p[1])));
      mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [livePilots, retrievals, drivers, dutyPos]);

  useEffect(() => {
    const handler = (event: CustomEvent) => {
      if (event.detail?.pilotId && event.detail?.name) {
        setComposeTarget({ pilotId: event.detail.pilotId, name: event.detail.name });
      }
    };
    window.addEventListener('map-message-reply', handler as EventListener);
    return () => window.removeEventListener('map-message-reply', handler as EventListener);
  }, []);

  useEffect(() => {
    if (!isLandscape) return;
    let startX: number | null = null;
    let startY: number | null = null;
    const onTouchStart = (e: globalThis.TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };
    const onTouchEnd = (e: globalThis.TouchEvent) => {
      if (startX === null || startY === null) return;
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const dx = endX - startX;
      const dy = Math.abs(endY - startY!);
      if (dy > Math.abs(dx)) { startX = null; startY = null; return; }
      if (panelCollapsed && dx > 60 && startX < 50) {
        setPanelCollapsed(false);
      } else if (!panelCollapsed && dx < -60) {
        setPanelCollapsed(true);
      }
      startX = null;
      startY = null;
    };
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [isLandscape, panelCollapsed]);

  if (!pilot) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: 'var(--tmpl-body-bg, #f5f5f7)' }}>
        <div className="max-w-md w-full p-8 rounded-2xl text-center" style={{ background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(20px)', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
          <Shield className="w-12 h-12 text-teal-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2" style={{ color: '#1d1d1f' }}>Duty Pilot</h2>
          <p className="text-sm mb-4" style={{ color: '#86868b' }}>
            Sign in to access the Duty Pilot command dashboard.
          </p>
          <button onClick={() => setShowLogin(true)} className="bg-teal-500 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-teal-600">
            Sign In
          </button>
        </div>
        {showLogin && <PilotLoginModal onClose={() => setShowLogin(false)} />}
      </div>
    );
  }

  const defaultCenter: [number, number] = isDemo ? [-36.18, 147.98] : [-38.1, 145.2];
  const inFlightPilots = livePilots.filter(p => !p.landed);
  const landedPilots = livePilots.filter(p => p.landed);

  const panelContent = (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-gray-200 shrink-0">
        {(['pilots', 'retrievals', 'drivers'] as PanelTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
              activeTab === tab
                ? 'text-teal-600 border-b-2 border-teal-500 bg-teal-50/50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {tab === 'pilots' && `Pilots (${inFlightPilots.length})`}
            {tab === 'retrievals' && `Retrieve (${retrievals.length})`}
            {tab === 'drivers' && `Drivers (${drivers.length})`}
          </button>
        ))}
      </div>

      {actionError && (
        <div className="mx-2 mt-2 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center justify-between shrink-0">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="ml-2 text-red-400 hover:text-red-600 font-bold">&times;</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'pilots' && (
          <div>
            {inFlightPilots.length === 0 && landedPilots.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-gray-400">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                No active pilots
              </div>
            )}
            {inFlightPilots.map(p => {
              const altFt = Math.round(p.altitude * 3.28084);
              const vFpm = Math.round((p.verticalSpeed || 0) * 196.85);
              const vSign = vFpm > 0 ? '+' : '';
              return (
                <button key={p.pilotId} className="w-full px-3 py-2.5 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0" onClick={() => flyTo(p.lat, p.lon)}>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
                    <span className="font-medium text-sm text-gray-900">{p.firstName}</span>
                    <span className="ml-auto text-xs text-gray-500 tabular-nums">{Math.round(p.speed)} km/h</span>
                  </div>
                  <div className="flex items-center gap-3 ml-4.5 mt-0.5">
                    <span className="text-xs text-gray-500 tabular-nums">{Math.round(p.altitude)}m / {altFt}ft</span>
                    <span className={`text-xs font-medium tabular-nums ${vFpm > 0 ? 'text-green-600' : vFpm < 0 ? 'text-red-500' : 'text-gray-400'}`}>{vSign}{vFpm} ft/m</span>
                  </div>
                  <div className="flex items-center gap-2 ml-4.5 mt-0.5">
                    <button onClick={(e) => { e.stopPropagation(); setComposeTarget({ pilotId: p.pilotId, name: p.firstName }); }} className="text-sky-500 hover:text-sky-700">
                      <MessageCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </button>
              );
            })}
            {landedPilots.length > 0 && (
              <>
                <div className="px-3 py-1.5 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">Landed ({landedPilots.length})</div>
                {landedPilots.map(p => (
                  <button key={p.pilotId} className="w-full px-3 py-2 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0" onClick={() => flyTo(p.lat, p.lon)}>
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-gray-400 shrink-0" />
                      <span className="font-medium text-sm text-gray-600">{p.firstName}</span>
                      <span className="ml-auto text-xs text-gray-400">Landed</span>
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        {activeTab === 'retrievals' && (
          <div>
            {retrievals.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-gray-400">
                <MapPin className="w-8 h-8 mx-auto mb-2 opacity-40" />
                No retrievals pending
              </div>
            )}
            {retrievals.map(r => (
              <div key={r.id} className="border-b border-gray-100 last:border-b-0">
                <button className="w-full px-3 py-2.5 text-left hover:bg-gray-50" onClick={() => r.pilotLat != null && r.pilotLon != null && flyTo(r.pilotLat, r.pilotLon)}>
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${r.status === 'claimed' ? 'bg-blue-500' : 'bg-orange-400'} shrink-0`} />
                    <span className="font-medium text-sm text-gray-900">{r.pilotName}</span>
                    <span className={`ml-auto text-xs font-medium ${r.status === 'claimed' ? 'text-blue-600' : 'text-orange-500'}`}>
                      {r.status === 'claimed' ? 'Claimed' : 'Awaiting'}
                    </span>
                  </div>
                  {r.status === 'claimed' && r.driverName && (
                    <div className="text-xs text-blue-600 mt-0.5 ml-4.5">🚗 {r.driverName}{r.etaMinutes != null ? ` · ${Math.round(r.etaMinutes)} min ETA` : ''}</div>
                  )}
                  {r.positionSource === 'satellite' && (
                    <div className="text-xs text-indigo-600 mt-0.5 ml-4.5 font-medium">📡 via satellite</div>
                  )}
                </button>
                <div className="px-3 pb-2 flex flex-wrap gap-1.5">
                  {r.status === 'awaiting' && (
                    <button onClick={() => handleClaim(r.pilotId)} disabled={actionLoading === r.pilotId} className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-medium hover:bg-blue-600 disabled:opacity-50">
                      <Navigation className="w-3 h-3" /> Claim
                    </button>
                  )}
                  {r.status === 'claimed' && (
                    <button onClick={() => handleUnclaim(r.pilotId)} disabled={actionLoading === r.pilotId} className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 disabled:opacity-50">
                      <XIcon className="w-3 h-3" /> Unclaim
                    </button>
                  )}
                  <button onClick={() => handleComplete(r.pilotId)} disabled={actionLoading === r.pilotId} className="flex items-center gap-1 px-2.5 py-1.5 bg-green-500 text-white rounded-lg text-xs font-medium hover:bg-green-600 disabled:opacity-50">
                    <CheckCircle className="w-3 h-3" /> Complete
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setComposeTarget({ pilotId: r.pilotId, name: r.pilotName }); }} className="flex items-center gap-1 px-2.5 py-1.5 bg-sky-100 text-sky-700 rounded-lg text-xs font-medium hover:bg-sky-200">
                    <MessageCircle className="w-3 h-3" /> Msg
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'drivers' && (
          <div>
            {drivers.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-gray-400">
                <Car className="w-8 h-8 mx-auto mb-2 opacity-40" />
                No active drivers
              </div>
            )}
            {drivers.map(d => (
              <button key={d.id} className="w-full px-3 py-2.5 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0" onClick={() => d.lat != null && d.lon != null && flyTo(d.lat, d.lon)}>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                  <span className="font-medium text-sm text-gray-900">{d.name}</span>
                  <span className="ml-auto text-xs text-gray-500">{d.assignments.length} pickup{d.assignments.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5 ml-4.5">
                  {d.assignments.join(', ')}
                </div>
                <div className="flex items-center gap-2 ml-4.5 mt-0.5">
                  <button onClick={(e) => { e.stopPropagation(); setComposeTarget({ pilotId: d.id, name: d.name }); }} className="text-sky-500 hover:text-sky-700">
                    <MessageCircle className="w-3.5 h-3.5" />
                  </button>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[9999] w-screen h-screen flex" style={{ flexDirection: isLandscape ? 'row' : 'column' }}>
      {isLandscape && (
        <>
          {!panelCollapsed && (
            <div
              className="fixed inset-0 bg-black/20 z-[1100]"
              onClick={() => setPanelCollapsed(true)}
            />
          )}
          <div
            ref={drawerRef}
            className="fixed top-0 left-0 h-full w-80 bg-white shadow-2xl flex flex-col z-[1101] transition-transform duration-300 ease-in-out"
            style={{ transform: panelCollapsed ? 'translateX(-100%)' : 'translateX(0)' }}
          >
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-gradient-to-r from-teal-50 to-white shrink-0">
              <Shield className="w-5 h-5 text-teal-500" />
              <h1 className="font-bold text-sm text-gray-900 flex-1">Duty Pilot</h1>
              <button onClick={() => setPanelCollapsed(true)} className="p-1 hover:bg-gray-100 rounded" title="Close panel">
                <ChevronLeft className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            {panelContent}
          </div>
          {panelCollapsed && (
            <button
              onClick={() => setPanelCollapsed(false)}
              className="fixed top-1/2 -translate-y-1/2 left-0 z-[1100] border border-l-0 shadow-lg rounded-r-lg px-1 py-4 flex items-center justify-center hover:bg-teal-50 hover:text-teal-600 transition-colors"
              style={{ background: 'rgba(255,255,255,0.95)', borderColor: 'rgba(0,0,0,0.1)', color: '#4b5563' }}
              title="Open panel"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </>
      )}

      <div className="flex-1 relative" style={{ minHeight: isLandscape ? '100%' : (panelCollapsed ? '100%' : '55%') }}>
        <MapContainer center={defaultCenter} zoom={10} style={{ height: '100%', width: '100%', position: 'absolute', inset: 0 }} zoomControl={false}>
          <TileLayer key={activeBasemap} attribution={BASEMAPS.find(b => b.id === activeBasemap)?.attribution || ''} url={BASEMAPS.find(b => b.id === activeBasemap)?.url || BASEMAPS[0].url} />
          <MapResizer />
          <AutoFitAll livePilots={livePilots} retrievals={retrievals} dutyPos={dutyPos} disabled={autoFitDisabled} />
          <MapControlBridge mapRef={mapRef} onZoomIn={zoomInRef} onZoomOut={zoomOutRef} />

          {retrievals.map(r => {
            if (r.pilotLat == null || r.pilotLon == null) return null;
            return (
              <Marker key={`ret-${r.pilotId}`} position={[r.pilotLat, r.pilotLon]} icon={pilotRetrievalIcon(r.pilotName, r.driverName, r.positionSource)}>
                <Popup>
                  <div className="text-sm">
                    <strong>{r.pilotName}</strong>
                    <div className={r.status === 'claimed' ? 'text-blue-600' : 'text-orange-500'}>{r.status === 'claimed' ? `🚗 ${r.driverName} en route` : 'Awaiting retrieval'}</div>
                    {r.etaMinutes != null && <div className="text-blue-500 font-medium">{Math.round(r.etaMinutes)} min ETA</div>}
                    <button onClick={() => { setComposeTarget({ pilotId: r.pilotId, name: r.pilotName }); mapRef.current?.closePopup(); }} style={{display:'block',width:'100%',marginTop:6,padding:'5px 0',background:'#0ea5e9',color:'#fff',border:'none',borderRadius:6,fontSize:11,fontWeight:600,cursor:'pointer'}}>Message</button>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {inFlightPilots.map(p => (
            <Marker key={`live-${p.pilotId}`} position={[p.lat, p.lon]} icon={livePilotIcon(p.firstName, p.altitude, p.verticalSpeed)}>
              <Popup>
                <div className="text-sm">
                  <strong>{p.firstName}</strong>
                  <div className="text-green-600">In flight — {Math.round(p.altitude)}m / {Math.round(p.speed)} km/h</div>
                  <button onClick={() => { setComposeTarget({ pilotId: p.pilotId, name: p.firstName }); mapRef.current?.closePopup(); }} style={{display:'block',width:'100%',marginTop:6,padding:'5px 0',background:'#0ea5e9',color:'#fff',border:'none',borderRadius:6,fontSize:11,fontWeight:600,cursor:'pointer'}}>Message</button>
                </div>
              </Popup>
            </Marker>
          ))}

          {drivers.filter(d => d.lat != null && d.lon != null).map(d => (
            <Marker key={`drv-${d.id}`} position={[d.lat!, d.lon!]} icon={driverIcon(d.name)}>
              <Popup>
                <div className="text-sm">
                  <strong>{d.name}</strong>
                  {d.assignments.length > 0
                    ? <div className="text-blue-600">{d.assignments.length} pickup{d.assignments.length !== 1 ? 's' : ''}: {d.assignments.join(', ')}</div>
                    : <div className="text-gray-500">Standby</div>
                  }
                  <button onClick={() => { setComposeTarget({ pilotId: d.id, name: d.name }); mapRef.current?.closePopup(); }} style={{display:'block',width:'100%',marginTop:6,padding:'5px 0',background:'#0ea5e9',color:'#fff',border:'none',borderRadius:6,fontSize:11,fontWeight:600,cursor:'pointer'}}>Message</button>
                </div>
              </Popup>
            </Marker>
          ))}

          {dutyPos && (
            <Marker position={[dutyPos.lat, dutyPos.lon]} icon={dutyPilotIcon()}>
              <Popup>
                <div className="text-sm">
                  <strong>Duty Pilot</strong>
                  <div className="text-teal-600">Your position</div>
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>

        <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-2">
          <div className="flex flex-col rounded-lg overflow-hidden shadow-md" style={{ border: '1px solid rgba(0,0,0,0.1)' }}>
            <button
              onClick={() => zoomInRef.current()}
              onTouchEnd={(e) => { e.preventDefault(); zoomInRef.current(); }}
              className="flex items-center justify-center min-h-[44px] min-w-[44px] transition-all"
              style={{ background: 'rgba(255,255,255,0.95)', color: '#1d1d1f', touchAction: 'manipulation', borderBottom: '1px solid rgba(0,0,0,0.1)' }}
              title="Zoom in"
            >
              <Plus className="w-[20px] h-[20px]" />
            </button>
            <button
              onClick={() => zoomOutRef.current()}
              onTouchEnd={(e) => { e.preventDefault(); zoomOutRef.current(); }}
              className="flex items-center justify-center min-h-[44px] min-w-[44px] transition-all"
              style={{ background: 'rgba(255,255,255,0.95)', color: '#1d1d1f', touchAction: 'manipulation' }}
              title="Zoom out"
            >
              <Minus className="w-[20px] h-[20px]" />
            </button>
          </div>
          <button
            onClick={() => { const idx = BASEMAPS.findIndex(b => b.id === activeBasemap); setActiveBasemap(BASEMAPS[(idx + 1) % BASEMAPS.length].id); }}
            onTouchEnd={(e) => { e.preventDefault(); const idx = BASEMAPS.findIndex(b => b.id === activeBasemap); setActiveBasemap(BASEMAPS[(idx + 1) % BASEMAPS.length].id); }}
            className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg shadow-md transition-all"
            style={{ background: 'rgba(255,255,255,0.95)', color: '#1d1d1f', border: '1px solid rgba(0,0,0,0.1)', touchAction: 'manipulation' }}
            title={`Map style: ${BASEMAPS.find(b => b.id === activeBasemap)?.label || 'Streets'}`}
          >
            <MapIcon className="w-[18px] h-[18px]" />
          </button>
        </div>

        <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-2">
          <Link to="/xc/maps" className="min-h-[44px] min-w-[44px] rounded-lg shadow-md flex items-center justify-center transition-all" style={{ background: 'rgba(255,255,255,0.95)', color: '#1d1d1f', border: '1px solid rgba(0,0,0,0.1)' }} title="Back">
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </div>

        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] flex gap-2">
          <button onClick={zoomToAll} className="bg-teal-500 hover:bg-teal-600 text-white rounded-full px-4 py-2 text-sm font-semibold shadow-lg">
            Fit All
          </button>
        </div>

        <MapMessaging
          pilotId={pilot?.id || null}
          pilotName={pilot?.name || pilot?.firstName || null}
          pilotToken={token}
          composeTarget={composeTarget}
          onCloseCompose={() => setComposeTarget(null)}
          apiPrefix="/api/map-messages"
          demoSession={demoSession}
        />
      </div>

      {!isLandscape && (
        <div className={`bg-white border-t border-gray-200 shadow-lg flex flex-col shrink-0 z-[1001] transition-all ${panelCollapsed ? 'h-10' : 'h-[45%]'}`}>
          <button className="w-full h-10 flex items-center justify-center border-b border-gray-100 shrink-0 bg-gradient-to-r from-teal-50 to-white" onClick={() => setPanelCollapsed(c => !c)}>
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-teal-500" />
              <span className="font-bold text-xs text-gray-700">Duty Pilot</span>
              {panelCollapsed ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </div>
          </button>
          {!panelCollapsed && panelContent}
        </div>
      )}
    </div>
  );
}
