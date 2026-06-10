import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { usePilotAuth } from "@/contexts/PilotAuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import {
  saveFlight,
  saveBreadcrumb,
  getFlightBreadcrumbs,
  getUnsyncedBreadcrumbs,
  saveBreadcrumbs,
  LocalFlight,
  Breadcrumb,
} from "@/lib/flightDb";
import { getDemoRole, generateSimConfig } from "@/lib/demoConfig";
import { DemoSimulation, type SimConfig, type DemoSettings } from "@/lib/demoSimulation";

interface PressureSensorReading {
  pressure: number;
  start(): void;
  stop(): void;
  addEventListener(type: string, listener: () => void): void;
}

interface PressureSensorConstructor {
  new (options: { frequency: number }): PressureSensorReading;
}

declare global {
  interface Window {
    Barometer?: PressureSensorConstructor;
    PressureSensor?: PressureSensorConstructor;
  }
}

function generateId() {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
}

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type TrackerState =
  | "idle"
  | "pre-recording"
  | "recording"
  | "stopping"
  | "completed"
  | "retrieving";

export interface FlightStats {
  duration: number;
  maxAltitude: number;
  maxSpeed: number;
  totalDistance: number;
  avgSpeed: number;
  altitudeGain: number;
  altitudeLoss: number;
  breadcrumbCount: number;
}

export interface LiveStats {
  altitude: number;
  speed: number;
  heading: number;
  totalDistance: number;
  elapsed: number;
  breadcrumbCount: number;
  smoothedAltitude: number;
  verticalSpeed: number;
  barometerActive: boolean;
}

interface LivePilot {
  pilotId: string;
  firstName: string;
  lat: number;
  lon: number;
  altitude: number;
  speed: number;
  heading: number;
  landed?: boolean;
}

