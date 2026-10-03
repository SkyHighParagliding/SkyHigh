import { useQuery } from '@tanstack/react-query';

// RainViewer's free public radar mosaic. One JSON index lists the recent frames;
// each frame's `path` is turned into web-mercator XYZ tiles by MapCanvas (same
// scheme as the CARTO basemap). `past` are observed scans; `nowcast` is
// RainViewer's own short-range forecast — we keep them tagged so the UI can mark
// the Real→Forecast boundary rather than pretending the forecast is observed.
// Docs: https://www.rainviewer.com/api/weather-maps-api.html
const RAINVIEWER_INDEX = 'https://api.rainviewer.com/public/weather-maps.json';

// How much observed history to keep. RainViewer serves ~2h of `past`; the pilot
// brief asked for ~1h, which is the useful window for "is the rain coming here".
const HISTORY_MS = 60 * 60 * 1000;

export interface RadarFrame {
  /** Unix seconds. */
  time: number;
  /** e.g. `/v2/radar/1790998200` — appended to the host to form tile URLs. */
  path: string;
  /** Observed scan vs RainViewer nowcast. Drives the LIVE/FORECAST marking. */
  kind: 'past' | 'nowcast';
}

export interface RadarData {
  /** Tile host, e.g. `https://tilecache.rainviewer.com`. */
  host: string;
  /** Oldest → newest: trimmed `past` history followed by any `nowcast` frames. */
  frames: RadarFrame[];
  /** Index of the newest observed frame — the "now" edge between Real and Forecast. */
  nowIndex: number;
}

interface RawFrame { time: number; path: string }
interface RawIndex {
  host: string;
  radar?: { past?: RawFrame[]; nowcast?: RawFrame[] };
}

/**
 * Loads the RainViewer frame index. Disabled until the pilot turns radar on, so
 * the request only fires for users who want it. Refetched every 5 min because
 * RainViewer publishes a new scan roughly every 10 min.
 */
export function useRainviewer(enabled: boolean) {
  return useQuery<RadarData>({
    queryKey: ['rainviewer-index'],
    enabled,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 4 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(RAINVIEWER_INDEX);
      if (!res.ok) throw new Error(`RainViewer HTTP ${res.status}`);
      const json = (await res.json()) as RawIndex;

      const past = json.radar?.past ?? [];
      const nowcast = json.radar?.nowcast ?? [];
      const cutoffSec = (Date.now() - HISTORY_MS) / 1000;

      let pastFrames: RadarFrame[] = past
        .filter(f => f.time >= cutoffSec)
        .map(f => ({ time: f.time, path: f.path, kind: 'past' as const }));
      // Clock skew / a quiet feed could trim everything — always keep the latest
      // observed scan so there's something to show on the "now" edge.
      if (pastFrames.length === 0 && past.length) {
        const last = past[past.length - 1];
        pastFrames = [{ time: last.time, path: last.path, kind: 'past' }];
      }

      const nowcastFrames: RadarFrame[] = nowcast.map(f => ({
        time: f.time, path: f.path, kind: 'nowcast' as const,
      }));

      const frames = [...pastFrames, ...nowcastFrames];
      return { host: json.host, frames, nowIndex: Math.max(0, pastFrames.length - 1) };
    },
  });
}
