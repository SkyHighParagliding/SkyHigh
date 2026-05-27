import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import L from "leaflet";
import { usePilotAuth } from "@/contexts/PilotAuthContext";
import { useDataUsage, trackSSEMessage } from "@/hooks/useDataUsage";
import { api } from "@/lib/apiClient";
import { getDemoRole } from "@/lib/demoConfig";

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

interface RouteInfo {
  pilotId: string;
  coords: [number, number][];
  distanceKm: number;
  durationMin: number;
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
  positionSource?: 'phone' | 'satellite';
}

function decodePolyline(encoded: string): [number, number][] {
  const coords: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    coords.push([lat / 1e5, lng / 1e5]);
  }
  return coords;
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeSegmentDistances(coords: [number, number][]): number[] {
  const distances: number[] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    distances.push(haversineDistance(coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1]));
  }
  return distances;
}

async function fetchOSRMRoute(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  signal?: AbortSignal
): Promise<{ coords: [number, number][]; distanceKm: number; durationMin: number } | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=polyline`;
    const res = await fetch(url, signal ? { signal } : undefined);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.length) return null;
    const route = data.routes[0];
    const coords = decodePolyline(route.geometry);
    return { coords, distanceKm: route.distance / 1000, durationMin: route.duration / 60 };
  } catch { return null; }
}

export type { LivePilotData, RouteInfo, RetrievalRecord };
export { fetchOSRMRoute, computeSegmentDistances, decodePolyline, haversineDistance, getDemoRole };

interface DemoRouteAnim {
  pilotId: string;
  coords: [number, number][];
  segmentDistances: number[];
  totalDistance: number;
  distanceTraveled: number;
  lastTick: number;
  baseSpeed: number;
  speed: number;
}

export function useRetrievalMap() {
  const { pilot, token } = usePilotAuth();
  const demoRole = useMemo(() => getDemoRole(), []);
  const isDemo = !!demoRole;
  const demoSession = useMemo(() => {
    if (!isDemo) return null;
    return new URLSearchParams(window.location.search).get('demoSession');
  }, [isDemo]);
  const apiBase = '/api';
  useDataUsage();

  const [showLogin, setShowLogin] = useState(false);
  const [retrievals, setRetrievals] = useState<RetrievalRecord[]>([]);
  const [livePilots, setLivePilots] = useState<LivePilotData[]>([]);
  const [selectedPilotId, setSelectedPilotId] = useState<string | null>(null);
  const [listCollapsed, setListCollapsed] = useState(isDemo);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(true);
  const driverPosIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const driverPosRef = useRef<{ lat: number; lon: number } | null>(null);
  const [driverPosState, setDriverPosState] = useState<{ lat: number; lon: number } | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const zoomInRef = useRef<() => void>(() => {});
  const zoomOutRef = useRef<() => void>(() => {});
  const [activeBasemap, setActiveBasemap] = useState('streets');
  const handleZoomIn = useCallback(() => zoomInRef.current(), []);
  const handleZoomOut = useCallback(() => zoomOutRef.current(), []);
  const [routes, setRoutes] = useState<RouteInfo[]>([]);
  const routeCacheRef = useRef<Map<string, { key: string; route: RouteInfo }>>(new Map());
  const demoSpeedRef = useRef<number>(1);
  const [composeTarget, setComposeTarget] = useState<{ pilotId: string; name: string } | null>(null);
  const [dutyPilotPos, setDutyPilotPos] = useState<{ lat: number; lon: number; name: string } | null>(null);
  const [launchSite, setLaunchSite] = useState<{ lat: number; lon: number; name: string } | null>(null);
  const [returnRoute, setReturnRoute] = useState<RouteInfo | null>(null);
  const [returnTarget, setReturnTarget] = useState<string | null>(null);
  const returnRouteOrigRef = useRef<{ distanceKm: number; durationMin: number } | null>(null);

  useEffect(() => {
    const handleCompose = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.pilotId && detail?.name) setComposeTarget({ pilotId: detail.pilotId, name: detail.name });
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

  const mapHeaders = useCallback(() => {
    const h: Record<string, string> = {};
    if (token) h['x-pilot-token'] = token;
    if (isDemo) h['x-demo'] = 'true';
    if (demoSession) h['x-demo-session'] = demoSession;
    return h;
  }, [token, isDemo, demoSession]);

  const apiOpts = useCallback(() => ({ headers: mapHeaders() }), [mapHeaders]);

  const fetchRetrievals = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.get<any>(`${apiBase}/retrievals/unretrieved`, null, apiOpts());
      if (isDemo && Array.isArray(data) && data.length > 0) {
        console.log('[demo-driver] fetchRetrievals got', data.length, 'unretrieved');
      }
      setRetrievals(data);
    } catch (e) {
      if (isDemo) console.warn('[demo-driver] fetchRetrievals error:', e);
    }
  }, [token, apiOpts, apiBase, isDemo]);

  const fetchLivePilots = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.get<Record<string, unknown>>(`${apiBase}/flights/live-pilots`, null, apiOpts());
      setLivePilots(data);
    } catch {}
  }, [token, apiOpts, apiBase]);

  useEffect(() => {
    if (!token) return;
    fetchRetrievals();
    fetchLivePilots();

    let eventSource: EventSource | null = null;
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;

    const sseUrl = isDemo
      ? `/api/retrievals/events?demo=true&demoSession=${demoSession}&pilotToken=${token}`
      : `/api/retrievals/events?role=driver&pilotToken=${token}`;

    try {
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
        if (!fallbackInterval) fallbackInterval = setInterval(() => { fetchRetrievals(); }, 5000);
      };
    } catch {
      fallbackInterval = setInterval(() => { fetchRetrievals(); }, 5000);
    }
    if (isDemo && !fallbackInterval) {
      fallbackInterval = setInterval(() => { fetchRetrievals(); }, 3000);
    }

    const livePilotInterval = setInterval(fetchLivePilots, 5000);

    const fetchNavTargets = async () => {
      try {
        const [dp, ls] = await Promise.all([
          api.get<Record<string, unknown>>(`${apiBase}/retrievals/duty-pilot-position`, null, apiOpts()),
          api.get<Record<string, unknown>>(`${apiBase}/retrievals/launch-site`, null, apiOpts()),
        ]);
        setDutyPilotPos(dp?.available ? { lat: dp.lat, lon: dp.lon, name: dp.name } : null);
        setLaunchSite(ls?.available ? { lat: ls.lat, lon: ls.lon, name: ls.name } : null);
      } catch {}
    };
    fetchNavTargets();
    const navTargetInterval = setInterval(fetchNavTargets, 15000);

    return () => {
      if (eventSource) { eventSource.close(); }
      if (fallbackInterval) clearInterval(fallbackInterval);
      clearInterval(livePilotInterval);
      clearInterval(navTargetInterval);
    };
  }, [token, fetchRetrievals, fetchLivePilots, isDemo, demoSession]);

  useEffect(() => {
    if (selectedPilotId && !retrievals.some(r => r.pilotId === selectedPilotId)) setSelectedPilotId(null);
    if (retrievals.length > 0 && returnRoute) { setReturnRoute(null); setReturnTarget(null); }
  }, [retrievals, selectedPilotId]);

  const routeTargetsRef = useRef<string>('');

  useEffect(() => {
    if (!driverPosState) return;
    const targets = retrievals.filter(
      r => r.pilotLat != null && r.pilotLon != null && r.status === 'claimed' && r.driverId === pilot?.id
    );
    if (targets.length === 0) {
      if (routes.length > 0) setRoutes([]);
      routeTargetsRef.current = '';
      routeCacheRef.current.clear();
      return;
    }
    const signature = targets
      .map(r => `${r.pilotId}:${r.pilotLat!.toFixed(4)},${r.pilotLon!.toFixed(4)}`)
      .sort().join('|') + `@${driverPosState.lat.toFixed(4)},${driverPosState.lon.toFixed(4)}`;
    if (signature === routeTargetsRef.current) return;
    routeTargetsRef.current = signature;

    const cache = routeCacheRef.current;
    const activePilotIds = new Set(targets.map(t => t.pilotId));
    for (const key of cache.keys()) { if (!activePilotIds.has(key)) cache.delete(key); }

    const controller = new AbortController();
    async function fetchRoutes() {
      const newRoutes: RouteInfo[] = [];
      for (const r of targets) {
        if (controller.signal.aborted) return;
        const cacheKey = `${r.pilotId}:${driverPosState!.lat.toFixed(4)},${driverPosState!.lon.toFixed(4)}:${r.pilotLat!.toFixed(4)},${r.pilotLon!.toFixed(4)}`;
        const cached = cache.get(r.pilotId);
        if (cached && cached.key === cacheKey) { newRoutes.push(cached.route); continue; }
        const result = await fetchOSRMRoute(driverPosState!, { lat: r.pilotLat!, lon: r.pilotLon! }, controller.signal);
        if (controller.signal.aborted) return;
        if (result) {
          const routeInfo: RouteInfo = { pilotId: r.pilotId, ...result };
          cache.set(r.pilotId, { key: cacheKey, route: routeInfo });
          newRoutes.push(routeInfo);
        }
      }
      if (!controller.signal.aborted) setRoutes(newRoutes);
    }
    fetchRoutes();
    const interval = setInterval(() => { routeTargetsRef.current = ''; }, 30000);
    return () => { controller.abort(); clearInterval(interval); };
  }, [driverPosState, retrievals]);

  const demoRouteAnimRef = useRef<DemoRouteAnim | null>(null);
  const demoRouteQueueRef = useRef<{ pilotId: string; lat: number; lon: number }[]>([]);
  const demoCompleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startDemoRouteToNext = useCallback(async () => {
    const queue = demoRouteQueueRef.current;
    if (queue.length === 0 || demoRouteAnimRef.current) return;
    const next = queue[0];
    const from = driverPosRef.current;
    if (!from) return;
    const routeData = await fetchOSRMRoute(from, { lat: next.lat, lon: next.lon });
    if (routeData && routeData.coords.length >= 2) {
      const segDists = computeSegmentDistances(routeData.coords);
      const totalDist = segDists.reduce((a, b) => a + b, 0);
      const baseSpeed = totalDist / (routeData.durationMin * 60);
      demoRouteAnimRef.current = {
        pilotId: next.pilotId, coords: routeData.coords, segmentDistances: segDists,
        totalDistance: totalDist, distanceTraveled: 0, lastTick: Date.now(),
        baseSpeed, speed: baseSpeed * demoSpeedRef.current,
      };
    }
  }, []);

  useEffect(() => {
    if (!token || !pilot) return;

    if (isDemo) {
      const driverNum = parseInt(pilot.id.replace(/\D/g, '')) || 1;
      const baseLat = -36.197;
      const baseLon = 147.898;
      const simPos = { lat: baseLat - (driverNum - 1) * 0.008, lon: baseLon + (driverNum - 1) * 0.014 };
      driverPosRef.current = simPos;
      setDriverPosState(simPos);
      api.post(`${apiBase}/retrievals/driver-position`, simPos, null, apiOpts()).catch(() => {});

      const animInterval = setInterval(() => {
        const anim = demoRouteAnimRef.current;
        if (!anim) return;
        const now = Date.now();
        const elapsed = (now - anim.lastTick) / 1000;
        anim.lastTick = now;
        anim.distanceTraveled += anim.speed * elapsed;

        if (anim.distanceTraveled >= anim.totalDistance) {
          const lastCoord = anim.coords[anim.coords.length - 1];
          const arrivedPos = { lat: lastCoord[0], lon: lastCoord[1] };
          driverPosRef.current = arrivedPos;
          setDriverPosState(arrivedPos);
          api.post(`${apiBase}/retrievals/driver-position`, arrivedPos, null, apiOpts()).catch(() => {});
          const targetId = anim.pilotId;
          demoRouteAnimRef.current = null;
          const isReturnRoute = targetId === 'launch' || targetId === 'duty-pilot';
          if (isReturnRoute) {
            setReturnRoute(null); setReturnTarget(null); returnRouteOrigRef.current = null;
            return;
          }
          demoRouteQueueRef.current = demoRouteQueueRef.current.filter(q => q.pilotId !== targetId);
          if (demoCompleteTimeoutRef.current) clearTimeout(demoCompleteTimeoutRef.current);
          demoCompleteTimeoutRef.current = setTimeout(() => {
            demoCompleteTimeoutRef.current = null;
            api.post(`${apiBase}/retrievals/complete/${targetId}`, {}, null, apiOpts()).then(() => {
              fetchRetrievals();
              startDemoRouteToNext();
            }).catch(() => {});
          }, 15000);
          return;
        }

        let cumDist = 0;
        for (let i = 0; i < anim.segmentDistances.length; i++) {
          const segLen = anim.segmentDistances[i];
          if (segLen < 0.01) { cumDist += segLen; continue; }
          if (cumDist + segLen >= anim.distanceTraveled) {
            const segProgress = Math.min(1, Math.max(0, (anim.distanceTraveled - cumDist) / segLen));
            const p1 = anim.coords[i];
            const p2 = anim.coords[i + 1];
            const lat = p1[0] + (p2[0] - p1[0]) * segProgress;
            const lon = p1[1] + (p2[1] - p1[1]) * segProgress;
            const newPos = { lat, lon };
            driverPosRef.current = newPos;
            setDriverPosState(newPos);
            api.post(`${apiBase}/retrievals/driver-position`, newPos, null, apiOpts()).catch(() => {});
            const isReturn = anim.pilotId === 'launch' || anim.pilotId === 'duty-pilot';
            if (isReturn && returnRouteOrigRef.current) {
              const remaining = Math.max(0, anim.totalDistance - anim.distanceTraveled);
              const fraction = remaining / anim.totalDistance;
              const remainCoords = anim.coords.slice(i);
              remainCoords[0] = [lat, lon];
              const orig = returnRouteOrigRef.current;
              setReturnRoute(prev => prev ? {
                ...prev, distanceKm: orig.distanceKm * fraction,
                durationMin: orig.durationMin * fraction, coords: remainCoords,
              } : null);
            }
            break;
          }
          cumDist += segLen;
        }
      }, 1000);

      return () => {
        clearInterval(animInterval);
        if (demoCompleteTimeoutRef.current) { clearTimeout(demoCompleteTimeoutRef.current); demoCompleteTimeoutRef.current = null; }
      };
    }

    function sendDriverPosition() {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const newPos = { lat: pos.coords.latitude, lon: pos.coords.longitude };
          driverPosRef.current = newPos;
          setDriverPosState(newPos);
          api.post(`${apiBase}/retrievals/driver-position`, newPos, null, apiOpts()).catch(() => {});
        },
        () => {},
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
    sendDriverPosition();
    driverPosIntervalRef.current = setInterval(sendDriverPosition, 60000);
    return () => { if (driverPosIntervalRef.current) clearInterval(driverPosIntervalRef.current); };
  }, [token, pilot, mapHeaders, isDemo, fetchRetrievals]);

  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = 'hidden';
      const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsFullscreen(false); };
      window.addEventListener('keydown', handleKey);
      return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', handleKey); };
    } else { document.body.style.overflow = ''; }
  }, [isFullscreen]);

  useEffect(() => {
    if (!isDemo) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'demo-speed') {
        const multiplier = Number(event.data.multiplier);
        if (multiplier > 0) {
          demoSpeedRef.current = multiplier;
          const anim = demoRouteAnimRef.current;
          if (anim) anim.speed = anim.baseSpeed * multiplier;
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [isDemo]);

  useEffect(() => {
    if (!mapRef.current) return;
    const timer = setTimeout(() => mapRef.current?.invalidateSize(), 100);
    return () => clearTimeout(timer);
  }, [isFullscreen]);

  const handleClaim = async (pilotId: string, lat: number | null, lon: number | null) => {
    setActionLoading(pilotId);
    setActionError(null);
    try {
      await api.post(`${apiBase}/retrievals/claim/${pilotId}`, {}, null, apiOpts());
      await fetchRetrievals();
      if (isDemo && lat != null && lon != null) {
        const alreadyQueued = demoRouteQueueRef.current.some(q => q.pilotId === pilotId);
        if (!alreadyQueued) {
          demoRouteQueueRef.current.push({ pilotId, lat, lon });
          if (!demoRouteAnimRef.current) startDemoRouteToNext();
        }
      } else if (!isDemo && lat != null && lon != null) {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const url = isIOS
          ? `maps://maps.apple.com/?daddr=${lat},${lon}`
          : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
        window.open(url, '_blank');
      }
    } catch (e: unknown) { setActionError(e instanceof Error ? e.message : 'Network error'); }
    setActionLoading(null);
  };

  const handleUnclaim = async (pilotId: string) => {
    setActionLoading(pilotId);
    setActionError(null);
    try {
      await api.post(`${apiBase}/retrievals/unclaim/${pilotId}`, {}, null, apiOpts());
      if (isDemo) {
        demoRouteQueueRef.current = demoRouteQueueRef.current.filter(q => q.pilotId !== pilotId);
        if (demoRouteAnimRef.current?.pilotId === pilotId) {
          demoRouteAnimRef.current = null;
          if (demoCompleteTimeoutRef.current) { clearTimeout(demoCompleteTimeoutRef.current); demoCompleteTimeoutRef.current = null; }
          startDemoRouteToNext();
        }
      }
      await fetchRetrievals();
    } catch (e: unknown) { setActionError(e instanceof Error ? e.message : 'Network error'); }
    setActionLoading(null);
  };

  const handleComplete = async (pilotId: string) => {
    setActionLoading(pilotId);
    setActionError(null);
    try {
      await api.post(`${apiBase}/retrievals/complete/${pilotId}`, {}, null, apiOpts());
      await fetchRetrievals();
    } catch (e: unknown) { setActionError(e instanceof Error ? e.message : 'Network error'); }
    setActionLoading(null);
    setSelectedPilotId(null);
  };

  const zoomToDriver = useCallback(() => {
    if (!mapRef.current || !driverPosRef.current) return;
    mapRef.current.flyTo([driverPosRef.current.lat, driverPosRef.current.lon], 14, { duration: 0.5 });
  }, []);

  const zoomToPilot = useCallback(() => {
    if (!mapRef.current) return;
    const target = selectedPilotId
      ? retrievals.find(r => r.pilotId === selectedPilotId)
      : retrievals[0];
    if (target?.pilotLat != null && target?.pilotLon != null) {
      mapRef.current.flyTo([target.pilotLat, target.pilotLon], 14, { duration: 0.5 });
    }
  }, [selectedPilotId, retrievals]);

  const zoomToAll = useCallback(() => {
    if (!mapRef.current) return;
    const points: [number, number][] = [];
    livePilots.filter(p => !p.landed).forEach(p => points.push([p.lat, p.lon]));
    retrievals.filter(r => r.pilotLat != null && r.pilotLon != null).forEach(r => points.push([r.pilotLat!, r.pilotLon!]));
    if (driverPosRef.current) points.push([driverPosRef.current.lat, driverPosRef.current.lon]);
    if (points.length > 0) {
      const bounds = L.latLngBounds(points.map(p => L.latLng(p[0], p[1])));
      mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [livePilots, retrievals]);

  const navigateToTarget = useCallback(async (targetId: string, targetLat: number, targetLon: number) => {
    const from = driverPosRef.current;
    if (!from) return;
    setReturnTarget(targetId);
    const result = await fetchOSRMRoute(from, { lat: targetLat, lon: targetLon });
    if (result) {
      setReturnRoute({ pilotId: targetId, ...result });
      returnRouteOrigRef.current = { distanceKm: result.distanceKm, durationMin: result.durationMin };
      if (mapRef.current) {
        const points: [number, number][] = [[from.lat, from.lon], [targetLat, targetLon]];
        const bounds = L.latLngBounds(points.map(p => L.latLng(p[0], p[1])));
        mapRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
      }
      if (isDemo && !demoRouteAnimRef.current) {
        const segDists = computeSegmentDistances(result.coords);
        const totalDist = segDists.reduce((a, b) => a + b, 0);
        const baseSpeed = totalDist / (result.durationMin * 60);
        demoRouteAnimRef.current = {
          pilotId: targetId, coords: result.coords, segmentDistances: segDists,
          totalDistance: totalDist, distanceTraveled: 0, lastTick: Date.now(),
          baseSpeed, speed: baseSpeed * demoSpeedRef.current,
        };
      }
    }
  }, [isDemo]);

  const cancelReturnRoute = useCallback(() => {
    setReturnRoute(null);
    setReturnTarget(null);
    returnRouteOrigRef.current = null;
    if (demoRouteAnimRef.current && (demoRouteAnimRef.current.pilotId === 'launch' || demoRouteAnimRef.current.pilotId === 'duty-pilot')) {
      demoRouteAnimRef.current = null;
    }
  }, []);

  return {
    pilot, token, demoRole, isDemo, demoSession, apiBase,
    showLogin, setShowLogin,
    retrievals, livePilots,
    selectedPilotId, setSelectedPilotId,
    listCollapsed, setListCollapsed,
    actionLoading, actionError, setActionError,
    isFullscreen, setIsFullscreen,
    driverPosState, mapRef, zoomInRef, zoomOutRef,
    activeBasemap, setActiveBasemap,
    handleZoomIn, handleZoomOut,
    routes, composeTarget, setComposeTarget,
    dutyPilotPos, launchSite,
    returnRoute, returnTarget,
    handleClaim, handleUnclaim, handleComplete,
    zoomToDriver, zoomToPilot, zoomToAll,
    navigateToTarget, cancelReturnRoute,
    fetchRetrievals, fetchLivePilots,
    apiOpts, mapHeaders,
  };
}
