/**
 * Dev safe mode (DECISION-021).
 *
 * In development the server talks to real outside services (Resend email, TidyHQ,
 * Google Drive, R2 …) with real keys, and dev may hold a copy of the production
 * database. So in dev every outside WRITE is off unless Jon has switched dev "live":
 *
 *   .env  DEV_LIVE=0                      safe (default; also when the key is missing)
 *         DEV_LIVE=1 + DEV_LIVE_SINCE=…   live, for at most LIVE_MINUTES
 *
 * `npm run live` / `npm run safe` flip it. The file is re-read on every check (cached
 * by mtime), so flipping it takes effect without a restart, and an expired live
 * window is written back to DEV_LIVE=0 by the server itself. Production
 * (NODE_ENV=production) ignores all of this and is always live.
 */
import { readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import createLogger from "./logger.js";

const log = createLogger("dev-mode");

export const LIVE_MINUTES = 60;

export type DevMode =
  | { mode: "production" }
  | { mode: "live"; liveUntil: string }
  | { mode: "safe" };

/** Value of KEY=… in .env text (quotes stripped), or undefined. */
function readKey(text: string, key: string): string | undefined {
  const m = text.match(new RegExp(`^[ \\t]*${key}[ \\t]*=[ \\t]*([^\\r\\n]*)`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : undefined;
}

/** Set (or append) KEY=value; value null removes the line. */
export function setKey(text: string, key: string, value: string | null): string {
  const lineRe = `^[ \\t]*${key}[ \\t]*=[^\\r\\n]*`;
  if (value === null) return text.replace(new RegExp(`${lineRe}(\\r?\\n)?`, "m"), "");
  const line = `${key}="${value}"`;
  if (new RegExp(lineRe, "m").test(text)) return text.replace(new RegExp(lineRe, "m"), line);
  return text.replace(/\s*$/, "") + `\n${line}\n`;
}

/**
 * Pure decision. Returns the mode and, when the file needs fixing, its new text:
 * live with no start time gets stamped "now"; an expired live window goes back to 0.
 */
export function evaluate(text: string, nowMs: number, isProduction: boolean): { state: DevMode; rewrite?: string } {
  if (isProduction) return { state: { mode: "production" } };
  if (readKey(text, "DEV_LIVE") !== "1") return { state: { mode: "safe" } };

  const sinceMs = Date.parse(readKey(text, "DEV_LIVE_SINCE") ?? "");
  if (Number.isNaN(sinceMs) || sinceMs > nowMs) {
    const stamped = setKey(text, "DEV_LIVE_SINCE", new Date(nowMs).toISOString());
    return { state: { mode: "live", liveUntil: new Date(nowMs + LIVE_MINUTES * 60_000).toISOString() }, rewrite: stamped };
  }
  const untilMs = sinceMs + LIVE_MINUTES * 60_000;
  if (nowMs >= untilMs) {
    return { state: { mode: "safe" }, rewrite: setKey(setKey(text, "DEV_LIVE", "0"), "DEV_LIVE_SINCE", null) };
  }
  return { state: { mode: "live", liveUntil: new Date(untilMs).toISOString() } };
}

const envPath = () => path.resolve(process.cwd(), ".env");
let cached: { mtimeMs: number; text: string } | null = null;
let lastLogged = "";

function describe(s: DevMode): string {
  if (s.mode === "live") {
    const t = new Date(s.liveUntil).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", timeZone: "Australia/Melbourne" });
    return `DEV MODE: LIVE until ${t} — emails and outside writes are REAL`;
  }
  return s.mode === "safe" ? "DEV MODE: SAFE — emails and outside writes are logged, not sent" : "production";
}

/** Current mode. Cheap: re-reads .env only when its mtime changes. */
export function getDevMode(nowMs = Date.now()): DevMode {
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction) return { mode: "production" };

  let text = "";
  try {
    const { mtimeMs } = statSync(envPath());
    if (!cached || cached.mtimeMs !== mtimeMs) cached = { mtimeMs, text: readFileSync(envPath(), "utf8") };
    text = cached.text;
  } catch {
    cached = null; // no .env → safe
  }

  const { state, rewrite } = evaluate(text, nowMs, false);
  if (rewrite !== undefined) {
    try {
      writeFileSync(envPath(), rewrite);
      cached = null;
      if (state.mode === "safe") log.warn(`Dev live expired after ${LIVE_MINUTES} min — .env set back to DEV_LIVE=0`);
    } catch (e: any) {
      log.error(`Could not update .env: ${e.message}`);
    }
  }
  const line = describe(state);
  if (line !== lastLogged) {
    lastLogged = line;
    if (state.mode === "live") log.warn(line); else if (state.mode === "safe") log.info(line);
  }
  return state;
}

/** True when outside writes may really happen: production, or dev switched live. */
export function isDevLive(): boolean {
  return getDevMode().mode !== "safe";
}

/**
 * Gate for an outside write. In safe mode logs what would have happened and returns
 * false; callers then skip the write and return a harmless result.
 */
export function allowOutsideWrite(what: string): boolean {
  if (isDevLive()) return true;
  log.info(`[SAFE] Skipped: ${what}`);
  return false;
}

/** Dev only: log the mode now, and re-check every minute so expiry happens on time. */
export function startDevModeWatch(): void {
  if (process.env.NODE_ENV === "production") return;
  getDevMode();
  setInterval(() => getDevMode(), 60_000).unref();
}
