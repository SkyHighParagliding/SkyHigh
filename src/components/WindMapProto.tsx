import { useState, useCallback, useRef } from 'react';
import { Loader2, X, Minimize2 } from 'lucide-react';
import { Altitude } from '@/components/Altitude';
import { WindMapModeToggle } from './windmap/WindMapModeToggle';
import { WindMapScrubberTray } from './windmap/WindMapScrubberTray';
import { MapScaleBar } from './windmap/MapScaleBar';
import { fetchWindGridCached } from '@/lib/windGridCache';
import { INITIAL_K, getCompassDirection, SPEED_LEGEND_CSS, SCALE_BAR_BOTTOM_COLLAPSED } from './windMapTypes';
import { WindCanvas } from './windmap/WindCanvas';
import { useWindPlayback } from '@/hooks/useWindPlayback';

interface WindMapProps {
  siteId: string;
  siteLat: number;
  siteLon: number;
  siteName?: string;
  siteStatus?: string;
  siteUpcomingClosureDates?: string[];
  fullscreen?: boolean;
  /** When shown fullscreen, wires the top-right minimize button (fullscreen == embedded). */
  onExitFullscreen?: () => void;
}

export default function WindMapProto({ siteId, siteLat, siteLon, siteName, siteStatus, siteUpcomingClosureDates, fullscreen = false, onExitFullscreen }: WindMapProps) {
  const [, setZoomK] = useState(INITIAL_K);
  const [singleWindInfo, setSingleWindInfo] = useState<{ speed: number; direction: number; groundAmsl?: number } | null>(null);
  const [mapMode, setMapMode] = useState<'today' | '7day'>('today');
  // Collapsible "Key" legend pill (bottom-left) — collapsed by default.
  const [showLegend, setShowLegend] = useState(false);
  // lat/k from onTransformChange (zoomLevel → k = 256 * 2^zoomLevel)
  const [mapTransform, setMapTransform] = useState<{ lat: number; k: number }>({ lat: siteLat, k: INITIAL_K });
  // The ✕ on the readout box calls this to clear the pin fully (box + pin +
  // crosshair), otherwise the render loop repaints it.
  const dismissWindRef = useRef<(() => void) | null>(null);

  const todayFetcher = useCallback(() => fetchWindGridCached(siteId), [siteId]);

  const handleTransformChange = useCallback((lat: number, _lon: number, zoomLevel: number) => {
    setMapTransform({ lat, k: 256 * Math.pow(2, zoomLevel) });
  }, []);

  const dismissReading = useCallback(() => {
    dismissWindRef.current?.();
    setSingleWindInfo(null);
  }, []);

  const {
    windGrid, loading, error,
    currentTime, isPlaying, trayOpen, toggleTray,
    playSpeed, timeStep, forecastStart, forecastEnd,
    formattedTime, handleSliderChange, togglePlay, cycleSpeed,
  } = useWindPlayback(mapMode, todayFetcher);

  const modeToggle = <WindMapModeToggle mode={mapMode} onChange={setMapMode} />;

  if (loading) {
    return (
      <div className={`${fullscreen ? 'w-full h-full' : 'w-full aspect-square'} relative flex items-center justify-center bg-[#0a0a0a] ${fullscreen ? '' : 'rounded-xl'}`}>
        <div className="absolute top-3 left-3 z-30">{modeToggle}</div>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 text-sky-400 animate-spin" />
          <span className="text-xs text-white/50 font-mono">Loading {mapMode === '7day' ? '7-day' : ''} wind data...</span>
        </div>
      </div>
    );
  }

  if (error || !windGrid) {
    return (
      <div className={`${fullscreen ? 'w-full h-full' : 'w-full aspect-square'} relative flex items-center justify-center bg-[#0a0a0a] ${fullscreen ? '' : 'rounded-xl'}`}>
        <div className="absolute top-3 left-3 z-30">{modeToggle}</div>
        <span className="text-xs text-red-400 font-mono">{error || 'No wind data available'}</span>
      </div>
    );
  }

  return (
    <div className={fullscreen ? 'w-full h-full flex flex-col' : 'w-full'}>
      <div
        className={`relative overflow-hidden ${fullscreen ? 'flex-1 min-h-0' : 'rounded-xl border border-gray-700 aspect-square'}`}
      >
        <WindCanvas
          windGrid={windGrid}
          currentTime={currentTime}
          siteLat={siteLat}
          siteLon={siteLon}
          siteName={siteName}
          onZoomChange={setZoomK}
          onWindInfoChange={setSingleWindInfo}
          dismissRef={dismissWindRef}
          onTransformChange={handleTransformChange}
          siteStatus={siteStatus}
          siteUpcomingClosureDates={siteUpcomingClosureDates}
        />

        {/* Fullscreen == embedded: a top-right minimize button (matches the picker
            and thermal panel). Only wired when shown fullscreen. */}
        {fullscreen && onExitFullscreen && (
          <button
            onClick={onExitFullscreen}
            className="absolute top-3 right-3 z-40 w-8 h-8 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/80 transition-colors shadow-lg"
            title="Exit fullscreen"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
        )}

        {/* Stacked, dismissable tapped-point readout box (top-left) — hidden until
            the map is tapped; ✕ dismisses the pin fully via dismissRef. Hidden on
            small screens when the legend is expanded so the two don't overlap. */}
        {singleWindInfo && (
          <div className={`absolute top-3 left-3 z-30 bg-black/75 backdrop-blur-sm rounded-lg px-2.5 py-2 min-w-[120px] max-w-[calc(100vw-1.5rem)] ${showLegend ? 'hidden lg:block' : ''}`}>
            <div className="flex items-start justify-between gap-2.5">
              <div className="space-y-0.5">
                <div className="text-[10px] text-white/70 font-semibold uppercase tracking-wide">Tapped point</div>
                <div className="text-[12px] font-bold leading-tight text-sky-400">{singleWindInfo.speed.toFixed(1)} kt</div>
                <div className="text-[11px] text-white/75">
                  {singleWindInfo.direction.toFixed(0)}° <span className="text-sky-300 font-semibold tracking-wide">{getCompassDirection(singleWindInfo.direction)}</span>
                </div>
                {typeof singleWindInfo.groundAmsl === 'number' && (
                  <div className="text-[11px] text-white/75">Ground <Altitude metres={singleWindInfo.groundAmsl} step={10} /> AMSL</div>
                )}
              </div>
              <button
                onClick={dismissReading}
                className="text-white/50 hover:text-white/80 transition-colors shrink-0 mt-0.5"
                title="Dismiss reading"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Collapsible "Key" legend pill (bottom-left). Collapsed = gradient
            swatch + "Key"; expanded = the readable Forecast Data panel. */}
        {showLegend ? (
          <button
            onClick={(e) => { e.stopPropagation(); setShowLegend(false); }}
            className={`absolute ${fullscreen ? 'bottom-[calc(2.75rem+env(safe-area-inset-bottom,0px))]' : 'bottom-[2.75rem]'} left-3 z-30 text-left bg-black/75 backdrop-blur-sm rounded-lg px-2.5 py-2 max-w-[calc(100vw-1.5rem)]`}
            title="Tap to hide legend"
          >
            <div className="flex items-center justify-between gap-2.5 mb-1">
              <span className="text-[10px] text-white/70 font-semibold uppercase tracking-wide">Forecast Data</span>
              <X className="w-3.5 h-3.5 text-white/50 shrink-0" />
            </div>
            <div className="relative w-44 max-w-full">
              <div className="h-2.5 w-full rounded-full" style={{ background: SPEED_LEGEND_CSS }} />
              {singleWindInfo && (
                <div
                  className="absolute top-0 w-px bg-card shadow-[0_0_3px_rgba(255,255,255,0.8)]"
                  style={{ left: `${Math.min(100, (singleWindInfo.speed / 20) * 100)}%`, height: 'calc(100% + 2px)' }}
                />
              )}
            </div>
            <div className="flex justify-between mt-1 w-44 max-w-full text-[10px] font-mono text-white/60 px-0.5">
              <span>0</span><span>5</span><span>10</span><span>15</span><span>20+ kt</span>
            </div>
            {/* CC BY 4.0 attribution for the DEM behind the Ground readout. */}
            <div
              className="text-[9px] text-white/40 mt-2 leading-snug"
              title="Ground elevation from Mapzen/AWS Terrain Tiles. Australian data: DEM derived from LiDAR 5 Metre Grid — © Commonwealth of Australia (Geoscience Australia) 2017, CC BY 4.0. Elsewhere: USGS 3DEP/SRTM/GMTED2010, NOAA ETOPO1 (public domain)."
            >
              Terrain © GA / USGS
            </div>
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); setShowLegend(true); }}
            className={`absolute ${fullscreen ? 'bottom-[calc(0.4rem+env(safe-area-inset-bottom,0px))]' : 'bottom-[0.4rem]'} left-3 z-30 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full pl-1.5 pr-2.5 py-1 hover:bg-black/80 transition-colors`}
            title="Show legend"
          >
            <span className="h-2 w-8 rounded-full" style={{ background: SPEED_LEGEND_CSS }} />
            <span className="text-[11px] text-white/80 font-medium">Key</span>
          </button>
        )}

        {/* Scale bar — left-justified with the Key pill (a row above it), lower z
            so the expanded legend panel sits over it. Shifts up when the tray is open. */}
        <div
          className="absolute left-3 z-20 transition-[bottom] duration-300 pointer-events-none"
          style={{ bottom: trayOpen ? 104 : SCALE_BAR_BOTTOM_COLLAPSED }}
        >
          <MapScaleBar lat={mapTransform.lat} k={mapTransform.k} />
        </div>

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
          mapMode={mapMode}
          modeToggle={modeToggle}
          insetBottom={fullscreen}
        />
      </div>
    </div>
  );
}
