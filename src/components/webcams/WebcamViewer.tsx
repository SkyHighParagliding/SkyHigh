import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, ExternalLink, Maximize, Minimize, Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import {
  useWebcamDay, useWebcamDays, useWebcamLatest,
  type WebcamDayFrame, type WebcamImage,
} from "@/hooks/useWebcams";
import {
  ageText, formatClock, formatDayShort, hhmmInZone, hhmmToMinutes, minutesOfDay,
  nearestByMinuteOfDay, nearestIndex, shiftYmd, ymdInZone,
} from "@/lib/webcamTime";

const SPEEDS = [1, 2, 4, 8];
const BASE_INTERVAL_MS = 600;
const COMPARE_PRESETS = [
  { id: "hour", label: "1 hour earlier" },
  { id: "3h", label: "3 hours earlier" },
  { id: "day", label: "Yesterday, same time" },
  { id: "week", label: "Last week, same time" },
] as const;
type ComparePreset = typeof COMPARE_PRESETS[number]["id"];

interface WebcamViewerProps {
  siteId: string;
  variant: "modal" | "page";
  /** "both" or a camera key such as "north". */
  initialCamera?: string;
  /** Page variant: keep day / time / camera in the address bar so a view can be shared. */
  syncUrl?: boolean;
  allowCompare?: boolean;
  onClose?: () => void;
}

function fmtHour(minutes: number): string {
  const h = Math.round(minutes / 60) % 24;
  return `${h % 12 === 0 ? 12 : h % 12} ${h >= 12 ? "pm" : "am"}`;
}

