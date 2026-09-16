import { CloudSun, Sun, Cloud, CloudRain, CloudDrizzle, CloudSnow, CloudLightning, CloudFog, Snowflake, Wind, Thermometer, type LucideIcon } from 'lucide-react';
import { getWeatherIcon, getWindStatus, getIdealDirections } from '@/lib/utils';
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
const WindMap = lazy(() => import('./WindMap'));

import type { TideData } from './weather/types';
import { WeatherCardApple } from './weather/WeatherCardApple';

const WEATHER_ICON_MAP: Record<string, LucideIcon> = {
  Sun, CloudSun, Cloud, Cloudy: Cloud, CloudRain, CloudDrizzle, CloudSnow, CloudLightning, CloudFog, Snowflake, Wind, Thermometer,
};

export function WeatherCard({ weather, site, distance }: { weather: any; site: any; distance?: number | string }) {
  const [showWindMap, setShowWindMap] = useState(false);
  const [showAlt, setShowAlt] = useState(false);
  const [extendedForecast, setExtendedForecast] = useState<any>(null);
  const [hourTick, setHourTick] = useState(0);
  const [showTides, setShowTides] = useState(false);
  const [tideData, setTideData] = useState<TideData | null>(null);
  const [activePanel, setActivePanel] = useState<'history' | 'outlook' | 'thermal'>('history');

  const isTidal = site && !(site.type || "").toLowerCase().includes("inland");

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const now = new Date();
    const msUntilNextHour = (60 - now.getMinutes()) * 60000 - now.getSeconds() * 1000 - now.getMilliseconds();
    const timeoutId = setTimeout(() => {
      setHourTick(t => t + 1);
      intervalId = setInterval(() => setHourTick(t => t + 1), 3600000);
    }, msUntilNextHour);
    return () => {
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  const { data: extForecastData } = useQuery({
    queryKey: ['weather', site?.id, 'extended-forecast'],
    queryFn: () => api.get<Record<string, any>>(`/api/weather/${site!.id}/extended-forecast`).catch(() => null),
    enabled: !!site?.id,
    staleTime: 15 * 60 * 1000,
  });

  useEffect(() => {
    if (extForecastData?.days) setExtendedForecast(extForecastData);
    else setExtendedForecast(null);
  }, [extForecastData]);

  const { data: tideQueryData } = useQuery({
    queryKey: ['sites', site?.id, 'tides'],
    queryFn: () => api.get<Record<string, any>>(`/api/sites/${site!.id}/tides`).catch(() => null),
    enabled: !!isTidal && !!site?.id,
    refetchInterval: 10 * 60 * 1000,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (tideQueryData) setTideData(tideQueryData);
    else { setTideData(null); setShowTides(false); }
  }, [tideQueryData]);

  const isLive = weather?.type === 'live';

  const hasAlt = weather?.altObservation && weather.type === 'live';
  const activeStationName: string | null = hasAlt && showAlt
    ? (weather.altObservation.stationName ?? null)
    : (weather?.stationName ?? null);

  const activeStationId: string | undefined = showAlt ? site?.liveStationIdAlt : site?.liveStationId;
  const sourceType: string | null = (() => {
    if (!activeStationId) return null;
    if (activeStationId.startsWith('freeflightwx-')) return 'freeflightwx';
    if (activeStationId.startsWith('livewind-')) return 'livewind';
    if (activeStationId.startsWith('bom-')) return 'bom';
    if (activeStationId.startsWith('davis-')) return 'davis';
    return 'wu';
  })();

  const { data: scraperSchedule = null } = useQuery({
    queryKey: ['scraper-schedule'],
    queryFn: () => api.get<Record<string, number>>('/api/weather/scraper-schedule').catch(() => null),
    enabled: !!site?.id && isLive,
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });

  const nextReadingMs: number | null = (scraperSchedule && sourceType) ? (scraperSchedule[sourceType] ?? null) : null;

  const { data: historyData = null } = useQuery({
    queryKey: ['weather', site?.id, 'history', activeStationName],
    queryFn: () => {
      const url = activeStationName
        ? `/api/weather/${site!.id}/history?station=${encodeURIComponent(activeStationName)}`
        : `/api/weather/${site!.id}/history`;
      return api.get<{ points: any[]; buckets: any[] }>(url).catch(() => null);
    },
    enabled: !!site?.id && isLive && activePanel === 'history',
    refetchInterval: 2 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
  });

  const hasExtended = extendedForecast?.days?.length > 0;
  const effectiveShowTides = tideData ? (showTides || !hasExtended) : false;

  const hasLiveHistory = isLive;

  const activeWeather = hasAlt && showAlt ? {
    ...weather,
    windSpeed: weather.altObservation.windSpeed,
    windGust: weather.altObservation.windGust,
    direction: weather.altObservation.direction,
    stationName: weather.altObservation.stationName,
    stationLat: weather.altObservation.stationLat,
    stationLon: weather.altObservation.stationLon,
    timestamp: weather.altObservation.timestamp,
  } : weather;

  useEffect(() => {
    if (showWindMap) {
      document.body.style.overflow = 'hidden';
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowWindMap(false); };
      window.addEventListener('keydown', onKey);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', onKey);
      };
    }
  }, [showWindMap]);

  const idealDirs = useMemo(() => getIdealDirections(site), [site?.windDir, site?.windSpeed, site?.id]);

  const direction = activeWeather?.direction || activeWeather?.windDirection || '';
  const windStatus = useMemo(
    () => getWindStatus(activeWeather?.windSpeed ?? null, direction, site),
    [activeWeather?.windSpeed, direction, site?.windDir, site?.windSpeed, site?.id]
  );

  const forecasts = useMemo(() => {
    if (!weather?.forecasts) return [];
    try {
      return JSON.parse(weather.forecasts);
    } catch (e) {
      console.error("Failed to parse forecasts", e);
      return [];
    }
  }, [weather?.forecasts]);

  const forecastWindow = useMemo(() => {
    const WINDOW_SIZE = 7;
    let windowedForecasts = forecasts;
    let forecastSubtitle = '';
    let forecastWindowStartMs: number | undefined;
    let forecastWindowEndMs: number | undefined;

    if (forecasts.length > WINDOW_SIZE) {
      const now = Date.now();
      const maxStart = forecasts.length - WINDOW_SIZE;
      const forecastTimes = forecasts.map((f: any) => new Date(f.timestamp).getTime());

      let startIdx = 0;
      if (now < forecastTimes[0]) {
        startIdx = 0;
      } else if (now >= forecastTimes[forecastTimes.length - 1]) {
        startIdx = maxStart;
      } else {
        let floorIdx = 0;
        for (let i = forecastTimes.length - 1; i >= 0; i--) {
          if (forecastTimes[i] <= now) {
            floorIdx = i;
            break;
          }
        }
        startIdx = Math.min(floorIdx, maxStart);
      }
      windowedForecasts = forecasts.slice(startIdx, startIdx + WINDOW_SIZE);
    }

    if (windowedForecasts.length > 0) {
      const firstTime = new Date(windowedForecasts[0].timestamp);
      const lastTime = new Date(windowedForecasts[windowedForecasts.length - 1].timestamp);
      forecastWindowStartMs = firstTime.getTime();
      forecastWindowEndMs = lastTime.getTime();
      const n = windowedForecasts.length;
      if (n > 1) {
        const slotMs = (forecastWindowEndMs - forecastWindowStartMs) / (n - 1);
        forecastWindowStartMs -= slotMs / 2;
        forecastWindowEndMs += slotMs / 2;
      }
      const fmt = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', hour12: true }).toUpperCase();
      forecastSubtitle = `${fmt(firstTime)}–${fmt(lastTime)}`;
    }

    return { windowedForecasts, forecastSubtitle, forecastWindowStartMs, forecastWindowEndMs };
  }, [forecasts, hourTick]);

  if (!weather || weather.error) {
    return (
      <div className="rounded-2xl p-8 flex flex-col items-center text-center min-h-[200px] justify-center" style={{ background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 8px 30px rgba(0,0,0,0.06)' }}>
        <CloudSun className="h-12 w-12 text-accent mb-4" />
        <h3 className="font-bold text-xl mb-2" style={{ color: '#1d1d1f' }}>{site.name}</h3>
        <p className="text-sm text-muted-foreground mb-4 italic">
          {weather?.error ? "No weather data available" : "Fetching observations..."}
        </p>
        <span className={`px-4 py-1.5 rounded-full text-xs font-semibold text-white bg-gray-400`}>
          {weather?.error ? "Offline" : "Connecting..."}
        </span>
      </div>
    );
  }

  const IconComponent = WEATHER_ICON_MAP[getWeatherIcon(activeWeather.icon)] || CloudSun;
  const { windowedForecasts, forecastSubtitle, forecastWindowStartMs, forecastWindowEndMs } = forecastWindow;
  const isDirectionIdeal = idealDirs.includes(direction);

  const windMapPortal = showWindMap && site.lat && site.lon && createPortal(
    // Fullscreen == embedded: no separate header — the map carries its own
    // top-right minimize button (wired via onExitFullscreen), matching the
    // picker and thermal panel.
    <div
      className="fixed inset-0 z-[10001] bg-black"
      onClick={(e) => e.stopPropagation()}
    >
      <Suspense fallback={<div className="w-full h-full flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div></div>}>
        <WindMap siteId={site.id} siteLat={site.lat} siteLon={site.lon} siteName={site.name} siteStatus={site.status} siteUpcomingClosureDates={site.upcomingClosureDates} fullscreen onExitFullscreen={() => setShowWindMap(false)} />
      </Suspense>
    </div>,
    document.body
  );

  const handleSetShowTides = (v: boolean) => { setShowTides(v); };
  const handleSetActivePanel = (v: 'history' | 'outlook' | 'thermal') => { setActivePanel(v); setShowTides(false); };

  const renderProps = {
    site, activeWeather, weather, distance, hasAlt, showAlt, setShowAlt, direction, windStatus, idealDirs, isDirectionIdeal,
    windowedForecasts, forecastSubtitle, forecastWindowStartMs, forecastWindowEndMs,
    hasExtended, extendedForecast, tideData, showTides, setShowTides: handleSetShowTides, effectiveShowTides,
    hasLiveWeather: hasLiveHistory, activePanel, setActivePanel: handleSetActivePanel, historyData: hasLiveHistory ? (historyData ?? null) : null,
    nextReadingMs: hasLiveHistory ? nextReadingMs : null,
    setShowWindMap, windMapPortal, IconComponent, WEATHER_ICON_MAP,
  };

  return <WeatherCardApple {...renderProps} />;
}
