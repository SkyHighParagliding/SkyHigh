import { useState, useEffect, useCallback, useRef } from 'react';
import { useSites } from './useSites';
import { api } from '@/lib/apiClient';
import { haversineDistance } from '@/lib/utils';
import { getCachedLocation } from '@/lib/cachedLocation';
import { getRecentSites, seedSitesIfEmpty } from '@/lib/recentSites';
import { prefetchWindGrids } from '@/lib/windGridCache';
import type { Site, WeatherData } from '@/types/api';

interface HomeSitesResult {
  sites: Site[];
  weatherData: Record<string, WeatherData>;
  distances: Record<string, string>;
  isLoading: boolean;
}

export function useHomeSites(): HomeSitesResult {
  const { data: allSites } = useSites();
  const [displaySites, setDisplaySites] = useState<Site[]>([]);
  const [weatherData, setWeatherData] = useState<Record<string, WeatherData>>({});
  const [distances, setDistances] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const processed = useRef(false);

  const loadSitesWithWeather = useCallback((sitesToDisplay: Site[]) => {
    setDisplaySites(sitesToDisplay);
    const liveIds = sitesToDisplay
      .filter((s) => s.useLiveWeather === 'true' && s.lat && s.lon)
      .map((s) => s.id);
    if (liveIds.length > 0) prefetchWindGrids(liveIds);

    const siteIds = sitesToDisplay.map((s) => s.id);
    api.post<Record<string, WeatherData>>('/api/weather/bulk', { siteIds })
      .then((bulkWeather) => {
        const newWeather: Record<string, WeatherData> = {};
        const newDistances: Record<string, string> = {};
        for (const site of sitesToDisplay) {
          const weather = bulkWeather[site.id];
          if (weather && !weather.error) {
            newWeather[site.id] = weather;
            if (weather.stationLat && weather.stationLon && site.lat && site.lon) {
              const dist = haversineDistance(
                site.lat, site.lon,
                weather.stationLat, weather.stationLon,
              );
              newDistances[site.id] = dist.toFixed(1);
            }
          } else {
            newWeather[site.id] = { error: true };
          }
        }
        setWeatherData((prev) => ({ ...prev, ...newWeather }));
        setDistances((prev) => ({ ...prev, ...newDistances }));
      })
      .catch(() => {
        const errorWeather: Record<string, WeatherData> = {};
        for (const site of sitesToDisplay) {
          errorWeather[site.id] = { error: true };
        }
        setWeatherData((prev) => ({ ...prev, ...errorWeather }));
      });
  }, []);

  useEffect(() => {
    if (!allSites || !Array.isArray(allSites) || allSites.length === 0 || processed.current) return;
    processed.current = true;
    setIsLoading(false);

    const maxFetch = 20;
    const data = allSites as Site[];

    const recentIds = getRecentSites();
    if (recentIds.length > 0) {
      const recentSites = recentIds
        .map((id) => data.find((s) => s.id === id))
        .filter(Boolean) as Site[];
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
            _dist: haversineDistance(lat, lon, s.lat as number, s.lon as number),
          }))
          .sort((a, b) => a._dist - b._dist)
          .slice(0, maxFetch);
        const geoSites = sorted.length > 0 ? sorted : data.slice(0, maxFetch);
        seedSitesIfEmpty(geoSites.map((s) => s.id));
        loadSitesWithWeather(geoSites);
      },
      () => {
        const fallbackSites = data.slice(0, maxFetch);
        seedSitesIfEmpty(fallbackSites.map((s) => s.id));
        loadSitesWithWeather(fallbackSites);
      },
    );
  }, [allSites, loadSitesWithWeather]);

  return { sites: displaySites, weatherData, distances, isLoading };
}
