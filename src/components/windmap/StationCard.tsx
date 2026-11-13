import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { Altitude } from '@/components/Altitude';
import { formatClockTime } from '@/lib/dateUtils';
import { haversineDistance } from '@/lib/utils';
import { useStationHistory } from '@/hooks/useLiveStations';
import { getCompassDirection, type SiteMarker } from '../windMapTypes';
import type { WindGrid } from './windInterpolation';
import type { LiveStation } from '../../../shared/stations';
import { StationHistoryChart, SPEED_FACTOR, windAtPoint, minutesAgo, fmtAgo, fmtObs, type SpeedUnit } from './StationHistoryChart';

// Station card for the live stations overlay: shown in the tapped-point card's
// slot when a station box is tapped. Same container, headline size, pull tab and
// ✕ as the tapped-point card (wiki/12 §6); units, direction mode and the 12/24 h
// clock are the map's shared settings, so tapping them here changes them
// everywhere (map boxes, forecast card, chart axis).

const READOUT_FONT_PX = 15;
const CLICKABLE = 'text-sky-500 hover:text-sky-400';
const BOM_COPYRIGHT = 'Observations © Commonwealth of Australia, Bureau of Meteorology';
/** A non-site station counts as "at" a flying site within this distance. */
const SITE_MATCH_KM = 1;

type DirMode = 'compass' | 'deg';

interface StationCardProps {
  station: LiveStation;
  sites: SiteMarker[];
  windGrid: WindGrid | null;
  /** The map's scrubber time — the forecast line is for this moment. */
  currentTime: number;
  /** False when the scrubber is off "now": observations are still "now". */
  mapIsNow: boolean;
  /** The map's formatted scrubber time, shown on the forecast line when off "now". */
  formattedTime: string;
  speedUnit: SpeedUnit;
  dirMode: DirMode;
  use24h: boolean;
  onCycleSpeedUnit: () => void;
  onToggleDirMode: () => void;
  onToggleClock: () => void;
  open: boolean;
  onSetOpen: (open: boolean) => void;
  swipeHandlers: { onPointerDown: (e: React.PointerEvent) => void; onPointerUp: (e: React.PointerEvent) => void };
  /** The map's time pills (forecast or radar), same as the tapped-point card. */
  timeControls?: ReactNode;
  onClose: () => void;
}

