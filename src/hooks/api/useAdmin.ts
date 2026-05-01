import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import type { Site, ExternalSite } from '@/types/api';

export const adminKeys = {
  sites: () => ['admin', 'sites'] as const,
  siteDetail: (id: string) => ['admin', 'sites', id] as const,
  externalSites: () => ['admin', 'externalSites'] as const,
  submissions: (filter: string) => ['admin', 'submissions', filter] as const,
  bannedIps: () => ['admin', 'bannedIps'] as const,
  archives: () => ['admin', 'archives'] as const,
  aiPrompt: () => ['admin', 'aiPrompt'] as const,
  nearbyStations: (lat: string, lon: string, radius: string) =>
    ['admin', 'nearbyStations', lat, lon, radius] as const,
};

export function useAdminSites() {
  const { token } = useAuth();
  return useQuery({
    queryKey: adminKeys.sites(),
    queryFn: () => api.get<Site[]>('/api/sites', token),
    enabled: !!token,
  });
}

export function useAdminSiteDetail(id: string | undefined) {
  const { token } = useAuth();
  return useQuery({
    queryKey: adminKeys.siteDetail(id ?? ''),
    queryFn: () => api.get<Site>(`/api/sites/${id}`, token),
    enabled: !!id && !!token,
  });
}

export function useExternalSites() {
  return useQuery({
    queryKey: adminKeys.externalSites(),
    queryFn: () => api.get<ExternalSite[]>('/api/external-sites'),
  });
}

export function useSaveSiteMutation() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      isNew,
      payload,
    }: {
      id?: string;
      isNew: boolean;
      payload: Record<string, unknown>;
    }) => {
      const url = isNew ? '/api/sites' : `/api/sites/${id}`;
      const method = isNew ? 'POST' : 'PUT';
      return method === 'POST'
        ? api.post(url, payload, token)
        : api.put(url, payload, token);
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['sites'] });
      qc.invalidateQueries({ queryKey: ['admin', 'sites'] });
      toast.success(vars.isNew ? 'Site created' : 'Site updated');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to save site');
    },
  });
}
