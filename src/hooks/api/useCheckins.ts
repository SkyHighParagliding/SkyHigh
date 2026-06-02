import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';

export interface Checkin {
  id: string;
  siteId: string;
  siteName: string;
  timestamp: string;
}

export interface CheckinStats {
  total: number;
  today: number;
  bySite: { siteName: string; count: number }[];
}

export const checkinKeys = {
  all: ['checkins'] as const,
  list: () => [...checkinKeys.all, 'list'] as const,
  stats: () => [...checkinKeys.all, 'stats'] as const,
};

export function useCheckins() {
  return useQuery<Checkin[]>({
    queryKey: checkinKeys.list(),
    queryFn: () => api.get<Checkin[]>('/api/checkins'),
  });
}

export function useCheckinStats() {
  return useQuery<CheckinStats>({
    queryKey: checkinKeys.stats(),
    queryFn: () => api.get<CheckinStats>('/api/checkins/stats'),
  });
}

export function useCreateCheckin() {
  return useMutation({
    mutationFn: (data: { siteId: string }) =>
      api.post<{ success: boolean; checkin: Checkin; error?: string }>('/api/checkins', data),
  });
}