export function StationCard({
  station, sites, windGrid, currentTime, mapIsNow, formattedTime,
  speedUnit, dirMode, use24h, onCycleSpeedUnit, onToggleDirMode, onToggleClock,
  open, onSetOpen, swipeHandlers, timeControls, onClose,
}: StationCardProps) {
  // Re-render every 30 s so "N min ago" and the chart's time axis stay current.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const history = useStationHistory(station.id);
  const fs = { fontSize: READOUT_FONT_PX };
  const fmtDir = (deg: number) => (dirMode === 'deg' ? `${Math.round(deg)}°` : getCompassDirection(deg));
  const obsMs = Date.parse(station.obsTime);
  const stuckParsed = station.unchangedSince ? Date.parse(station.unchangedSince) : NaN;
  const stuckMs = Number.isFinite(stuckParsed) ? stuckParsed : null;
  const ago = fmtAgo(minutesAgo(station.obsTime, now));
  const o = fmtObs(station.speedKt, station.gustKt, speedUnit);
  const fcst = windAtPoint(station.lon, station.lat, currentTime, windGrid);
  const fcstSpeed = fcst ? Math.round(fcst.speedKt * SPEED_FACTOR[speedUnit]) : null;

  // Nearest flying site, and the site this station belongs to (by name for our
  // site stations, else any site within SITE_MATCH_KM).
  const { nearest, siteMatch } = useMemo(() => {
    let best: { site: SiteMarker; km: number } | null = null;
    for (const s of sites) {
      const km = haversineDistance(station.lat, station.lon, s.lat, s.lon);
      if (!best || km < best.km) best = { site: s, km };
    }
    const byName = station.siteName
      ? sites.find(s => s.name.trim().toLowerCase() === station.siteName!.trim().toLowerCase())
      : undefined;
    return { nearest: best, siteMatch: byName ?? (best && best.km <= SITE_MATCH_KM ? best.site : undefined) };
  }, [sites, station.lat, station.lon, station.siteName]);

  const extras = [
    station.tempC != null ? `${station.tempC.toFixed(1)}°C` : null,
    station.pressureHpa != null ? `${Math.round(station.pressureHpa)} hPa` : null,
    station.humidityPct != null ? `RH ${Math.round(station.humidityPct)}%` : null,
  ].filter(Boolean).join(' · ');

  const speedBtn = (text: string) => (
    <button onClick={onCycleSpeedUnit} className={CLICKABLE} title="Tap to change speed units (kt / mph / kph)">{text}</button>
  );

  return (
    <div className="relative bg-black/75 backdrop-blur-sm rounded-lg px-2.5 pt-2 pb-1 min-w-[232px] max-w-[calc(100vw-1.5rem)]" data-station-card>
      <div {...swipeHandlers} className="select-none" style={{ touchAction: 'none', WebkitUserSelect: 'none' }}>
        <div className="space-y-0.5 pr-5">
          <div className="font-semibold leading-tight text-white truncate max-w-[260px]" style={fs} title={station.name}>{station.name}</div>
          <div className="flex items-baseline gap-1.5 leading-tight" style={fs}>
            <button onClick={onToggleClock} className={`font-semibold ${CLICKABLE}`} title="Tap to switch 12-hour / 24-hour clock" data-readout="time">
              {Number.isFinite(obsMs) ? formatClockTime(obsMs, use24h) : '—'}
            </button>
            {ago && <span className="text-white/60 text-[11px]">· {ago}</span>}
            {station.stale && <span className="text-[10px] font-semibold tracking-wide uppercase text-amber-400" title="This reading is more than 90 min old">Stale</span>}
            {!station.stale && stuckMs != null && <span className="text-[10px] font-semibold tracking-wide uppercase text-amber-400" title="Speed, gust and direction haven't changed for a long time: the station may be stuck">Unchanged</span>}
          </div>
          {!station.stale && stuckMs != null && (
            <div className="text-[10px] text-amber-300/90 leading-tight">
              Same reading since {formatClockTime(stuckMs, use24h)}: the station may be stuck
            </div>
          )}
          <div className="flex items-baseline gap-1 font-semibold leading-tight" style={fs} data-readout="main">
            <span className="text-white/75">Obs</span>
            {o.calm ? (
              <span className="text-white/85">Calm</span>
            ) : (
              <>
                {speedBtn(o.speed)}
                {o.gust && <>{speedBtn(`G${o.gust}`)}</>}
                {speedBtn(speedUnit)}
                {station.dirDeg != null && (
                  <>
                    <span className="text-white/40 font-normal">/</span>
                    <button onClick={onToggleDirMode} className={`${CLICKABLE} tracking-wide`} title="Tap to switch compass / degrees">{fmtDir(station.dirDeg)}</button>
                  </>
                )}
              </>
            )}
          </div>
          {fcst && fcstSpeed != null && (
            <div className="leading-tight text-white/75" style={fs} data-readout="second">
              <span className="font-semibold tracking-wide">Fcst</span> {fcstSpeed} {speedUnit} <span className="text-white/40">/</span> <span className="font-semibold tracking-wide">{fmtDir(fcst.dirDeg)}</span>
              {!mapIsNow && <span className="text-[10px] text-white/60"> at {formattedTime}</span>}
            </div>
          )}
          {!mapIsNow && <div className="text-[10px] text-white/60 leading-tight">Observed: now · the map shows a forecast time</div>}
        </div>
        {timeControls && <div className="pt-2">{timeControls}</div>}
        <button
          onClick={() => onSetOpen(!open)}
          className="w-full flex flex-col items-center pt-1.5 pb-0.5 text-white/40 hover:text-white/70"
          title={open ? 'Show less' : 'Show more'}
          aria-expanded={open}
          data-card-tab
        >
          <span className="block w-8 h-1 rounded-full bg-white/25" />
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {open && (
        <div className="pb-1.5 border-t border-white/10 pt-1.5 space-y-0.5">
          {station.siteName && <div className="text-[10px] text-white/75">Station for {station.siteName}</div>}
          {extras && <div className="text-[10px] text-white/75">{extras}</div>}
          {station.elevation != null && (
            <div className="text-[10px] text-white/75">Elevation <Altitude metres={station.elevation} step={10} /> AMSL</div>
          )}
          {nearest && nearest.site !== siteMatch && (
            <div className="text-[10px] text-white/75">
              Nearest site {nearest.site.name} · {nearest.km < 1 ? '<1' : nearest.km.toFixed(nearest.km < 10 ? 1 : 0)} km
            </div>
          )}
          {siteMatch && (
            <a href={`/sites/${siteMatch.id}`} className={`block text-[10px] font-semibold ${CLICKABLE}`}>View {siteMatch.name} site guide →</a>
          )}
          <div className="pt-1.5">
            <div className="text-[10px] text-white/75 font-semibold tracking-wide mb-0.5">Last 6 hours</div>
            <StationHistoryChart
              points={history.data?.points}
              loading={history.isLoading}
              error={history.isError}
              unit={speedUnit}
              use24h={use24h}
              lat={station.lat}
              lon={station.lon}
              windGrid={windGrid}
              now={now}
            />
            <div className="flex items-center gap-2.5 text-[9px] text-white/55">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-sky-400" />Wind</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 bg-sky-400/25" />Gust</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 border-t border-dotted border-amber-300" />Forecast</span>
            </div>
          </div>
          <div className="pt-1 text-[9px] text-white/45 leading-snug">
            {station.attribution && <div>Data: {station.attribution}</div>}
            {station.source === 'bom' && <div>{BOM_COPYRIGHT}</div>}
          </div>
        </div>
      )}
      <button onClick={onClose} className="absolute top-2 right-2 text-white/50 hover:text-white/80 transition-colors" title="Close station" aria-label="Close station">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
