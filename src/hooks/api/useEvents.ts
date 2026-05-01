import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';
import type { EventItem } from '@/types/api';

export const eventKeys = {
  all: ['events'] as const,
  upcoming: () => [...eventKeys.all, 'upcoming'] as const,
};

export function useUpcomingEvents() {
  return useQuery({
    queryKey: eventKeys.upcoming(),
    queryFn: () => api.get<EventItem[]>('/api/events/upcoming'),
  });
}
