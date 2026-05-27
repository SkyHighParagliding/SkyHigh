import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';

// Type also defined in src/types/api.ts — keep in sync
export interface ClosureBanner {
  siteId: string;
  siteName: string;
  firstDate: string;
  lastDate: string;
}

export function useClosureBanners() {
  return useQuery({
    queryKey: ['closure-banners'],
    queryFn: () => api.get<ClosureBanner[]>('/api/sites/closure-banners'),
    staleTime: 60 * 1000,
  });
}
