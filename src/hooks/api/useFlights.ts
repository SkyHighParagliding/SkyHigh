import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';
import { toast } from 'sonner';

import type { Flight } from '@/types/api';

export const flightKeys = {
  all: ['flights'] as const,
};

export function useFlights(token: string | null) {
  return useQuery<Flight[]>({
    queryKey: flightKeys.all,
    queryFn: () => api.get<Flight[]>('/api/flights', token),
    enabled: !!token,
  });
}

export function useDeleteFlightMutation(token: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (flightId: string) => api.delete(`/api/flights/${flightId}`, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: flightKeys.all });
      toast.success('Flight deleted');
    },
    onError: () => {
      toast.error('Failed to delete flight');
    },
  });
}
