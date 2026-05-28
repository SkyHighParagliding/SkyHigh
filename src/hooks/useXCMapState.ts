import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSettings } from '@/contexts/SettingsContext';
import { usePilotAuth } from '@/contexts/PilotAuthContext';
import { useAuth } from '@/contexts/AuthContext';
import { useXCSites } from '@/hooks/api';
import { getDemoRole, DEMO_LAUNCH } from '@/lib/demoConfig';
import { useFlightTracker } from '@/hooks/useFlightTracker';
import { useProximityAlerts } from '@/hooks/useProximityAlerts';
import { useRetrievalStatus } from '@/hooks/useRetrievalStatus';
import { api } from '@/lib/apiClient';
import type { MapOrientation } from '@/components/XCMap';
import { cacheTilesForLocation } from '@/lib/tileCache';
import type { CacheProgress } from '@/lib/tileCache';
import { buildWindObservations } from '@/components/WindFieldLayer';
import type { WindFieldSettings } from '@/components/WindFieldLayer';

export interface XCSite {
  id: string;
  name: string;
  lat: number;
  lon: number;
  type?: string;
  windDir?: string;
  launchHeight?: string;
  status?: string;
  useLiveWeather?: string;
}

export interface WindData {
  windSpeed: number | null;
  windGust: number | null;
  direction: string | number | null;
  stale?: boolean;
}

