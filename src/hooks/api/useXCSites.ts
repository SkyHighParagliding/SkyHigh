import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';

export interface XCSite {
  id: string;
  name: string;
  lat: string;
  lon: string;
  useLiveWeather: string;
  [key: string]: unknown;
}

export const xcSiteKeys = {
  all: ['xc-sites'] as const,
};

export function useXCSites(enabled = true) {
  return useQuery<XCSite[]>({
    queryKey: xcSiteKeys.all,
    queryFn: () => api.get<XCSite[]>('/api/sites/xc/sites'),
    enabled,
  });
}
