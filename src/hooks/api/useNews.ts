import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';

export interface NewsItem {
  id: string;
  title: string;
  slug: string;
  summary: string;
  content: string;
  author: string;
  category: string;
  published: boolean;
  publishedAt: string;
  image: string;
}

export const newsKeys = {
  all: ['news'] as const,
  list: () => [...newsKeys.all, 'list'] as const,
  detail: (id: string | undefined) => [...newsKeys.all, 'detail', id ?? ''] as const,
};

export function useNews() {
  return useQuery({
    queryKey: newsKeys.list(),
    queryFn: async () => {
      const response = await api.get<{ data: NewsItem[] }>('/api/news');
      return response.data;
    },
  });
}
