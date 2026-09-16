import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { Altitude } from '@/components/Altitude';
import { createPortal } from 'react-dom';
import { Loader2, Maximize2, Minimize2, X, ChartLine, CalendarDays, Info, LineChart } from 'lucide-react';
import { useSettings } from '@/contexts/SettingsContext';
import { PointMeteogramModal } from './PointMeteogramModal';
import { SkewTModal } from './SkewTModal';
import { precipDescription } from '@/lib/precip';
import { airspaceAt, airspaceLabel, airspacesAt } from '@/lib/airspaceConflict';
import { AirspaceRange } from '@/components/AirspaceRange';
import { ThermalHelpModal } from '../windmap/ThermalHelpModal';
import { MapScaleBar } from '../windmap/MapScaleBar';
import { WindMapScrubberTray } from '../windmap/WindMapScrubberTray';
import { SCALE_BAR_BOTTOM_COLLAPSED } from '../windMapTypes';
import { cn } from '@/lib/utils';
import type { ThermalGrid } from '../windmap/thermalInterpolation';
import { getThermalStrength, effectiveWstar } from '../windmap/thermalInterpolation';
import { nextSpeed } from '../windMapTypes';
import type { SiteMarker, PlaySpeed } from '../windMapTypes';
import { THERMAL_LEGEND_CSS, LEGEND_MAX_WSTAR, HATCH_MIN } from '../windmap/thermalRenderer';

const ThermalCanvas = lazy(() =>
  import('../windmap/ThermalCanvas').then(m => ({ default: m.ThermalCanvas }))
);