function IconBtn({ label, onClick, disabled, big, children }: { label: string; onClick: () => void; disabled?: boolean; big?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:hover:bg-white/10 transition-colors ${big ? "h-10 w-12" : "h-9 w-9"}`}
    >
      {children}
    </button>
  );
}

function Pane({ label, image, tz, caption }: { label: string; image?: WebcamImage; tz: string; caption?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [image?.medium]);
  return (
    <figure className="relative m-0 bg-black rounded-lg overflow-hidden aspect-[4/3]">
      {image && !failed ? (
        <img
          src={image.medium}
          alt={`${label} camera at ${formatClock(image.at, tz)}`}
          className="absolute inset-0 w-full h-full object-contain select-none"
          draggable={false}
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-white/50">
          {image ? "Image unavailable" : "No image for this time"}
        </div>
      )}
      <figcaption className="absolute left-2 bottom-2 px-2 py-0.5 rounded bg-black/60 text-[11px] font-semibold">
        {label}{image ? ` · ${formatClock(image.at, tz)}` : ""}{caption ? ` · ${caption}` : ""}
      </figcaption>
      {image && (
        <a
          href={image.original}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute right-2 bottom-2 p-1.5 rounded bg-black/60 hover:bg-black/80"
          aria-label={`Open ${label} image full size`}
          title="Full size"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </figure>
  );
}

function useCompareFrame(opts: {
  enabled: boolean; siteId: string; tz: string; current?: WebcamDayFrame; preset: ComparePreset; camera?: string;
}) {
  const { enabled, siteId, tz, current, preset, camera } = opts;
  const curMs = current ? Date.parse(current.t) : null;
  const targetDay = useMemo(() => {
    if (!enabled || curMs === null) return null;
    if (preset === "hour") return ymdInZone(curMs - 3_600_000, tz);
    if (preset === "3h") return ymdInZone(curMs - 3 * 3_600_000, tz);
    return shiftYmd(ymdInZone(curMs, tz), preset === "day" ? -1 : -7);
  }, [enabled, curMs, preset, tz]);
  const q = useWebcamDay(siteId, targetDay, { enabled: enabled && !!targetDay });

  const frame = useMemo(() => {
    if (curMs === null) return null;
    const frames = (q.data?.frames ?? []).filter(f => (camera ? !!f.images[camera] : true));
    if (frames.length === 0) return null;
    const times = frames.map(f => Date.parse(f.t));
    const i = preset === "hour" ? nearestIndex(times, curMs - 3_600_000, 30 * 60_000)
      : preset === "3h" ? nearestIndex(times, curMs - 3 * 3_600_000, 30 * 60_000)
      : nearestByMinuteOfDay(times, tz, minutesOfDay(curMs, tz), 30);
    return i >= 0 ? frames[i] : null;
  }, [q.data, curMs, preset, camera, tz]);

  return { frame, loading: q.isLoading };
}

export function WebcamViewer({ siteId, variant, initialCamera, syncUrl = false, allowCompare = false, onClose }: WebcamViewerProps) {
  const [params, setParams] = useSearchParams();
  const rootRef = useRef<HTMLDivElement>(null);

  const latestQ = useWebcamLatest(siteId);
  const daysQ = useWebcamDays(siteId);
  const tz = daysQ.data?.timezone ?? latestQ.data?.timezone ?? "Australia/Melbourne";

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const today = ymdInZone(nowMs, tz);

  const availableDays = daysQ.data?.days ?? [];
  const [dayChoice, setDayChoice] = useState<string | null>(() => (syncUrl ? params.get("day") : null));
  const activeDay = dayChoice ?? (availableDays.some(d => d.day === today) ? today : availableDays[0]?.day ?? null);
  const isToday = activeDay === today;
  const dayQ = useWebcamDay(siteId, activeDay, { live: isToday });
  const frames = dayQ.data?.frames ?? [];
  const cameras = dayQ.data?.cameras ?? [];

  const [modeChoice, setModeChoice] = useState<string>(() => (syncUrl ? params.get("cam") : null) ?? initialCamera ?? "both");
  const mode = cameras.length <= 1
    ? (cameras[0]?.camera ?? "both")
    : (modeChoice === "both" || cameras.some(c => c.camera === modeChoice) ? modeChoice : "both");

  const [compareOn, setCompareOn] = useState(false);
  const [preset, setPreset] = useState<ComparePreset>("day");
  const compareActive = allowCompare && compareOn;
  const shown: string[] = compareActive
    ? [mode === "both" ? cameras[0]?.camera : mode].filter((c): c is string => !!c)
    : mode === "both" ? cameras.map(c => c.camera) : [mode];
  const shownKey = shown.join("|");

  const [indexChoice, setIndexChoice] = useState<number | null>(null);
  const defaultIndex = isToday ? Math.max(0, frames.length - 1) : 0;
  const idx = Math.min(Math.max(indexChoice ?? defaultIndex, 0), Math.max(0, frames.length - 1));
  const current: WebcamDayFrame | undefined = frames[idx];

  const seekRef = useRef<string | null>(syncUrl ? params.get("t") : null);
  useEffect(() => {
    if (!seekRef.current || frames.length === 0) return;
    const mins = hhmmToMinutes(seekRef.current);
    seekRef.current = null;
    if (mins === null) return;
    const i = nearestByMinuteOfDay(frames.map(f => Date.parse(f.t)), tz, mins, 60);
    if (i >= 0) setIndexChoice(i);
  }, [frames, tz]);

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [loop, setLoop] = useState(false);
  const live = useRef({ defaultIndex: 0, length: 0, loop: false });
  live.current = { defaultIndex, length: frames.length, loop };

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setIndexChoice(prev => {
        const cur = prev ?? live.current.defaultIndex;
        if (cur >= live.current.length - 1) return live.current.loop ? 0 : cur;
        return cur + 1;
      });
    }, BASE_INTERVAL_MS / speed);
    return () => clearInterval(id);
  }, [playing, speed]);

  useEffect(() => {
    if (playing && !loop && frames.length > 0 && idx >= frames.length - 1) setPlaying(false);
  }, [playing, loop, idx, frames.length]);

  const preloaded = useRef(new Map<string, HTMLImageElement>());
  useEffect(() => {
    if (frames.length === 0) return;
    const ahead = playing ? Math.min(40, speed * 5 + 6) : 4;
    const cache = preloaded.current;
    for (let k = -1; k <= ahead; k++) {
      const f = frames[idx + k];
      if (!f) continue;
      for (const cam of shownKey.split("|")) {
        const url = f.images[cam]?.medium;
        if (url && !cache.has(url)) {
          const im = new Image();
          im.decoding = "async";
          im.src = url;
          cache.set(url, im);
        }
      }
    }
    while (cache.size > 200) {
      const first = cache.keys().next().value;
      if (first === undefined) break;
      cache.delete(first);
    }
  }, [frames, idx, playing, speed, shownKey]);

  const compare = useCompareFrame({ enabled: compareActive, siteId, tz, current, preset, camera: shown[0] });

  const step = (d: number) => {
    setPlaying(false);
    setIndexChoice(Math.min(Math.max(idx + d, 0), Math.max(0, frames.length - 1)));
  };
  const jump = (i: number) => {
    setPlaying(false);
    setIndexChoice(i);
  };
  const togglePlay = () => {
    if (playing) { setPlaying(false); return; }
    if (idx >= frames.length - 1) setIndexChoice(0);
    setPlaying(true);
  };
  const changeDay = (d: string) => {
    setPlaying(false);
    setDayChoice(d);
    setIndexChoice(null);
  };
  const goLatest = () => {
    setPlaying(false);
    setDayChoice(null);
    setIndexChoice(null);
  };

  useEffect(() => {
    if (!syncUrl || playing || !activeDay) return;
    const next = new URLSearchParams(params);
    if (dayChoice) next.set("day", dayChoice); else next.delete("day");
    if (indexChoice !== null && current) next.set("t", hhmmInZone(Date.parse(current.t), tz)); else next.delete("t");
    if (modeChoice !== "both") next.set("cam", modeChoice); else next.delete("cam");
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [syncUrl, playing, dayChoice, indexChoice, modeChoice, idx]);

  const [isFs, setIsFs] = useState(false);
  useEffect(() => {
    const h = () => setIsFs(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);
  const canFs = typeof document !== "undefined" && !!document.documentElement.requestFullscreen;
  const toggleFs = () => {
    const el = rootRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen().catch(() => {});
  };

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (variant !== "modal") return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.fullscreenElement) onCloseRef.current?.(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    rootRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [variant]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "SELECT" || tag === "INPUT") return;
    if (tag === "BUTTON" && (e.key === " " || e.key === "k")) return;
    if (e.key === " " || e.key === "k") { e.preventDefault(); togglePlay(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
    else if (e.key === "Home") { e.preventDefault(); jump(0); }
    else if (e.key === "End") { e.preventDefault(); jump(Math.max(0, frames.length - 1)); }
    else if (e.key === "f" && canFs) toggleFs();
  };

  const swipe = useRef<{ x: number; y: number } | null>(null);

  const latest = latestQ.data;
  const statusLine = !latest ? "" : latest.status === "live" ? `Live · updated ${ageText(latest.newestAt!, nowMs)}`
    : latest.status === "overnight" ? `Overnight · last image ${ageText(latest.newestAt!, nowMs)} (cameras run about ${fmtHour(latest.expectFromMin)} to ${fmtHour(latest.expectToMin)})`
    : latest.status === "stale" ? `Delayed · last image ${ageText(latest.newestAt!, nowMs)}`
    : "No images yet";
  const dot = latest?.status === "live" ? "bg-green-400" : latest?.status === "stale" || latest?.status === "offline" ? "bg-amber-400" : "bg-white/40";

  const cameraLabel = (key: string) => cameras.find(c => c.camera === key)?.label ?? key;
  const loading = daysQ.isLoading || dayQ.isLoading;
  const empty = !loading && frames.length === 0;

  const body = (
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      {...(variant === "modal" ? { role: "dialog", "aria-modal": true, "aria-label": `${latest?.label ?? "Camera"} images` } : {})}
      className={
        variant === "modal"
          ? "fixed inset-0 z-[10001] overflow-y-auto bg-black/95 text-white p-3 sm:p-5 outline-none"
          : "rounded-xl bg-neutral-950 text-white p-3 sm:p-4 outline-none"
      }
      style={isFs ? { overflowY: "auto" } : undefined}
    >
      <div className={variant === "modal" ? "mx-auto max-w-5xl" : ""}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ${dot}`} />
            <span className="text-sm font-semibold truncate">{latest?.label ?? "Cameras"}</span>
            <span className="text-xs text-white/60 truncate">{statusLine}</span>
          </div>
          <div className="flex items-center gap-2">
            {availableDays.length > 0 && (
              <select
                aria-label="Day"
                value={activeDay ?? ""}
                onChange={e => changeDay(e.target.value)}
                className="bg-white/10 text-white text-xs rounded px-2 py-1.5 border border-white/20"
                style={{ colorScheme: "dark" }}
              >
                {availableDays.map(d => (
                  <option key={d.day} value={d.day}>
                    {formatDayShort(d.day)}{d.day === today ? " (today)" : ""} · {d.frames}
                  </option>
                ))}
              </select>
            )}
            <button type="button" onClick={goLatest} className="text-xs rounded px-2.5 py-1.5 bg-white/10 hover:bg-white/20">Latest</button>
            {canFs && (
              <IconBtn label={isFs ? "Exit full screen" : "Full screen"} onClick={toggleFs}>
                {isFs ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </IconBtn>
            )}
            {variant === "modal" && <IconBtn label="Close" onClick={() => onClose?.()}><X className="w-5 h-5" /></IconBtn>}
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white/70" />
          </div>
        )}

        {empty && (
          <div className="flex items-center justify-center h-64 text-sm text-white/60 text-center px-4">
            {availableDays.length === 0 ? "No camera images have been archived yet." : "No images for this day."}
          </div>
        )}

        {!loading && !empty && (
          <>
            <div
              className={`mt-3 grid gap-2 ${compareActive || shown.length > 1 ? "sm:grid-cols-2" : ""}`}
              style={{ touchAction: "pan-y" }}
              onPointerDown={e => { if (e.pointerType === "touch") swipe.current = { x: e.clientX, y: e.clientY }; }}
              onPointerUp={e => {
                const s = swipe.current;
                swipe.current = null;
                if (!s || e.pointerType !== "touch") return;
                const dx = e.clientX - s.x, dy = e.clientY - s.y;
                if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
              }}
            >
              {compareActive ? (
                <>
                  <Pane label={cameraLabel(shown[0] ?? "")} image={shown[0] ? current?.images[shown[0]] : undefined} tz={tz} caption={formatDayShort(ymdInZone(Date.parse(current?.t ?? new Date().toISOString()), tz))} />
                  <Pane
                    label={cameraLabel(shown[0] ?? "")}
                    image={shown[0] ? compare.frame?.images[shown[0]] : undefined}
                    tz={tz}
                    caption={compare.frame ? formatDayShort(ymdInZone(Date.parse(compare.frame.t), tz)) : compare.loading ? "loading" : undefined}
                  />
                </>
              ) : (
                shown.map(cam => <Pane key={cam} label={cameraLabel(cam)} image={current?.images[cam]} tz={tz} />)
              )}
            </div>

            <div className={variant === "modal" ? "sticky bottom-0 z-10 -mx-3 sm:-mx-5 mt-2 px-3 sm:px-5 pb-2 pt-1 bg-black/90" : ""}>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <IconBtn label="First image of the day" onClick={() => jump(0)} disabled={idx === 0}><SkipBack className="w-4 h-4" /></IconBtn>
              <IconBtn label="Previous image" onClick={() => step(-1)} disabled={idx === 0}><ChevronLeft className="w-5 h-5" /></IconBtn>
              <IconBtn label={playing ? "Pause" : "Play"} onClick={togglePlay} big>
                {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </IconBtn>
              <IconBtn label="Next image" onClick={() => step(1)} disabled={idx >= frames.length - 1}><ChevronRight className="w-5 h-5" /></IconBtn>
              <IconBtn label="Last image of the day" onClick={() => jump(frames.length - 1)} disabled={idx >= frames.length - 1}><SkipForward className="w-4 h-4" /></IconBtn>
              <select
                aria-label="Playback speed"
                value={speed}
                onChange={e => setSpeed(Number(e.target.value))}
                className="bg-white/10 text-white text-xs rounded px-2 py-1.5 border border-white/20"
                style={{ colorScheme: "dark" }}
              >
                {SPEEDS.map(s => <option key={s} value={s}>{s}×</option>)}
              </select>
              <label className="flex items-center gap-1 text-xs text-white/80">
                <input type="checkbox" checked={loop} onChange={e => setLoop(e.target.checked)} /> Loop
              </label>
              <div className="ml-auto text-xs text-white/70 tabular-nums text-right">
                {current ? `${formatClock(current.t, tz)} · ${formatDayShort(ymdInZone(Date.parse(current.t), tz))}` : ""}
                <span className="text-white/40"> · {idx + 1}/{frames.length}</span>
              </div>
            </div>

            <input
              type="range"
              aria-label="Time of day"
              min={0}
              max={Math.max(0, frames.length - 1)}
              value={idx}
              onChange={e => jump(Number(e.target.value))}
              className="w-full mt-2 accent-orange-500"
            />

            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
              {cameras.length > 1 && (
                <div className="inline-flex rounded-md overflow-hidden border border-white/20" role="group" aria-label="Cameras">
                  {(compareActive ? cameras.map(c => c.camera) : ["both", ...cameras.map(c => c.camera)]).map(key => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setModeChoice(key)}
                      className={`px-3 py-1.5 ${(compareActive ? shown[0] : mode) === key ? "bg-white text-black font-semibold" : "bg-white/10 hover:bg-white/20"}`}
                    >
                      {key === "both" ? "Both" : cameraLabel(key)}
                    </button>
                  ))}
                </div>
              )}
              {allowCompare && (
                <label className="flex items-center gap-1.5 text-white/80">
                  <input type="checkbox" checked={compareOn} onChange={e => { setCompareOn(e.target.checked); setPlaying(false); }} /> Compare
                </label>
              )}
              {compareActive && (
                <select
                  aria-label="Compare with"
                  value={preset}
                  onChange={e => setPreset(e.target.value as ComparePreset)}
                  className="bg-white/10 text-white rounded px-2 py-1.5 border border-white/20"
                  style={{ colorScheme: "dark" }}
                >
                  {COMPARE_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              )}
            </div>
            </div>
            <p className="mt-2 text-[11px] text-white/45">
              New images about every 6 minutes{daysQ.data ? `; the last ${daysQ.data.retentionDays} days are kept` : ""}. Use the corner icon on an image for full size.
            </p>
          </>
        )}
      </div>
    </div>
  );

  return variant === "modal" ? createPortal(body, document.body) : body;
}
