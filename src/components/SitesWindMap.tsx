import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { Altitude } from '@/components/Altitude';
import { Loader2, Maximize2, Minimize2, Crosshair, Wind, Thermometer, Info, X, LineChart, ChartLine, CloudRain } from 'lucide-react';
import { PointMeteogramModal } from './weather/PointMeteogramModal';
import { SkewTModal } from './weather/SkewTModal';
import { RaspModal } from './weather/RaspModal';
import { LayerSelector, type LayerOption } from './windmap/LayerSelector';
import { RadarCardControls } from './windmap/RadarCardControls';
import { RADAR_LEGEND_CSS, sampleRadarAt, type RadarSample } from './windmap/radarTiles';
import { useRainviewer } from '@/hooks/useRainviewer';
import { MapScaleBar } from './windmap/MapScaleBar';
import { useSettings } from '@/contexts/SettingsContext';
import { useChartScale } from '@/hooks/useChartScale';
import { useAuth } from '@/contexts/AuthContext';
import { SPEED_LEGEND_CSS, getCompassDirection, INITIAL_K, SCALE_BAR_BOTTOM_COLLAPSED, SLIDER_INPUT_CLS } from './windMapTypes';
import type { SiteMarker, ZoomSetpoints } from './windMapTypes';
import { getWindAt, type WindGrid } from './windmap/windInterpolation';
import { useWindPlayback } from '@/hooks/useWindPlayback';
import { getThermalAt, getThermalStrength, effectiveWstar } from './windmap/thermalInterpolation';
import type { ThermalGrid } from './windmap/thermalInterpolation';
import { OVERCAST_SUPPRESS_MIN } from './windmap/thermalRenderer';
import { ThermalStrengthLegend } from './windmap/ThermalLegend';
import { precipDescription } from '@/lib/precip';
import { haversineDistance } from '@/lib/utils';
import { airspaceAt, airspaceLabel, airspacesAt } from '@/lib/airspaceConflict';
import { AirspaceRange } from './AirspaceRange';

const M_TO_FT = 3.280839895;
// Ignore wide info regions / low ground obstacles for the airspace warning (see
// airspaceConflict.ts). Controlled/restricted/danger airspace IS flagged.
const AIRSPACE_WARN_SKIP = new Set(['FIR', 'OCA', 'OTHER', 'TIZ', 'GLIDING_SECTOR', 'WAVE_WINDOW']);
// Interactive readout text (Chart / SkewT / the class label / the Wind line) gets
// a subtle sky tint so it reads as tappable, distinct from the plain white/75
// readings — without shouting like the red airspace-conflict words.
const CLICKABLE = 'text-sky-500 hover:text-sky-400';

// Switchable speed/direction display. Speed cycles kt→mph→kph; direction toggles
// compass↔degrees. Both persist per browser and are shown on one line ("4.9 kt / S").
type SpeedUnit = 'kt' | 'mph' | 'kph';
const SPEED_UNITS: SpeedUnit[] = ['kt', 'mph', 'kph'];
const SPEED_FACTOR: Record<SpeedUnit, number> = { kt: 1, mph: 1.15078, kph: 1.852 };
const fmtSpeed = (kt: number, unit: SpeedUnit, dp = 1) => `${(kt * SPEED_FACTOR[unit]).toFixed(dp)} ${unit}`;
type DirMode = 'compass' | 'deg';
const fmtDir = (deg: number, mode: DirMode) => (mode === 'deg' ? `${Math.round(deg)}°` : getCompassDirection(deg));

const WindCanvas = lazy(() => import('./windmap/WindCanvas').then(m => ({ default: m.WindCanvas })));
const ThermalCanvas = lazy(() => import('./windmap/ThermalCanvas').then(m => ({ default: m.ThermalCanvas })));
import { ThermalHelpModal } from './windmap/ThermalHelpModal';

interface SitesWindMapProps {
  sites: SiteMarker[];
  isAuthenticated?: boolean;
  zoomSetpoints?: ZoomSetpoints;
}

/** Tapped point must be within this many km of a live-reporting site to show its
 *  live wind alongside the forecast. Tunable. */
const LIVE_WIND_RADIUS_KM = 5;

