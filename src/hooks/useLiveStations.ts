import { useQuery } from '@tanstack/react-query';
import type { LiveStationsResponse, StationHistoryResponse } from '../../shared/stations';

// Live stations overlay (wiki/future/station-overlay-plan.md). The server polls
// the stations in the background; these hooks only read its in-memory cache.

const FIVE_MIN = 5 * 60 * 1000;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

/** Latest reading at every station. Disabled until the pilot turns the overlay
 *  on; refetched every 5 min. react-query skips interval refetches while the
 *  tab is hidden (refetchIntervalInBackground defaults to false) and refetches
 *  on focus, so no extra visibility handling is needed. */
export function useLiveStations(enabled: boolean) {
  return useQuery<LiveStationsResponse>({
    queryKey: ['live-stations'],
    enabled,
    refetchInterval: FIVE_MIN,
    staleTime: 4 * 60 * 1000,
    queryFn: () => getJson<LiveStationsResponse>('/api/weather/stations/live'),
  });
}

/** 6 h of readings for one station, cached per id for 5 min. */
export function useStationHistory(id: string | null, hours = 6) {
  return useQuery<StationHistoryResponse>({
    queryKey: ['station-history', id, hours],
    enabled: !!id,
    staleTime: FIVE_MIN,
    gcTime: FIVE_MIN,
    queryFn: () => getJson<StationHistoryResponse>(`/api/weather/stations/history?id=${encodeURIComponent(id!)}&hours=${hours}`),
  });
}
