import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

export type FeedStatus = "live" | "overnight" | "stale" | "offline";

export interface WebcamSiteInfo {
  siteId: string;
  label: string;
  siteName: string | null;
}

export interface WebcamLatestCamera {
  camera: string;
  label: string;
  capturedAt: string;
  thumb: string;
  medium: string;
  original: string;
}

export interface WebcamLatest {
  siteId: string;
  label: string;
  timezone: string;
  status: FeedStatus;
  newestAt: string | null;
  expectFromMin: number;
  expectToMin: number;
  cameras: WebcamLatestCamera[];
}

export interface WebcamImage {
  at: string;
  thumb: string;
  medium: string;
  original: string;
}

export interface WebcamDayFrame {
  t: string;
  images: Record<string, WebcamImage>;
}

export interface WebcamDay {
  day: string;
  timezone: string;
  cameras: { camera: string; label: string }[];
  frames: WebcamDayFrame[];
}

export interface WebcamDays {
  timezone: string;
  retentionDays: number;
  days: { day: string; frames: number; first: string; last: string }[];
}

export function useWebcamSites() {
  return useQuery({
    queryKey: ["webcams", "sites"],
    queryFn: () => api.get<WebcamSiteInfo[]>("/api/webcams/sites"),
    staleTime: 5 * 60_000,
  });
}

export function useWebcamLatest(siteId?: string) {
  return useQuery({
    queryKey: ["webcams", "latest", siteId],
    queryFn: () => api.get<WebcamLatest>(`/api/webcams/${encodeURIComponent(siteId!)}/latest`),
    enabled: !!siteId,
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
  });
}

export function useWebcamDays(siteId?: string) {
  return useQuery({
    queryKey: ["webcams", "days", siteId],
    queryFn: () => api.get<WebcamDays>(`/api/webcams/${encodeURIComponent(siteId!)}/days`),
    enabled: !!siteId,
    staleTime: 2 * 60_000,
  });
}

export function useWebcamDay(siteId?: string, ymd?: string | null, opts: { enabled?: boolean; live?: boolean } = {}) {
  return useQuery({
    queryKey: ["webcams", "day", siteId, ymd],
    queryFn: () => api.get<WebcamDay>(`/api/webcams/${encodeURIComponent(siteId!)}/day/${ymd}`),
    enabled: !!siteId && !!ymd && opts.enabled !== false,
    staleTime: opts.live ? 60_000 : 10 * 60_000,
    refetchInterval: opts.live ? 2 * 60_000 : false,
  });
}
