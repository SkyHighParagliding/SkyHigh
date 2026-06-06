import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import { extractVideoId } from "@/lib/youtube";

interface YouTubeVideo {
  id: string;
  url: string;
}

const LG_W = 600;
const LG_H = 400;
const SM_W = 450;
const SM_H = 300;
const GAP = 12;
const MAX_H = 400;
const SCROLL_SPEED = 0.4;

interface YouTubeCarouselProps {
  reverse?: boolean;
  autoScroll?: boolean;
}

export function YouTubeCarousel({ reverse = false, autoScroll = true }: YouTubeCarouselProps) {
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollXRef = useRef(0);
  const rafRef = useRef<number>(0);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragScrollX = useRef(0);
  const lastTimestamp = useRef(0);
  const pauseUntil = useRef(0);
  const totalWidthRef = useRef(0);
  const wasDragged = useRef(false);

  const { data: fetchedVideos } = useQuery({
    queryKey: ['sites', 'youtube-videos'],
    queryFn: () => api.get<{ url: string }[]>('/api/sites/youtube-videos'),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (fetchedVideos) {
      const mapped: YouTubeVideo[] = [];
      for (const item of fetchedVideos) {
        const id = extractVideoId(item.url);
        if (id) mapped.push({ id, url: item.url });
      }
      setVideos(mapped);
    }
  }, [fetchedVideos]);

  useEffect(() => {
    if (videos.length === 0) return;
    let total = 0;
    for (let i = 0; i < videos.length; i++) {
      total += (i % 2 === 0 ? LG_W : SM_W) + GAP;
    }
    totalWidthRef.current = total;
  }, [videos]);

  useEffect(() => {
    if (videos.length === 0) return;
    const direction = reverse ? -1 : 1;

    const animate = (timestamp: number) => {
      if (!lastTimestamp.current) lastTimestamp.current = timestamp;
      const delta = timestamp - lastTimestamp.current;
      lastTimestamp.current = timestamp;

      if (!isDragging.current && Date.now() > pauseUntil.current && autoScroll) {
        scrollXRef.current += direction * SCROLL_SPEED * (delta / 16.67);
        if (totalWidthRef.current > 0) {
          scrollXRef.current = ((scrollXRef.current % totalWidthRef.current) + totalWidthRef.current) % totalWidthRef.current;
        }
      }

      if (trackRef.current) {
        trackRef.current.style.transform = `translateX(${-scrollXRef.current}px)`;
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [videos, reverse, autoScroll]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    wasDragged.current = false;
    dragStartX.current = e.clientX;
    dragScrollX.current = scrollXRef.current;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStartX.current;
    if (Math.abs(dx) > 5) wasDragged.current = true;
    scrollXRef.current = dragScrollX.current - dx;
    if (totalWidthRef.current > 0) {
      scrollXRef.current = ((scrollXRef.current % totalWidthRef.current) + totalWidthRef.current) % totalWidthRef.current;
    }
  }, []);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
    pauseUntil.current = Date.now() + 2000;
  }, []);

  if (videos.length === 0) return null;

  const tripled = [...videos, ...videos, ...videos];

  return (
    <div
      className="w-full overflow-hidden select-none"
      style={{ height: MAX_H + 24, cursor: isDragging.current ? "grabbing" : "grab" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div
        ref={trackRef}
        className="flex items-center"
        style={{ gap: GAP, willChange: "transform", paddingTop: 12, paddingBottom: 12 }}
      >
        {tripled.map((v, i) => {
          const isLarge = i % 2 === 0;
          const w = isLarge ? LG_W : SM_W;
          const h = isLarge ? LG_H : SM_H;
          return (
            <a
              key={i}
              href={v.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => { if (wasDragged.current) e.preventDefault(); }}
              className="shrink-0 relative group block"
              style={{ width: w, height: h, borderRadius: 8, overflow: "hidden" }}
            >
              <img
                src={`https://img.youtube.com/vi/${v.id}/hqdefault.jpg`}
                alt=""
                draggable={false}
                className="w-full h-full object-cover"
                loading="lazy"
                style={{ pointerEvents: "none" }}
              />
              <div className="absolute inset-0 flex items-center justify-center" style={{ pointerEvents: "none" }}>
                <svg width="68" height="48" viewBox="0 0 68 48" className="drop-shadow-lg">
                  <path d="M66.52 7.74c-.78-2.93-2.49-5.41-5.42-6.19C55.79.13 34 0 34 0S12.21.13 6.9 1.55C3.97 2.33 2.27 4.81 1.48 7.74.06 13.05 0 24 0 24s.06 10.95 1.48 16.26c.78 2.93 2.49 5.41 5.42 6.19C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.55c2.93-.78 4.64-3.26 5.42-6.19C67.94 34.95 68 24 68 24s-.06-10.95-1.48-16.26z" fill="#FF0000"/>
                  <path d="M45 24L27 14v20" fill="white"/>
                </svg>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}