export const DEFAULT_DISABLED_AIRSPACE = new Set([
  'RESTRICTED', 'DANGER', 'PROHIBITED', 'OTHER',
  'ALERT', 'WARNING', 'GLIDING_SECTOR', 'WAVE_WINDOW',
  'FIR', 'OCA', 'PROTECTED', 'TIZ',
]);

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function useXCMapState() {
  const { settings, loading: settingsLoading } = useSettings();
  const { pilot, token } = usePilotAuth();
  const { user: authUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const demoRole = useMemo(() => getDemoRole(), []);
  const isDemo = !!demoRole;
  const { data: sites = [], isLoading: loading } = useXCSites(!settingsLoading && settings.xcMapsEnabled);
  const [selectedSite, setSelectedSite] = useState<XCSite | null>(null);
  const [showAirspace, setShowAirspace] = useState(false);
  const [showZones, setShowZones] = useState(false);
  const [zoneData, setZoneData] = useState<GeoJSON.FeatureCollection | null>(null);
  const [zoneLoading, setZoneLoading] = useState(false);
  const [disabledZoneTypes, setDisabledZoneTypes] = useState<Set<string>>(new Set());
  const [showWindField, setShowWindField] = useState(false);
  const [altitudeFt, setAltitudeFt] = useState(0);
  const [disabledTypes, setDisabledTypes] = useState<Set<string>>(new Set(DEFAULT_DISABLED_AIRSPACE));
  const [windDataMap, setWindDataMap] = useState<Record<string, WindData>>({});
  const [tileCacheProgress, setTileCacheProgress] = useState<CacheProgress | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(() => {
    if (demoRole && demoRole.startsWith('pilot')) return true;
    return false;
  });
  const [mapOrientation, setMapOrientation] = useState<MapOrientation>('north-up');
  const [followPilot, setFollowPilot] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const {
    proximityThresholdFt, dismissedSectorIds, activeProximityIds, alertsDismissed,
    cycleThreshold, handleProximityEnter, handleProximityExit, handleActiveProximityIds,
    handleDismissAlerts, setAlertsDismissed, setDismissedSectorIds,
  } = useProximityAlerts(pilot?.id ?? null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);

  const tracker = useFlightTracker();

  const {
    retrievalStatus, showDriverOnMap, setShowDriverOnMap,
    retrievalDrawerOpen, setRetrievalDrawerOpen, drawerDragRef,
    inFlightRetrievalRequested, handleRequestRetrieval, handlePilotPickedUp,
  } = useRetrievalStatus({
    pilotId: pilot?.id ?? null,
    pilotToken: token,
    trackerState: tracker.state,
    trackerCurrentPosition: tracker.currentPosition,
    finishRetrieval: tracker.finishRetrieval,
    isDemo,
    demoRole,
  });

  const [composeTarget, setComposeTarget] = useState<{ pilotId: string; name: string } | null>(null);

  useEffect(() => {
    const handleCompose = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.pilotId && detail?.name) {
        setComposeTarget({ pilotId: detail.pilotId, name: detail.name });
      }
    };
    const handleReply = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.pilotId && detail?.name) {
        setComposeTarget({ pilotId: detail.pilotId, name: detail.name });
      }
    };
    window.addEventListener('map-compose-message', handleCompose);
    window.addEventListener('map-message-reply', handleReply);
    return () => {
      window.removeEventListener('map-compose-message', handleCompose);
      window.removeEventListener('map-message-reply', handleReply);
    };
  }, []);

  useEffect(() => {
    if (!isDemo) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'demo-auto') {
        const demoSite = {
          id: 'demo-mt-elliot',
          name: DEMO_LAUNCH.siteName,
          lat: DEMO_LAUNCH.lat,
          lon: DEMO_LAUNCH.lon,
        };
        setSelectedSite(demoSite as XCSite);
        setFollowPilot(true);
        setMapOrientation('north-up');
        tracker.startTracking(true, demoSite.id, demoSite.name);
      } else if (event.data?.type === 'demo-stop') {
        if (tracker.state === 'recording' || tracker.state === 'pre-recording') {
          tracker.stopTracking();
        }
      } else if (event.data?.type === 'demo-speed') {
        const multiplier = Number(event.data.multiplier);
        if (multiplier > 0) {
          tracker.setDemoSpeed(multiplier);
        }
      } else if (event.data?.type === 'demo-settings') {
        tracker.setDemoSettings(event.data.settings);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [isDemo, tracker.state]);

  useEffect(() => {
    if (!isDemo || !demoRole) return;
    const sendStatus = () => {
      const simPhase = tracker.demoSimPhase || 'waiting';
      try {
        window.parent?.postMessage({
          type: 'demo-status',
          role: demoRole,
          trackerState: tracker.state,
          simPhase,
        }, '*');
      } catch {}
    };
    sendStatus();
    const interval = setInterval(sendStatus, 1500);
    return () => clearInterval(interval);
  }, [isDemo, demoRole, tracker.state, tracker.demoSimPhase]);

  useEffect(() => {
    if (isDemo) {
      setUserLocation({ lat: DEMO_LAUNCH.lat, lon: DEMO_LAUNCH.lon });
      return;
    }
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [isDemo]);

  const [showPilotSettings, setShowPilotSettings] = useState(false);

  useEffect(() => {
    if (tracker.state === 'recording') {
      const altMeters = tracker.liveStats.smoothedAltitude || tracker.currentPosition?.altitude || 0;
      const altFeet = Math.round(altMeters * 3.28084);
      setAltitudeFt(Math.max(0, altFeet));
    }
  }, [tracker.state, tracker.liveStats.smoothedAltitude, tracker.currentPosition?.altitude]);

  const prevTrackerStateRef = useRef(tracker.state);
  useEffect(() => {
    if (tracker.state === 'recording' && prevTrackerStateRef.current !== 'recording') {
      if (settings.xcMapAirspaceButtonEnabled !== false) {
        setShowAirspace(true);
      }
      setAlertsDismissed(false);
      setDismissedSectorIds(new Set());
    }
    prevTrackerStateRef.current = tracker.state;
  }, [tracker.state]);

  const supportsNativeFullscreen = typeof document.documentElement?.requestFullscreen === 'function';

  const toggleFullscreen = useCallback(async () => {
    if (isDemo && demoRole) {
      try {
        window.parent?.postMessage({ type: 'demo-fullscreen', role: demoRole }, '*');
      } catch {}
      setIsFullscreen(prev => !prev);
      setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
      return;
    }

    if (!mapContainerRef.current) return;

    if (supportsNativeFullscreen) {
      try {
        if (document.fullscreenElement === mapContainerRef.current) {
          await document.exitFullscreen();
        } else {
          await mapContainerRef.current.requestFullscreen();
        }
        return;
      } catch {
      }
    }

    setIsFullscreen(prev => {
      const next = !prev;
      if (next) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = '';
      }
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 50);
      return next;
    });
  }, [supportsNativeFullscreen, isDemo, demoRole]);

  useEffect(() => {
    if (!supportsNativeFullscreen) return;
    const handler = () => {
      setIsFullscreen(document.fullscreenElement === mapContainerRef.current);
      if (!document.fullscreenElement) {
        document.body.style.overflow = '';
      }
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, [supportsNativeFullscreen]);

  useEffect(() => {
    return () => {
      document.body.style.overflow = '';
    };
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

    const onVisibility = () => {
      if (document.visibilityState === 'visible') acquire();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVisibility);
      wl?.release().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!settings.flightTrackerEnabled || !selectedSite) return;
    if (!('caches' in window)) return;

    const radius = Number(settings.ftOfflineTileRadius) || 50;
    const zMin = Number(settings.ftOfflineZoomMin) || 8;
    const zMax = Number(settings.ftOfflineZoomMax) || 13;
    let layers: string[] = ['streets'];
    try { layers = JSON.parse(settings.ftOfflineLayers || '["streets"]'); } catch {}

    cacheTilesForLocation(selectedSite.lat, selectedSite.lon, radius, zMin, zMax, layers, (p) => {
      setTileCacheProgress(p);
    }).catch(() => {});
  }, [selectedSite, settings.flightTrackerEnabled, settings.ftOfflineTileRadius, settings.ftOfflineZoomMin, settings.ftOfflineZoomMax, settings.ftOfflineLayers]);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw-tiles.js').catch(() => {});
    }
  }, []);

  const ringLegend = useMemo(() => {
    const DEFAULT = [10, 20, 50, 100];
    let distances = DEFAULT;
    if (settings.xcDistanceRings) {
      try {
        const p = JSON.parse(settings.xcDistanceRings);
        if (Array.isArray(p) && p.length > 0) distances = p.filter((n: unknown) => typeof n === "number" && n > 0 && n <= 500).slice(0, 20);
      } catch {}
    }
    const sorted = [...distances].sort((a, b) => a - b);
    return sorted.map((km, i) => {
      const opacity = 0.5 - (i / sorted.length) * 0.3;
      return { label: `${km} km`, color: `rgba(0,122,255,${opacity.toFixed(2)})` };
    });
  }, [settings.xcDistanceRings]);
  const [selectorOpen, setSelectorOpen] = useState(false);

  useEffect(() => {
    if (!settingsLoading && !settings.xcMapsEnabled) {
      navigate('/', { replace: true });
    }
  }, [settingsLoading, settings.xcMapsEnabled, navigate]);

  const sortedSites = useMemo(() => {
    if (!userLocation || sites.length === 0) return sites;
    return [...sites].sort((a, b) => {
      const distA = haversineKm(userLocation.lat, userLocation.lon, a.lat, a.lon);
      const distB = haversineKm(userLocation.lat, userLocation.lon, b.lat, b.lon);
      return distA - distB;
    });
  }, [sites, userLocation]);

  const siteIdFromUrl = searchParams.get('site');
  const appliedSiteIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (sortedSites.length === 0) return;

    if (siteIdFromUrl && siteIdFromUrl !== appliedSiteIdRef.current) {
      const match = sortedSites.find(s => s.id === siteIdFromUrl);
      if (match) {
        setSelectedSite(match);
        appliedSiteIdRef.current = siteIdFromUrl;
        return;
      }
    }

    if (!selectedSite) {
      setSelectedSite(sortedSites[0]);
    }
  }, [sortedSites, selectedSite, siteIdFromUrl]);

  useEffect(() => {
    if (sites.length === 0) return;

    const liveSites = sites.filter((s) => s.useLiveWeather === 'true');
    if (liveSites.length === 0) return;

    function fetchWindData() {
      if (document.hidden) return;
      liveSites.forEach((site) => {
        api.get<Record<string, unknown>>(`/api/weather/${site.id}`)
          .then((data) => {
            if (data.type === 'live') {
              setWindDataMap((prev) => ({
                ...prev,
                [site.id]: {
                  windSpeed: (data.windSpeed as number) ?? null,
                  windGust: (data.windGust as number) ?? null,
                  direction: (data.direction as number) ?? null,
                  stale: false,
                },
              }));
            } else {
              setWindDataMap((prev) => ({
                ...prev,
                [site.id]: { windSpeed: null, windGust: null, direction: null, stale: true },
              }));
            }
          })
          .catch(() => {
            setWindDataMap((prev) => ({
              ...prev,
              [site.id]: { windSpeed: null, windGust: null, direction: null, stale: true },
            }));
          });
      });
    }

    fetchWindData();
    const interval = setInterval(fetchWindData, 60000);
    return () => clearInterval(interval);
  }, [sites]);

  useEffect(() => {
    if (showZones && !zoneData && !zoneLoading) {
      setZoneLoading(true);
      api.get<GeoJSON.FeatureCollection>('/api/sites/xc/zones')
        .then((data) => {
          if (data?.type === 'FeatureCollection' && Array.isArray(data.features)) {
            setZoneData(data);
          }
        })
        .catch(() => {})
        .finally(() => setZoneLoading(false));
    }
  }, [showZones, zoneData, zoneLoading]);

  const windObservations = useMemo(() => buildWindObservations(sites, windDataMap), [sites, windDataMap]);

  const windFieldSettings = useMemo((): Partial<WindFieldSettings> => {
    const p = (v: string | undefined, fallback: number) => { const n = parseFloat(v || ''); return isNaN(n) ? fallback : n; };
    return {
      particleCount: p(settings.wfParticleCount, 1200),
      trailLength: p(settings.wfTrailLength, 12),
      maxInfluenceKm: p(settings.wfMaxInfluenceKm, 120),
      fadeStartKm: p(settings.wfFadeStartKm, 80),
      idwPower: p(settings.wfIdwPower, 2),
      speedScale: p(settings.wfSpeedScale, 0.4),
      lineWidth: p(settings.wfLineWidth, 1.5),
      opacity: p(settings.wfOpacity, 0.7),
      maxParticleSpeed: p(settings.wfMaxParticleSpeed, 4),
      particleMaxAge: p(settings.wfParticleMaxAge, 180),
    };
  }, [settings.wfParticleCount, settings.wfTrailLength, settings.wfMaxInfluenceKm, settings.wfFadeStartKm, settings.wfIdwPower, settings.wfSpeedScale, settings.wfLineWidth, settings.wfOpacity, settings.wfMaxParticleSpeed, settings.wfParticleMaxAge]);

  return {
    settings, settingsLoading, pilot, token, authUser, navigate, searchParams,
    demoRole, isDemo, sites, loading,
    selectedSite, setSelectedSite,
    showAirspace, setShowAirspace,
    showZones, setShowZones,
    zoneData, zoneLoading,
    disabledZoneTypes, setDisabledZoneTypes,
    showWindField, setShowWindField,
    altitudeFt, setAltitudeFt,
    disabledTypes, setDisabledTypes,
    windDataMap,
    tileCacheProgress,
    isFullscreen, setIsFullscreen,
    mapOrientation, setMapOrientation,
    followPilot, setFollowPilot,
    mapContainerRef,
    proximityThresholdFt, dismissedSectorIds, activeProximityIds, alertsDismissed,
    cycleThreshold, handleProximityEnter, handleProximityExit, handleActiveProximityIds,
    handleDismissAlerts, setAlertsDismissed, setDismissedSectorIds,
    userLocation,
    tracker,
    retrievalStatus, showDriverOnMap, setShowDriverOnMap,
    retrievalDrawerOpen, setRetrievalDrawerOpen, drawerDragRef,
    inFlightRetrievalRequested, handleRequestRetrieval, handlePilotPickedUp,
    composeTarget, setComposeTarget,
    showPilotSettings, setShowPilotSettings,
    toggleFullscreen,
    ringLegend,
    selectorOpen, setSelectorOpen,
    sortedSites,
    windObservations,
    windFieldSettings,
  };
}
