import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';

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

export interface BusinessListing {
  id: string;
  businessName: string;
  memberName: string;
  category: string;
  description: string;
  phone: string;
  email: string;
  websiteUrl: string;
  imagePath: string;
}

export interface SafetyOfficer {
  id: string;
  type: 'SO' | 'SSO';
  name: string;
  surname?: string;
  phone?: string;
  email?: string;
  showTelegram?: number;
  showPhone?: number;
  showEmail?: number;
  showAdminEmail?: number;
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

export function useBusinessDirectory() {
  return useQuery({
    queryKey: publicKeys.businessDirectory(),
    queryFn: () => api.get<BusinessListing[]>('/api/business-directory'),
  });
}

export function useSafetyOfficers() {
  return useQuery({
    queryKey: publicKeys.safetyOfficers(),
    queryFn: () => api.get<SafetyOfficer[]>('/api/safety-officers'),
  });
}