function fmtMelbTime(isoStr: string): string {
  const h = parseInt(
    new Date(isoStr).toLocaleTimeString('en-AU', {
      hour: '2-digit', hour12: false, timeZone: 'Australia/Melbourne',
    })
  );
  return `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;
}

interface SiteThermalPanelProps {
  site: any;
  onBack: (target: 'history' | 'outlook') => void;
  hasExtended: boolean;
  hasLiveWeather: boolean;
}

// Only show slots within flying hours (10am–8pm Melbourne time), today only
const FLYING_HOUR_START = 10;
const FLYING_HOUR_END = 20;

const M_TO_FT = 3.280839895;
// Types to ignore for the airspace warning: wide info regions that always
// contain you (FIR/OCA) or low-relevance sectors — NOT the controlled/restricted
// airspace, which is exactly what we must flag.
const AIRSPACE_WARN_SKIP = new Set(['FIR', 'OCA', 'OTHER', 'TIZ', 'GLIDING_SECTOR', 'WAVE_WINDOW']);

/** Parse a string setting to a finite number, else the default (handles 0 correctly). */
function numSetting(v: unknown, d: number): number {
  const n = Number(v);
  return Number.isFinite(n) && v !== '' && v != null ? n : d;
}

function getMelbHour(isoStr: string): number {
  return parseInt(
    new Date(isoStr).toLocaleTimeString('en-AU', {
      hour: '2-digit', hour12: false, timeZone: 'Australia/Melbourne',
    })
  );
}

export function SiteThermalPanel({ site, onBack, hasExtended, hasLiveWeather }: SiteThermalPanelProps) {
  const { settings } = useSettings();
  const meteogramEnabled = settings.featureMeteogram === 'true';
  const skewtEnabled = settings.featureSkewT === 'true';
  // Point-aware Chart / SkewT: the tapped point opens a full-screen modal. Null = closed.
  const [chartPoint, setChartPoint] = useState<{ lat: number; lon: number; ground?: number } | null>(null);
  const [skewtPoint, setSkewtPoint] = useState<{ lat: number; lon: number; ground?: number; time: number } | null>(null);

  const [thermalGrid, setThermalGrid] = useState<ThermalGrid | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Playback over today's flying-hours window — same idiom as the picker
  // (WindMapScrubberTray + play/pause), scoped to a single day.
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState<PlaySpeed>(5000);
  const [trayOpen, setTrayOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const dismissThermalInfoRef = useRef<(() => void) | null>(null);

  // Airspace zones (same GeoJSON the XC map uses) for the conflict warning.
  const [zones, setZones] = useState<GeoJSON.FeatureCollection | null>(null);
  // The conflicting sector to draw on the map, set by tapping a red bracket.
  const [shownAirspace, setShownAirspace] = useState<GeoJSON.Feature | null>(null);
  // "Airspace ON" — outline every sector, not just a height conflict.
  const [showAllAirspace, setShowAllAirspace] = useState(false);
  useEffect(() => {
    fetch('/api/sites/xc/airspace')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: GeoJSON.FeatureCollection) => setZones(data))
      .catch(() => {});
  }, []);
  const [thermalInfo, setThermalInfo] = useState<{ cape: number; blh: number; wstar?: number; ccl?: number; cloud?: number; cloudLow?: number; precip?: number; weatherCode?: number; groundAmsl?: number; lat?: number; lon?: number } | null>(null);

  // Conflict check is heavy (point-in-polygon over ~1800 sectors), so memoise on
  // the tapped point + altitudes rather than recomputing on every throttled emit.
  const airspaceConflicts = useMemo(() => {
    const t = thermalInfo;
    if (!t || t.lat == null || t.lon == null || typeof t.groundAmsl !== 'number' || !zones) {
      return { bl: null, cu: null };
    }
    const blFt = (t.blh + t.groundAmsl) * M_TO_FT;
    const cuFt = t.ccl !== undefined ? (t.ccl + t.groundAmsl) * M_TO_FT : null;
    return {
      bl: t.blh > 0 ? airspaceAt(t.lat, t.lon, blFt, zones, AIRSPACE_WARN_SKIP) : null,
      cu: cuFt != null ? airspaceAt(t.lat, t.lon, cuFt, zones, AIRSPACE_WARN_SKIP) : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thermalInfo?.lat, thermalInfo?.lon, thermalInfo?.blh, thermalInfo?.ccl, thermalInfo?.groundAmsl, zones]);

  // "Airspace ON" list: every sector stacked under the pin (floor-first). Only
  // computed while the toggle is on; updates as you pan (the pin is screen-fixed).
  const airspaceStack = useMemo(() => {
    if (!showAllAirspace || !thermalInfo || thermalInfo.lat == null || thermalInfo.lon == null || !zones) return [];
    return airspacesAt(thermalInfo.lat, thermalInfo.lon, zones, AIRSPACE_WARN_SKIP);
  }, [showAllAirspace, thermalInfo?.lat, thermalInfo?.lon, zones]);

  // Turning the airspace layer OFF also clears any drawn conflict sector — you
  // may have panned off it, so the tap-the-bracket toggle is no longer reachable.
  const toggleAllAirspace = useCallback(() => {
    setShowAllAirspace(v => {
      if (v) setShownAirspace(null);
      return !v;
    });
  }, []);
  // lat/k from onTransformChange; fall back to site lat and a sensible default zoom.
  const [mapTransform, setMapTransform] = useState<{ lat: number; k: number }>({ lat: site?.lat ?? -37.8, k: 256 * Math.pow(2, 8) });
  const handleTransformChange = useCallback((lat: number, _lon: number, zoomLevel: number) => {
    setMapTransform({ lat, k: 256 * Math.pow(2, zoomLevel) });
  }, []);

  // Fullscreen: lock body scroll and exit on Escape (parity with the picker).
  useEffect(() => {
    if (!isFullscreen) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [isFullscreen]);

  useEffect(() => {
    fetch('/api/weather/thermal-overlay')
      .then(res => res.ok ? res.json() as Promise<ThermalGrid> : Promise.reject(`HTTP ${res.status}`))
      .then(data => {
        setThermalGrid(data);
        setLoading(false);
      })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, []);

  // Filter to today's flying hours only (10am–8pm Melbourne time)
  // thermalGrid.times spans today+tomorrow; we restrict to the first date so
  // the slider shows a clean single-day view (10am → 8pm).
  const flyingSlots = useMemo(() => {
    if (!thermalGrid) return [];
    const firstDate = thermalGrid.times[0]?.slice(0, 10) ?? '';
    return thermalGrid.times
      .map((t, idx) => ({ t, idx, h: getMelbHour(t) }))
      .filter(({ t, h }) =>
        t.slice(0, 10) === firstDate && h >= FLYING_HOUR_START && h <= FLYING_HOUR_END
      );
  }, [thermalGrid]);

  // The scrubber runs continuously across the flying-hours window; the map
  // interpolates at any instant, so we don't need discrete slot indices.
  const HOUR_MS = 60 * 60 * 1000;
  const forecastStart = flyingSlots.length ? new Date(flyingSlots[0].t).getTime() : 0;
  const forecastEnd = flyingSlots.length ? new Date(flyingSlots[flyingSlots.length - 1].t).getTime() : 0;
  const timeStep = HOUR_MS;

  // Open at "now" clamped into the flying window (else the nearest edge).
  useEffect(() => {
    if (!flyingSlots.length) return;
    const first = new Date(flyingSlots[0].t).getTime();
    const last = new Date(flyingSlots[flyingSlots.length - 1].t).getTime();
    setCurrentTime(Math.min(Math.max(Date.now(), first), last));
  }, [flyingSlots]);

  // Advance one hour per tick while playing, looping back to the window start.
  useEffect(() => {
    if (!isPlaying || !flyingSlots.length) return;
    const id = setInterval(() => {
      setCurrentTime(prev => {
        const next = prev + timeStep;
        return next > forecastEnd ? forecastStart : next;
      });
    }, playSpeed);
    return () => clearInterval(id);
  }, [isPlaying, playSpeed, forecastStart, forecastEnd, timeStep, flyingSlots.length]);

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setIsPlaying(false);
    setCurrentTime(parseInt(e.target.value));
  }, []);
  const togglePlay = useCallback(() => setIsPlaying(p => !p), []);
  const cycleSpeed = useCallback(() => { setIsPlaying(true); setPlaySpeed(prev => nextSpeed(prev)); }, []);
  const toggleTray = useCallback(() => setTrayOpen(o => !o), []);
  const formattedTime = flyingSlots.length ? fmtMelbTime(new Date(currentTime).toISOString()) : '';

  // Single-entry marker array for the launch pin; passing exactly 1 marker keeps
  // ThermalCanvas in the single-site zoom path (not the Victoria-fit path).
  const launchMarker = useMemo<SiteMarker[]>(() => {
    if (!site?.lat || !site?.lon) return [];
    return [{ id: site.id ?? 'site', name: site.name ?? '', lat: site.lat, lon: site.lon, status: site.status, type: site.type }];
  }, [site?.id, site?.name, site?.lat, site?.lon, site?.status, site?.type]);

  const panelClass = 'rounded-xl p-3';
  const panelStyle = { background: '#f5f5f7' };
  const headerClass = 'text-[10px] font-semibold uppercase tracking-widest';
  const headerStyle = { color: '#86868b' };
  const btnClass = 'flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-colors hover:opacity-80';
  const btnStyle = { background: '#0071e3', color: '#fff' };

  // insetBottom only when the tray is at the real screen bottom (fullscreen);
  // embedded it's mid-page, so the iOS inset must not lift the collapsed tray.
  const scrubberTray = (fullscreen: boolean) => flyingSlots.length > 1 && (
    <WindMapScrubberTray
      trayOpen={trayOpen}
      onToggle={toggleTray}
      isPlaying={isPlaying}
      onPlayToggle={togglePlay}
      currentTime={currentTime}
      forecastStart={forecastStart}
      forecastEnd={forecastEnd}
      timeStep={timeStep}
      onTimeChange={handleSliderChange}
      playSpeed={playSpeed}
      onSpeedCycle={cycleSpeed}
      formattedTime={formattedTime}
      mapMode="today"
      insetBottom={fullscreen}
    />
  );

  const mapArea = (fullscreen: boolean) => (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: fullscreen ? '100%' : '260px',
        borderRadius: fullscreen ? 0 : '8px',
        overflow: 'hidden',
        background: '#e8e8e8',
      }}
    >
      {loading ? (
        <div className="w-full h-full flex flex-col items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-amber-500 mb-1" />
          <span className="text-xs text-gray-500">Loading thermal data…</span>
        </div>
      ) : error ? (
        <div className="w-full h-full flex items-center justify-center">
          <span className="text-xs text-red-500">Failed to load thermal data</span>
        </div>
      ) : thermalGrid ? (
        <Suspense fallback={<div className="w-full h-full bg-gray-200 animate-pulse" />}>
          <ThermalCanvas
            thermalGrid={thermalGrid}
            currentTime={currentTime}
            siteLat={site.lat}
            siteLon={site.lon}
            savedZoom={fullscreen ? 7 : 8}
            sizeKey={fullscreen ? 2 : 1}
            // When fullscreen, BOTH the embedded and the portal canvas are mounted.
            // Only the visible one may drive the shared readout / scale bar —
            // otherwise their two pins fight over `thermalInfo` at 10fps and the
            // data box oscillates. `active` = this canvas matches the view state.
            onThermalInfoChange={fullscreen === isFullscreen ? setThermalInfo : undefined}
            dismissRef={fullscreen === isFullscreen ? dismissThermalInfoRef : undefined}
            airspaceFeature={shownAirspace}
            allAirspace={showAllAirspace ? zones : null}
            siteMarkers={launchMarker}
            onTransformChange={fullscreen === isFullscreen ? handleTransformChange : undefined}
          />
        </Suspense>
      ) : null}

      {/* Fullscreen toggle — top-right, matching the picker (map style guide). */}
      <button
        onClick={() => setIsFullscreen(v => !v)}
        className="absolute top-3 right-3 z-40 w-8 h-8 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/80 transition-colors shadow-lg"
        title={fullscreen ? 'Exit fullscreen' : 'Fullscreen — XC planning view'}
      >
        {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
      </button>

      {/* Tapped-point info overlay */}
      {thermalInfo && (() => {
        const s = getThermalStrength(effectiveWstar(thermalInfo.wstar, thermalInfo.cape));
        // Mirror the renderer's overcast rule so the readout agrees with the grey
        // sheet: a solid low-cloud deck suppresses thermals, so don't claim "Good
        // thermals" under it. overcastPct = max(cloudLow, total≥90 ? total : 0).
        const overcastPct = Math.max(thermalInfo.cloudLow ?? 0, (thermalInfo.cloud ?? 0) >= 90 ? (thermalInfo.cloud ?? 0) : 0);
        const overcastOnset = numSetting(settings.thermalOvercastOnsetPct, 70);
        const overcastFull = numSetting(settings.thermalOvercastFullPct, 95);
        const overcast = thermalInfo.cloudLow !== undefined && overcastPct >= overcastOnset;
        // Grade the label to the same ramp the grey sheet draws (onset→full): a
        // broken deck near onset reads "reduced" (grey is still faint), only a
        // solid sheet (past HATCH_MIN of the ramp) reads "suppressed".
        const overcastRaw = Math.min(1, Math.max(0, (overcastPct - overcastOnset) / Math.max(1, overcastFull - overcastOnset)));
        const overcastLabel = overcastRaw >= HATCH_MIN ? 'Overcast — suppressed' : 'Overcast — reduced';

        // BL Top / Cu Base are AGL; add ground to show AMSL (what airspace uses).
        const gm = thermalInfo.groundAmsl;
        const hasGround = typeof gm === 'number';
        const blhAmslM = hasGround ? thermalInfo.blh + gm! : null;
        const cclAmslM = (hasGround && thermalInfo.ccl !== undefined) ? thermalInfo.ccl + gm! : null;
        const blConflict = airspaceConflicts.bl;
        const cuConflict = airspaceConflicts.cu;
        const toggleAS = (f: GeoJSON.Feature) => setShownAirspace(cur => cur === f ? null : f);

        return (
          <div className="absolute top-3 left-3 bg-black/75 backdrop-blur-sm rounded-lg px-2.5 py-2 z-30 min-w-[120px] max-w-[calc(100%-1rem)]">
            <div className="flex items-start justify-between gap-2.5">
              <div className="space-y-0.5">
                <div className="text-[10px] text-white/70 font-semibold uppercase tracking-wide">{showAllAirspace ? 'Airspace overhead' : 'Tapped point'}</div>
                {showAllAirspace ? (
                  airspaceStack.length === 0
                    ? <div className="text-[10px] text-white/50">No airspace here</div>
                    : airspaceStack.map((sec, i) => (
                        <div key={i} className="text-[10px] leading-tight">
                          <span className="font-semibold text-white/90">{airspaceLabel(sec)}</span>
                          <span className="text-white/55"> <AirspaceRange sector={sec} /></span>
                        </div>
                      ))
                ) : (
                  <>
                    {overcast
                      ? <div className="text-[12px] font-bold leading-tight text-white/70">{overcastLabel}</div>
                      : (s && <div className="text-[12px] font-bold leading-tight" style={{ color: s.color }}>{s.label}</div>)}
                    {thermalInfo.blh > 0 && (
                      <div className="text-[10px] text-white/75">
                        BL Top {hasGround
                          ? <><Altitude metres={blhAmslM!} step={100} /> AMSL</>
                          : <><Altitude metres={thermalInfo.blh} step={100} /> AGL</>}
                        {blConflict && (
                          <button onClick={(e) => { e.stopPropagation(); toggleAS(blConflict.feature); }}
                            className="ml-1 text-red-400 font-semibold hover:text-red-300">({airspaceLabel(blConflict)})</button>
                        )}
                      </div>
                    )}
                    {thermalInfo.ccl !== undefined && thermalInfo.ccl > 0 && (
                      <div className={cn('text-[10px]', thermalInfo.ccl < 600 ? 'text-amber-400' : 'text-white/75')}>
                        Cu Base {hasGround && cclAmslM != null
                          ? <><Altitude metres={cclAmslM} step={100} /> AMSL</>
                          : <><Altitude metres={thermalInfo.ccl} step={100} /> AGL</>}{thermalInfo.ccl < 600 ? ' ⚠' : ''}
                        {cuConflict && (
                          <button onClick={(e) => { e.stopPropagation(); toggleAS(cuConflict.feature); }}
                            className="ml-1 text-red-400 font-semibold hover:text-red-300">({airspaceLabel(cuConflict)})</button>
                        )}
                      </div>
                    )}
                    {typeof thermalInfo.precip === 'number' && thermalInfo.precip >= 0.1 && (
                      <div className="text-[10px] text-sky-300">{precipDescription(thermalInfo.precip, thermalInfo.weatherCode)}</div>
                    )}
                    {typeof thermalInfo.groundAmsl === 'number' && (
                      <div className="text-[10px] text-white/75">Ground <Altitude metres={thermalInfo.groundAmsl} step={10} /> AMSL</div>
                    )}
                  </>
                )}
                {/* Point actions. Chart opens the meteogram for this point (launch
                    is just a point). Airspace ON lists the stack; OFF reverts + clears
                    any drawn sector. */}
                <div className="flex items-center gap-3 pt-1 mt-0.5 border-t border-white/10">
                  {meteogramEnabled && thermalInfo.lat != null && thermalInfo.lon != null && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setChartPoint({ lat: thermalInfo.lat!, lon: thermalInfo.lon!, ground: thermalInfo.groundAmsl }); }}
                      className="flex items-center gap-1 text-[10px] text-white/75 hover:text-white"
                      title="Thermal forecast chart for this point"
                    >
                      <LineChart className="w-3 h-3" /> Chart
                    </button>
                  )}
                  {skewtEnabled && thermalInfo.lat != null && thermalInfo.lon != null && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setSkewtPoint({ lat: thermalInfo.lat!, lon: thermalInfo.lon!, ground: thermalInfo.groundAmsl, time: currentTime }); }}
                      className="flex items-center gap-1 text-[10px] text-white/75 hover:text-white"
                      title="SkewT sounding for this point + time"
                    >
                      <ChartLine className="w-3 h-3" /> SkewT
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleAllAirspace(); }}
                    className="flex items-center gap-1 text-[10px] text-white/75 hover:text-white"
                    title="List the airspace stack under the pin"
                  >
                    Airspace <span className={cn('font-semibold', showAllAirspace ? 'text-sky-300' : 'text-white/40')}>{showAllAirspace ? 'ON' : 'OFF'}</span>
                  </button>
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setThermalInfo(null); dismissThermalInfoRef.current?.(); }}
                className="text-white/50 hover:text-white/80 transition-colors shrink-0 mt-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })()}

      {/* Scale bar — bottom-left, offset right of the Key pill, shifting up when
          the scrubber tray opens (matches the picker). */}
      {thermalGrid && (
        <div
          className="absolute left-24 z-20 transition-[bottom] duration-300 pointer-events-none"
          style={{ bottom: trayOpen ? 104 : SCALE_BAR_BOTTOM_COLLAPSED }}
        >
          <MapScaleBar lat={mapTransform.lat} k={mapTransform.k} />
        </div>
      )}

      {/* Legend — collapsed to a swatch pill on this small map; tap to expand to a
          readable panel, tap the panel to hide. Sits above the scrubber tray
          handle (bottom-left), matching the picker. */}
      {thermalGrid && (showLegend ? (
        <button
          onClick={(e) => { e.stopPropagation(); setShowLegend(false); }}
          className={`absolute ${fullscreen ? 'bottom-[calc(2.75rem+env(safe-area-inset-bottom,0px))]' : 'bottom-[2.75rem]'} left-3 z-30 text-left bg-black/75 backdrop-blur-sm rounded-lg px-2.5 py-2 max-w-[calc(100%-1rem)]`}
          title="Tap to hide legend"
        >
          <div className="flex items-center justify-between gap-2.5 mb-1">
            <span className="text-[10px] text-white/70 font-semibold uppercase tracking-wide">Thermal Strength</span>
            <X className="w-3.5 h-3.5 text-white/50 shrink-0" />
          </div>
          <div className="h-2.5 w-44 max-w-full rounded-full" style={{ background: THERMAL_LEGEND_CSS }} />
          {/* Labels pinned to their true W* threshold position so they stay
              aligned with the gradient when the ramp changes. */}
          <div className="relative mt-1 h-[13px] w-44 max-w-full text-[10px] text-white/60 font-mono">
            {(
              [
                { label: 'Weak',   wstar: 0.3 },
                { label: 'Good',   wstar: 1.5 },
                { label: 'Strong', wstar: 2.5 },
              ] as { label: string; wstar: number }[]
            ).map(({ label, wstar }, i, arr) => {
              const pct = Math.min(100, (wstar / LEGEND_MAX_WSTAR) * 100);
              const isFirst = i === 0;
              const isLast  = i === arr.length - 1;
              return (
                <span
                  key={label}
                  className="absolute"
                  style={{
                    left: `${pct}%`,
                    transform: isFirst ? 'none' : isLast ? 'translateX(-100%)' : 'translateX(-50%)',
                  }}
                >{label}</span>
              );
            })}
          </div>
          <div className="mt-2 space-y-1.5 text-[10px] text-white/75 leading-snug">
            <div className="flex items-center gap-2">
              {/* Same shape the map draws (traceCumulus): three domes on a flat base. */}
              <span className="w-[22px] flex justify-center shrink-0">
                <svg width="22" height="16" viewBox="0 0 16 11">
                  <path fill="white" d="M2.52 9 A2.48 2.48 0 0 1 7.48 9 L4.8 7.4 A3.2 3.2 0 0 1 11.2 7.4 L9 8.8 A2.2 2.2 0 0 1 13.4 8.8 L2.52 9 Z" />
                </svg>
              </span>
              <span>Cumulus — density = coverage · size &amp; brightness = depth</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-[22px] flex justify-center shrink-0"><span className="inline-block w-4 h-2.5 rounded-sm" style={{ background: 'linear-gradient(90deg, rgba(150,154,160,0.3), rgb(150,154,160))' }} /></span>
              <span>Overcast — deeper grey = more low cloud; thermals suppressed</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-[22px] flex justify-center shrink-0"><span className="inline-block w-3.5 h-2.5 rounded-sm" style={{ background: 'rgb(56,118,209)' }} /></span>
              <span>Rain — deeper blue = heavier</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span>Overdevelopment:</span>
              <svg width="11" height="11" viewBox="0 0 11 11" className="shrink-0"><path d="M5.5 1 L10 10 L1 10 Z" fill="none" stroke="white" strokeWidth="1.2" /></svg>
              <span className="text-white/60">watch</span>
              <span className="text-white/35">·</span>
              <svg width="11" height="11" viewBox="0 0 11 11" className="shrink-0"><path d="M5.5 1 L10 10 L1 10 Z" fill="white" /></svg>
              <span className="text-white/60">likely</span>
            </div>
          </div>
        </button>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); setShowLegend(true); }}
          className={`absolute ${fullscreen ? 'bottom-[calc(0.4rem+env(safe-area-inset-bottom,0px))]' : 'bottom-[0.4rem]'} left-3 z-30 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full pl-1.5 pr-2.5 py-1 hover:bg-black/80 transition-colors`}
          title="Show legend"
        >
          <span className="h-2 w-8 rounded-full" style={{ background: THERMAL_LEGEND_CSS }} />
          <span className="text-[11px] text-white/80 font-medium">Key</span>
        </button>
      ))}

      {/* Time scrubber — pull-out tray (identical to the picker), embedded and
          fullscreen. */}
      {scrubberTray(fullscreen)}
    </div>
  );

  const dateLabel = thermalGrid
    ? new Date(thermalGrid.times[0]).toLocaleDateString('en-AU', {
        weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Australia/Melbourne',
      })
    : '';

  return (
    <>
      <div className={panelClass} style={panelStyle}>
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          {/* Two rows, each baseline-aligned: title word + its date part sit on
              one baseline. Fixed-width title column keeps the date/ECMWF left
              edges aligned even though THERMAL and FORECAST differ in width. */}
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-baseline gap-2 min-w-0">
              <span className={cn(headerClass, 'w-[72px] shrink-0')} style={headerStyle}>Thermal</span>
              {dateLabel && <span className="text-[8px] text-muted-foreground font-mono truncate">{dateLabel}</span>}
            </div>
            <div className="flex items-baseline gap-2 min-w-0">
              <span className={cn(headerClass, 'w-[72px] shrink-0')} style={headerStyle}>Forecast</span>
              {dateLabel && <span className="text-[8px] text-muted-foreground font-mono">ECMWF</span>}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowHelp(true); }}
              className="text-muted-foreground/50 hover:text-muted-foreground transition-colors p-0.5"
              title="What do these readings mean?"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
            {hasLiveWeather && (
              <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onBack('history'); }} className={btnClass} style={btnStyle}>
                <ChartLine className="w-3 h-3" />
                <span>History</span>
              </button>
            )}
            {hasExtended && (
              <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onBack('outlook'); }} className={btnClass} style={btnStyle}>
                <CalendarDays className="w-3 h-3" />
                <span>7-Day</span>
              </button>
            )}
          </div>
        </div>

        {mapArea(false)}
      </div>

      {/* Fullscreen portal — identical chrome to the embedded map (Key, readout,
          scrubber tray, top-right toggle), just larger. Per the style guide,
          fullscreen == embedded, so no extra header. */}
      {isFullscreen && createPortal(
        <div
          className="fixed inset-0 z-[10001] h-[100dvh] w-screen bg-black"
          onClick={(e) => e.stopPropagation()}
        >
          {mapArea(true)}
        </div>,
        document.body
      )}

      {showHelp && <ThermalHelpModal onClose={() => setShowHelp(false)} variant="map" />}

      {/* Point-aware Chart popup — the meteogram for the tapped point. */}
      {chartPoint && (
        <PointMeteogramModal
          lat={chartPoint.lat}
          lon={chartPoint.lon}
          groundAmsl={chartPoint.ground}
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
          onClose={() => setSkewtPoint(null)}
        />
      )}
    </>
  );
}
