import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';
import { toast } from 'sonner';

export const adminDataKeys = {
  pageViews: ['admin', 'page-views'] as const,
  scheduledTasks: ['admin', 'scheduled-tasks'] as const,
  aiModels: ['admin', 'ai-models'] as const,
  weatherStations: ['admin', 'weather-stations'] as const,
  documents: ['admin', 'documents'] as const,
  projects: ['admin', 'projects'] as const,
};

export function usePageViews(token: string | null) {
  return useQuery<Record<string, unknown>[]>({
    queryKey: adminDataKeys.pageViews,
    queryFn: () => api.get<Record<string, unknown>[]>('/api/analytics/page-views', token),
    enabled: !!token,
  });
}

export function useScheduledTasks(token: string | null) {
  return useQuery<Record<string, unknown>[]>({
    queryKey: adminDataKeys.scheduledTasks,
    queryFn: () => api.get<Record<string, unknown>[]>('/api/scheduled-tasks', token),
    enabled: !!token,
  });
}

export function useRunTaskMutation(token: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => api.post(`/api/scheduled-tasks/${taskId}/run`, {}, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminDataKeys.scheduledTasks });
      toast.success('Task executed');
    },
    onError: () => {
      toast.error('Failed to run task');
    },
  });
}

export function useAIModels(token: string | null) {
  return useQuery<Record<string, unknown>[]>({
    queryKey: adminDataKeys.aiModels,
    queryFn: () => api.get<Record<string, unknown>[]>('/api/ai-models', token),
    enabled: !!token,
  });
}

export function useSaveAIModelMutation(token: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: Record<string, unknown> }) => {
      const url = id ? `/api/ai-models/${id}` : '/api/ai-models';
      const method = id ? api.put : api.post;
      return method(url, data, token);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminDataKeys.aiModels });
      toast.success('AI model saved');
    },
    onError: () => {
      toast.error('Failed to save AI model');
    },
  });
}

export function useDeleteAIModelMutation(token: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/ai-models/${id}`, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminDataKeys.aiModels });
      toast.success('AI model deleted');
    },
    onError: () => {
      toast.error('Failed to delete AI model');
    },
  });
}

export function useWeatherStations(token: string | null) {
  return useQuery<Record<string, unknown>[]>({
    queryKey: adminDataKeys.weatherStations,
    queryFn: () => api.get<Record<string, unknown>[]>('/api/weather/stations', token),
    enabled: !!token,
  });
}

export function useDocuments(token: string | null) {
  return useQuery<Record<string, unknown>[]>({
    queryKey: adminDataKeys.documents,
    queryFn: () => api.get<Record<string, unknown>[]>('/api/documents', token),
    enabled: !!token,
  });
}

export function useSaveDocumentMutation(token: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: Record<string, unknown> }) => {
      const url = id ? `/api/documents/${id}` : '/api/documents';
      const method = id ? api.put : api.post;
      return method(url, data, token);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminDataKeys.documents });
      toast.success('Document saved');
    },
    onError: () => {
      toast.error('Failed to save document');
    },
  });
}

export function useDeleteDocumentMutation(token: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/documents/${id}`, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminDataKeys.documents });
      toast.success('Document deleted');
    },
    onError: () => {
      toast.error('Failed to delete document');
    },
  });
}

export function useProjects(token: string | null) {
  return useQuery<Record<string, unknown>[]>({
    queryKey: adminDataKeys.projects,
    queryFn: () => api.get<Record<string, unknown>[]>('/api/projects', token),
    enabled: !!token,
  });
}

export function useDeleteProjectMutation(token: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/projects/${id}`, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminDataKeys.projects });
      toast.success('Project deleted');
    },
    onError: () => {
      toast.error('Failed to delete project');
    },
  });
}