export function useFlightTracker() {
  const { pilot, token: pilotToken } = usePilotAuth();
  const { settings } = useSettings();
  const demoRole = useMemo(() => getDemoRole(), []);
  const isDemo = !!demoRole;
  const apiBase = '/api';
  const demoSession = useMemo(() => isDemo ? new URLSearchParams(window.location.search).get('demoSession') : null, [isDemo]);
  const demoHeaders = useCallback((extra?: Record<string, string>): Record<string, string> => {
    const h: Record<string, string> = { ...extra };
    if (isDemo) h['x-demo'] = 'true';
    if (demoSession) h['x-demo-session'] = demoSession;
    return h;
  }, [isDemo, demoSession]);
  const demoSimRef = useRef<DemoSimulation | null>(null);
  const demoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const demoBreadcrumbsRef = useRef<Breadcrumb[]>([]);
  const demoFlightRef = useRef<LocalFlight | null>(null);
  const demoSpeedRef = useRef(1);

  const [state, setState] = useState<TrackerState>("idle");
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const [liveStats, setLiveStats] = useState<LiveStats>({
    altitude: 0,
    speed: 0,
    heading: 0,
    totalDistance: 0,
    elapsed: 0,
    breadcrumbCount: 0,
    smoothedAltitude: 0,
    verticalSpeed: 0,
    barometerActive: false,
  });
  const [flightStats, setFlightStats] = useState<FlightStats | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [error, setError] = useState<string | null>(null);
  const [currentPosition, setCurrentPosition] = useState<{ lat: number; lon: number; altitude: number; speed: number; heading: number } | null>(null);
  const [livePilots, setLivePilots] = useState<LivePilot[]>([]);

  const flightRef = useRef<LocalFlight | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const preBufferRef = useRef<Breadcrumb[]>([]);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const totalDistRef = useRef(0);
  const lastPosRef = useRef<{ lat: number; lon: number } | null>(null);
  const altGainRef = useRef(0);
  const altLossRef = useRef(0);
  const maxAltRef = useRef(0);
  const maxSpeedRef = useRef(0);
  const lastAltRef = useRef<number | null>(null);
  const autoStopCounterRef = useRef(0);
  const pendingSiteRef = useRef<{ siteId?: string; siteName?: string }>({});
  const livePilotIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentPositionRef = useRef<{ lat: number; lon: number; altitude: number; speed: number; heading: number; verticalSpeed?: number } | null>(null);

  const addBreadcrumbRef = useRef<(pos: GeolocationPosition) => void>(() => {});
  const stopTrackingRef = useRef<() => Promise<void>>(async () => {});
  const pendingCrumbsRef = useRef<Breadcrumb[]>([]);
  const crumbFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fullTrailRef = useRef<Breadcrumb[]>([]);
  const liveStatsRef = useRef<LiveStats>({
    altitude: 0, speed: 0, heading: 0, totalDistance: 0,
    elapsed: 0, breadcrumbCount: 0, smoothedAltitude: 0,
    verticalSpeed: 0, barometerActive: false,
  });
  const statsFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const smoothedAltRef = useRef(0);
  const verticalSpeedRef = useRef(0);
  const lastAltTimeRef = useRef<number>(0);
  const barometerRawRef = useRef<number | null>(null);
  const barometerOffsetRef = useRef<number | null>(null);
  const barometerSensorRef = useRef<PressureSensorReading | null>(null);
  const barometerActiveRef = useRef(false);
  const barometerCalibCountRef = useRef(0);
  const barometerCalibSumRef = useRef(0);

  const parseNum = (v: string | undefined, fallback: number) => {
    if (v === undefined || v === "") return fallback;
    const n = Number(v);
    return isNaN(n) ? fallback : n;
  };

  const emaAlphaRef = useRef(0.3);
  const vspeedAlphaRef = useRef(0.2);
  const baroCalibSamplesRef = useRef(5);
  const baroMaxDivergenceRef = useRef(120);
  const baroFusionWeightRef = useRef(0.7);

  emaAlphaRef.current = parseNum(settings.ftEmaAlpha, 0.3);
  vspeedAlphaRef.current = parseNum(settings.ftVspeedAlpha, 0.2);
  const BARO_SEA_LEVEL_HPA = 1013.25;
  baroCalibSamplesRef.current = parseNum(settings.ftBaroCalibSamples, 5);
  baroMaxDivergenceRef.current = parseNum(settings.ftBaroMaxDivergence, 120);
  baroFusionWeightRef.current = parseNum(settings.ftBaroFusionWeight, 0.7);

  const gpsInterval = Number(settings.ftGpsInterval) || 3;
  const autoStartSpeed = Number(settings.ftAutoStartSpeed) || 15;
  const autoStartAltitude = Number(settings.ftAutoStartAltitude) || 20;
  const autoStopSpeed = Number(settings.ftAutoStopSpeed) || 3;
  const autoStopDuration = Number(settings.ftAutoStopDuration) || 30;
  const autoStopVerticalSpeed = Number(settings.ftAutoStopVerticalSpeed) || 0.5;
  const preRecordBuffer = Number(settings.ftPreRecordBuffer) || 15;
  const crumbFlushInterval = Math.max(1, Number(settings.ftCrumbFlushInterval) || 3) * 1000;
  const crumbWindowSize = Math.max(20, Number(settings.ftCrumbWindowSize) || 200);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (state !== 'recording' && state !== 'pre-recording') {
      if (barometerSensorRef.current) {
        try { barometerSensorRef.current.stop(); } catch {}
        barometerSensorRef.current = null;
      }
      barometerActiveRef.current = false;
      barometerRawRef.current = null;
      barometerOffsetRef.current = null;
      return;
    }

    const SensorClass = window.Barometer || window.PressureSensor;
    if (!SensorClass) return;

    try {
      const sensor = new SensorClass({ frequency: 2 });
      sensor.addEventListener('reading', () => {
        const pressureHpa = sensor.pressure;
        if (typeof pressureHpa === 'number' && pressureHpa > 0) {
          const pressureAlt = 44330 * (1 - Math.pow(pressureHpa / BARO_SEA_LEVEL_HPA, 1 / 5.255));
          barometerRawRef.current = pressureAlt;
        }
      });
      sensor.addEventListener('error', () => {
        barometerActiveRef.current = false;
        barometerRawRef.current = null;
        barometerOffsetRef.current = null;
      });
      sensor.start();
      barometerSensorRef.current = sensor;
    } catch {
      barometerActiveRef.current = false;
    }

    return () => {
      if (barometerSensorRef.current) {
        try { barometerSensorRef.current.stop(); } catch {}
        barometerSensorRef.current = null;
      }
    };
  }, [state]);

  const computeSmoothedAltitude = useCallback((rawGpsAltitude: number, timestamp: number) => {
    let fusedAlt = rawGpsAltitude;

    if (barometerRawRef.current !== null) {
      if (barometerOffsetRef.current === null) {
        barometerCalibCountRef.current += 1;
        barometerCalibSumRef.current += (rawGpsAltitude - barometerRawRef.current);
        if (barometerCalibCountRef.current >= baroCalibSamplesRef.current) {
          barometerOffsetRef.current = barometerCalibSumRef.current / barometerCalibCountRef.current;
          barometerActiveRef.current = true;
        }
      }

      if (barometerOffsetRef.current !== null) {
        const correctedBaroAlt = barometerRawRef.current + barometerOffsetRef.current;
        const divergence = Math.abs(correctedBaroAlt - rawGpsAltitude);

        if (divergence < baroMaxDivergenceRef.current) {
          fusedAlt = baroFusionWeightRef.current * correctedBaroAlt + (1 - baroFusionWeightRef.current) * rawGpsAltitude;
          barometerActiveRef.current = true;
        } else {
          barometerActiveRef.current = false;
        }
      }
    }

    const prev = smoothedAltRef.current;
    if (prev === 0 && lastAltTimeRef.current === 0) {
      smoothedAltRef.current = fusedAlt;
    } else {
      smoothedAltRef.current = emaAlphaRef.current * fusedAlt + (1 - emaAlphaRef.current) * prev;
    }

    const dt = lastAltTimeRef.current > 0 ? (timestamp - lastAltTimeRef.current) / 1000 : 0;
    if (dt > 0 && dt < 30) {
      const rawVspeed = (smoothedAltRef.current - prev) / dt;
      verticalSpeedRef.current = vspeedAlphaRef.current * rawVspeed + (1 - vspeedAlphaRef.current) * verticalSpeedRef.current;
    }
    lastAltTimeRef.current = timestamp;

    return { smoothedAltitude: smoothedAltRef.current, verticalSpeed: verticalSpeedRef.current };
  }, []);

  const addBreadcrumb = useCallback(
    async (pos: GeolocationPosition) => {
      const crumb: Breadcrumb = {
        timestamp: pos.timestamp,
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        altitude: pos.coords.altitude || 0,
        speed: pos.coords.speed ? pos.coords.speed * 3.6 : 0,
        heading: pos.coords.heading || 0,
      };

      const posData = { lat: crumb.lat, lon: crumb.lon, altitude: crumb.altitude, speed: crumb.speed, heading: crumb.heading, verticalSpeed: verticalSpeedRef.current };
      currentPositionRef.current = posData;

      if (state === "pre-recording") {
        const buf = preBufferRef.current;
        buf.push(crumb);
        const cutoff = Date.now() - preRecordBuffer * 1000;
        preBufferRef.current = buf.filter((b) => b.timestamp >= cutoff);

        const speedExceeded = crumb.speed >= autoStartSpeed;
        const firstAlt = buf.length > 0 ? buf[0].altitude : crumb.altitude;
        const altChange = Math.abs(crumb.altitude - firstAlt);
        const altExceeded = altChange >= autoStartAltitude;

        if (speedExceeded || altExceeded) {
          const { siteId, siteName } = pendingSiteRef.current;
          const flight: LocalFlight = {
            id: generateId(),
            pilotId: pilot?.id,
            siteId,
            siteName,
            startedAt: Date.now(),
            status: "recording",
            lastSyncedTimestamp: 0,
          };
          flightRef.current = flight;
          if (isDemo) {
            demoFlightRef.current = flight;
          } else {
            await saveFlight(flight);
          }

          const allCrumbs = [...preBufferRef.current];
          if (isDemo) {
            demoBreadcrumbsRef.current = allCrumbs;
          } else {
            await saveBreadcrumbs(flight.id, allCrumbs);
          }
          fullTrailRef.current = [...allCrumbs];
          setBreadcrumbs(allCrumbs);

          if (navigator.onLine) {
            try {
              const fHeaders: Record<string, string> = { "Content-Type": "application/json" };
              if (pilotToken) fHeaders["x-pilot-token"] = pilotToken;
              const resp = await fetch(`${apiBase}/flights`, {
                method: "POST",
                headers: demoHeaders(fHeaders),
                body: JSON.stringify({ siteId, siteName }),
              });
              if (resp.ok) {
                const data = await resp.json();
                flight.serverId = data.id;
                flight.sessionToken = data.sessionToken;
                if (!isDemo) await saveFlight(flight);
              }
            } catch {}
          }

          startTimeRef.current = allCrumbs[0]?.timestamp || Date.now();
          totalDistRef.current = 0;
          altGainRef.current = 0;
          altLossRef.current = 0;
          maxAltRef.current = crumb.altitude;
          maxSpeedRef.current = crumb.speed;
          lastPosRef.current = { lat: crumb.lat, lon: crumb.lon };
          lastAltRef.current = crumb.altitude;
          preBufferRef.current = [];
          setState("recording");
        }
        return;
      }

      if (state === "recording" && flightRef.current) {
        if (isDemo) {
          demoBreadcrumbsRef.current.push(crumb);
        } else {
          await saveBreadcrumb(flightRef.current.id, crumb);
        }
        fullTrailRef.current = [...fullTrailRef.current, crumb];
        pendingCrumbsRef.current.push(crumb);
        if (!crumbFlushTimerRef.current) {
          crumbFlushTimerRef.current = setTimeout(() => {
            const batch = pendingCrumbsRef.current;
            pendingCrumbsRef.current = [];
            crumbFlushTimerRef.current = null;
            if (batch.length > 0) {
              setBreadcrumbs((prev) => {
                const combined = prev.concat(batch);
                if (combined.length > crumbWindowSize) {
                  return combined.slice(combined.length - crumbWindowSize);
                }
                return combined;
              });
            }
          }, crumbFlushInterval);
        }

        if (lastPosRef.current) {
          const d = haversineDistance(
            lastPosRef.current.lat,
            lastPosRef.current.lon,
            crumb.lat,
            crumb.lon
          );
          totalDistRef.current += d;
        }
        lastPosRef.current = { lat: crumb.lat, lon: crumb.lon };

        if (crumb.altitude > maxAltRef.current) maxAltRef.current = crumb.altitude;
        if (crumb.speed > maxSpeedRef.current) maxSpeedRef.current = crumb.speed;

        if (lastAltRef.current !== null) {
          const altDiff = crumb.altitude - lastAltRef.current;
          if (altDiff > 0) altGainRef.current += altDiff;
          else altLossRef.current += Math.abs(altDiff);
        }
        lastAltRef.current = crumb.altitude;

        const smoothed = computeSmoothedAltitude(crumb.altitude, crumb.timestamp);

        liveStatsRef.current = {
          altitude: crumb.altitude,
          speed: crumb.speed,
          heading: crumb.heading,
          totalDistance: totalDistRef.current,
          elapsed: Date.now() - startTimeRef.current,
          breadcrumbCount: fullTrailRef.current.length + pendingCrumbsRef.current.length,
          smoothedAltitude: smoothed.smoothedAltitude,
          verticalSpeed: smoothed.verticalSpeed,
          barometerActive: barometerActiveRef.current,
        };
        if (!statsFlushTimerRef.current) {
          statsFlushTimerRef.current = setTimeout(() => {
            statsFlushTimerRef.current = null;
            setLiveStats({ ...liveStatsRef.current });
            if (currentPositionRef.current) {
              setCurrentPosition({ ...currentPositionRef.current });
            }
          }, 2000);
        }

        const absVspeed = Math.abs(verticalSpeedRef.current);
        const isStationary = crumb.speed < autoStopSpeed && absVspeed < autoStopVerticalSpeed;

        if (isStationary) {
          autoStopCounterRef.current += gpsInterval;
          if (autoStopCounterRef.current >= autoStopDuration) {
            stopTrackingRef.current();
          }
        } else {
          autoStopCounterRef.current = 0;
        }
      }
    },
    [state, pilot, pilotToken, autoStartSpeed, autoStartAltitude, autoStopSpeed, autoStopDuration, autoStopVerticalSpeed, gpsInterval, preRecordBuffer, computeSmoothedAltitude]
  );

  addBreadcrumbRef.current = addBreadcrumb;

  const syncToServer = useCallback(async () => {
    const flight = flightRef.current;
    if (!flight?.serverId || !navigator.onLine) return;

    try {
      let unsent: Breadcrumb[];
      if (isDemo) {
        unsent = demoBreadcrumbsRef.current.filter(c => c.timestamp > flight.lastSyncedTimestamp);
      } else {
        unsent = await getUnsyncedBreadcrumbs(flight.id, flight.lastSyncedTimestamp);
      }
      if (unsent.length === 0) return;

      const syncHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (pilotToken) syncHeaders["x-pilot-token"] = pilotToken;
      if (flight.sessionToken) syncHeaders["x-session-token"] = flight.sessionToken;

      const resp = await fetch(`${apiBase}/flights/${flight.serverId}/breadcrumbs`, {
        method: "POST",
        headers: demoHeaders(syncHeaders),
        body: JSON.stringify({ breadcrumbs: unsent }),
      });

      if (resp.ok) {
        flight.lastSyncedTimestamp = unsent[unsent.length - 1].timestamp;
        if (!isDemo) await saveFlight(flight);
      }
    } catch {}
  }, [pilotToken, isDemo, apiBase, demoHeaders]);

  const startTracking = useCallback(
    (autoStart: boolean, siteId?: string, siteName?: string) => {
      setError(null);
      setFlightStats(null);
      setBreadcrumbs([]);
      fullTrailRef.current = [];
      preBufferRef.current = [];
      totalDistRef.current = 0;
      altGainRef.current = 0;
      altLossRef.current = 0;
      maxAltRef.current = 0;
      maxSpeedRef.current = 0;
      lastPosRef.current = null;
      lastAltRef.current = null;
      autoStopCounterRef.current = 0;
      smoothedAltRef.current = 0;
      verticalSpeedRef.current = 0;
      lastAltTimeRef.current = 0;
      barometerOffsetRef.current = null;
      barometerCalibCountRef.current = 0;
      barometerCalibSumRef.current = 0;
      demoBreadcrumbsRef.current = [];

      const isDemoPilot = isDemo && demoRole?.startsWith('pilot');

      if (!isDemoPilot && !navigator.geolocation) {
        setError("Geolocation is not supported by your browser");
        return;
      }

      pendingSiteRef.current = { siteId, siteName };

      if (autoStart) {
        setState("pre-recording");
      } else {
        const flight: LocalFlight = {
          id: generateId(),
          pilotId: pilot?.id,
          siteId,
          siteName,
          startedAt: Date.now(),
          status: "recording",
          lastSyncedTimestamp: 0,
        };
        flightRef.current = flight;
        if (isDemo) {
          demoFlightRef.current = flight;
        } else {
          saveFlight(flight);
        }
        startTimeRef.current = Date.now();
        setState("recording");

        if (navigator.onLine) {
          const autoHeaders: Record<string, string> = { "Content-Type": "application/json" };
          if (pilotToken) autoHeaders["x-pilot-token"] = pilotToken;
          fetch(`${apiBase}/flights`, {
            method: "POST",
            headers: demoHeaders(autoHeaders),
            body: JSON.stringify({ siteId, siteName }),
          })
            .then((r) => r.json())
            .then((data) => {
              flight.serverId = data.id;
              flight.sessionToken = data.sessionToken;
              if (!isDemo) saveFlight(flight);
            })
            .catch(() => {});
        }
      }

      if (isDemoPilot) {
        const pilotNum = parseInt(demoRole!.replace('pilot', '')) || 1;
        const simConfig: SimConfig = generateSimConfig(pilotNum);
        const sim = new DemoSimulation(simConfig);
        demoSimRef.current = sim;

        const baseInterval = 3000;
        const currentMultiplier = demoSpeedRef.current;
        const interval = Math.max(100, Math.round(baseInterval / currentMultiplier));
        const fireTick = () => {
          const pos = sim.tick();
          const mockPosition = {
            coords: {
              latitude: pos.lat,
              longitude: pos.lon,
              altitude: pos.altitude,
              accuracy: 5,
              altitudeAccuracy: 10,
              heading: pos.heading,
              speed: pos.speed / 3.6,
            },
            timestamp: Date.now(),
          } as GeolocationPosition;
          addBreadcrumbRef.current(mockPosition);
        };
        fireTick();
        demoIntervalRef.current = setInterval(fireTick, interval);
      } else {
        const watchId = navigator.geolocation.watchPosition(
          (pos) => addBreadcrumbRef.current(pos),
          (err) => {
            setError(`GPS error: ${err.message}`);
          },
          {
            enableHighAccuracy: true,
            maximumAge: gpsInterval * 1000,
            timeout: 10000,
          }
        );
        watchIdRef.current = watchId;
      }

      syncIntervalRef.current = setInterval(syncToServer, 10000);

      statsIntervalRef.current = setInterval(() => {
        if (startTimeRef.current > 0) {
          liveStatsRef.current = {
            ...liveStatsRef.current,
            elapsed: Date.now() - startTimeRef.current,
          };
          setLiveStats({ ...liveStatsRef.current });
        }
      }, 3000);
    },
    [pilot, pilotToken, addBreadcrumb, syncToServer, gpsInterval, isDemo, demoRole]
  );

  const retrievalWatchRef = useRef<number | null>(null);
  const retrievalIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTracking = useCallback(async () => {
    setState("stopping");

    if (crumbFlushTimerRef.current) {
      clearTimeout(crumbFlushTimerRef.current);
      crumbFlushTimerRef.current = null;
    }
    if (statsFlushTimerRef.current) {
      clearTimeout(statsFlushTimerRef.current);
      statsFlushTimerRef.current = null;
    }
    if (pendingCrumbsRef.current.length > 0) {
      setBreadcrumbs((prev) => [...prev, ...pendingCrumbsRef.current]);
      pendingCrumbsRef.current = [];
    }
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }
    if (demoIntervalRef.current) {
      clearInterval(demoIntervalRef.current);
      demoIntervalRef.current = null;
    }

    const flight = flightRef.current;
    if (flight) {
      let allCrumbs: Breadcrumb[];
      if (isDemo) {
        allCrumbs = demoBreadcrumbsRef.current;
      } else {
        allCrumbs = await getFlightBreadcrumbs(flight.id);
      }
      const duration = Date.now() - startTimeRef.current;
      const speeds = allCrumbs.map((c) => c.speed).filter((s) => s > 0);
      const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;

      const stats: FlightStats = {
        duration,
        maxAltitude: maxAltRef.current,
        maxSpeed: maxSpeedRef.current,
        totalDistance: totalDistRef.current,
        avgSpeed,
        altitudeGain: altGainRef.current,
        altitudeLoss: altLossRef.current,
        breadcrumbCount: allCrumbs.length,
      };
      setFlightStats(stats);

      flight.status = "completed";
      flight.endedAt = Date.now();
      if (!isDemo) await saveFlight(flight);

      if (flight.serverId && navigator.onLine) {
        try {
          await syncToServer();
          const endHeaders: Record<string, string> = { "Content-Type": "application/json" };
          if (pilotToken) endHeaders["x-pilot-token"] = pilotToken;
          if (flight.sessionToken) endHeaders["x-session-token"] = flight.sessionToken;
          const endResp = await fetch(`${apiBase}/flights/${flight.serverId}/end`, {
            method: "PUT",
            headers: demoHeaders(endHeaders),
            body: JSON.stringify({ stats }),
          });
          if (!endResp.ok && isDemo) {
            console.warn('[demo] flight end failed:', endResp.status, await endResp.text().catch(() => ''));
          }
        } catch (e) {
          if (isDemo) console.warn('[demo] flight end error:', e);
        }
      } else if (isDemo && !flight.serverId) {
        console.warn('[demo] flight has no serverId — skipping flight end call, relying on pilot-position fallback');
      }
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    if (pilotToken) {
      if (isDemo) {
        const pos = currentPositionRef.current;
        if (pos) {
          try {
            const resp = await fetch(`${apiBase}/retrievals/pilot-position`, {
              method: 'POST',
              headers: demoHeaders({ 'Content-Type': 'application/json', 'x-pilot-token': pilotToken }),
              body: JSON.stringify({ lat: pos.lat, lon: pos.lon }),
            });
            if (!resp.ok) {
              console.warn('[demo] pilot-position failed:', resp.status, await resp.text().catch(() => ''));
            }
          } catch (e) {
            console.warn('[demo] pilot-position error:', e);
          }
        }
        retrievalIntervalRef.current = setInterval(() => {
          const p = currentPositionRef.current;
          if (p && navigator.onLine && pilotToken) {
            fetch(`${apiBase}/retrievals/pilot-position`, {
              method: 'POST',
              headers: demoHeaders({ 'Content-Type': 'application/json', 'x-pilot-token': pilotToken }),
              body: JSON.stringify({ lat: p.lat, lon: p.lon }),
            }).catch(() => {});
          }
        }, 60000);
      } else if (navigator.geolocation) {
        const rWatch = navigator.geolocation.watchPosition(
          (pos) => {
            const posData = { lat: pos.coords.latitude, lon: pos.coords.longitude, altitude: pos.coords.altitude || 0, speed: pos.coords.speed ? pos.coords.speed * 3.6 : 0, heading: pos.coords.heading || 0 };
            setCurrentPosition(posData);
            currentPositionRef.current = posData;
          },
          () => {},
          { enableHighAccuracy: true, maximumAge: 60000, timeout: 10000 }
        );
        retrievalWatchRef.current = rWatch;

        const sendRetrievalPos = () => {
          const pos = currentPositionRef.current;
          if (pos && navigator.onLine && pilotToken) {
            fetch('/api/retrievals/pilot-position', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-pilot-token': pilotToken },
              body: JSON.stringify({ lat: pos.lat, lon: pos.lon }),
            }).catch(() => {});
          }
        };
        sendRetrievalPos();
        retrievalIntervalRef.current = setInterval(sendRetrievalPos, 60000);
      }
    }

    setState("retrieving");
  }, [pilotToken, syncToServer, isDemo, apiBase, demoHeaders]);
  stopTrackingRef.current = stopTracking;

  const finishRetrieval = useCallback(() => {
    if (retrievalWatchRef.current !== null) {
      navigator.geolocation.clearWatch(retrievalWatchRef.current);
      retrievalWatchRef.current = null;
    }
    if (retrievalIntervalRef.current) {
      clearInterval(retrievalIntervalRef.current);
      retrievalIntervalRef.current = null;
    }
    setState("completed");
  }, []);

  const reset = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }
    if (retrievalWatchRef.current !== null) {
      navigator.geolocation.clearWatch(retrievalWatchRef.current);
      retrievalWatchRef.current = null;
    }
    if (retrievalIntervalRef.current) {
      clearInterval(retrievalIntervalRef.current);
      retrievalIntervalRef.current = null;
    }
    if (demoIntervalRef.current) {
      clearInterval(demoIntervalRef.current);
      demoIntervalRef.current = null;
    }
    if (crumbFlushTimerRef.current) {
      clearTimeout(crumbFlushTimerRef.current);
      crumbFlushTimerRef.current = null;
    }
    if (statsFlushTimerRef.current) {
      clearTimeout(statsFlushTimerRef.current);
      statsFlushTimerRef.current = null;
    }
    pendingCrumbsRef.current = [];
    demoSimRef.current = null;
    demoBreadcrumbsRef.current = [];
    demoFlightRef.current = null;
    setState("idle");
    setBreadcrumbs([]);
    fullTrailRef.current = [];
    setFlightStats(null);
    setLiveStats({
      altitude: 0,
      speed: 0,
      heading: 0,
      totalDistance: 0,
      elapsed: 0,
      breadcrumbCount: 0,
      smoothedAltitude: 0,
      verticalSpeed: 0,
      barometerActive: false,
    });
    flightRef.current = null;
    smoothedAltRef.current = 0;
    verticalSpeedRef.current = 0;
    lastAltTimeRef.current = 0;
    barometerOffsetRef.current = null;
    barometerCalibCountRef.current = 0;
    barometerCalibSumRef.current = 0;
  }, []);

  useEffect(() => {
    const isActive = state === "recording" || state === "pre-recording";
    if (!isActive || !pilotToken) {
      if (livePilotIntervalRef.current) {
        clearInterval(livePilotIntervalRef.current);
        livePilotIntervalRef.current = null;
      }
      if (pilotToken && (state === "completed" || state === "idle")) {
        fetch(`${apiBase}/flights/position`, {
          method: "DELETE",
          headers: demoHeaders({ "x-pilot-token": pilotToken }),
        }).catch(() => {});
      }
      setLivePilots([]);
      return;
    }

    const tick = async () => {
      const pos = currentPositionRef.current;
      if (pos && navigator.onLine) {
        try {
          await fetch(`${apiBase}/flights/position`, {
            method: "POST",
            headers: demoHeaders({ "Content-Type": "application/json", "x-pilot-token": pilotToken }),
            body: JSON.stringify({
              lat: pos.lat,
              lon: pos.lon,
              altitude: pos.altitude,
              speed: pos.speed,
              heading: pos.heading,
              verticalSpeed: pos.verticalSpeed ?? 0,
            }),
          });
        } catch {}
      }

      if (navigator.onLine) {
        try {
          const resp = await fetch(`${apiBase}/flights/live-pilots`, { headers: demoHeaders({ "x-pilot-token": pilotToken }) });
          if (resp.ok) {
            const data = await resp.json();
            setLivePilots(data);
          }
        } catch {}
      }
    };

    tick();
    livePilotIntervalRef.current = setInterval(tick, 5000);

    return () => {
      if (livePilotIntervalRef.current) {
        clearInterval(livePilotIntervalRef.current);
        livePilotIntervalRef.current = null;
      }
    };
  }, [state, pilotToken]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (retrievalWatchRef.current !== null) {
        navigator.geolocation.clearWatch(retrievalWatchRef.current);
      }
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
      if (livePilotIntervalRef.current) clearInterval(livePilotIntervalRef.current);
      if (retrievalIntervalRef.current) clearInterval(retrievalIntervalRef.current);
      if (demoIntervalRef.current) clearInterval(demoIntervalRef.current);
      if (crumbFlushTimerRef.current) clearTimeout(crumbFlushTimerRef.current);
      if (statsFlushTimerRef.current) clearTimeout(statsFlushTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (isOnline && state === "recording") {
      syncToServer();
    }
  }, [isOnline, state, syncToServer]);

  const setDemoSettings = useCallback((settings: DemoSettings) => {
    const sim = demoSimRef.current;
    if (sim) sim.setSettings(settings);
  }, []);

  const setDemoSpeed = useCallback((multiplier: number) => {
    demoSpeedRef.current = multiplier;
    const sim = demoSimRef.current;
    if (!sim || !demoIntervalRef.current) return;
    clearInterval(demoIntervalRef.current);
    const baseInterval = 3000;
    const newInterval = Math.max(100, Math.round(baseInterval / multiplier));
    demoIntervalRef.current = setInterval(() => {
      const pos = sim.tick();
      const mockPosition = {
        coords: {
          latitude: pos.lat,
          longitude: pos.lon,
          altitude: pos.altitude,
          accuracy: 5,
          altitudeAccuracy: 10,
          heading: pos.heading,
          speed: pos.speed / 3.6,
        },
        timestamp: Date.now(),
      } as GeolocationPosition;
      addBreadcrumbRef.current(mockPosition);
    }, newInterval);
  }, []);

  return {
    state,
    breadcrumbs,
    fullTrailRef,
    liveStats,
    flightStats,
    isOnline,
    error,
    currentPosition,
    livePilots,
    startTracking,
    stopTracking,
    finishRetrieval,
    reset,
    setDemoSpeed,
    setDemoSettings,
    demoSimPhase: demoSimRef.current?.getPhase() || null,
  };
}
