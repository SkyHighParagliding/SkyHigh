import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';
import type { Site, WeatherData } from '@/types/api';

export const siteKeys = {
  all: ['sites'] as const,
  list: (isPublic?: boolean) => [...siteKeys.all, 'list', { isPublic }] as const,
  detail: (id: string | undefined) => [...siteKeys.all, 'detail', id ?? ''] as const,
  weather: (siteId: string | undefined) => ['weather', siteId ?? ''] as const,
};

export function useSites(isPublic = true) {
  return useQuery({
    queryKey: siteKeys.list(isPublic),
    queryFn: async () => {
      const response = await api.get<{ data: Site[] }>(isPublic ? '/api/sites?public=true&limit=500' : '/api/sites?limit=500');
      return response.data;
    },
  });
}

export function useSite(id: string | undefined) {
  return useQuery({
    queryKey: siteKeys.detail(id),
    queryFn: () => api.get<Site>(`/api/sites/${id}`),
    enabled: !!id,
  });
}

export function useWeather(siteId: string | undefined) {
  return useQuery({
    queryKey: siteKeys.weather(siteId),
    queryFn: () => api.get<WeatherData>(`/api/weather/${siteId}`),
    enabled: !!siteId,
    staleTime: 60_000,
  });
}

