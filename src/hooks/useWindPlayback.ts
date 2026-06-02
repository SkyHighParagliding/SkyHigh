import { useState, useEffect, useRef, useCallback } from 'react';
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

export function useWindPlayback(
  mapMode: 'today' | '7day',
  todayFetcher: () => Promise<WindGrid>,
): UseWindPlaybackResult {
  const [windGrid, setWindGrid] = useState<WindGrid | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [isPlaying, setIsPlaying] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const [playSpeed, setPlaySpeed] = useState<PlaySpeed>(5000);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setIsPlaying(false);

    const fetchPromise: Promise<WindGrid> = mapMode === '7day'
      ? fetch('/api/weather/extended-grid/wind-overlay').then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
      : todayFetcher();

    fetchPromise
      .then(data => {
        if (data?.times?.length && data?.data?.length && data.ni && data.nj) {
          setWindGrid(data);
          const now = Date.now();
          const start = new Date(data.times[0]).getTime();
          const end = new Date(data.times[data.times.length - 1]).getTime();
          setCurrentTime(now >= start && now <= end ? now : start);
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
        setCurrentTime(prev => {
          const next = prev + timeStep;
          const end = new Date(windGrid.times[windGrid.times.length - 1]).getTime();
          const start = new Date(windGrid.times[0]).getTime();
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

  const forecastStart = windGrid ? new Date(windGrid.times[0]).getTime() : 0;
  const forecastEnd = windGrid ? new Date(windGrid.times[windGrid.times.length - 1]).getTime() : 0;
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
