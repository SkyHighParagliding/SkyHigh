import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { Altitude } from '@/components/Altitude';
import { createPortal } from 'react-dom';
import { Loader2, Maximize2, Minimize2, X, ChartLine, CalendarDays, Thermometer, Info, Map as MapIcon, LineChart } from 'lucide-react';
import { useSettings } from '@/contexts/SettingsContext';
import { SiteMeteogramChart, type MeteogramHour } from './SiteMeteogramChart';
import { precipDescription } from '@/lib/precip';
import { ThermalHelpModal } from '../windmap/ThermalHelpModal';
import { MapScaleBar } from '../windmap/MapScaleBar';
import { cn } from '@/lib/utils';
import type { ThermalGrid } from '../windmap/thermalInterpolation';
import { getThermalStrength, effectiveWstar, getThermalAt } from '../windmap/thermalInterpolation';
import type { SiteMarker } from '../windMapTypes';
import { THERMAL_LEGEND_CSS, LEGEND_MAX_WSTAR } from '../windmap/thermalRenderer';

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
  const [thermalView, setThermalView] = useState<'map' | 'chart'>('map');

  // Per-site meteogram series (lazy — fetched the first time the chart is shown).
  const [meteogram, setMeteogram] = useState<{ hours: MeteogramHour[]; launchElevation: number | null } | null>(null);
  const [meteogramLoading, setMeteogramLoading] = useState(false);
  const [meteogramError, setMeteogramError] = useState<string | null>(null);
  useEffect(() => {
    if (thermalView !== 'chart' || meteogram || meteogramLoading || !site?.id) return;
    setMeteogramLoading(true);
    fetch(`/api/weather/${site.id}/meteogram`)
      .then(res => res.ok ? res.json() : Promise.reject(`HTTP ${res.status}`))
      .then((data: { hours: MeteogramHour[]; launchElevation: number | null }) => {
        setMeteogram(data);
        setMeteogramLoading(false);
      })
      .catch(e => { setMeteogramError(String(e)); setMeteogramLoading(false); });
  }, [thermalView, meteogram, meteogramLoading, site?.id]);

  const [thermalGrid, setThermalGrid] = useState<ThermalGrid | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sliderIndex, setSliderIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const dismissThermalInfoRef = useRef<(() => void) | null>(null);
  const [thermalInfo, setThermalInfo] = useState<{ cape: number; blh: number; wstar?: number; ccl?: number; precip?: number; weatherCode?: number; groundAmsl?: number } | null>(null);
  // lat/k from onTransformChange; fall back to site lat and a sensible default zoom.
  const [mapTransform, setMapTransform] = useState<{ lat: number; k: number }>({ lat: site?.lat ?? -37.8, k: 256 * Math.pow(2, 8) });
  const handleTransformChange = useCallback((lat: number, _lon: number, zoomLevel: number) => {
    setMapTransform({ lat, k: 256 * Math.pow(2, zoomLevel) });
  }, []);

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

  // Set initial slider to the closest flying slot to current Melbourne time
  useEffect(() => {
    if (!flyingSlots.length) return;
    const nowMs = Date.now();
    const best = flyingSlots.reduce(
      (bestI, slot, i) =>
        Math.abs(new Date(slot.t).getTime() - nowMs) <
        Math.abs(new Date(flyingSlots[bestI].t).getTime() - nowMs)
          ? i : bestI,
      0
    );
    setSliderIndex(best);
  }, [flyingSlots]);

  // Map slider position → original grid index → Unix ms timestamp
  const activeSlot = flyingSlots[sliderIndex];
  const currentTime = activeSlot ? new Date(activeSlot.t).getTime() : Date.now();

  // Compute current thermal reading at the site for the readout strip
  const siteReading = useMemo(() => {
    if (!thermalGrid || !site?.lat || !site?.lon) return null;
    return getThermalAt(site.lon, site.lat, currentTime, thermalGrid);
  }, [thermalGrid, site?.lat, site?.lon, currentTime]);

  const strength = siteReading
    ? getThermalStrength(effectiveWstar(siteReading.wstar, siteReading.cape))
    : null;

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

  const sliderContent = flyingSlots.length > 1 && (
    <div className="mt-2 px-1">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-mono text-muted-foreground w-7 text-right shrink-0">
          {fmtMelbTime(flyingSlots[0].t)}
        </span>
        <input
          type="range"
          min={0}
          max={flyingSlots.length - 1}
          value={sliderIndex}
          onChange={e => setSliderIndex(Number(e.target.value))}
          className="flex-1 h-1.5 appearance-none rounded-full cursor-pointer"
          style={{ accentColor: '#f97316' }}
        />
        <span className="text-[9px] font-mono text-muted-foreground w-7 shrink-0">
          {fmtMelbTime(flyingSlots[flyingSlots.length - 1].t)}
        </span>
      </div>
      <div className="text-center text-[10px] font-mono font-semibold text-amber-600 mt-0.5">
        {activeSlot ? fmtMelbTime(activeSlot.t) : ''}
        {strength && (
          <span className="ml-2 font-bold" style={{ color: strength.color }}>
            · {strength.label}
          </span>
        )}
        {siteReading && siteReading.blh > 0 && (
          <span className="ml-1.5 text-muted-foreground font-normal">
            BL Top <Altitude metres={siteReading.blh} step={100} />
          </span>
        )}
        {siteReading && siteReading.ccl !== undefined && siteReading.ccl > 0 && (
          <span className={cn('ml-1.5 font-normal', siteReading.ccl < 600 ? 'text-amber-500' : 'text-muted-foreground')}>
            Cu Base <Altitude metres={siteReading.ccl} step={100} />
          </span>
        )}
      </div>
    </div>
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
            onThermalInfoChange={setThermalInfo}
            dismissRef={dismissThermalInfoRef}
            siteMarkers={launchMarker}
            onTransformChange={handleTransformChange}
          />
        </Suspense>
      ) : null}

      {/* Fullscreen toggle */}
      <button
        onClick={() => setIsFullscreen(v => !v)}
        className="absolute top-2 right-2 bg-black/50 backdrop-blur-sm text-white rounded-md p-1.5 hover:bg-black/70 transition-colors z-10"
        title={fullscreen ? 'Exit fullscreen' : 'Fullscreen — XC planning view'}
      >
        {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
      </button>

      {/* Tapped-point info overlay */}
      {thermalInfo && (() => {
        const s = getThermalStrength(effectiveWstar(thermalInfo.wstar, thermalInfo.cape));
        return (
          <div className="absolute top-2 left-2 bg-black/75 backdrop-blur-sm rounded-lg px-2.5 py-2 z-10 min-w-[120px]">
            <div className="flex items-start justify-between gap-2.5">
              <div className="space-y-0.5">
                <div className="text-[10px] text-white/70 font-semibold uppercase tracking-wide">Tapped point</div>
                {s && <div className="text-[12px] font-bold leading-tight" style={{ color: s.color }}>{s.label}</div>}
                {thermalInfo.blh > 0 && (
                  <div className="text-[10px] text-white/75">BL Top <Altitude metres={thermalInfo.blh} step={100} /></div>
                )}
                {thermalInfo.ccl !== undefined && thermalInfo.ccl > 0 && (
                  <div className={cn('text-[10px]', thermalInfo.ccl < 600 ? 'text-amber-400' : 'text-white/75')}>
                    Cu Base <Altitude metres={thermalInfo.ccl} step={100} />{thermalInfo.ccl < 600 ? ' ⚠' : ''}
                  </div>
                )}
                {typeof thermalInfo.precip === 'number' && thermalInfo.precip >= 0.1 && (
                  <div className="text-[10px] text-sky-300">{precipDescription(thermalInfo.precip, thermalInfo.weatherCode)}</div>
                )}
                {typeof thermalInfo.groundAmsl === 'number' && (
                  <div className="text-[10px] text-white/75">Ground <Altitude metres={thermalInfo.groundAmsl} step={10} /></div>
                )}
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

      {/* Scale bar.
          Embedded: top-right, clear of the tapped-point info (top-left) and the
          fullscreen button (top-right of the map — but that's right-2 and this bar
          is tucked left of it; in practice the fullscreen button is 28px so we use
          right-10 to stay clear of it).
          Fullscreen: bottom-left, above the legend. */}
      {thermalGrid && (
        <div className={`absolute z-10 ${fullscreen ? 'left-2' : 'top-2 right-10'}`}
             style={fullscreen ? { bottom: 'calc(0.5rem + 52px)' } : undefined}>
          <MapScaleBar lat={mapTransform.lat} k={mapTransform.k} />
        </div>
      )}

      {/* Legend — collapsed to a swatch pill on this small map; tap to expand to a
          readable panel, tap the panel to hide. The pinch-to-zoom hint was
          removed as self-evident. */}
      {thermalGrid && (showLegend ? (
        <button
          onClick={(e) => { e.stopPropagation(); setShowLegend(false); }}
          className="absolute bottom-2 left-2 z-10 text-left bg-black/75 backdrop-blur-sm rounded-lg px-2.5 py-2 max-w-[calc(100%-1rem)]"
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
              <span className="w-[22px] flex justify-center shrink-0"><span className="inline-block w-3.5 h-2.5 rounded-sm" style={{ background: 'rgb(150,154,160)' }} /></span>
              <span>Overcast — grey sheet, thermals suppressed</span>
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
          className="absolute bottom-2 left-2 z-10 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full pl-1.5 pr-2.5 py-1 hover:bg-black/80 transition-colors"
          title="Show legend"
        >
          <span className="h-2 w-8 rounded-full" style={{ background: THERMAL_LEGEND_CSS }} />
          <span className="text-[11px] text-white/80 font-medium">Key</span>
        </button>
      ))}
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
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={headerClass} style={headerStyle}>Thermal Forecast</span>
            {dateLabel && (
              <span className="text-[8px] text-muted-foreground font-mono truncate">{dateLabel} · ECMWF</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {meteogramEnabled && (
              <div className="flex items-center rounded-md overflow-hidden border border-border-faint mr-0.5">
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setThermalView('map'); }}
                  className={cn('flex items-center gap-1 px-1.5 py-1 text-[10px] font-semibold transition-colors',
                    thermalView === 'map' ? 'bg-amber-500 text-white' : 'text-muted-foreground hover:bg-muted')}
                  title="Map view"
                >
                  <MapIcon className="w-3 h-3" /> Map
                </button>
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setThermalView('chart'); }}
                  className={cn('flex items-center gap-1 px-1.5 py-1 text-[10px] font-semibold transition-colors',
                    thermalView === 'chart' ? 'bg-amber-500 text-white' : 'text-muted-foreground hover:bg-muted')}
                  title="Chart view (meteogram)"
                >
                  <LineChart className="w-3 h-3" /> Chart
                </button>
              </div>
            )}
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

        {meteogramEnabled && thermalView === 'chart' ? (
          meteogramLoading ? (
            <div className="h-[300px] flex flex-col items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-amber-500 mb-1" />
              <span className="text-xs text-gray-500">Loading meteogram…</span>
            </div>
          ) : meteogramError || !meteogram ? (
            <div className="h-[300px] flex items-center justify-center">
              <span className="text-xs text-red-500">Failed to load meteogram</span>
            </div>
          ) : (
            <SiteMeteogramChart
              hours={meteogram.hours}
              launchElevation={meteogram.launchElevation}
              thresholds={{
                clearSkyPct: numSetting(settings.thermalClearSkyCloudPct, 12),
                overcastPct: numSetting(settings.thermalOvercastOnsetPct, 70),
                stormCape: numSetting(settings.thermalStormCapeGate, 500),
                minWstar: numSetting(settings.thermalMinWstar, 0.3),
                rainOffMm: numSetting(settings.thermalRainOffMm, 1),
              }}
            />
          )
        ) : (
          <>
            {mapArea(false)}
            {sliderContent}
          </>
        )}
      </div>

      {/* Fullscreen portal */}
      {isFullscreen && createPortal(
        <div
          className="fixed inset-0 z-[10001] h-[100dvh] bg-black flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Fullscreen header */}
          <div className="flex items-center justify-between px-3 py-2 bg-black/90 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2">
              <Thermometer className="w-4 h-4 text-amber-400" />
              <span className="text-white/80 text-xs font-semibold truncate">
                {site.name} — Thermal Forecast (XC Planning)
              </span>
            </div>
            <button
              onClick={() => setIsFullscreen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white shrink-0 ml-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Fullscreen map */}
          <div className="flex-1 min-h-0">
            {mapArea(true)}
          </div>

          {/* Fullscreen time slider */}
          {flyingSlots.length > 1 && (
            <div
              className="px-4 pt-3 bg-black/80 border-t border-white/10 shrink-0"
              style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
            >
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono text-white/50 w-8 text-right shrink-0">
                  {fmtMelbTime(flyingSlots[0].t)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={flyingSlots.length - 1}
                  value={sliderIndex}
                  onChange={e => setSliderIndex(Number(e.target.value))}
                  className="flex-1 h-2 appearance-none rounded-full cursor-pointer"
                  style={{ accentColor: '#f97316' }}
                />
                <span className="text-[10px] font-mono text-white/50 w-8 shrink-0">
                  {fmtMelbTime(flyingSlots[flyingSlots.length - 1].t)}
                </span>
              </div>
              <div className="flex items-center justify-center gap-3 mt-1.5">
                <span className="text-[11px] font-mono font-bold text-amber-400">
                  {activeSlot ? fmtMelbTime(activeSlot.t) : ''}
                </span>
                {strength && (
                  <span className="text-[11px] font-bold" style={{ color: strength.color }}>
                    {strength.label}
                  </span>
                )}
                {siteReading && siteReading.blh > 0 && (
                  <span className="text-[10px] text-white/50 font-mono">
                    BL Top <Altitude metres={siteReading.blh} step={100} />
                  </span>
                )}
                {siteReading && siteReading.ccl !== undefined && siteReading.ccl > 0 && (
                  <span className={cn('text-[10px] font-mono', siteReading.ccl < 600 ? 'text-amber-400 font-semibold' : 'text-white/50')}>
                    Cu Base <Altitude metres={siteReading.ccl} step={100} />
                    {siteReading.ccl < 600 ? ' ⚠' : ''}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>,
        document.body
      )}

      {showHelp && <ThermalHelpModal onClose={() => setShowHelp(false)} variant={meteogramEnabled && thermalView === 'chart' ? 'chart' : 'map'} />}
    </>
  );
}
