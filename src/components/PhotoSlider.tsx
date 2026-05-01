import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

interface SliderPhoto {
  src: string;
  variant: "landscape-lg" | "landscape-sm" | "portrait";
}

const VARIANT_DIMS: Record<SliderPhoto["variant"], { w: number; h: number }> = {
  "landscape-lg": { w: 600, h: 400 },
  "landscape-sm": { w: 450, h: 300 },
  "portrait":     { w: 267, h: 400 },
};

const VARIANTS: SliderPhoto["variant"][] = [
  "landscape-lg", "landscape-sm", "portrait",
];

const GAP = 2;
const MAX_H = 400;
const SCROLL_SPEED = 0.4;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface PhotoSliderProps {
  reverse?: boolean;
  autoScroll?: boolean;
}

export function PhotoSlider({ reverse = false, autoScroll = true }: PhotoSliderProps) {
  const [photos, setPhotos] = useState<SliderPhoto[]>([]);
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollXRef = useRef(0);
  const rafRef = useRef<number>(0);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragScrollX = useRef(0);
  const lastTimestamp = useRef(0);
  const pauseUntil = useRef(0);
  const totalWidthRef = useRef(0);

  const { data: fetchedPhotos } = useQuery({
    queryKey: ['sites', 'slider-photos'],
    queryFn: () => api.get<{ src: string; variant: string }[]>('/api/sites/slider-photos'),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (fetchedPhotos) {
      const mapped: SliderPhoto[] = fetchedPhotos.map(item => ({
        src: item.src,
        variant: (VARIANTS.includes(item.variant as any) ? item.variant : "landscape-lg") as SliderPhoto["variant"],
      }));
      setPhotos(shuffle(mapped));
    }
  }, [fetchedPhotos]);

  const getItemWidth = useCallback((p: SliderPhoto) => {
    return VARIANT_DIMS[p.variant].w;
  }, []);

  useEffect(() => {
    if (photos.length === 0) return;
    const total = photos.reduce((sum, p) => sum + getItemWidth(p) + GAP, 0);
    totalWidthRef.current = total;
  }, [photos, getItemWidth]);

  useEffect(() => {
    if (photos.length === 0) return;
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
  }, [photos, reverse, autoScroll]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragScrollX.current = scrollXRef.current;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStartX.current;
    scrollXRef.current = dragScrollX.current - dx;
    if (totalWidthRef.current > 0) {
      scrollXRef.current = ((scrollXRef.current % totalWidthRef.current) + totalWidthRef.current) % totalWidthRef.current;
    }
  }, []);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
    pauseUntil.current = Date.now() + 2000;
  }, []);

  if (photos.length === 0) return null;

  const tripled = [...photos, ...photos, ...photos];

  return (
    <div
      className="w-full overflow-hidden select-none"
      style={{ height: MAX_H, cursor: isDragging.current ? "grabbing" : "grab" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div
        ref={trackRef}
        className="flex items-center"
        style={{ gap: GAP, willChange: "transform" }}
      >
        {tripled.map((p, i) => {
          const dims = VARIANT_DIMS[p.variant];
          return (
            <div
              key={i}
              className="shrink-0 overflow-hidden"
              style={{
                width: dims.w,
                height: dims.h,
                borderRadius: 4,
              }}
            >
              <img
                src={p.src}
                alt=""
                draggable={false}
                className="w-full h-full object-cover"
                loading="lazy"
                style={{ pointerEvents: "none" }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
