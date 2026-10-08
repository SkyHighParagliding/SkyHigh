import { localToUtc } from "./timeUtil.js";

export type CameraKey = "north" | "south";
const CAMERAS: CameraKey[] = ["north", "south"];

export interface ProviderFrame {
  camera: CameraKey;
  /** Path relative to the source base URL, e.g. Camera1/20261008/images/P26100806000010.jpg */
  path: string;
  /** Station wall-clock time of the capture, HH:MM:SS */
  localTime: string;
  capturedAt: Date;
}

const PATH_RE = /^Camera\d+\/(\d{8})\/images\/[A-Za-z0-9_.-]+\.jpe?g$/i;
const TIME_RE = /^\d{2}:\d{2}:\d{2}$/;
const USER_AGENT = "SkyHighParagliding-webcam-archive/1.0 (+https://skyhighparagliding.org.au)";
const MIN_IMAGE_BYTES = 10_000;
const MAX_IMAGE_BYTES = 12_000_000;

/**
 * Turns one day's getFrames JSON into a flat list of usable images. Only sides
 * whose status is "ok" are returned — "missing" and "unreadable" entries carry a
 * null path (or a *_file path to a file the operator could not read) and are
 * skipped. Returns null when the payload is not the expected shape.
 */
export function parseDayFrames(json: unknown, ymd: string, tz: string): ProviderFrame[] | null {
  if (!json || typeof json !== "object") return null;
  const frames = (json as { frames?: unknown }).frames;
  if (!Array.isArray(frames)) return null;

  const seen = new Set<string>();
  const out: ProviderFrame[] = [];
  for (const raw of frames) {
    if (!raw || typeof raw !== "object") continue;
    const f = raw as Record<string, unknown>;
    for (const camera of CAMERAS) {
      const path = f[camera];
      const time = f[`${camera}_time`];
      const status = f[`${camera}_status`];
      if (typeof path !== "string" || typeof time !== "string") continue;
      if (status !== undefined && status !== "ok") continue;
      const m = PATH_RE.exec(path);
      if (!m || m[1] !== ymd || !TIME_RE.test(time) || seen.has(path)) continue;
      const capturedAt = localToUtc(ymd, time, tz);
      if (Number.isNaN(capturedAt.getTime())) continue;
      seen.add(path);
      out.push({ camera, path, localTime: time, capturedAt });
    }
  }
  return out.sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
}

function withSlash(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

/** Absolute image URL for a provider path; throws if the path is not a plain camera image path. */
export function resolveImageUrl(baseUrl: string, path: string): string {
  if (!PATH_RE.test(path)) throw new Error(`Unexpected image path: ${path.slice(0, 80)}`);
  const base = new URL(withSlash(baseUrl));
  const url = new URL(path, base);
  if (url.origin !== base.origin) throw new Error("Image URL left the feed origin");
  return url.toString();
}

export function dayListUrl(baseUrl: string, ymd: string): string {
  return `${withSlash(baseUrl)}timelapse.php?action=getFrames&day=${encodeURIComponent(ymd)}&_=${Date.now()}`;
}

export type DayListResult =
  | { status: "ok"; json: unknown }
  | { status: "http"; code: number }
  | { status: "error"; message: string };

export async function fetchDayList(baseUrl: string, ymd: string): Promise<DayListResult> {
  try {
    const res = await fetch(dayListUrl(baseUrl, ymd), {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { status: "http", code: res.status };
    return { status: "ok", json: await res.json() };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

/** Downloads a JPEG and rejects placeholders, error pages and truncated transfers. */
export async function fetchImage(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "image/jpeg" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Image HTTP ${res.status}`);
  const type = res.headers.get("content-type") || "";
  if (!type.includes("image/jpeg")) throw new Error(`Image content-type was ${type || "missing"}`);
  const buf = Buffer.from(await res.arrayBuffer());
  assertJpeg(buf);
  return buf;
}

export function assertJpeg(buf: Buffer): void {
  if (buf.length < MIN_IMAGE_BYTES || buf.length > MAX_IMAGE_BYTES) throw new Error(`Image size ${buf.length} bytes out of range`);
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error("Not a JPEG");
  if (buf.lastIndexOf(Buffer.from([0xff, 0xd9])) < buf.length - 64) throw new Error("JPEG looks truncated");
}
