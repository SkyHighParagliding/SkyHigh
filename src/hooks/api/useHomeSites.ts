import { useState, useEffect, useCallback, useRef } from 'react';
import { useSites } from './useSites';
import { api } from '@/lib/apiClient';
import { haversineDistance } from '@/lib/utils';
import { getCachedLocation } from '@/lib/cachedLocation';
import { getRecentSites, seedSitesIfEmpty } from '@/lib/recentSites';
import { prefetchWindGrids } from '@/lib/windGridCache';

interface HomeSitesResult {
  sites: Record<string, unknown>[];
  weatherData: Record<string, Record<string, unknown>>;
  distances: Record<string, string>;
  isLoading: boolean;
}

export function useHomeSites(): HomeSitesResult {
  const { data: allSites } = useSites();
  const [displaySites, setDisplaySites] = useState<Record<string, unknown>[]>([]);
  const [weatherData, setWeatherData] = useState<Record<string, Record<string, unknown>>>({});
  const [distances, setDistances] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const processed = useRef(false);

  const loadSitesWithWeather = useCallback((sitesToDisplay: Record<string, unknown>[]) => {
    setDisplaySites(sitesToDisplay);
    const liveIds = sitesToDisplay
      .filter((s) => s.useLiveWeather === 'true' && s.lat && s.lon)
      .map((s) => s.id as string);
    if (liveIds.length > 0) prefetchWindGrids(liveIds);

    const siteIds = sitesToDisplay.map((s) => s.id as string);
    api.post<Record<string, Record<string, unknown>>>('/api/weather/bulk', { siteIds })
      .then((bulkWeather) => {
        const newWeather: Record<string, Record<string, unknown>> = {};
        const newDistances: Record<string, string> = {};
        for (const site of sitesToDisplay) {
          const weather = bulkWeather[site.id as string];
          if (weather && !weather.error) {
            newWeather[site.id as string] = weather;
            if (weather.stationLat && weather.stationLon && site.lat && site.lon) {
              const dist = haversineDistance(
                site.lat as number, site.lon as number,
                weather.stationLat as number, weather.stationLon as number,
              );
              newDistances[site.id as string] = dist.toFixed(1);
            }
          } else {
            newWeather[site.id as string] = { error: true };
          }
        }
        setWeatherData((prev) => ({ ...prev, ...newWeather }));
        setDistances((prev) => ({ ...prev, ...newDistances }));
      })
      .catch(() => {
        const errorWeather: Record<string, Record<string, unknown>> = {};
        for (const site of sitesToDisplay) {
          errorWeather[site.id as string] = { error: true };
        }
        setWeatherData((prev) => ({ ...prev, ...errorWeather }));
      });
  }, []);

  useEffect(() => {
    if (!allSites || !Array.isArray(allSites) || allSites.length === 0 || processed.current) return;
    processed.current = true;
    setIsLoading(false);

    const maxFetch = 20;
    const data = allSites as Record<string, unknown>[];

    const recentIds = getRecentSites();
    if (recentIds.length > 0) {
      const recentSites = recentIds
        .map((id) => data.find((s) => s.id === id))
        .filter(Boolean) as Record<string, unknown>[];
      if (recentSites.length > 0) {
        loadSitesWithWeather(recentSites.slice(0, maxFetch));
        return;
      }
    }

    getCachedLocation(
      (lat, lon) => {
        const sorted = [...data]
          .filter((s) => s.lat && s.lon)
          .map((s) => ({
            ...s,
            _dist: haversineDistance(lat, lon, parseFloat(s.lat as string), parseFloat(s.lon as string)),
          }))
          .sort((a, b) => a._dist - b._dist)
          .slice(0, maxFetch);
        const geoSites = sorted.length > 0 ? sorted : data.slice(0, maxFetch);
        seedSitesIfEmpty(geoSites.map((s) => s.id as string));
        loadSitesWithWeather(geoSites);
      },
      () => {
        const fallbackSites = data.slice(0, maxFetch);
        seedSitesIfEmpty(fallbackSites.map((s) => s.id as string));
        loadSitesWithWeather(fallbackSites);
      },
    );
  }, [allSites, loadSitesWithWeather]);

  return { sites: displaySites, weatherData, distances, isLoading };
}
