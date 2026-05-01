import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';

export const checkinKeys = {
  all: ['checkins'] as const,
  list: () => [...checkinKeys.all, 'list'] as const,
  stats: () => [...checkinKeys.all, 'stats'] as const,
};

export function useCheckins() {
  return useQuery({
    queryKey: checkinKeys.list(),
    queryFn: () => api.get<Array<Record<string, unknown>>>('/api/checkins'),
  });
}

export function useCheckinStats() {
  return useQuery({
    queryKey: checkinKeys.stats(),
    queryFn: () => api.get<Record<string, unknown>>('/api/checkins/stats'),
  });
}

export function useCreateCheckin() {
  return useMutation({
    mutationFn: (data: { siteId: string }) =>
      api.post<{ success: boolean; checkin: Record<string, unknown>; error?: string }>('/api/checkins', data),
  });
}
