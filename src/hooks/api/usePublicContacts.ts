import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';
import { toast } from 'sonner';

export interface PublicContact {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  isDriver: boolean;
  displayName: string;
  [key: string]: unknown;
}

export const contactKeys = {
  all: ['public-contacts'] as const,
  search: (q: string) => ['public-contacts', 'search', q] as const,
};

export function usePublicContacts(search: string, token: string | null) {
  const url = search
    ? `/api/public-contacts/search?q=${encodeURIComponent(search)}`
    : '/api/public-contacts';
  return useQuery<PublicContact[]>({
    queryKey: search ? contactKeys.search(search) : contactKeys.all,
    queryFn: () => api.get<PublicContact[]>(url, token),
    enabled: !!token,
  });
}

export function useSaveContactMutation(token: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: Record<string, unknown> }) => {
      const url = id ? `/api/public-contacts/${id}` : '/api/public-contacts';
      const method = id ? api.put : api.post;
      return method(url, data, token);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: contactKeys.all });
      toast.success('Contact saved');
    },
    onError: () => {
      toast.error('Failed to save contact');
    },
  });
}

export function useDeleteContactMutation(token: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/public-contacts/${id}`, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: contactKeys.all });
      toast.success('Contact deleted');
    },
    onError: () => {
      toast.error('Failed to delete contact');
    },
  });
}

export function useSendResetMutation(token: string | null) {
  return useMutation({
    mutationFn: (pilotId: string) =>
      api.post<{ message: string }>('/api/auth/send-pilot-password-reset', { pilotId }, token),
    onSuccess: (data) => {
      toast.success((data as { message?: string })?.message || 'Reset link sent');
    },
    onError: () => {
      toast.error('Failed to send reset link');
    },
  });
}
