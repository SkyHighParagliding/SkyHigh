import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';
import { toast } from 'sonner';

export interface Flight {
  id: string;
  pilotId: string;
  siteId: string;
  siteName: string;
  startedAt: string;
  endedAt: string | null;
  status: string;
  maxAltitude: number;
  maxSpeed: number;
  totalDistance: number;
  altitudeGain: number;
  altitudeLoss: number;
}

export interface Breadcrumb {
  id: number;
  flightId: string;
  timestamp: number;
  lat: number;
  lon: number;
  altitude: number;
  speed: number;
  heading: number;
}

export interface FlightDetail extends Flight {
  breadcrumbs: Breadcrumb[];
}

export const flightKeys = {
  all: ['flights'] as const,
  detail: (id: string) => ['flights', id] as const,
};

export function useFlights(token: string | null) {
  return useQuery<Flight[]>({
    queryKey: flightKeys.all,
    queryFn: () => api.get<Flight[]>('/api/flights', token),
    enabled: !!token,
  });
}

export function useFlight(flightId: string | null, token: string | null) {
  return useQuery<FlightDetail>({
    queryKey: flightKeys.detail(flightId ?? ''),
    queryFn: () => api.get<FlightDetail>(`/api/flights/${flightId}`, token),
    enabled: !!flightId && !!token,
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
