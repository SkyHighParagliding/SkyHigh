import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/apiClient';

interface RetrievalStatusData {
  active: boolean;
  status?: string;
  driverName?: string;
  driverId?: string;
  driverLat?: number;
  driverLon?: number;
  etaMinutes?: number | null;
}

interface UseRetrievalStatusOptions {
  pilotId: string | null;
  pilotToken: string | null;
  trackerState: string;
  trackerCurrentPosition: { lat: number; lon: number } | null;
  finishRetrieval: () => void;
  isDemo: boolean;
  demoRole: string | null;
}

export function useRetrievalStatus({
  pilotId,
  pilotToken,
  trackerState,
  trackerCurrentPosition,
  finishRetrieval,
  isDemo,
  demoRole,
}: UseRetrievalStatusOptions) {
  const [retrievalStatus, setRetrievalStatus] = useState<RetrievalStatusData | null>(null);
  const [showDriverOnMap, setShowDriverOnMap] = useState(true);
  const [retrievalDrawerOpen, setRetrievalDrawerOpen] = useState(false);
  const drawerDragRef = useRef<{ startY: number; startOpen: boolean } | null>(null);
  const [inFlightRetrievalRequested, setInFlightRetrievalRequested] = useState(false);
  const inFlightRetrievalPositionRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const trackerPositionRef = useRef(trackerCurrentPosition);
  trackerPositionRef.current = trackerCurrentPosition;

  const demoSession = isDemo ? new URLSearchParams(window.location.search).get('demoSession') : null;
  const demoApiOpts = useCallback((): { headers: Record<string, string> } | undefined => {
    if (!isDemo) return undefined;
    const h: Record<string, string> = { 'x-demo': 'true' };
    if (demoSession) h['x-demo-session'] = demoSession;
    return { headers: h };
  }, [isDemo, demoSession]);

  const handleRequestRetrieval = useCallback(async () => {
    if (!pilotId || !pilotToken || inFlightRetrievalRequested) return;
    const pos = trackerCurrentPosition;
    try {
      await api.post(`/api/retrievals/request`, {
        lat: pos?.lat,
        lon: pos?.lon,
      }, pilotToken, demoApiOpts());
      setInFlightRetrievalRequested(true);
      setRetrievalStatus({ active: true, status: 'awaiting' });
      if (inFlightRetrievalPositionRef.current) clearInterval(inFlightRetrievalPositionRef.current);
      inFlightRetrievalPositionRef.current = setInterval(() => {
        const p = trackerPositionRef.current;
        if (p && navigator.onLine && pilotToken) {
          api.post(`/api/retrievals/pilot-position`, { lat: p.lat, lon: p.lon }, pilotToken, demoApiOpts()).catch(() => {});
        }
      }, 15000);
    } catch {}
  }, [pilotId, pilotToken, inFlightRetrievalRequested, trackerCurrentPosition, demoApiOpts]);

  useEffect(() => {
    return () => {
      if (inFlightRetrievalPositionRef.current) {
        clearInterval(inFlightRetrievalPositionRef.current);
        inFlightRetrievalPositionRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (trackerState !== 'recording' && trackerState !== 'pre-recording' && trackerState !== 'stopping') {
      setInFlightRetrievalRequested(false);
      if (inFlightRetrievalPositionRef.current) {
        clearInterval(inFlightRetrievalPositionRef.current);
        inFlightRetrievalPositionRef.current = null;
      }
    }
  }, [trackerState]);

  useEffect(() => {
    if (!pilotId || !pilotToken) return;

    let eventSource: EventSource | null = null;
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;
    let active = true;

    const mergedOpts = (extra?: Record<string, string>): { headers: Record<string, string> } => {
      const demoH = demoApiOpts();
      return { headers: { ...extra, ...(demoH?.headers || {}) } };
    };

    const fetchStatus = async () => {
      try {
        const data = await api.get<any>(`/api/retrievals/status/${pilotId}`, null, mergedOpts({ 'x-pilot-token': pilotToken! }));
        if (!active) return;
        setRetrievalStatus(data);
        if (!data.active && trackerState === 'retrieving') {
          finishRetrieval();
        }
      } catch {}
    };

    fetchStatus();

    if (isDemo) {
      const demoSession = new URLSearchParams(window.location.search).get('demoSession');
      const demoToken = `demo-token-${(demoRole || '').replace(/(\d+)/, '-$1')}`;
      const sseUrl = `/api/retrievals/events?demo=true&demoSession=${encodeURIComponent(demoSession || '')}&pilotToken=${encodeURIComponent(demoToken)}`;
      try {
        eventSource = new EventSource(sseUrl);
        eventSource.onopen = () => {
          if (!active) return;
          if (fallbackInterval) {
            clearInterval(fallbackInterval);
            fallbackInterval = null;
          }
        };
        eventSource.onmessage = (event) => {
          if (!active) return;
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'retrievals' && Array.isArray(msg.data)) {
              const mine = msg.data.find((r: any) => r.pilotId === pilotId);
              if (mine) {
                setRetrievalStatus({
                  active: true,
                  status: mine.status,
                  driverName: mine.driverName,
                  driverId: mine.driverId,
                  driverLat: mine.driverLat,
                  driverLon: mine.driverLon,
                  etaMinutes: mine.etaMinutes,
                });
              } else {
                setRetrievalStatus((prev) => {
                  if (prev?.active && trackerState === 'retrieving') {
                    finishRetrieval();
                  }
                  return { active: false };
                });
              }
            }
          } catch {}
        };
        eventSource.onerror = () => {
          if (!active) return;
          if (!fallbackInterval) {
            fetchStatus();
            fallbackInterval = setInterval(fetchStatus, 3000);
          }
        };
      } catch {
        fallbackInterval = setInterval(fetchStatus, 3000);
      }
    } else {
      const sseUrl = `/api/retrievals/events?role=pilot&pilotToken=${encodeURIComponent(pilotToken)}`;
      try {
        eventSource = new EventSource(sseUrl);
        eventSource.onopen = () => {
          if (!active) return;
          if (fallbackInterval) {
            clearInterval(fallbackInterval);
            fallbackInterval = null;
          }
        };
        eventSource.onmessage = (event) => {
          if (!active) return;
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'retrieval-status' && msg.data) {
              setRetrievalStatus(msg.data);
              if (!msg.data.active && trackerState === 'retrieving') {
                finishRetrieval();
              }
            }
          } catch {}
        };
        eventSource.onerror = () => {
          if (!active) return;
          if (!fallbackInterval) {
            fetchStatus();
            fallbackInterval = setInterval(fetchStatus, 5000);
          }
        };
      } catch {
        fallbackInterval = setInterval(fetchStatus, 5000);
      }
    }

    return () => {
      active = false;
      if (eventSource) { eventSource.close(); eventSource = null; }
      if (fallbackInterval) { clearInterval(fallbackInterval); fallbackInterval = null; }
    };
  }, [pilotId, pilotToken, trackerState, isDemo, demoRole, inFlightRetrievalRequested, finishRetrieval, demoApiOpts]);

  useEffect(() => {
    if (!pilotId || !pilotToken) return;
    if (!retrievalStatus?.active) return;
    if (trackerState === 'retrieving') return;

    const sendPos = () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const dH = demoApiOpts();
          api.post('/api/retrievals/pilot-position', { lat: pos.coords.latitude, lon: pos.coords.longitude }, null, { headers: { 'x-pilot-token': pilotToken, ...(dH?.headers || {}) } }).catch(() => {});
        },
        () => {},
        { enableHighAccuracy: true, timeout: 10000 }
      );
    };

    sendPos();
    const interval = setInterval(sendPos, 60000);
    return () => clearInterval(interval);
  }, [pilotId, pilotToken, retrievalStatus?.active, trackerState, demoApiOpts]);

  const handlePilotPickedUp = useCallback(async () => {
    if (!pilotId || !pilotToken) return;
    try {
      const dH = demoApiOpts();
      await api.post(`/api/retrievals/complete/${pilotId}`, {}, null, { headers: { 'x-pilot-token': pilotToken, ...(dH?.headers || {}) } });
      setRetrievalStatus({ active: false });
      finishRetrieval();
    } catch {}
  }, [pilotId, pilotToken, finishRetrieval, demoApiOpts]);

  return {
    retrievalStatus,
    showDriverOnMap,
    setShowDriverOnMap,
    retrievalDrawerOpen,
    setRetrievalDrawerOpen,
    drawerDragRef,
    inFlightRetrievalRequested,
    handleRequestRetrieval,
    handlePilotPickedUp,
  };
}
