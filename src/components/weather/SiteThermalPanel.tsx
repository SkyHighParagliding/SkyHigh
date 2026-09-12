import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Maximize2, Minimize2, X, ChartLine, CalendarDays, Thermometer, Info } from 'lucide-react';
import { ThermalHelpModal } from '../windmap/ThermalHelpModal';
import { cn } from '@/lib/utils';
import type { ThermalGrid } from '../windmap/thermalInterpolation';
import { getThermalStrength, effectiveWstar, getThermalAt } from '../windmap/thermalInterpolation';
import type { SiteMarker } from '../windMapTypes';

const ThermalCanvas = lazy(() =>
  import('../windmap/ThermalCanvas').then(m => ({ default: m.ThermalCanvas }))
);

const THERMAL_LEGEND_CSS =
  'linear-gradient(to right, #0f172a 0%, #1e3a5f 15%, #1d6f42 30%, #d4a017 55%, #ff6b00 75%, #dc143c 100%)';

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
  variant: 'apple' | 'classic';
  onBack: (target: 'history' | 'outlook') => void;
  hasExtended: boolean;
  hasLiveWeather: boolean;
}

// Only show slots within flying hours (10am–8pm Melbourne time), today only
const FLYING_HOUR_START = 10;
const FLYING_HOUR_END = 20;

function getMelbHour(isoStr: string): number {
  return parseInt(
    new Date(isoStr).toLocaleTimeString('en-AU', {
      hour: '2-digit', hour12: false, timeZone: 'Australia/Melbourne',
    })
  );
}

export function SiteThermalPanel({ site, variant, onBack, hasExtended, hasLiveWeather }: SiteThermalPanelProps) {
  const [thermalGrid, setThermalGrid] = useState<ThermalGrid | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sliderIndex, setSliderIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [thermalInfo, setThermalInfo] = useState<{ cape: number; blh: number; wstar?: number; ccl?: number } | null>(null);

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

  const isApple = variant === 'apple';
  const panelClass = isApple ? 'rounded-xl p-3' : 'bg-navy/5 rounded-2xl p-3 sm:p-4 border border-navy/10';
  const panelStyle = isApple ? { background: '#f5f5f7' } : undefined;
  const headerClass = isApple
    ? 'text-[10px] font-semibold uppercase tracking-widest'
    : 'text-[8px] sm:text-[10px] font-bold text-foreground-faint uppercase tracking-widest';
  const headerStyle = isApple ? { color: '#86868b' } : undefined;
  const btnClass = isApple
    ? 'flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-colors hover:opacity-80'
    : 'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[9px] font-semibold bg-navy text-white hover:bg-navy/90 transition-colors';
  const btnStyle = isApple ? { background: '#0071e3', color: '#fff' } : undefined;

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
            Top {Math.round(siteReading.blh / 100) * 100}m
          </span>
        )}
        {siteReading && siteReading.ccl !== undefined && siteReading.ccl > 0 && (
          <span className={cn('ml-1.5 font-normal', siteReading.ccl < 600 ? 'text-amber-500' : 'text-muted-foreground')}>
            Base {Math.round(siteReading.ccl / 100) * 100}m
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
            siteMarkers={launchMarker}
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
          <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm rounded-lg px-2.5 py-1.5 z-10 min-w-[110px]">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-0.5">
                <div className="text-[8px] text-white/45 uppercase tracking-wide font-mono">Tapped point</div>
                {s && <div className="text-[11px] font-bold leading-tight" style={{ color: s.color }}>{s.label}</div>}
                {thermalInfo.blh > 0 && (
                  <div className="text-[9px] text-white/70 font-mono">Thermal top {Math.round(thermalInfo.blh / 100) * 100}m</div>
                )}
                {thermalInfo.ccl !== undefined && thermalInfo.ccl > 0 && (
                  <div className={cn('text-[9px] font-mono', thermalInfo.ccl < 600 ? 'text-amber-400' : 'text-white/70')}>
                    Cloudbase {Math.round(thermalInfo.ccl / 100) * 100}m{thermalInfo.ccl < 600 ? ' ⚠' : ''}
                  </div>
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setThermalInfo(null); }}
                className="text-white/40 hover:text-white/80 transition-colors shrink-0 mt-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        );
      })()}

      {/* Legend */}
      {thermalGrid && (
        <div className="absolute bottom-2 left-2 bg-black/55 backdrop-blur-sm rounded px-2 py-1 pointer-events-none">
          <div className="text-[7px] text-white/60 font-mono uppercase tracking-wide mb-0.5">Thermal Strength</div>
          <div className="h-1.5 w-24 rounded-full" style={{ background: THERMAL_LEGEND_CSS }} />
          <div className="flex justify-between text-[6px] text-white/45 font-mono mt-0.5 px-0.5">
            <span>None</span><span>Weak</span><span>Mod</span><span>XC</span>
          </div>
        </div>
      )}

      {/* Hint */}
      {thermalGrid && (
        <div className="absolute bottom-2 right-2 bg-black/55 backdrop-blur-sm rounded px-2 py-1 pointer-events-none">
          <span className="text-[7px] text-white/70 font-mono">Scroll / pinch to zoom</span>
        </div>
      )}
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
        <div className={cn('flex items-center justify-between', isApple ? 'mb-2' : 'mb-2 sm:mb-3')}>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={headerClass} style={headerStyle}>Thermal Forecast</span>
            {dateLabel && (
              <span className="text-[8px] text-muted-foreground font-mono truncate">{dateLabel} · ECMWF</span>
            )}
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
        {sliderContent}
      </div>

      {/* Fullscreen portal */}
      {isFullscreen && createPortal(
        <div
          className="fixed inset-0 z-[10001] bg-black flex flex-col"
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
            <div className="px-4 py-3 bg-black/80 border-t border-white/10 shrink-0">
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
                    Thermal top {Math.round(siteReading.blh / 100) * 100}m
                  </span>
                )}
                {siteReading && siteReading.ccl !== undefined && siteReading.ccl > 0 && (
                  <span className={cn('text-[10px] font-mono', siteReading.ccl < 600 ? 'text-amber-400 font-semibold' : 'text-white/50')}>
                    Cloudbase {Math.round(siteReading.ccl / 100) * 100}m
                    {siteReading.ccl < 600 ? ' ⚠' : ''}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>,
        document.body
      )}

      {showHelp && <ThermalHelpModal onClose={() => setShowHelp(false)} />}
    </>
  );
}
