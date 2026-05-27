import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/apiClient';
import { useAuth } from '@/contexts/AuthContext';

// Type also defined in src/types/api.ts — keep in sync
export interface PageData {
  slug: string;
  title: string;
  content: string;
  template: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

// Type also defined in src/types/api.ts — keep in sync
export interface PageAttachment {
  id: string;
  pageSlug: string;
  originalFilename: string;
  fileSize: number;
  mimeType: string;
  downloadCount: number;
  uploadedAt: string;
}

export const pageKeys = {
  all: ['pages'] as const,
  list: () => [...pageKeys.all, 'list'] as const,
  detail: (slug: string | undefined) => [...pageKeys.all, 'detail', slug ?? ''] as const,
  attachments: (slug: string | undefined) => [...pageKeys.all, 'attachments', slug ?? ''] as const,
};

export function usePages() {
  return useQuery({
    queryKey: pageKeys.list(),
    queryFn: () => api.get<PageData[]>('/api/pages'),
  });
}

export function usePage(slug: string | undefined) {
  return useQuery({
    queryKey: pageKeys.detail(slug),
    queryFn: () => api.get<PageData>(`/api/pages/${slug}`),
    enabled: !!slug,
  });
}

export function usePageAttachments(slug: string | undefined) {
  return useQuery({
    queryKey: pageKeys.attachments(slug),
    queryFn: () => api.get<PageAttachment[]>(`/api/pages/${slug}/attachments`),
    enabled: !!slug,
  });
}

export function useDeletePageMutation() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => api.delete(`/api/pages/${slug}`, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pageKeys.all });
      toast.success('Page deleted');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to delete page');
    },
  });
}
