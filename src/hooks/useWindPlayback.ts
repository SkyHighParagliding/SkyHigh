import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { nextSpeed } from '@/components/windMapTypes';
import type { PlaySpeed } from '@/components/windMapTypes';
import { formatWindMapTime } from '@/lib/dateUtils';
import type { WindGrid } from '@/components/windmap/windInterpolation';

export interface UseWindPlaybackResult {
  windGrid: WindGrid | null;
  loading: boolean;
  error: string | null;
  currentTime: number;
  isPlaying: boolean;
  trayOpen: boolean;
  toggleTray: () => void;
  playSpeed: PlaySpeed;
  timeStep: number;
  forecastStart: number;
  forecastEnd: number;
  formattedTime: string;
  handleSliderChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  togglePlay: () => void;
  cycleSpeed: () => void;
}

// todayFetcher MUST be wrapped in useCallback with correct deps by the caller.
// An unstable reference (new function every render) will cause a refetch loop.
export function useWindPlayback(
  mapMode: 'today' | '7day',
  todayFetcher: () => Promise<WindGrid>,
  /**
   * Optional default hour (0–23, Melbourne local) for the initial slider
   * position. When set, the slider opens at today-at-this-hour (clamped to the
   * forecast range) instead of "now". Undefined reproduces the original "now,
   * else forecast start" behaviour exactly. Wired from the admin thermal-map
   * default-hour setting.
   */
  defaultHour?: number,
): UseWindPlaybackResult {
  const [windGrid, setWindGrid] = useState<WindGrid | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [isPlaying, setIsPlaying] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const [playSpeed, setPlaySpeed] = useState<PlaySpeed>(5000);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Ref always holds the latest fetcher; effect body calls through it so a stale
  // closure never invokes the wrong fetcher even if deps fire from a previous render.
  const todayFetcherRef = useRef(todayFetcher);
  todayFetcherRef.current = todayFetcher;

  // Read inside the load effect without adding to its deps (a changed default
  // hour must not trigger a grid re-fetch — it only matters at initial load).
  const defaultHourRef = useRef(defaultHour);
  defaultHourRef.current = defaultHour;

  // Pre-computed bounds cached when grid loads — avoids string parsing inside the
  // setInterval callback on every playback tick (#8).
  const gridBoundsRef = useRef({ start: 0, end: 0 });

  useEffect(() => {
    setLoading(true);
    setError(null);
    setIsPlaying(false);

    // Surfaces JSON error body from the server rather than a bare HTTP status (#9).
    const fetchPromise: Promise<WindGrid> = mapMode === '7day'
      ? fetch('/api/weather/extended-grid/wind-overlay').then(async res => {
          if (!res.ok) {
            const body = await res.json().catch(() => null);
            throw new Error((body as { error?: string })?.error || `HTTP ${res.status}`);
          }
          return res.json();
        })
      : todayFetcherRef.current();

    fetchPromise
      .then(data => {
        if (data?.times?.length && data?.data?.length && data.ni && data.nj) {
          const start = new Date(data.times[0]).getTime();
          const end = new Date(data.times[data.times.length - 1]).getTime();
          gridBoundsRef.current = { start, end };
          setWindGrid(data);
          const now = Date.now();
          let target = now >= start && now <= end ? now : start;
          const dh = defaultHourRef.current;
          if (dh != null && Number.isFinite(dh)) {
            const d = new Date();
            d.setHours(dh, 0, 0, 0);
            target = Math.min(Math.max(d.getTime(), start), end);
          }
          setCurrentTime(target);
        } else {
          setError('Invalid wind data');
        }
        setLoading(false);
      })
      .catch(err => {
        setError((err as Error).message || 'Failed to load wind data');
        setLoading(false);
      });
  }, [mapMode, todayFetcher]);

  const timeStep = mapMode === '7day' ? 4 * 60 * 60 * 1000 : 15 * 60 * 1000;

  useEffect(() => {
    if (isPlaying && windGrid) {
      playIntervalRef.current = setInterval(() => {
        const { start, end } = gridBoundsRef.current;
        setCurrentTime(prev => {
          const next = prev + timeStep;
          return next > end ? start : next;
        });
      }, playSpeed);
    } else {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    }
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [isPlaying, windGrid, playSpeed, timeStep]);

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setIsPlaying(false);
    setCurrentTime(parseInt(e.target.value));
  }, []);

  const togglePlay = useCallback(() => setIsPlaying(p => !p), []);

  const cycleSpeed = useCallback(() => {
    setIsPlaying(true);
    setPlaySpeed(prev => nextSpeed(prev));
  }, []);

  const toggleTray = useCallback(() => setTrayOpen(o => !o), []);

  // Memoized — derived from windGrid, not re-derived on every render (#8).
  const forecastStart = useMemo(
    () => windGrid ? new Date(windGrid.times[0]).getTime() : 0,
    [windGrid],
  );
  const forecastEnd = useMemo(
    () => windGrid ? new Date(windGrid.times[windGrid.times.length - 1]).getTime() : 0,
    [windGrid],
  );
  const formattedTime = formatWindMapTime(currentTime, mapMode === '7day');

  return {
    windGrid,
    loading,
    error,
    currentTime,
    isPlaying,
    trayOpen,
    toggleTray,
    playSpeed,
    timeStep,
    forecastStart,
    forecastEnd,
    formattedTime,
    handleSliderChange,
    togglePlay,
    cycleSpeed,
  };
}