export function SitesWindMapProto({ sites, isAuthenticated, zoomSetpoints }: SitesWindMapProps) {
  const { settings, updateSettings } = useSettings();
  const { user } = useAuth();
  const clubName = settings.clubName || 'SkyHigh';
  const isAdmin = !!user?.isAdmin;
  const containerRef = useRef<HTMLDivElement>(null);
  const isThermalEnabled = settings.featureThermalMap === 'true';
  const meteogramEnabled = settings.featureMeteogram === 'true';
  const skewtEnabled = settings.featureSkewT === 'true';
  // Point-aware Chart / SkewT: tapped point opens a full-screen modal.
  const [chartPoint, setChartPoint] = useState<{ lat: number; lon: number; ground?: number } | null>(null);
  const [skewtPoint, setSkewtPoint] = useState<{ lat: number; lon: number; ground?: number; time: number } | null>(null);
  const [raspPoint, setRaspPoint] = useState<{ lat: number; lon: number; ground?: number } | null>(null);
  const { fullScale, toggle: toggleScale } = useChartScale();

  const [zoomK, setZoomK] = useState(INITIAL_K);
  const [selectedSite, setSelectedSite] = useState<{ site: SiteMarker; x: number; y: number } | null>(null);
  const [sitesWindInfo, setSitesWindInfo] = useState<{ speed: number; direction: number; groundAmsl?: number; lat?: number; lon?: number } | null>(null);
  // Live wind from the nearest live-reporting site within LIVE_WIND_RADIUS_KM of
  // the tapped point — only when the scrubber sits on "now" (see effect below).
  const [liveWind, setLiveWind] = useState<{ speedKt: number; direction: string; directionDeg?: number; siteName: string } | null>(null);
  const [thermalInfo, setThermalInfo] = useState<{ cape: number; blh: number; wstar?: number; ccl?: number; cloud?: number; cloudLow?: number; precip?: number; weatherCode?: number; groundAmsl?: number; lat?: number; lon?: number } | null>(null);
  // Mirror the renderer's overcast rule so the tapped-point strength label agrees
  // with the grey sheet (a low-cloud deck suppresses thermals — don't say "Good").
  const overcastOnsetPct = Number(settings.thermalOvercastOnsetPct) || 70;
  const overcastFullPct = Number(settings.thermalOvercastFullPct) || 95;
  const overcastPct = thermalInfo && thermalInfo.cloudLow !== undefined
    ? Math.max(thermalInfo.cloudLow, (thermalInfo.cloud ?? 0) >= 90 ? thermalInfo.cloud! : 0)
    : 0;
  const thermalOvercast = !!thermalInfo && thermalInfo.cloudLow !== undefined && overcastPct >= overcastOnsetPct;
  // Grade the label to the grey ramp (onset→full): "reduced" near onset where the
  // grey is faint, "suppressed" only past OVERCAST_SUPPRESS_MIN (a solid sheet).
  const overcastRaw = Math.min(1, Math.max(0, (overcastPct - overcastOnsetPct) / Math.max(1, overcastFullPct - overcastOnsetPct)));
  const thermalOvercastLabel = overcastRaw >= OVERCAST_SUPPRESS_MIN ? 'Overcast — suppressed' : 'Overcast — reduced';
  const [showThermalHelp, setShowThermalHelp] = useState(false);
  const [showWindOnThermal, setShowWindOnThermal] = useState(false);
  const [mapMode, setMapMode] = useState<'today' | '7day'>('today');
  const [viewMode, setViewMode] = useState<'wind' | 'thermal'>('wind');
  // "Base map detail" — 0–1 personal preference, shared by both maps and
  // remembered per browser. Held in a ref too, so dragging the slider updates the
  // canvas frame loop live without re-rendering the map (see MapCanvas).
  const [basemapIntensity, setBasemapIntensity] = useState<number>(() => {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem('skyhigh.basemapIntensity') : null;
    const n = v == null ? NaN : Number(v);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
  });
  // `basemapIntensity` is the pilot's slider POSITION (0–1), remembered per browser.
  // The effective multiply alpha is that position mapped into an admin-set floor/
  // ceiling band (Admin → Forecast → Base-map detail range), separate per map
  // because the wind and thermal overlays bury the base by different amounts.
  useEffect(() => {
    try { localStorage.setItem('skyhigh.basemapIntensity', String(basemapIntensity)); } catch { /* private mode */ }
  }, [basemapIntensity]);
  const basemapIntensityRef = useRef(0);
  useEffect(() => {
    const numOr = (v: unknown, d: number) => { const n = parseFloat(String(v)); return Number.isFinite(n) ? n : d; };
    const floorPct = viewMode === 'thermal' ? numOr(settings.thermalBasemapDetailFloorPct, 0) : numOr(settings.windBasemapDetailFloorPct, 0);
    const ceilPct  = viewMode === 'thermal' ? numOr(settings.thermalBasemapDetailCeilPct, 100) : numOr(settings.windBasemapDetailCeilPct, 100);
    const lo = Math.min(floorPct, ceilPct) / 100;
    const hi = Math.max(floorPct, ceilPct) / 100;
    const pos = Math.min(1, Math.max(0, basemapIntensity));
    basemapIntensityRef.current = lo + pos * (hi - lo);
  }, [basemapIntensity, viewMode, settings.windBasemapDetailFloorPct, settings.windBasemapDetailCeilPct, settings.thermalBasemapDetailFloorPct, settings.thermalBasemapDetailCeilPct]);
  // Town-name labels toggle (the map icon in front of the slider). Drawn on top of
  // the overlay so names stay readable. Shared by both maps, remembered per browser.
  const [showMapLabels, setShowMapLabels] = useState<boolean>(() => {
    try { return localStorage.getItem('skyhigh.showMapLabels') === 'true'; } catch { return false; }
  });
  const showLabelsRef = useRef(showMapLabels);
  useEffect(() => {
    showLabelsRef.current = showMapLabels;
    try { localStorage.setItem('skyhigh.showMapLabels', String(showMapLabels)); } catch { /* private mode */ }
  }, [showMapLabels]);

  // ── Rain-radar overlay (RainViewer) ──────────────────────────────────────
  // Shared by both maps, same ref pattern as the basemap controls: React state
  // drives the control UI; refs feed the canvas frame loop live. On/off and
  // opacity persist per browser; the frame index and play state are per session.
  const [radarEnabled, setRadarEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem('skyhigh.radarEnabled') === 'true'; } catch { return false; }
  });
  const [radarOpacity, setRadarOpacity] = useState<number>(() => {
    try { const v = localStorage.getItem('skyhigh.radarOpacity'); const n = v == null ? NaN : Number(v); return Number.isFinite(n) ? Math.min(1, Math.max(0.1, n)) : 0.75; } catch { return 0.75; }
  });
  const [radarIndex, setRadarIndex] = useState(0);
  const [radarPlaying, setRadarPlaying] = useState(false);
  // Rain intensity sampled from the radar image at the tapped point (null = no rain
  // / unavailable) — drives the marker + mm/hr on the Rain-radar scale.
  const [radarPoint, setRadarPoint] = useState<RadarSample | null>(null);

  const radar = useRainviewer(radarEnabled);
  const radarHost = radar.data?.host ?? '';
  const radarFrames = useMemo(() => radar.data?.frames ?? [], [radar.data]);
  const radarNowIndex = radar.data?.nowIndex ?? 0;
  // Clamp the index to the live frame list (it can shrink/grow on refetch).
  const radarClampedIndex = radarFrames.length ? Math.min(radarIndex, radarFrames.length - 1) : 0;

  const radarEnabledRef = useRef(radarEnabled);
  const radarOpacityRef = useRef(radarOpacity);
  const radarFrameRef = useRef<{ host: string; path: string } | null>(null);

  useEffect(() => {
    radarEnabledRef.current = radarEnabled;
    try { localStorage.setItem('skyhigh.radarEnabled', String(radarEnabled)); } catch { /* private mode */ }
    if (!radarEnabled) setRadarPlaying(false);
  }, [radarEnabled]);
  useEffect(() => {
    radarOpacityRef.current = radarOpacity;
    try { localStorage.setItem('skyhigh.radarOpacity', String(radarOpacity)); } catch { /* private mode */ }
  }, [radarOpacity]);

  // When a fresh index arrives (first load or a 5-min refetch), jump the scrubber
  // to the "now" edge so the map opens on the latest observed scan.
  useEffect(() => {
    if (radar.data) setRadarIndex(radar.data.nowIndex);
  }, [radar.data]);

  // Park the frame the canvas should draw this instant; null when off or empty.
  useEffect(() => {
    const f = radarFrames[radarClampedIndex];
    radarFrameRef.current = radarEnabled && f ? { host: radarHost, path: f.path } : null;
  }, [radarEnabled, radarFrames, radarClampedIndex, radarHost]);

  // Loop: advance ~2 frames/sec, wrapping back to the start of the ~1h history.
  useEffect(() => {
    if (!radarPlaying || radarFrames.length < 2) return;
    const id = setInterval(() => {
      setRadarIndex(prev => (prev + 1) % radarFrames.length);
    }, 500);
    return () => clearInterval(id);
  }, [radarPlaying, radarFrames.length]);

  const onRadarIndexChange = useCallback((i: number) => { setRadarPlaying(false); setRadarIndex(i); }, []);
  // Dismiss handlers filled in by the active canvas; the ✕ on the readout box
  // calls the current mode's handler to clear the pin fully (box + pin +
  // crosshair), otherwise the render loop repaints it.
  const dismissThermalRef = useRef<(() => void) | null>(null);
  const dismissWindRef = useRef<(() => void) | null>(null);

  // Airspace conflict warning (thermal mode): same zones + logic as the site panel.
  const [zones, setZones] = useState<GeoJSON.FeatureCollection | null>(null);
  const [shownAirspace, setShownAirspace] = useState<GeoJSON.Feature | null>(null);
  // "Airspace ON" — outline every sector, not just a height conflict.
  const [showAllAirspace, setShowAllAirspace] = useState(false);
  useEffect(() => {
    fetch('/api/sites/xc/airspace')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: GeoJSON.FeatureCollection) => setZones(d))
      .catch(() => {});
  }, []);
  const airspaceConflicts = useMemo(() => {
    const t = thermalInfo;
    if (viewMode !== 'thermal' || !t || t.lat == null || t.lon == null || typeof t.groundAmsl !== 'number' || !zones) {
      return { bl: null as ReturnType<typeof airspaceAt>, cu: null as ReturnType<typeof airspaceAt> };
    }
    const blFt = (t.blh + t.groundAmsl) * M_TO_FT;
    const cuFt = t.ccl !== undefined ? (t.ccl + t.groundAmsl) * M_TO_FT : null;
    return {
      bl: t.blh > 0 ? airspaceAt(t.lat, t.lon, blFt, zones, AIRSPACE_WARN_SKIP) : null,
      cu: cuFt != null ? airspaceAt(t.lat, t.lon, cuFt, zones, AIRSPACE_WARN_SKIP) : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, thermalInfo?.lat, thermalInfo?.lon, thermalInfo?.blh, thermalInfo?.ccl, thermalInfo?.groundAmsl, zones]);
  // Airspace stack at the point the Chart was opened for — drives the meteogram's
  // red conflict overlay (floor line + tapered strip).
  const chartAirspace = useMemo(
    () => (chartPoint && zones) ? airspacesAt(chartPoint.lat, chartPoint.lon, zones, AIRSPACE_WARN_SKIP) : [],
    [chartPoint, zones],
  );
  // "Airspace ON" list: every sector stacked under the pin (floor-first), thermal
  // mode only. Updates as you pan (the pin is screen-fixed).
  const airspaceStack = useMemo(() => {
    if (!showAllAirspace || viewMode !== 'thermal' || !thermalInfo || thermalInfo.lat == null || thermalInfo.lon == null || !zones) return [];
    return airspacesAt(thermalInfo.lat, thermalInfo.lon, zones, AIRSPACE_WARN_SKIP);
  }, [showAllAirspace, viewMode, thermalInfo?.lat, thermalInfo?.lon, zones]);
  // Turning airspace OFF also clears any drawn conflict sector (you may have
  // panned off it, so the tap-the-bracket toggle is no longer reachable).
  const toggleAllAirspace = useCallback(() => {
    setShowAllAirspace(v => {
      if (v) setShownAirspace(null);
      return !v;
    });
  }, []);
  const [thermalGrid, setThermalGrid] = useState<ThermalGrid | null>(null);
  const [thermalLoading, setThermalLoading] = useState(false);
  const [thermalError, setThermalError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canvasSizeKey, setCanvasSizeKey] = useState(0);
  const [isSettingView, setIsSettingView] = useState(false);
  const [liveView, setLiveView] = useState<{ lat: number; lon: number; zoom: number } | null>(null);
  // Mirror of liveView in a ref. The canvases take the saved viewport as a prop
  // that sits in their setup effect's dependency array, and that effect resets
  // initialTransformApplied — so feeding live state in directly would re-run it
  // on every pan and re-apply the transform in a loop. The ref lets us read the
  // current viewport without making it a render-visible dependency.
  const liveViewRef = useRef<{ lat: number; lon: number; zoom: number } | null>(null);
  // Viewport captured at the moment of a wind/thermal toggle. Changes only on
  // toggle, so the incoming canvas mounts where the outgoing one was, and the
  // setup effect still runs exactly once per switch.
  const [viewportSnapshot, setViewportSnapshot] = useState<{ lat: number; lon: number; zoom: number } | null>(null);
  // lat/k for the scale bar, derived from onTransformChange (which fires on both
  // WindCanvas and ThermalCanvas). k = 256 * 2^zoomLevel.
  const [mapTransform, setMapTransform] = useState<{ lat: number; k: number }>({ lat: -37.8, k: INITIAL_K });
  const didPushHistoryRef = useRef(false);
  const closingViaPopRef = useRef(false);

  const savedLat = settings.windMapDefaultLat ? parseFloat(String(settings.windMapDefaultLat)) : undefined;
  const savedLon = settings.windMapDefaultLon ? parseFloat(String(settings.windMapDefaultLon)) : undefined;
  const savedZoom = settings.windMapDefaultZoom ? parseFloat(String(settings.windMapDefaultZoom)) : undefined;

  // What the canvases actually mount at: the viewport carried across the most
  // recent wind/thermal toggle, falling back to the admin-configured default on
  // first load (when no toggle has happened yet).
  const viewLat = viewportSnapshot?.lat ?? savedLat;
  const viewLon = viewportSnapshot?.lon ?? savedLon;
  const viewZoom = viewportSnapshot?.zoom ?? savedZoom;

  const todayFetcher = useCallback(async (): Promise<WindGrid> => {
    const res = await fetch('/api/weather/wind-overlay/full');
    if (!res.ok) {
      if (res.status === 503) throw new Error('Wind data temporarily unavailable, please try again in a moment');
      throw new Error(`HTTP ${res.status}`);
    }
    return res.json();
  }, []);

  // 12h (e.g. "3 PM") vs 24h ("15:00") clock, shared by every time display on the
  // map (card, scrubber tray, radar frame). Toggled by tapping the card's time,
  // remembered per browser.
  const [use24h, setUse24h] = useState<boolean>(() => {
    try { return localStorage.getItem('skyhigh.time24h') === 'true'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('skyhigh.time24h', String(use24h)); } catch { /* private mode */ }
  }, [use24h]);

  // Speed units (kt/mph/kph) + direction mode (compass/degrees), remembered per
  // browser. Tapping the speed cycles units; tapping the direction toggles mode.
  const [speedUnit, setSpeedUnit] = useState<SpeedUnit>(() => {
    try { const v = localStorage.getItem('skyhigh.speedUnit'); return (SPEED_UNITS as string[]).includes(v || '') ? (v as SpeedUnit) : 'kt'; } catch { return 'kt'; }
  });
  const [dirMode, setDirMode] = useState<DirMode>(() => {
    try { return localStorage.getItem('skyhigh.dirMode') === 'deg' ? 'deg' : 'compass'; } catch { return 'compass'; }
  });
  useEffect(() => { try { localStorage.setItem('skyhigh.speedUnit', speedUnit); } catch { /* private */ } }, [speedUnit]);
  useEffect(() => { try { localStorage.setItem('skyhigh.dirMode', dirMode); } catch { /* private */ } }, [dirMode]);
  const cycleSpeedUnit = useCallback(() => setSpeedUnit(u => SPEED_UNITS[(SPEED_UNITS.indexOf(u) + 1) % SPEED_UNITS.length]), []);
  const toggleDirMode = useCallback(() => setDirMode(m => (m === 'compass' ? 'deg' : 'compass')), []);

  const {
    windGrid, loading, error,
    currentTime, timeStep, forecastStart, forecastEnd,
    formattedTime, handleSliderChange, seekTo,
  } = useWindPlayback(
    mapMode,
    todayFetcher,
    // Admin-set default opening hour for the site forecast map (Admin → Forecast).
    // Only applied when explicitly set; unset keeps the original "now" behaviour.
    settings.thermalMapDefaultHour !== undefined && settings.thermalMapDefaultHour !== ''
      ? parseInt(String(settings.thermalMapDefaultHour), 10)
      : undefined,
    use24h,
  );

  // Keep the forecast in step with the radar: while radar is on, snap the forecast
  // time to the nearest grid time to the displayed radar frame, so the tapped-point
  // reading and the radar image are for the same moment (follows radar scrubbing too).
  useEffect(() => {
    if (!radarEnabled) return;
    const f = radarFrames[radarClampedIndex];
    if (f) seekTo(f.time * 1000);
  }, [radarEnabled, radarFrames, radarClampedIndex, seekTo]);

  // Lazy-load thermal grid when user switches to thermal mode
  useEffect(() => {
    if (viewMode !== 'thermal' || thermalGrid) return;
    setThermalLoading(true);
    setThermalError(null);
    fetch('/api/weather/thermal-overlay')
      .then(async res => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error((body as { error?: string })?.error || `HTTP ${res.status}`);
        }
        return res.json() as Promise<ThermalGrid>;
      })
      .then(data => { setThermalGrid(data); setThermalLoading(false); })
      .catch(e => { setThermalError((e as Error).message); setThermalLoading(false); });
  }, [viewMode, thermalGrid]);

  // Live wind for the tapped point: when the scrubber is on "now" and the tap is
  // within LIVE_WIND_RADIUS_KM of a live-reporting site, fetch that site's most
  // recent reading and show it beside the forecast. Off-now or too far → cleared.
  const tappedLat = viewMode === 'thermal' ? thermalInfo?.lat : sitesWindInfo?.lat;
  const tappedLon = viewMode === 'thermal' ? thermalInfo?.lon : sitesWindInfo?.lon;
  // Terrain elevation at the tapped point, from whichever readout is active — used
  // by the Radar panel (which shows no wind/thermal reading of its own).
  const tappedGround = viewMode === 'thermal' ? thermalInfo?.groundAmsl : sitesWindInfo?.groundAmsl;

  // Sample the radar image at the tapped point for the current frame → marker + mm/hr.
  useEffect(() => {
    if (!radarEnabled || tappedLat == null || tappedLon == null) { setRadarPoint(null); return; }
    const f = radarFrames[radarClampedIndex];
    if (!f || !radarHost) { setRadarPoint(null); return; }
    let cancelled = false;
    sampleRadarAt(tappedLat, tappedLon, radarHost, f.path).then(r => { if (!cancelled) setRadarPoint(r); });
    return () => { cancelled = true; };
  }, [radarEnabled, tappedLat, tappedLon, radarFrames, radarClampedIndex, radarHost]);

  useEffect(() => {
    const isNow = Math.abs(currentTime - Date.now()) < timeStep; // within one frame of real "now"
    if (!isNow || tappedLat == null || tappedLon == null) { setLiveWind(null); return; }

    // Nearest live-capable site within the radius (uses site coords we already hold).
    let nearest: { site: SiteMarker; km: number } | null = null;
    for (const s of sites) {
      const km = haversineDistance(tappedLat, tappedLon, s.lat, s.lon);
      if (km <= LIVE_WIND_RADIUS_KM && (!nearest || km < nearest.km)) nearest = { site: s, km };
    }
    if (!nearest) { setLiveWind(null); return; }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/weather/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteIds: [nearest!.site.id] }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as Record<string, any>;
        const obs = data[nearest!.site.id];
        if (cancelled) return;
        if (obs && obs.type === 'live' && obs.windSpeed != null) {
          const dir = typeof obs.direction === 'number' ? getCompassDirection(obs.direction) : String(obs.direction ?? '');
          const dirDeg = typeof obs.direction === 'number' ? obs.direction : undefined;
          setLiveWind({ speedKt: Number(obs.windSpeed), direction: dir, directionDeg: dirDeg, siteName: nearest!.site.name });
        } else {
          setLiveWind(null);
        }
      } catch {
        if (!cancelled) setLiveWind(null);
      }
    })();
    return () => { cancelled = true; };
  }, [tappedLat, tappedLon, currentTime, timeStep, sites]);

  const handleViewModeChange = useCallback((mode: 'wind' | 'thermal') => {
    // Carry the current viewport across the switch. The two canvases are mounted
    // in an either/or ternary, so the incoming one would otherwise initialise
    // from the admin default and throw away wherever the pilot had panned to.
    if (liveViewRef.current) setViewportSnapshot(liveViewRef.current);
    setViewMode(mode);
    setSelectedSite(null);
    if (mode === 'thermal') setMapMode('today');
  }, []);

  // Thermal data at the selected site, live-updating with currentTime
  const thermalAtSite = useMemo(() => {
    if (viewMode !== 'thermal' || !thermalGrid || !selectedSite) return null;
    return getThermalAt(selectedSite.site.lon, selectedSite.site.lat, currentTime, thermalGrid);
  }, [viewMode, thermalGrid, selectedSite, currentTime]);

  // Surface wind at the tapped thermal point, sampled from the wind overlay at
  // the current scrubber time — shown under Ground in the readout box.
  const tappedWind = useMemo(() => {
    if (viewMode !== 'thermal' || !thermalInfo || thermalInfo.lat == null || thermalInfo.lon == null || !windGrid) return null;
    const uv = getWindAt(thermalInfo.lon, thermalInfo.lat, currentTime, windGrid);
    if (!uv) return null;
    const [u, v] = uv;
    const speedKt = Math.hypot(u, v) / 0.514444;
    // u/v were built as u=-S·sin(dir), v=-S·cos(dir) (dir = FROM), so atan2(-u,-v)=dir.
    const direction = (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360;
    return { speedKt, direction };
  }, [viewMode, thermalInfo?.lat, thermalInfo?.lon, currentTime, windGrid]);

  const thermalSiteStrength = thermalAtSite ? getThermalStrength(effectiveWstar(thermalAtSite.wstar, thermalAtSite.cape)) : null;

  const handleSaveView = useCallback(async () => {
    if (!liveView) return;
    try {
      await updateSettings({
        windMapDefaultLat: String(liveView.lat.toFixed(6)),
        windMapDefaultLon: String(liveView.lon.toFixed(6)),
        windMapDefaultZoom: String(liveView.zoom.toFixed(4)),
      });
      setIsSettingView(false);
    } catch (e) {
      console.error('Failed to save wind map view:', e);
    }
  }, [liveView, updateSettings]);

  const exitFullscreen = useCallback(() => {
    if (didPushHistoryRef.current && !closingViaPopRef.current) {
      didPushHistoryRef.current = false;
      window.history.back();
    } else {
      closingViaPopRef.current = false;
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    let resizeTimer: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      if (isFullscreen) {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          requestAnimationFrame(() => setCanvasSizeKey(k => k + 1));
        }, 150);
      }
    };

    if (isFullscreen) {
      document.body.style.overflow = 'hidden';
      const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') exitFullscreen(); };
      const handlePopState = () => {
        didPushHistoryRef.current = false;
        closingViaPopRef.current = true;
        setIsFullscreen(false);
      };
      if (!didPushHistoryRef.current) {
        window.history.pushState({ windMapFullscreen: true }, '');
        didPushHistoryRef.current = true;
      }
      window.addEventListener('keydown', handleKey);
      window.addEventListener('resize', handleResize);
      window.addEventListener('popstate', handlePopState);
      resizeTimer = setTimeout(() => {
        requestAnimationFrame(() => setCanvasSizeKey(k => k + 1));
      }, 150);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKey);
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('popstate', handlePopState);
        clearTimeout(resizeTimer);
      };
    } else {
      document.body.style.overflow = '';
      resizeTimer = setTimeout(() => {
        requestAnimationFrame(() => setCanvasSizeKey(k => k + 1));
      }, 150);
      return () => clearTimeout(resizeTimer);
    }
  }, [isFullscreen, exitFullscreen]);

  const centerLat = useMemo(
    () => sites.length > 0 ? sites.reduce((s, site) => s + site.lat, 0) / sites.length : -37.8,
    [sites],
  );
  const centerLon = useMemo(
    () => sites.length > 0 ? sites.reduce((s, site) => s + site.lon, 0) / sites.length : 145.0,
    [sites],
  );

  const handleTransformChange = useCallback((lat: number, lon: number, zoom: number) => {
    liveViewRef.current = { lat, lon, zoom };
    setLiveView({ lat, lon, zoom });
    setMapTransform({ lat, k: 256 * Math.pow(2, zoom) });
  }, []);

  const handleSiteClick = useCallback((site: SiteMarker, x: number, y: number) => {
    setSelectedSite(prev => prev?.site.id === site.id ? null : { site, x, y });
  }, []);

  const handleZoomChange = useCallback((k: number) => {
    setZoomK(k);
    setSelectedSite(null);
  }, []);

  // Dismiss the pinned readout in the active mode. Clears the pin fully (box +
  // pin + crosshair) so the render loop stops repainting it, and clears the
  // local readout state that drives the box.
  const dismissReading = useCallback(() => {
    if (viewMode === 'thermal') {
      dismissThermalRef.current?.();
      setThermalInfo(null);
    } else {
      dismissWindRef.current?.();
      setSitesWindInfo(null);
    }
  }, [viewMode]);


  // The layer selector (Wind | Thermal | Radar). Rendered top-left in the loaded
  // state AND in the loading/error states, so the control is in place before the
  // grid arrives. Segmented idiom: all layers visible, the active one highlighted.
  // The map's active data layer — Wind | Thermal | Radar, three mutually-exclusive
  // peers selected by one segmented control (replaces the old mode pill + the in-card
  // radar toggle). "Radar" reuses whichever canvas is mounted, suppressing its data
  // overlay and drawing rain instead.
  const activeLayer: 'wind' | 'thermal' | 'radar' = radarEnabled ? 'radar' : viewMode;
  const handleLayerChange = useCallback((layer: 'wind' | 'thermal' | 'radar') => {
    if (layer === 'radar') { setRadarEnabled(true); return; }
    setRadarEnabled(false);
    handleViewModeChange(layer); // viewport snapshot, popup clear, today-for-thermal
  }, [handleViewModeChange]);
  const layerOptions = ([
    { value: 'wind', label: 'Wind', icon: Wind, colorClass: 'text-sky-400' },
    isThermalEnabled ? { value: 'thermal', label: 'Thermal', icon: Thermometer, colorClass: 'text-amber-400' } : null,
    { value: 'radar', label: 'Radar', icon: CloudRain, colorClass: 'text-sky-300' },
  ] as (LayerOption<'wind' | 'thermal' | 'radar'> | null)[]).filter(Boolean) as LayerOption<'wind' | 'thermal' | 'radar'>[];
  const layerSelector = <LayerSelector options={layerOptions} value={activeLayer} onChange={handleLayerChange} />;

  // One slider style for the whole card: a label (optionally a toggle) +
  // full-width track. All sliders share this so their tracks line up and match in
  // length. The narrow w-12 label lets the track run a little longer leftwards.
  const cardSlider = (
    label: string, value: number, onChange: (v: number) => void, title: string,
    min = 0, labelActive?: boolean, onLabelClick?: () => void,
  ) => (
    <div className="flex items-center gap-2" onPointerDown={(e) => e.stopPropagation()} title={title}>
      {onLabelClick ? (
        <button onClick={onLabelClick} className={`text-[10px] tracking-wide shrink-0 w-14 text-left ${labelActive ? 'text-sky-500' : 'text-sky-500/55 hover:text-sky-500'}`}>{label}</button>
      ) : (
        <span className="text-[10px] text-white/75 tracking-wide shrink-0 w-14 text-left">{label}</span>
      )}
      <div className="relative flex-1 flex items-center">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-sky-500/70 pointer-events-none" />
        <input
          type="range" min={min} max={100} step={5}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          onClick={(e) => e.stopPropagation()}
          className={SLIDER_INPUT_CLS}
        />
      </div>
    </div>
  );
  // Rain controls.
  const opacitySlider = cardSlider('Opacity', Math.round(radarOpacity * 100), v => setRadarOpacity(Math.max(0.1, v / 100)), 'Rain radar opacity', 10);
  // Map control: the slider sets base-map detail; tapping the MAP label toggles
  // town names (sky when on). Combines the old Detail slider + Labels toggle.
  const mapSlider = cardSlider(
    'Base map', Math.round(basemapIntensity * 100), v => setBasemapIntensity(v / 100),
    'Base-map detail (slider) · tap MAP to toggle town names',
    0, showMapLabels, () => setShowMapLabels(v => !v),
  );

  // Forecast time scrubber — moved out of the bottom tray into the card. Same look
  // as the other sliders. The label toggles Today↔7-day (wind only; thermal is
  // today-only). No play button or time readout — the time is in the card header.
  const forecastSlider = (
    <div className="flex items-center gap-2" onPointerDown={(e) => e.stopPropagation()} title="Forecast time — drag to scrub">
      {viewMode === 'wind' ? (
        <button onClick={() => setMapMode(m => (m === 'today' ? '7day' : 'today'))} className="text-[10px] tracking-wide shrink-0 w-14 text-left text-sky-500 hover:text-sky-400" title="Tap to switch Today / 7-day">
          {mapMode === '7day' ? '7 Days' : 'Today'}
        </button>
      ) : (
        <span className="text-[10px] tracking-wide shrink-0 w-14 text-left text-white/75">Today</span>
      )}
      <div className="relative flex-1 flex items-center">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-sky-500/70 pointer-events-none" />
        <input
          type="range" min={forecastStart} max={forecastEnd} step={timeStep}
          value={currentTime}
          onChange={handleSliderChange}
          onClick={(e) => e.stopPropagation()}
          className={SLIDER_INPUT_CLS}
        />
      </div>
    </div>
  );

  // Radar loop (Play + timeline), shown only when radar is on.
  const radarLoop = radarEnabled ? (
    <RadarCardControls
      frames={radarFrames}
      index={radarClampedIndex}
      onIndexChange={onRadarIndexChange}
      nowIndex={radarNowIndex}
      isPlaying={radarPlaying}
      onPlayToggle={() => setRadarPlaying(v => !v)}
      loading={radar.isLoading}
      error={radar.isError}
      use24h={use24h}
      onToggle24h={() => setUse24h(v => !v)}
      pointMmhr={radarPoint ? radarPoint.mmhr : null}
    />
  ) : null;

  // The scale, pinned to the card bottom — shows the scale for whatever the map is
  // displaying (rain radar / thermal strength / wind speed). Replaces the old Key pill.
  const scaleBlock = (
    <div>
      {radarEnabled ? (
        <>
          <div className="relative h-1.5 w-full rounded-full" style={{ background: RADAR_LEGEND_CSS }}>
            {radarPoint && (
              <div className="absolute top-0 w-px bg-white shadow-[0_0_3px_rgba(255,255,255,0.8)]" style={{ left: `${Math.min(100, Math.max(0, radarPoint.pos * 100))}%`, height: 'calc(100% + 2px)' }} />
            )}
          </div>
          <div className="flex justify-between mt-1 text-[10px] font-mono text-white/75 px-0.5"><span>Light</span><span>Moderate</span><span>Heavy</span></div>
        </>
      ) : viewMode === 'thermal' ? (
        <>
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[10px] text-white/75 font-semibold tracking-wide">Thermal strength</span>
            <button onClick={() => setShowThermalHelp(true)} className="text-white/40 hover:text-white/80 transition-colors" title="What do these readings mean?"><Info className="w-3.5 h-3.5" /></button>
          </div>
          <ThermalStrengthLegend marks={false} wstar={thermalInfo ? effectiveWstar(thermalInfo.wstar, thermalInfo.cape) : undefined} />
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[10px] text-white/75 font-semibold tracking-wide">Wind speed</span>
            <button onClick={() => setShowThermalHelp(true)} className="text-white/40 hover:text-white/80 transition-colors" title="How to read this map"><Info className="w-3.5 h-3.5" /></button>
          </div>
          <div className="relative w-full">
            <div className="h-1.5 w-full rounded-full" style={{ background: SPEED_LEGEND_CSS }} />
            {sitesWindInfo && (
              <div className="absolute top-0 w-px bg-white shadow-[0_0_3px_rgba(255,255,255,0.8)]" style={{ left: `${Math.min(100, (sitesWindInfo.speed / 20) * 100)}%`, height: 'calc(100% + 2px)' }} />
            )}
          </div>
          <div className="flex justify-between mt-1 text-[10px] font-mono text-white/75 px-0.5"><span>0</span><span>5</span><span>10</span><span>15</span><span>20+ kt</span></div>
        </>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="w-full h-full relative flex items-center justify-center bg-[#0a0a0a] rounded-xl">
        <div className="absolute top-3 left-3 z-30">{layerSelector}</div>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 text-sky-400 animate-spin" />
          <span className="text-xs text-white/50 font-mono">Loading {mapMode === '7day' ? '7-day' : ''} wind data...</span>
        </div>
      </div>
    );
  }

  if (error || !windGrid) {
    return (
      <div className="w-full h-full relative flex items-center justify-center bg-[#0a0a0a] rounded-xl">
        <div className="absolute top-3 left-3 z-30">{layerSelector}</div>
        <span className="text-xs text-red-400 font-mono">{error || 'No wind data available'}</span>
      </div>
    );
  }

  const fullscreenClasses = isFullscreen
    // dvh, not vh: on iOS Safari `100vh` is the *large* viewport, so the bottom
    // of the map slides under the collapsing toolbar and takes the tray with it.
    ? 'fixed inset-0 z-[10001] w-screen h-[100dvh]'
    : 'w-full h-full relative';

  const canvasFallback = (
    <div className="w-full h-full flex items-center justify-center bg-[#e8e8e8]">
      <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
    </div>
  );

  return (
    <div ref={containerRef} className={fullscreenClasses}>
      <div className={`relative overflow-hidden w-full h-full ${isFullscreen ? '' : 'rounded-xl'}`}>

        {/* Canvas area */}
        {viewMode === 'thermal' ? (
          thermalLoading ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-[#e8e8e8]">
              <Loader2 className="w-6 h-6 text-amber-500 animate-spin mb-2" />
              <span className="text-xs text-gray-500 font-mono">Loading thermal data…</span>
            </div>
          ) : thermalError ? (
            <div className="w-full h-full flex items-center justify-center bg-[#e8e8e8]">
              <span className="text-xs text-red-500 font-mono">{thermalError}</span>
            </div>
          ) : thermalGrid ? (
            <Suspense fallback={canvasFallback}>
              <ThermalCanvas
                thermalGrid={thermalGrid}
                currentTime={currentTime}
                siteLat={centerLat}
                siteLon={centerLon}
                siteMarkers={sites}
                onSiteClick={handleSiteClick}
                onThermalInfoChange={setThermalInfo}
                dismissRef={dismissThermalRef}
                airspaceFeature={shownAirspace}
                allAirspace={showAllAirspace ? zones : null}
                sizeKey={canvasSizeKey}
                savedCenterLat={viewLat}
                savedCenterLon={viewLon}
                savedZoom={viewZoom}
                onTransformChange={handleTransformChange}
                windGrid={windGrid}
                showWind={showWindOnThermal}
                zoomSetpoints={zoomSetpoints}
                basemapIntensityRef={basemapIntensityRef}
                showLabelsRef={showLabelsRef}
                radarEnabledRef={radarEnabledRef}
                radarOpacityRef={radarOpacityRef}
                radarFrameRef={radarFrameRef}
              />
            </Suspense>
          ) : null
        ) : (
          <Suspense fallback={
            <div className="w-full h-full flex items-center justify-center bg-[#0a0a0a]">
              <Loader2 className="w-6 h-6 text-sky-400 animate-spin" />
            </div>
          }>
            <WindCanvas
              windGrid={windGrid}
              currentTime={currentTime}
              siteLat={centerLat}
              siteLon={centerLon}
              onZoomChange={handleZoomChange}
              zoomSetpoints={zoomSetpoints}
              siteMarkers={sites}
              onSiteClick={handleSiteClick}
              onWindInfoChange={setSitesWindInfo}
              dismissRef={dismissWindRef}
              sizeKey={canvasSizeKey}
              initialZoomK={INITIAL_K}
              savedCenterLat={viewLat}
              savedCenterLon={viewLon}
              savedZoom={viewZoom}
              onTransformChange={handleTransformChange}
              basemapIntensityRef={basemapIntensityRef}
              showLabelsRef={showLabelsRef}
              radarEnabledRef={radarEnabledRef}
              radarOpacityRef={radarOpacityRef}
              radarFrameRef={radarFrameRef}
            />
          </Suspense>
        )}

        {/* Site popup */}
        {selectedSite && (
          <div
            className="absolute z-30 bg-card rounded-lg shadow-xl border border-border-subtle p-3 min-w-[180px]"
            style={{
              left: Math.min(Math.max(8, selectedSite.x + 12), (containerRef.current?.clientWidth || 400) - 200),
              top: Math.min(Math.max(8, selectedSite.y - 60), (containerRef.current?.clientHeight || 400) - 160),
              pointerEvents: 'auto',
            }}
          >
            <button
              onClick={() => setSelectedSite(null)}
              className="absolute top-1 right-1.5 text-foreground-faint hover:text-foreground-secondary text-xs font-bold"
            >
              &times;
            </button>
            <div className="font-semibold text-ink text-sm">{selectedSite.site.name}</div>
            {selectedSite.site.isSkyHighSite === 'true' && (
              <div className="text-[10px] text-emerald-600 font-medium">a {clubName} Site</div>
            )}

            {viewMode === 'thermal' ? (
              thermalSiteStrength ? (
                <div className="mt-1.5 space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: thermalSiteStrength.color }} />
                    <span className="font-medium" style={{ color: thermalSiteStrength.color }}>{thermalSiteStrength.label}</span>
                  </div>
                  {thermalAtSite && effectiveWstar(thermalAtSite.wstar, thermalAtSite.cape) >= 0.3 && (
                    <div className="text-[10px] text-foreground-secondary space-y-0.5">
                      <div>
                        {thermalAtSite.wstar !== undefined
                          ? `W* ${thermalAtSite.wstar.toFixed(1)} m/s`
                          : `CAPE ${Math.round(thermalAtSite.cape)} J/kg`}
                      </div>
                      {(thermalAtSite.blh > 0 || (thermalAtSite.ccl !== undefined && thermalAtSite.ccl > 0)) && (
                        <div className="flex items-center gap-2">
                          {thermalAtSite.blh > 0 && (
                            <span>BL Top <Altitude metres={thermalAtSite.blh} step={100} /></span>
                          )}
                          {thermalAtSite.ccl !== undefined && thermalAtSite.ccl > 0 && (
                            <span className={thermalAtSite.ccl < 600 ? 'text-amber-500 font-medium' : ''}>
                              Cu Base <Altitude metres={thermalAtSite.ccl} step={100} />{thermalAtSite.ccl < 600 ? ' ⚠' : ''}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-foreground-secondary mt-1">Thermal data loading…</div>
              )
            ) : (
              <div className="text-xs text-muted-foreground mt-0.5">{selectedSite.site.type} &middot; {selectedSite.site.windDir}</div>
            )}

            <div className="flex items-center gap-3 mt-2">
              <a href={`/sites/${selectedSite.site.id}`} className="text-xs font-medium text-accent hover:underline">
                View Site Guide &rarr;
              </a>
              {viewMode !== 'thermal' && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${selectedSite.site.lat},${selectedSite.site.lon}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-emerald-600 hover:underline"
                >
                  Navigate
                </a>
              )}
            </div>
            {isAuthenticated && viewMode !== 'thermal' && (
              <div className="mt-1.5 pt-1.5 border-t border-border-subtle">
                <a href={`/admin/sites/${selectedSite.site.id}/edit`} className="text-xs font-medium text-accent hover:underline">
                  Edit Site
                </a>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Fullscreen button — top-right, per the map style guide. */}
      <button
        onClick={() => isFullscreen ? exitFullscreen() : setIsFullscreen(true)}
        className="absolute top-3 right-3 z-40 w-8 h-8 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/80 transition-colors shadow-lg"
        title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      >
        {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
      </button>

      {isAdmin && (
        <button
          onClick={() => isSettingView ? handleSaveView() : setIsSettingView(true)}
          title={isSettingView ? 'Save this view as default' : 'Set default map view'}
          className={`absolute top-3 right-12 z-40 p-1.5 rounded-full transition-colors shadow-lg ${
            isSettingView
              ? 'bg-orange-500 text-white ring-2 ring-orange-300 animate-pulse'
              : 'bg-black/60 text-white/80 hover:text-white hover:bg-black/80'
          }`}
        >
          <Crosshair className="w-4 h-4" />
        </button>
      )}

      {/* Mode controls — ALWAYS visible (never hidden). Wind/Thermal view toggle
          (feature-flagged) and the Today/7-day toggle (wind mode only). Sits
          top-left below the fullscreen button. */}
      <div className="absolute top-3 left-3 z-30 flex flex-col gap-1.5 max-w-[calc(100vw-1.5rem)]">
        {layerSelector}

        {/* Stacked, dismissable tapped-point readout box (top-left) — only shown
            after the map is tapped; ✕ closes it (clears the pin). One value/line. */}
        {((viewMode === 'thermal' && thermalInfo) || (viewMode === 'wind' && sitesWindInfo)) && (
        <div className="relative bg-black/75 backdrop-blur-sm rounded-lg px-2.5 py-2 min-w-[232px] max-w-[calc(100vw-1.5rem)]">
            <div className="space-y-0.5">
              <div className="text-[10px] text-white/75 font-semibold tracking-wide">Tapped point</div>
              {/* Forecast time this readout is for (the scrubber's selected time),
                  with the wind speed/direction on the same line (wind mode). The
                  Radar panel has no forecast reading, so this header is hidden there —
                  its time lives on the Live line. Tap time = 12/24h; speed = units;
                  dir = compass/degrees. */}
              {!radarEnabled && (
              <div className="flex items-baseline gap-2 flex-wrap text-[10px] font-semibold leading-tight">
                <span className="flex items-baseline gap-1">
                  <span className="text-white/75">Fcst</span>
                  <button
                    onClick={() => setUse24h(v => !v)}
                    className="text-sky-500 hover:text-sky-400 text-left"
                    title="Tap to switch 12-hour / 24-hour clock"
                  >
                    {formattedTime}
                  </button>
                </span>
                {viewMode === 'wind' && sitesWindInfo && (
                  <span className="flex items-center gap-1">
                    <button onClick={cycleSpeedUnit} className="text-sky-500 hover:text-sky-400" title="Tap to change speed units (kt / mph / kph)">
                      {fmtSpeed(sitesWindInfo.speed, speedUnit)}
                    </button>
                    <span className="text-white/40 font-normal">/</span>
                    <button onClick={toggleDirMode} className="text-sky-500 hover:text-sky-400 tracking-wide" title="Tap to switch compass / degrees">
                      {fmtDir(sitesWindInfo.direction, dirMode)}
                    </button>
                  </span>
                )}
              </div>
              )}
              {radarEnabled ? (
                /* RADAR PANEL — rain at the tapped point. Its time + scrubber are the
                   Rain radar section (the Play loop), so no Fcst header / Today here;
                   no wind/thermal reading (those are the other two layers). */
                <>
                  {typeof tappedGround === 'number' && (
                    <div className="text-[10px] text-white/75">Ground <Altitude metres={tappedGround} step={10} className="text-sky-500 hover:text-sky-400" /> AMSL</div>
                  )}
                  <div className="pt-1 mt-0.5 border-t border-white/10 space-y-1.5">
                    {radarLoop}
                    {opacitySlider}
                    {scaleBlock}
                    <div className="border-t border-white/10" />
                    {mapSlider}
                    <div className="text-[9px] text-white/40">© RainViewer</div>
                  </div>
                </>
              ) : viewMode === 'thermal' ? (
                thermalInfo ? (
                  <>
                    <>
                        {thermalOvercast
                          ? <div className="text-[10px] font-semibold leading-tight text-white/75">{thermalOvercastLabel}</div>
                          : <div className="text-[10px] font-semibold leading-tight" style={{ color: getThermalStrength(effectiveWstar(thermalInfo.wstar, thermalInfo.cape)).color }}>{getThermalStrength(effectiveWstar(thermalInfo.wstar, thermalInfo.cape)).label}</div>}
                        {thermalInfo.blh > 0 && (
                          <div className="text-[10px] text-white/75">
                            BL Top {typeof thermalInfo.groundAmsl === 'number'
                              ? <><Altitude metres={thermalInfo.blh + thermalInfo.groundAmsl} step={100} /> AMSL</>
                              : <><Altitude metres={thermalInfo.blh} step={100} /> AGL</>}
                            {/* Airspace class at this height. Plain (inherits the
                                line colour) when uncontrolled (Class G); red when
                                it busts controlled airspace. Tap = show/hide the
                                airspace overhead list (same as the old toggle). */}
                            {zones && typeof thermalInfo.groundAmsl === 'number' && (
                              <button
                                onClick={() => toggleAllAirspace()}
                                className={`ml-1 ${airspaceConflicts.bl ? 'font-semibold text-red-400 hover:text-red-300' : CLICKABLE}`}
                                title="Show/hide airspace overhead"
                              >
                                ({airspaceConflicts.bl ? airspaceLabel(airspaceConflicts.bl) : 'Class G'})
                              </button>
                            )}
                          </div>
                        )}
                        {thermalInfo.ccl !== undefined && thermalInfo.ccl > 0 && (
                          <div className={`text-[10px] ${thermalInfo.ccl < 600 ? 'text-amber-400' : 'text-white/75'}`}>
                            Cu Base {typeof thermalInfo.groundAmsl === 'number'
                              ? <><Altitude metres={thermalInfo.ccl + thermalInfo.groundAmsl} step={100} /> AMSL</>
                              : <><Altitude metres={thermalInfo.ccl} step={100} /> AGL</>}{thermalInfo.ccl < 600 ? ' ⚠' : ''}
                            {zones && typeof thermalInfo.groundAmsl === 'number' && (
                              <button
                                onClick={() => toggleAllAirspace()}
                                className={`ml-1 ${airspaceConflicts.cu ? 'font-semibold text-red-400 hover:text-red-300' : CLICKABLE}`}
                                title="Show/hide airspace overhead"
                              >
                                ({airspaceConflicts.cu ? airspaceLabel(airspaceConflicts.cu) : 'Class G'})
                              </button>
                            )}
                          </div>
                        )}
                        {/* Airspace ON: list the sectors overhead here — directly
                            under Cu Base and above Ground — rather than replacing
                            the readout. */}
                        {showAllAirspace && (
                          airspaceStack.length === 0
                            ? <div className="text-[10px] text-white/75">No airspace overhead</div>
                            : airspaceStack.map((sec, i) => (
                                <div key={i} className="text-[10px] leading-tight">
                                  <span className="font-semibold text-white/75">{airspaceLabel(sec)}</span>
                                  <span className="text-white/75"> <AirspaceRange sector={sec} /></span>
                                </div>
                              ))
                        )}
                        {typeof thermalInfo.precip === 'number' && thermalInfo.precip >= 0.1 && (
                          <div className="text-[10px] text-white/75">{precipDescription(thermalInfo.precip, thermalInfo.weatherCode)}</div>
                        )}
                        {typeof thermalInfo.groundAmsl === 'number' && (
                          <div className="text-[10px] text-white/75">Ground <Altitude metres={thermalInfo.groundAmsl} step={10} className="text-sky-500 hover:text-sky-400" /> AMSL</div>
                        )}
                        {/* Wind line doubles as the wind-flow toggle. */}
                        {tappedWind && (
                          <button
                            onClick={() => setShowWindOnThermal(v => !v)}
                            className={`block text-left text-[10px] ${showWindOnThermal ? 'text-sky-500 font-semibold' : CLICKABLE}`}
                            title="Show/hide wind flow on the map"
                          >
                            Wind {liveWind ? 'Fcst ' : ''}{fmtSpeed(tappedWind.speedKt, speedUnit, 0)} <span className="text-sky-500 font-semibold tracking-wide">{fmtDir(tappedWind.direction, dirMode)}</span>{liveWind && <> | Live {fmtSpeed(liveWind.speedKt, speedUnit, 0)} <span className="text-sky-500 font-semibold tracking-wide">{liveWind.directionDeg != null ? fmtDir(liveWind.directionDeg, dirMode) : liveWind.direction}</span></>}
                          </button>
                        )}
                      </>
                    <div className="pt-1">{forecastSlider}</div>
                    {/* Point actions — they act on the tapped point, so they live in
                        the readings zone, above the layer-section divider. */}
                    {thermalInfo.lat != null && thermalInfo.lon != null && (
                      <div className="pt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        {(meteogramEnabled || skewtEnabled) && (
                          <button onClick={() => toggleScale()} className={`flex items-center gap-1 text-[10px] ${CLICKABLE}`} title="Altitude scale for Chart & SkewT: PG working band vs full profile">
                            Scale <span className={`font-semibold ${fullScale ? 'text-sky-500' : 'text-white/40'}`}>{fullScale ? 'Full' : 'PG'}</span>
                          </button>
                        )}
                        {meteogramEnabled && (
                          <button onClick={() => setChartPoint({ lat: thermalInfo.lat!, lon: thermalInfo.lon!, ground: thermalInfo.groundAmsl })} className={`flex items-center gap-1 text-[10px] ${CLICKABLE}`} title="Thermal forecast chart for this point">
                            <LineChart className="w-3 h-3" /> Chart
                          </button>
                        )}
                        {skewtEnabled && (
                          <button onClick={() => setSkewtPoint({ lat: thermalInfo.lat!, lon: thermalInfo.lon!, ground: thermalInfo.groundAmsl, time: currentTime })} className={`flex items-center gap-1 text-[10px] ${CLICKABLE}`} title="SkewT sounding for this point + time">
                            <ChartLine className="w-3 h-3" /> SkewT
                          </button>
                        )}
                        {meteogramEnabled && (
                          <button onClick={() => setRaspPoint({ lat: thermalInfo.lat!, lon: thermalInfo.lon!, ground: thermalInfo.groundAmsl })} className={`flex items-center gap-1 text-[10px] ${CLICKABLE}`} title="RASP — winds & thermals aloft (time × altitude)">
                            <Wind className="w-3 h-3" /> RASP
                          </button>
                        )}
                      </div>
                    )}
                    {/* Layer section (Rain radar / Thermal strength, legend at its
                        foot), then the Base map zone — same order as the wind map. */}
                    {thermalInfo.lat != null && thermalInfo.lon != null && (
                      <div className="pt-1 mt-0.5 border-t border-white/10 space-y-1.5">
                        {scaleBlock}
                        <div className="border-t border-white/10" />
                        {mapSlider}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-[10px] text-white/75">Tap map for a reading</div>
                )
              ) : (
                sitesWindInfo ? (
                  <>
                    {liveWind && (
                      <div className="text-[10px] text-white/75"><span className="font-semibold tracking-wide">Live</span> {fmtSpeed(liveWind.speedKt, speedUnit, 0)} <span className="font-semibold tracking-wide">{liveWind.directionDeg != null ? fmtDir(liveWind.directionDeg, dirMode) : liveWind.direction}</span></div>
                    )}
                    {typeof sitesWindInfo.groundAmsl === 'number' && (
                      <div className="text-[10px] text-white/75">Ground <Altitude metres={sitesWindInfo.groundAmsl} step={10} className="text-sky-500 hover:text-sky-400" /> AMSL</div>
                    )}
                    <div className="pt-1">{forecastSlider}</div>
                    <div className="pt-1 mt-0.5 border-t border-white/10 space-y-1.5">
                      {scaleBlock}
                      <div className="border-t border-white/10" />
                      {mapSlider}
                    </div>
                  </>
                ) : (
                  <div className="text-[10px] text-white/75">Tap map for a reading</div>
                )
              )}
            </div>
            <button
              onClick={dismissReading}
              className="absolute top-2 right-2 text-white/50 hover:text-white/80 transition-colors"
              title="Dismiss reading"
            >
              <X className="w-3.5 h-3.5" />
            </button>
        </div>
        )}
      </div>

      {/* Map scale now lives in the tapped-point card (see scaleBlock); the old
          bottom-left Key pill has been removed. */}

      {/* Scale bar. Shifts up when the scrubber tray is open. Left-justified with
          the other bottom-left chrome. */}
      <div
        className="absolute left-3 z-20 transition-[bottom] duration-300 pointer-events-none"
        style={{ bottom: SCALE_BAR_BOTTOM_COLLAPSED }}
      >
        <MapScaleBar lat={mapTransform.lat} k={mapTransform.k} />
      </div>

      {/* Thermal help modal */}
      {showThermalHelp && <ThermalHelpModal variant={viewMode === 'thermal' ? 'map' : 'wind'} onClose={() => setShowThermalHelp(false)} />}

      {/* Point-aware Chart popup — the meteogram for the tapped point. */}
      {chartPoint && (
        <PointMeteogramModal
          lat={chartPoint.lat}
          lon={chartPoint.lon}
          groundAmsl={chartPoint.ground}
          airspace={chartAirspace}
          fullScale={fullScale}
          onToggleScale={toggleScale}
          onClose={() => setChartPoint(null)}
        />
      )}

      {/* Interactive SkewT popup — the sounding for the tapped point + time. */}
      {skewtPoint && (
        <SkewTModal
          lat={skewtPoint.lat}
          lon={skewtPoint.lon}
          groundAmsl={skewtPoint.ground}
          time={skewtPoint.time}
          fullScale={fullScale}
          onToggleScale={toggleScale}
          onClose={() => setSkewtPoint(null)}
        />
      )}

      {/* RASP — winds & thermals aloft (time × altitude) for the tapped point. */}
      {raspPoint && (
        <RaspModal
          lat={raspPoint.lat}
          lon={raspPoint.lon}
          groundAmsl={raspPoint.ground}
          fullScale={fullScale}
          onToggleScale={toggleScale}
          onClose={() => setRaspPoint(null)}
        />
      )}
    </div>
  );
}
