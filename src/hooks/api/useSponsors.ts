import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';
import type { Sponsor } from '@/types/api';

export const sponsorKeys = {
  all: ['sponsors'] as const,
};

export function useSponsors() {
  return useQuery({
    queryKey: sponsorKeys.all,
    queryFn: () => api.get<Sponsor[]>('/api/sponsors'),
  });
}
