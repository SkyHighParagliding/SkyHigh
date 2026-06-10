import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';
import type { BusinessListing, SafetyOfficer } from '@/types/api';

export type { BusinessListing, SafetyOfficer };

// Local Competition type (slightly narrower than src/types/api.ts — leave separate)
export interface Competition {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  location: string;
  pilotRating: string;
  rulesSummary: string;
  registrationUrl: string;
  status: string;
}

export const publicKeys = {
  competitions: () => ['competitions'] as const,
  businessDirectory: () => ['businessDirectory'] as const,
  safetyOfficers: () => ['safetyOfficers'] as const,
};

export function useCompetitions() {
  return useQuery({
    queryKey: publicKeys.competitions(),
    queryFn: () => api.get<Competition[]>('/api/competitions'),
  });
}

export function useBusinessDirectory(enabled = true) {
  return useQuery({
    queryKey: publicKeys.businessDirectory(),
    queryFn: () => api.get<BusinessListing[]>('/api/business-directory'),
    enabled,
  });
}

export function useSafetyOfficers() {
  return useQuery({
    queryKey: publicKeys.safetyOfficers(),
    queryFn: () => api.get<SafetyOfficer[]>('/api/safety-officers'),
  });
}
