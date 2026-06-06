import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { extractVideoId } from "@/lib/youtube";

const YT_QUALITY_FALLBACKS = ["maxresdefault", "sddefault", "hqdefault", "mqdefault"] as const;

function YouTubeThumbnail({ videoId, className }: { videoId: string; className?: string }) {
  const [qi, setQi] = useState(0);
  const src = `https://img.youtube.com/vi/${videoId}/${YT_QUALITY_FALLBACKS[qi]}.jpg`;

  const advance = () => setQi(q => Math.min(q + 1, YT_QUALITY_FALLBACKS.length - 1));

  return (
    <img
      src={src}
      alt=""
      className={className}
      loading="lazy"
      // YouTube returns a 120×90 grey placeholder with 200 OK when maxresdefault/sddefault
      // are unavailable — onError never fires, so we check naturalWidth on load instead.
      onLoad={(e) => { if (e.currentTarget.naturalWidth <= 120 && qi < YT_QUALITY_FALLBACKS.length - 1) advance(); }}
      onError={advance}
    />
  );
}
import { useSettings } from "@/contexts/SettingsContext";

type SlotType = "hero" | "banner" | "landscape" | "square" | "tall";

interface MosaicItem {
  src: string;
  videoId: string;
  slot: SlotType;
  w: number;
  h: number;
}

const SLOT_DIMS: Record<SlotType, { w: number; h: number }> = {
  hero:      { w: 900, h: 506 },
  banner:    { w: 900, h: 300 },
  landscape: { w: 600, h: 400 },
  square:    { w: 400, h: 400 },
  tall:      { w: 300, h: 450 },
};

const SLOT_CYCLE: SlotType[] = ["hero", "banner", "landscape", "square", "tall"];

const GAP = 6;
const TARGET_ROW_HEIGHT = 350;

function buildMosaicItems(videoIds: string[]): MosaicItem[] {
  const items: MosaicItem[] = [];
  for (let i = 0; i < videoIds.length; i++) {
    const slot = SLOT_CYCLE[i % SLOT_CYCLE.length];
    const dims = SLOT_DIMS[slot];
    items.push({
      src: `https://img.youtube.com/vi/${videoIds[i]}/maxresdefault.jpg`,
      videoId: videoIds[i],
      slot,
      w: dims.w,
      h: dims.h,
    });
  }
  return items;
}

interface Row {
  items: MosaicItem[];
  scale: number;
}

function layoutRows(items: MosaicItem[], containerWidth: number): Row[] {
  const rows: Row[] = [];
  let currentRow: MosaicItem[] = [];
  let currentNaturalWidth = 0;

  for (const item of items) {
    const scaledW = (item.w / item.h) * TARGET_ROW_HEIGHT;
    currentRow.push(item);
    currentNaturalWidth += scaledW;

    const totalGaps = (currentRow.length - 1) * GAP;
    if (currentNaturalWidth + totalGaps >= containerWidth && currentRow.length >= 2) {
      const scale = (containerWidth - totalGaps) / currentNaturalWidth;
      rows.push({ items: [...currentRow], scale });
      currentRow = [];
      currentNaturalWidth = 0;
    }
  }

  if (currentRow.length > 0) {
    const totalGaps = (currentRow.length - 1) * GAP;
    const scale = Math.min(1, (containerWidth - totalGaps) / currentNaturalWidth);
    rows.push({ items: currentRow, scale });
  }

  return rows;
}

export function VideoWall() {
  const { settings, loading } = useSettings();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);

  const videoIds = useMemo<string[]>(() => {
    if (!settings.youtubeVideos) return [];
    try {
      const videos: { url: string }[] = JSON.parse(settings.youtubeVideos);
      const ids: string[] = [];
      for (const v of videos) {
        const id = extractVideoId(v.url);
        if (id) ids.push(id);
      }
      return ids;
    } catch {
      return [];
    }
  }, [settings.youtubeVideos]);

  const updateWidth = useCallback(() => {
    if (containerRef.current) {
      setContainerWidth(containerRef.current.clientWidth);
    }
  }, []);

  useEffect(() => {
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, [updateWidth]);

  const items = useMemo(() => buildMosaicItems([...videoIds].reverse()), [videoIds]);
  const rows = useMemo(() => layoutRows(items, containerWidth), [items, containerWidth]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky" />
      </div>
    );
  }

  if (videoIds.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-foreground-secondary">
        No videos available yet.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full min-h-screen bg-background">
      <div className="pt-8 pb-12">
        <h1 className="text-3xl font-bold text-foreground text-center mb-8">
          SkyHigh Video Wall
        </h1>
        <div className="flex flex-col" style={{ gap: GAP }}>
          {rows.map((row, ri) => {
            const rowH = TARGET_ROW_HEIGHT * row.scale;
            return (
              <div
                key={ri}
                className="flex"
                style={{ gap: GAP, height: rowH }}
              >
                {row.items.map((item, ci) => {
                  const scaledW = (item.w / item.h) * TARGET_ROW_HEIGHT * row.scale;
                  return (
                    <a
                      key={ci}
                      href={`https://www.youtube.com/watch?v=${item.videoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="overflow-hidden shrink-0 relative group"
                      style={{
                        width: scaledW,
                        height: rowH,
                        borderRadius: 4,
                      }}
                    >
                      <YouTubeThumbnail
                        videoId={item.videoId}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                        <svg className="w-16 h-16 text-white drop-shadow-lg" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </a>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
