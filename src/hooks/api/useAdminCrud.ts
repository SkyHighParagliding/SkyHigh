import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { sponsorKeys } from './useSponsors';
import { publicKeys } from './usePublicData';
import { newsKeys } from './useNews';

export const adminCrudKeys = {
  sponsors: () => ['admin', 'sponsors'] as const,
  competitions: () => ['admin', 'competitions'] as const,
  businessDirectory: () => ['admin', 'businessDirectory'] as const,
  news: () => ['admin', 'news'] as const,
  pages: () => ['admin', 'pages'] as const,
  checkins: () => ['admin', 'checkins'] as const,
};

function useCrudMutation(
  endpoint: string,
  label: string,
  invalidateKeys: readonly (readonly string[])[],
) {
  const { token } = useAuth();
  const qc = useQueryClient();
  const invalidate = () => {
    for (const key of invalidateKeys) {
      qc.invalidateQueries({ queryKey: [...key] });
    }
  };

  const save = useMutation({
    mutationFn: ({ id, data }: { id?: string; data: Record<string, any> }) =>
      id
        ? api.put(`${endpoint}/${id}`, data, token)
        : api.post(endpoint, data, token),
    onSuccess: (_d, vars) => {
      invalidate();
      toast.success(vars.id ? `${label} updated` : `${label} created`);
    },
    onError: (err: Error) => {
      toast.error(err.message || `Failed to save ${label.toLowerCase()}`);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`${endpoint}/${id}`, token),
    onSuccess: () => {
      invalidate();
      toast.success(`${label} deleted`);
    },
    onError: (err: Error) => {
      toast.error(err.message || `Failed to delete ${label.toLowerCase()}`);
    },
  });

  return { save, remove };
}

export function useAdminSponsors() {
  return useQuery({
    queryKey: adminCrudKeys.sponsors(),
    queryFn: () => api.get<Array<{
      id: string; name: string; logo: string; url: string;
      markdown: string; sortOrder: number; createdAt: string; updatedAt: string;
    }>>('/api/sponsors'),
  });
}

export function useSponsorMutation() {
  return useCrudMutation('/api/sponsors', 'Sponsor', [
    adminCrudKeys.sponsors(),
    sponsorKeys.all,
  ]);
}

export function useAdminCompetitions() {
  return useQuery({
    queryKey: adminCrudKeys.competitions(),
    queryFn: () => api.get<Array<{
      id: string; name: string; description: string; startDate: string;
      endDate: string; location: string; pilotRating: string;
      rulesSummary: string; registrationUrl: string; status: string;
      createdAt: string; updatedAt: string;
    }>>('/api/competitions'),
  });
}

export function useCompetitionMutation() {
  return useCrudMutation('/api/competitions', 'Competition', [
    adminCrudKeys.competitions(),
    publicKeys.competitions(),
  ]);
}

export function useAdminBusinessDirectory() {
  const { token } = useAuth();
  return useQuery({
    queryKey: adminCrudKeys.businessDirectory(),
    queryFn: () => api.get<Array<{
      id: string; businessName: string; memberName: string; category: string;
      description: string; phone: string; email: string; websiteUrl: string;
      imagePath: string; sortOrder: number; createdAt: string; updatedAt: string;
    }>>('/api/business-directory', token),
  });
}

export function useBusinessDirectoryMutation() {
  return useCrudMutation('/api/business-directory', 'Listing', [
    adminCrudKeys.businessDirectory(),
    publicKeys.businessDirectory(),
  ]);
}

export function useAdminNews() {
  const { token } = useAuth();
  return useQuery({
    queryKey: adminCrudKeys.news(),
    queryFn: () => api.get<Array<{
      id: string; title: string; slug: string; summary: string;
      content: string; author: string; category: string;
      published: boolean; publishedAt: string; image: string;
    }>>('/api/news', token),
  });
}

export function useNewsMutation() {
  return useCrudMutation('/api/news', 'News item', [
    adminCrudKeys.news(),
    newsKeys.all,
  ]);
}
