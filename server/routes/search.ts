import { Router } from "express";
import { GoogleGenAI } from "@google/genai";
import db from "../db.js";
import asyncHandler from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { generateTextWithFallback, getTextModels } from "../utils/aiModels.js";
import { getIndexedDocumentsContext, getPublicDocumentsContext } from "./documents.js";
import { filterByCurrentMembers } from "../utils/tidyhqMemberFilter.js";
import { registerSearchCacheInvalidator } from "../utils/searchCacheInvalidation.js";
import { sendEmail } from "../utils/email.js";

const router = Router();

async function logPublicSearch(query: string, response: string): Promise<void> {
  try {
    const enabledRow = await db.prepare("SELECT value FROM settings WHERE key = 'searchLoggingEnabled'").get() as { value: string } | undefined;
    if (enabledRow?.value !== "true") return;

    await db.prepare("INSERT INTO search_logs (search_type, query, response) VALUES (?, ?, ?)").run("public", query, response);

    // Check size threshold and send a one-time warning email if exceeded
    const warnSentRow = await db.prepare("SELECT value FROM settings WHERE key = 'searchLogWarningSent'").get() as { value: string } | undefined;
    if (warnSentRow?.value === "true") return;

    const warnMbRow = await db.prepare("SELECT value FROM settings WHERE key = 'searchLogSizeWarningMb'").get() as { value: string } | undefined;
    const warnMb = parseFloat(warnMbRow?.value || "10");
    const sizeRow = await db.prepare("SELECT SUM(LENGTH(query) + LENGTH(response)) as bytes FROM search_logs").get() as { bytes: number | null };
    const currentMb = Number(sizeRow?.bytes || 0) / (1024 * 1024);

    if (currentMb >= warnMb) {
      const countRow = await db.prepare("SELECT COUNT(*) as total FROM search_logs").get() as { total: number | string };
      const total = parseInt(String(countRow.total));
      await sendEmail({
        to: process.env.ADMIN_NOTIFICATION_EMAIL || "web@skyhighparagliding.org.au",
        subject: "SkyHigh Smart Search log needs review",
        html: `<p>The Smart Search query log has reached <strong>${Math.round(currentMb * 10) / 10} MB</strong> (${total} entries), exceeding the configured threshold of ${warnMb} MB.</p><p>Please review and clear the log in <strong>Admin → API Settings → Smart Assistant → Search Query Logging</strong>.</p>`,
      });
      await db.prepare("INSERT INTO settings (key, value) VALUES ('searchLogWarningSent', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true'").run();
    }
  } catch {
    // Never let logging errors surface to callers
  }
}

async function getClubName(): Promise<string> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'clubName'").get() as { value: string } | undefined;
  return row?.value || "SkyHigh";
}

const COMPASS_DIRS = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];

function parseWindSpeedRange(text: string): { min: number; max: number } | null {
  if (!text) return null;
  const match = text.match(/(\d+)\s*[-–toTO\s]+\s*(\d+)/);
  if (match) return { min: parseInt(match[1]), max: parseInt(match[2]) };
  const single = text.match(/(\d+)/);
  if (single) { const v = parseInt(single[1]); return { min: v, max: v }; }
  return null;
}

function parseWindDirs(text: string): string[] {
  if (!text) return [];
  const norm = text.toUpperCase().trim();
  if (norm.includes(' TO ') || norm.includes('-')) {
    const parts = norm.split(/ TO |-/);
    if (parts.length >= 2) {
      const si = COMPASS_DIRS.indexOf(parts[0].trim());
      const ei = COMPASS_DIRS.indexOf(parts[1].trim());
      if (si !== -1 && ei !== -1) {
        const result: string[] = [];
        const dist = (ei - si + 16) % 16;
        const revDist = (si - ei + 16) % 16;
        const steps = dist <= revDist ? dist : -revDist;
        const count = Math.abs(steps);
        const dir = steps >= 0 ? 1 : -1;
        for (let i = 0; i <= count; i++) result.push(COMPASS_DIRS[(si + i * dir + 16) % 16]);
        return result;
      }
    }
  }
  const found: string[] = [];
  COMPASS_DIRS.forEach(d => { if (new RegExp(`\\b${d}\\b`).test(norm)) found.push(d); });
  return found;
}

function getCrossDirs(idealDirs: string[], crossLeft: boolean, crossRight: boolean): string[] {
  const crossDirs: string[] = [];
  const idealSet = new Set(idealDirs);
  if (idealSet.size === 0) return crossDirs;
  for (let i = 0; i < 16; i++) {
    if (!idealSet.has(COMPASS_DIRS[i])) continue;
    if (crossRight) { const n = (i + 1) % 16; if (!idealSet.has(COMPASS_DIRS[n])) crossDirs.push(COMPASS_DIRS[n]); }
    if (crossLeft) { const p = (i - 1 + 16) % 16; if (!idealSet.has(COMPASS_DIRS[p])) crossDirs.push(COMPASS_DIRS[p]); }
  }
  return crossDirs;
}

function computeFlyability(windSpeed: number | null, windGust: number | null, windDir: string | null, site: any): { direction: string; speed: string; gustWarning: string | null } | null {
  if (windSpeed == null || !windDir) return null;
  const range = parseWindSpeedRange(site.windSpeed);
  const idealDirs = parseWindDirs(site.windDir);
  if (!range || idealDirs.length === 0) return null;

  let speed = "Good";
  if (Math.round(windSpeed) > range.max) speed = "Blown Out";
  else if (Math.round(windSpeed) < range.min) speed = "Light";

  let gustWarning: string | null = null;
  if (windGust != null && Math.round(windGust) > range.max) {
    gustWarning = `Gusts of ${Math.round(windGust)}kts exceed the ${range.max}kts upper limit`;
  }

  const crossL = site.crossLeft === "true" || site.crossLeft === true;
  const crossR = site.crossRight === "true" || site.crossRight === true;
  const crossDirList = getCrossDirs(idealDirs, crossL, crossR);

  let direction = "Not Flyable";
  if (idealDirs.includes(windDir.toUpperCase())) direction = "Good";
  else if (crossDirList.includes(windDir.toUpperCase())) direction = "Cross";

  return { direction, speed, gustWarning };
}

// ─── OPTIMIZATION: Context caching ───
interface CachedContext {
  data: string;
  timestamp: number;
  sites: any[];
  closureMap: Map<string, string[]>;
}

let publicContextCache: CachedContext | null = null;
let internalContextCache: { data: string; timestamp: number } | null = null;
let adminContextCache: { data: string; sites: any[]; timestamp: number } | null = null;

async function getContextTtl(): Promise<number> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ?").get("cacheSearchContextTtl") as { value: string } | undefined;
  const minutes = parseInt(row?.value || "5", 10);
  return minutes * 60 * 1000;
}

// ─── OPTIMIZATION: Asset register caching ───
let assetCache: { data: string; timestamp: number } | null = null;

async function getAssetTtl(): Promise<number> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ?").get("cacheAssetRegisterTtl") as { value: string } | undefined;
  const minutes = parseInt(row?.value || "10", 10);
  return minutes * 60 * 1000;
}

export function invalidateSearchCaches() {
  publicContextCache = null;
  internalContextCache = null;
  adminContextCache = null;
  assetCache = null;
}

registerSearchCacheInvalidator(invalidateSearchCaches);

async function getCachedAssetData(): Promise<string> {
  const assetTtl = await getAssetTtl();
  if (assetCache && Date.now() - assetCache.timestamp < assetTtl) {
    return assetCache.data;
  }

  const appScriptUrlRow = await db.prepare("SELECT value FROM settings WHERE key = 'asset_appscript_url'").get() as SettingRow | undefined;
  const appScriptUrl = appScriptUrlRow?.value || "";
  const allowedDomains = ["script.google.com", "script.googleusercontent.com"];
  const isValid = appScriptUrl && (() => {
    try { return allowedDomains.some(d => new URL(appScriptUrl).hostname.endsWith(d)); } catch { return false; }
  })();

  if (!isValid) {
    assetCache = { data: "", timestamp: Date.now() };
    return "";
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const assetRes = await fetch(`${appScriptUrl}?q=`, { signal: controller.signal });
    clearTimeout(timeout);
    if (assetRes.ok) {
      const assetJson = await assetRes.json() as any;
      if (assetJson.success && assetJson.results?.length > 0) {
        console.log(`Asset register: Loaded ${assetJson.results.length} items (caching ${Math.min(assetJson.results.length, 50)})`);
        const items = assetJson.results.slice(0, 50) as any[];
        const grouped: Record<string, any[]> = {};
        for (const item of items) {
          const tab = item._sheet || "UNKNOWN";
          if (!grouped[tab]) grouped[tab] = [];
          grouped[tab].push(item);
        }
        let data = "\n\n=== ASSET REGISTER (Google Sheet) ===\n";
        data += "This data comes from the club's Asset Register spreadsheet with multiple tabs.\n";
        data += "IMPORTANT: The LOAN REGISTER tab shows who currently has equipment on loan. If 'Actual Return Date' is empty, that person STILL HAS the item.\n\n";
        for (const [tab, rows] of Object.entries(grouped)) {
          data += `--- ${tab} (${rows.length} rows) ---\n`;
          data += JSON.stringify(rows, null, 1) + "\n\n";
        }
        assetCache = { data, timestamp: Date.now() };
        return data;
      } else if (assetJson.connected) {
        console.warn("Asset register: URL points to Drive bridge, not the Asset Register script. Update the Asset Register Apps Script URL in Connections.");
      } else {
        console.warn(`Asset register: Response OK but no results (success: ${assetJson.success}, results: ${assetJson.results?.length ?? 'none'})`);
      }
    } else {
      console.warn(`Asset register: Fetch failed with status ${assetRes.status}`);
    }
    assetCache = { data: "", timestamp: Date.now() };
    return "";
  } catch (err) {
    console.warn(`Asset register: Fetch error — ${err instanceof Error ? err.message : String(err)}`);
    assetCache = { data: "", timestamp: Date.now() };
    return "";
  }
}

// Background asset refresh — fire-and-forget on startup
(async () => { try { await getCachedAssetData(); } catch {} })();

// ─── Build public context (with weather) ───
async function buildPublicContext(): Promise<CachedContext> {
  const contextTtl = await getContextTtl();
  if (publicContextCache && Date.now() - publicContextCache.timestamp < contextTtl) {
    return publicContextCache;
  }

  const sites = await db.prepare("SELECT id, name, description, pgRating, hgRating, windDir, windSpeed, launch, landing, hazards, rules, type, navigateTo, isSkyHighSite, status, crossLeft, crossRight FROM sites ORDER BY name").all() as any[];
  const weatherObs = await db.prepare("SELECT siteId, windSpeed, windGust, direction, stationName, timestamp FROM weather_observations").all() as any[];
  const weatherForecasts = await db.prepare("SELECT siteId, temperature, windSpeed, windGust, windDirection, summary, forecasts FROM weather_forecasts").all() as any[];
  const obsMap = new Map(weatherObs.map((w: any) => [w.siteId, w]));
  const forecastMap = new Map(weatherForecasts.map((w: any) => [w.siteId, w]));

  // Upcoming closure dates (next 14 days) — keyed by site_id
  const today = new Date().toISOString().slice(0, 10);
  const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const closureRows = await db.prepare(
    "SELECT site_id, closure_date FROM site_closure_dates WHERE closure_date >= ? AND closure_date <= ? ORDER BY site_id, closure_date"
  ).all(today, in14) as { site_id: string; closure_date: string }[];
  const closureMap = new Map<string, string[]>();
  for (const r of closureRows) {
    const existing = closureMap.get(r.site_id) || [];
    existing.push(r.closure_date);
    closureMap.set(r.site_id, existing);
  }

  // Build a dayName → YYYY-MM-DD map for the next 14 days (Melbourne time)
  // Used to match extended forecast day entries against closure dates
  const dayNameToDate = new Map<string, string>();
  for (let i = 0; i < 14; i++) {
    const d = new Date(Date.now() + i * 86400000);
    const dayName = d.toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'Australia/Melbourne' });
    const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
    if (!dayNameToDate.has(dayName)) dayNameToDate.set(dayName, dateStr);
  }

  let ctx = "=== FLYING SITES ===\n";
  for (const site of sites) {
    // Server-side hard exclusion: skip permanently closed and restricted sites entirely
    if (site.status === 'closed' || site.status === 'permanently closed' || site.status === 'restricted') continue;

    const isSH = site.isSkyHighSite === true || site.isSkyHighSite === "true";
    ctx += `\n## ${site.name} [page: /sites/${site.id}]${isSH ? " (Club Site)" : ""}\n`;
    ctx += `Type: ${site.type || "Unknown"}, Status: ${site.status || "unknown"}\n`;
    ctx += `Club site: ${isSH ? "Yes" : "No"}\n`;

    // Make HG-only and PG-only labels explicit so the AI cannot miss them
    const pgLabel = site.pgRating?.toLowerCase() === 'not suitable'
      ? 'HG ONLY — NOT OPEN TO PG PILOTS'
      : (site.pgRating || "NOT SPECIFIED IN DATABASE");
    const hgLabel = site.hgRating?.toLowerCase() === 'not suitable'
      ? 'PG ONLY — NOT OPEN TO HG PILOTS'
      : (site.hgRating || "NOT SPECIFIED IN DATABASE");
    ctx += `PG Rating: ${pgLabel}, HG Rating: ${hgLabel}\n`;

    const siteClosure = closureMap.get(site.id);
    if (siteClosure && siteClosure.length > 0) {
      ctx += `SCHEDULED CLOSURES (skip this site on these dates): ${siteClosure.join(", ")}\n`;
    }
    if (site.windDir) ctx += `Wind Dir: ${site.windDir}`;
    if (site.windSpeed) ctx += `, Speed Range: ${site.windSpeed}`;
    if (site.windDir || site.windSpeed) ctx += "\n";
    if (site.description) ctx += `Desc: ${site.description.substring(0, 200)}\n`;
    if (site.hazards) ctx += `Hazards: ${site.hazards.substring(0, 150)}\n`;
    if (site.launch) ctx += `Launch: ${site.launch.substring(0, 150)}\n`;
    if (site.landing) ctx += `Landing: ${site.landing.substring(0, 150)}\n`;
    if (site.rules) ctx += `Rules: ${site.rules.substring(0, 150)}\n`;
    if (site.navigateTo) ctx += `Access: ${site.navigateTo.substring(0, 150)}\n`;

    const obs = obsMap.get(site.id);
    if (obs && obs.windSpeed != null) {
      const obsAge = obs.timestamp ? Math.round((Date.now() - new Date(obs.timestamp).getTime()) / 60000) : null;
      ctx += `LIVE: ${obs.windSpeed}kts G${obs.windGust ?? "N/A"} ${obs.direction || "?"} (${obsAge !== null && obsAge < 120 ? `${obsAge}m ago` : "recent"})`;
      const liveStatus = computeFlyability(obs.windSpeed, obs.windGust, obs.direction, site);
      if (liveStatus) {
        const siteRange = parseWindSpeedRange(site.windSpeed);
        let advisory = "";
        if (liveStatus.direction === 'Not Flyable') advisory = " [WRONG DIRECTION — do not recommend]";
        else if (liveStatus.speed === 'Light') advisory = " [LIGHT WINDS — do not recommend]";
        else if (liveStatus.speed === 'Blown Out') advisory = " [BLOWN OUT — do not recommend]";
        else if (obs.windGust != null && siteRange && Math.round(obs.windGust) > siteRange.max + 2) advisory = " [GUST THRESHOLD EXCEEDED — do not recommend]";
        else advisory = " [No gust concern]";
        ctx += ` [Dir:${liveStatus.direction} Spd:${liveStatus.speed}${liveStatus.gustWarning ? ` ⚠ ${liveStatus.gustWarning}` : ""}]${advisory}`;
      }
      ctx += "\n";
    }
    const forecast = forecastMap.get(site.id);
    if (forecast && forecast.windSpeed != null) {
      ctx += `FCST: ${forecast.windSpeed}kts G${forecast.windGust ?? "N/A"} ${forecast.windDirection || "?"} ${forecast.temperature != null ? forecast.temperature + "°C" : ""}`;
      const fcStatus = computeFlyability(forecast.windSpeed, forecast.windGust, forecast.windDirection, site);
      if (fcStatus) {
        const siteRange = parseWindSpeedRange(site.windSpeed);
        let advisory = "";
        if (fcStatus.direction === 'Not Flyable') advisory = " [WRONG DIRECTION — do not recommend]";
        else if (fcStatus.speed === 'Light') advisory = " [LIGHT WINDS — do not recommend]";
        else if (fcStatus.speed === 'Blown Out') advisory = " [BLOWN OUT — do not recommend]";
        else if (forecast.windGust != null && siteRange && Math.round(forecast.windGust) > siteRange.max + 2) advisory = " [GUST THRESHOLD EXCEEDED — do not recommend]";
        else advisory = " [No gust concern]";
        ctx += ` [Dir:${fcStatus.direction} Spd:${fcStatus.speed}${fcStatus.gustWarning ? ` ⚠ ${fcStatus.gustWarning}` : ""}]${advisory}`;
      }
      ctx += "\n";
      if (forecast.forecasts) {
        try {
          const hourly = JSON.parse(forecast.forecasts);
          if (Array.isArray(hourly) && hourly.length > 0) {
            const upcoming = hourly.slice(0, 4).map((h: any) => {
              const hStatus = computeFlyability(h.windSpeed, h.windGust, h.windDirection, site);
              if (!hStatus) return `${h.time || ""}:${h.windSpeed || 0}G${h.windGust || 0}${h.windDirection || ""}`;
              const siteRange = parseWindSpeedRange(site.windSpeed);
              let advisory = "";
              if (hStatus.direction === 'Not Flyable') advisory = "[WRONG DIR]";
              else if (hStatus.speed === 'Light') advisory = "[LIGHT]";
              else if (hStatus.speed === 'Blown Out') advisory = "[BLOWN OUT]";
              else if (h.windGust != null && siteRange && Math.round(h.windGust) > siteRange.max + 2) advisory = "[GUSTS EXCEED LIMIT]";
              else advisory = "[OK]";
              const tag = `[${hStatus.direction}/${hStatus.speed}${hStatus.gustWarning ? ` ⚠ ${hStatus.gustWarning}` : ""}]${advisory}`;
              return `${h.time || ""}:${h.windSpeed || 0}G${h.windGust || 0}${h.windDirection || ""}${tag}`;
            }).join(" | ");
            ctx += `HRLY: ${upcoming}\n`;
          }
        } catch {}
      }
    }
  }

  try {
    const extRows = await db.prepare("SELECT siteId, forecastData FROM site_extended_forecasts").all() as any[];
    if (extRows.length > 0) {
      ctx += "\n=== 7-DAY EXTENDED FORECASTS ===\n";
      const extMap = new Map<string, any>();
      for (const row of extRows) {
        try { extMap.set(row.siteId, JSON.parse(row.forecastData)); } catch {}
      }
      const todayDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
      const tomorrowDateStr = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
      for (const site of sites) {
        // Skip closed and restricted sites (already filtered above, but guard here too)
        if (site.status === 'closed' || site.status === 'permanently closed' || site.status === 'restricted') continue;
        const ext = extMap.get(site.id);
        if (!ext || !ext.days || ext.days.length === 0) continue;
        const siteClosure = closureMap.get(site.id) || [];
        const dayStrs = ext.days
          .map((d: any) => {
            const spd = d.bestSpeed ?? 0;
            const dir = d.bestDirection || '?';
            // Server-side: skip days where this site has a scheduled closure
            // Use d.date (YYYY-MM-DD) directly — avoids ambiguity when day name repeats (e.g. two Saturdays)
            if (siteClosure.includes(d.date)) return null;
            const bestSlot = d.slots?.find((s: any) => s.windSpeed === spd && s.windDirection === dir) || d.slots?.[0] || {};
            const gust = bestSlot.windGust ?? null;
            const fly = computeFlyability(spd, gust, dir, site);
            // Cannot assess flyability without site wind config — skip this day
            if (!fly) return null;
            // Label today/tomorrow explicitly so the AI cannot misidentify which day is which
            const dayLabel = d.date === todayDateStr ? `TODAY (${d.dayName})`
                           : d.date === tomorrowDateStr ? `TOMORROW (${d.dayName})`
                           : d.dayName;
            const siteRange = parseWindSpeedRange(site.windSpeed);
            const speedBase = `${spd}kt${gust != null ? ` G${gust}` : ''} ${dir}`;
            // Include unflyable days with [NOT FLYABLE: reason] instead of dropping them.
            // Prevents the AI from confabulating today's FCST numbers for a future day
            // that has no flyable conditions — it can now cite the actual forecast data.
            if (fly.direction === 'Not Flyable') {
              const reason = `wrong direction${site.windDirection ? `, requires ${site.windDirection}` : ''}`;
              return `${dayLabel} ${speedBase} [NOT FLYABLE: ${reason}]`;
            }
            if (fly.speed === 'Blown Out') return `${dayLabel} ${speedBase} [NOT FLYABLE: wind too strong]`;
            if (fly.speed === 'Light') return `${dayLabel} ${speedBase} [NOT FLYABLE: wind too light]`;
            if (gust != null && siteRange && Math.round(gust) > siteRange.max + 2) {
              return `${dayLabel} ${speedBase} [NOT FLYABLE: gusts exceed site limit]`;
            }
            const flyTag = ` [Dir:${fly.direction} Spd:${fly.speed}${fly.gustWarning ? ` ⚠ ${fly.gustWarning}` : ''}]`;
            return `${dayLabel} ${speedBase} ${d.bestWeatherSummary || ''}${flyTag}`;
          })
          .filter(Boolean);
        if (dayStrs.length > 0) {
          ctx += `${site.name}: ${dayStrs.join(" | ")}\n`;
        }
      }
    }
  } catch {}

  publicContextCache = { data: ctx, timestamp: Date.now(), sites, closureMap };
  return publicContextCache;
}

// ─── Pilot-type filter: strip HG-only sites for PG queries and vice versa ───
// This runs at query time so the shared cache is never modified.
function filterContextByPilotType(context: string, query: string, sites: any[]): string {
  const isPgQuery = /\bpg\d?\b|\bparaglid/i.test(query);
  const isHgQuery = /\bhg\d?\b|\bhang.?glid/i.test(query);
  // For conditions/forecast queries with no explicit pilot type, default to PG behaviour
  // and strip HG-only sites. HG pilots asking about conditions almost always say "HG";
  // a generic "what's flyable this weekend?" is almost always from a PG pilot, and
  // conversational follow-ups lose the PG context from the previous turn.
  const isConditionsQuery = /weather|wind|fly|flyable|conditions|forecast|weekend|this\s+week|saturday|sunday|monday|tuesday|wednesday|thursday|friday|today|tonight/i.test(query);
  const effectivelyPg = isPgQuery || (!isHgQuery && isConditionsQuery);

  if (!effectivelyPg && !isHgQuery) return context;

  const excludedNames = new Set<string>();
  for (const site of sites) {
    if (effectivelyPg && site.pgRating?.toLowerCase() === 'not suitable') excludedNames.add(site.name);
    if (isHgQuery && site.hgRating?.toLowerCase() === 'not suitable') excludedNames.add(site.name);
  }
  if (excludedNames.size === 0) return context;

  // Strip excluded site sections from FLYING SITES block
  const sections = context.split(/\n(?=## )/);
  const filteredSections = sections.filter(section => {
    if (!section.startsWith('## ')) return true;
    for (const name of excludedNames) {
      if (section.startsWith(`## ${name} `) || section.startsWith(`## ${name}\n`)) return false;
    }
    return true;
  });

  // Strip excluded site lines from 7-DAY EXTENDED FORECASTS block
  const rejoined = filteredSections.join('\n');
  const filteredLines = rejoined.split('\n').filter(line => {
    for (const name of excludedNames) {
      if (line.startsWith(`${name}: `)) return false;
    }
    return true;
  });

  return filteredLines.join('\n');
}

// ─── Query-aware context filtering ───
// Extract dates from the query (day names, today, tomorrow, weekend) as YYYY-MM-DD strings in Melbourne time.
// Returns an empty array if no dates are detected — callers should fall back to a default window.
function extractQueryDates(query: string): string[] {
  const q = query.toLowerCase();
  const toMelbDate = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
  const dates = new Set<string>();

  for (let i = 0; i < 14; i++) {
    const d = new Date(Date.now() + i * 86400000);
    const dayName = d.toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'Australia/Melbourne' }).toLowerCase();
    const dateStr = toMelbDate(d);
    if (i === 0 && /\btoday\b|\btonight\b|\bnow\b/.test(q)) dates.add(dateStr);
    if (i === 1 && /\btomorrow\b/.test(q)) dates.add(dateStr);
    if (q.includes(dayName)) dates.add(dateStr);
    if (/\bweekend\b/.test(q) && (dayName === 'saturday' || dayName === 'sunday') && i < 8) dates.add(dateStr);
  }
  return Array.from(dates);
}

// Convert "14:00" → "2pm", "09:00" → "9am", etc.
function formatHrlyTime(time: string): string {
  const hour = parseInt(time.split(':')[0], 10);
  if (isNaN(hour)) return time;
  if (hour === 0) return '12am';
  if (hour === 12) return '12pm';
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

// Scan a HRLY context line for the first slot where direction is Good/Cross and advisory is [OK].
// Returns a human-readable description or null if no suitable slot exists.
function findGoodHrlySlot(hrlyLine: string): { time: string; dir: string } | null {
  const content = hrlyLine.replace(/^HRLY:\s*/i, '').trim();
  for (const slot of content.split(/\s*\|\s*/)) {
    if (!slot.includes('[OK]')) continue;
    const dirMatch = slot.match(/\[(Good|Cross)\/Good/);
    if (!dirMatch) continue;
    const timeMatch = slot.match(/^(\d{1,2}:\d{2})/);
    if (!timeMatch) continue;
    return { time: formatHrlyTime(timeMatch[1]), dir: dirMatch[1] };
  }
  return null;
}

// Strip LIVE/FCST lines with hard-exclusion advisory tags, then enforce site-level rules:
// • If valid LIVE or FCST remains → keep section (HRLY stays for hourly granularity).
// • If all LIVE/FCST stripped but HRLY has a good slot → replace HRLY with a plain improving note.
// • If no flyable data at all → strip the entire site section.
// • Sites with no weather lines at all → strip only for conditions queries.
// Runs at query time so the shared cache is never modified.
function filterContextByAdvisoryExclusions(context: string, query: string = ''): string {
  const EXCLUSION_TAGS = [
    '[WRONG DIRECTION — do not recommend]',
    '[LIGHT WINDS — do not recommend]',
    '[BLOWN OUT — do not recommend]',
    '[GUST THRESHOLD EXCEEDED — do not recommend]',
  ];
  const isConditionsQuery = /weather|wind|fly|flyable|conditions|forecast|today|tonight|now|current|good.*site|blown|gust|sites.*available|where.*fly/i.test(query);
  // Rating/eligibility queries ("Im a PG3, can I fly X?") must not strip sites based on
  // current conditions — the pilot needs the site's rules and ratings regardless of today's wind.
  const isRatingQuery = /\bpg\d\b|\bhg\d\b/i.test(query);
  const shouldStripUnflyable = isConditionsQuery && !isRatingQuery;

  // The 7-DAY block is appended without a '## ' prefix so it fuses to the last site
  // section when splitting on /\n(?=## )/. Carve it out first; reattach unchanged after.
  const extIdx = context.indexOf('\n=== 7-DAY');
  const sitesContext = extIdx !== -1 ? context.slice(0, extIdx) : context;
  const extBlock = extIdx !== -1 ? context.slice(extIdx) : '';

  const sections = sitesContext.split(/\n(?=## )/);
  // Track site names stripped for conditions queries so we can remove them from the
  // 7-day extBlock too — ECMWF and Open-Meteo are independent sources and can disagree
  // on today's conditions, so a site excluded from short-term can't appear as flyable-today
  // in the 7-day block.
  const strippedNames = new Set<string>();

  // Sites explicitly named in the query are never stripped — the pilot asked about them
  // specifically and needs their eligibility/rating info even if no weather station exists.
  const qLower = query.toLowerCase();
  const mentionedInQuery = new Set<string>();
  for (const header of sitesContext.split('\n').filter(l => l.startsWith('## '))) {
    const name = header.replace(/^## /, '').replace(/\s*\[.*$/, '').replace(/\s*\(.*$/, '').trim();
    if (!name) continue;
    const nameLower = name.toLowerCase();
    if (qLower.includes(nameLower)) { mentionedInQuery.add(name); continue; }
    const words = nameLower.split(/[\s-]+/).filter(w => w.length > 3);
    if (words.some(w => qLower.includes(w))) mentionedInQuery.add(name);
  }

  const processed = sections.map(section => {
    if (!section.startsWith('## ')) return section;

    const lines = section.split('\n');
    const hrlyLine = lines.find(line => /^HRLY:\s/i.test(line.trim()));
    const siteName = section.match(/^## ([^\[]+)/)?.[1]?.trim() ?? '';

    // Strip bad LIVE/FCST lines; leave everything else (including HRLY) intact for now.
    const filteredLines = lines.filter(line => {
      const trimmed = line.trim();
      if (!/^(LIVE:|FCST:)/.test(trimmed)) return true;
      return !EXCLUSION_TAGS.some(tag => line.includes(tag));
    });

    const hasValidWeather = filteredLines.some(line => /^(LIVE:|FCST:)/.test(line.trim()));

    if (hasValidWeather) {
      // Current/forecast data is good — keep section as-is (HRLY provides hourly granularity).
      return filteredLines.join('\n');
    }

    // No valid LIVE/FCST. Remove raw HRLY and decide what to put in its place.
    const withoutHrly = filteredLines.filter(line => !/^HRLY:\s/i.test(line.trim()));

    if (hrlyLine) {
      const goodSlot = findGoodHrlySlot(hrlyLine);
      if (goodSlot) {
        withoutHrly.push(`FCST: Conditions expected to improve — Dir:${goodSlot.dir} Spd:Good at approx ${goodSlot.time}`);
        return withoutHrly.join('\n');
      }
      // HRLY exists but all slots unflyable — strip for conditions queries,
      // keep site metadata (ratings, hazards, rules) for info queries and named sites.
      if (shouldStripUnflyable && !mentionedInQuery.has(siteName)) { if (siteName) strippedNames.add(siteName); return null; }
      return withoutHrly.join('\n');
    }

    // No weather data at all — strip for conditions queries, keep for info queries and named sites.
    if (shouldStripUnflyable && !mentionedInQuery.has(siteName)) { if (siteName) strippedNames.add(siteName); return null; }
    return filteredLines.join('\n');
  });

  // For conditions queries, remove stripped sites from the 7-day block so a site
  // excluded from short-term context cannot reappear as flyable-today via ECMWF data.
  let filteredExt = extBlock;
  if (isConditionsQuery && strippedNames.size > 0) {
    filteredExt = extBlock.split('\n').filter(line => {
      for (const name of strippedNames) {
        if (line.startsWith(`${name}: `)) return false;
      }
      return true;
    }).join('\n');
  }

  return processed.filter(Boolean).join('\n') + filteredExt;
}

// Query-time filter: remove site sections for sites that have scheduled closures overlapping the queried dates.
// Falls back to a 7-day window when the query doesn't mention specific dates.
function filterContextByClosureDates(context: string, closureMap: Map<string, string[]>, sites: any[], query: string): string {
  let queriedDates = extractQueryDates(query);

  if (queriedDates.length === 0) {
    // Generic query — use the next 7 days as the default window
    const toMelbDate = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
    for (let i = 0; i < 7; i++) {
      queriedDates.push(toMelbDate(new Date(Date.now() + i * 86400000)));
    }
  }

  const queriedSet = new Set(queriedDates);
  const excludedNames = new Set<string>();

  for (const site of sites) {
    const siteClosure = closureMap.get(site.id) || [];
    if (siteClosure.some((date: string) => queriedSet.has(date))) {
      excludedNames.add(site.name);
    }
  }

  if (excludedNames.size === 0) return context;

  // Carve out the 7-day block so it doesn't fuse to the last site section during split.
  const extIdx = context.indexOf('\n=== 7-DAY');
  const sitesContext = extIdx !== -1 ? context.slice(0, extIdx) : context;
  const extBlock = extIdx !== -1 ? context.slice(extIdx) : '';

  const sections = sitesContext.split(/\n(?=## )/);
  const filteredSites = sections.filter(section => {
    if (!section.startsWith('## ')) return true;
    for (const name of excludedNames) {
      if (section.startsWith(`## ${name} `) || section.startsWith(`## ${name}\n`)) return false;
    }
    return true;
  }).join('\n');

  // Also strip closed sites from the 7-day block.
  const filteredExt = extBlock.split('\n').filter(line => {
    for (const name of excludedNames) {
      if (line.startsWith(`${name}: `)) return false;
    }
    return true;
  }).join('\n');

  return filteredSites + filteredExt;
}

function filterContextBySites(fullContext: string, sites: any[], query: string): string {
  const qLower = query.toLowerCase();

  const isWeatherQuery = /weather|wind|fly|flyable|conditions|forecast|today|now|current|good.*site|blown|gust/i.test(qLower);
  const isRatingQuery = /rating|pg\d|hg\d|can i fly|where can i|sites? for|allowed/i.test(qLower);
  const isBroadQuery = /all sites|every site|list.*sites|how many/i.test(qLower);

  if (isWeatherQuery || isRatingQuery || isBroadQuery) {
    return fullContext;
  }

  const matchedSiteNames = new Set<string>();
  for (const site of sites) {
    const nameLower = site.name?.toLowerCase() || "";
    const idLower = site.id?.toLowerCase() || "";
    if (qLower.includes(nameLower) || qLower.includes(idLower)) {
      matchedSiteNames.add(site.name);
    }
    const nameWords = nameLower.split(/[\s-]+/).filter((w: string) => w.length > 3);
    for (const word of nameWords) {
      if (qLower.includes(word)) {
        matchedSiteNames.add(site.name);
        break;
      }
    }
  }

  if (matchedSiteNames.size === 0) {
    return fullContext;
  }

  const sections = fullContext.split(/\n(?=## )/);
  const header = sections[0].startsWith("===") ? sections[0] : "";
  const filtered = sections.filter(section => {
    if (section.startsWith("===")) return true;
    for (const name of matchedSiteNames) {
      if (section.includes(`## ${name} `)) return true;
    }
    return false;
  });

  if (filtered.length <= 1) return fullContext;
  return (header ? "" : sections[0] + "\n") + filtered.join("\n");
}

async function getDefaultPublicPrompt(): Promise<string> {
  return `You are the ${await getClubName()}'s friendly Smart assistant, helping pilots and visitors find information about flying sites, ratings, rules, and club resources.

PERSONALITY:
- Warm, helpful, and knowledgeable about paragliding
- Use plain language, not overly technical unless the pilot seems experienced
- Keep answers concise but thorough — 2-4 sentences is ideal for simple questions

CAPABILITIES:
1. Answer questions about flying sites (ratings, wind directions, hazards, rules, access)
2. Help pilots understand if they can fly a specific site based on their rating (PG1-PG5, HG1-HG5)
3. Provide LIVE weather observations and forecasts for flying sites — you DO have real-time weather data including current wind speed, gusts, direction, and upcoming hourly forecasts. When a pilot asks about current conditions or forecasts, share the data you have and link them to the site page for the full live view
4. Reference official documents when relevant
5. Provide information about club sponsors when asked
6. Direct equipment/physical item questions to committee members

RATING SYSTEM:
- Paragliding ratings: PG1 (Student) → PG2 (Supervised) → PG3 (Intermediate) → PG4 (Advanced) → PG5 (Master)
- Hang gliding ratings: HG1 → HG2 → HG3 → HG4 → HG5
- A pilot with PG3 can fly sites requiring PG3 or lower (PG1, PG2)

CRITICAL — RATING-FIRST RULE:
- If a pilot asks "can I fly X", "what sites can I fly", "where can I fly", or ANY question about which sites they are allowed to fly — and they have NOT already told you their PG or HG rating in this conversation — you MUST ask for their rating FIRST before listing ANY site names.
- IMPORTANT: Check the question itself for a rating! If they say "sites for a pg3" or "I'm PG2" or "as a HG3" — they HAVE given their rating. Ratings are case-insensitive: pg3 = PG3, hg2 = HG2. Do NOT ask again if the rating is already in their message.
- Do NOT list site names, do NOT link to sites, do NOT mention specific sites at all until you know their rating.
- Simply acknowledge their question and ask: "What is your paragliding (PG) or hang gliding (HG) rating?"
- Only AFTER they provide their rating should you list the sites they can fly.
- This is a SAFETY rule — listing sites before knowing their rating could lead a pilot to assume they can fly somewhere dangerous for their level.

WEATHER & FLYABILITY — IMPORTANT:
- You have LIVE weather observations and ECMWF forecasts for most sites.
- Each site has pre-computed FLYABILITY STATUS labels in the data. Direction can be "Good", "Cross", or "Not Flyable". Speed can be "Good", "Light", or "Blown Out". ALWAYS use these pre-computed labels — DO NOT compute your own flyability from raw wind numbers.
- GUST WARNINGS: When the data includes a gust warning (⚠ Gusts of Xkts exceed the Ykts upper limit), always quote it exactly as shown. Do not paraphrase or recalculate — use the numbers in the data verbatim. Strong gusts can make conditions dangerous even when average speed looks fine.
- When a pilot asks about weather or "which sites are flyable", focus on the FLYABILITY labels first — "Good/Good" means both direction and speed are ideal.
- FLYABILITY FILTER: Only recommend sites where the flyability label is "Good" or "Cross" for the relevant time. DO NOT list or recommend sites with "Not Flyable" direction or "Blown Out" speed. If no sites have Good or Cross conditions, say so: "There are no sites with flyable conditions for that day based on current forecasts."
- Prioritise "Good/Good" (no gust warning) sites first. List "Cross" or gusty sites second with a clear caution note.
- When listing sites with weather, lead with the flyability status, then the key numbers (wind speed, gusts, direction). Temperature and sky conditions are secondary.
- Always suggest the pilot check the site page for the full live view and 6-hour forecast.
- You also have access to 7-DAY EXTENDED FORECASTS when available. All 7 days appear for each site. Flyable days show [Dir:X Spd:Y] labels. Unflyable days are included with a [NOT FLYABLE: reason] tag showing the actual forecast wind data (e.g. "Monday 6kt NE [NOT FLYABLE: wrong direction, requires W-NW]"). When a day is marked NOT FLYABLE, cite the actual numbers from that entry — do NOT substitute numbers from another day or from the LIVE/FCST section.
- FUTURE DATE WITH NO FORECAST: If a pilot asks about a specific future date and that date is completely absent from the 7-DAY EXTENDED FORECASTS (neither as a flyable nor as a [NOT FLYABLE] entry), the date is beyond the 7-day forecast window. Do NOT say "forecast not available." Instead say the forecast doesn't extend to that date yet, and recommend the pilot check the site page closer to the date for updated conditions.

RULES:
1. If the pilot asks about physical club equipment or items (porosity meter, reserve parachute for testing, club gear, etc.), tell them to contact a committee member and link to the committee page
2. If a reference document is relevant, mention it by name and include its URL
3. NEVER make up information — only use what's in the provided data
4. If you don't know the answer, say so honestly and suggest who to contact`;
}

function getDefaultEligibilityRules(): string {
  return `SITE ELIGIBILITY RULES — apply these before recommending any site:

HARD EXCLUSION — CRITICAL: Any site that fails any rule below must be completely absent from your response. Do not list it, do not mention it, do not note it with a caveat, do not reference it in any form. If a site cannot be recommended, it simply does not appear. A response that lists a site and then says "you cannot fly here" or "be cautious" is wrong — omit the site entirely.

- HG ONLY [ABSOLUTE]: If a site shows "HG ONLY — NOT OPEN TO PG PILOTS", that site is completely invisible in your response for any PG pilot — including when the pilot identified themselves as PG earlier in the conversation. A PG pilot cannot fly an HG-only site under any supervision level. The label is an absolute disqualifier. Do not list it, do not say "this site is HG only", do not use it as an example of what is unavailable. It does not exist.
- PG ONLY [ABSOLUTE]: Same rule in reverse — "PG ONLY — NOT OPEN TO HG PILOTS" sites do not exist in responses to HG pilots.
- CONVERSATION CONTEXT: If the pilot has stated their rating at any point in the conversation (e.g. "I'm a PG2"), apply that pilot's eligibility rules for the entire conversation — not just the turn where they said it. A follow-up query like "what about this weekend?" from a PG2 pilot is still a PG2 query.
- SCHEDULED CLOSURES: If a site has a "SCHEDULED CLOSURES" line and the requested date appears in that list, omit that site for that date only. It may be recommended on other dates.
- WEATHER PRE-FILTERING: The server has already removed sites where current LIVE and FCST conditions are unflyable (wrong direction, light winds, blown out, or gust threshold exceeded). Do not second-guess this — if a site is not in the data, conditions are not suitable. If a site has a FCST line containing "Conditions expected to improve", current conditions are poor but a later time today may be suitable — surface the improving time to the pilot as a late-day option and let them decide. Sites with no weather data at all are excluded from conditions queries.
- GUST WARNING: If a site's LIVE or FCST line shows a ⚠ gust warning (gusts exceeding site maximum), do not recommend that site for a PG2 or PG3 pilot. For PG4+ you may mention it with the gust note, but only if no advisory tag is also present.

PG2 UNIVERSAL SUPERVISION RULE — MANDATORY: PG2 pilots require supervision at EVERY site without exception. There is no site a PG2 can fly unsupervised. When responding to a PG2 pilot, state this clearly at the start of your response before listing any sites. Every site you include must carry a supervision requirement.

PG3 AND ABOVE — DO NOT GENERALISE: NEVER say "as a PG3 (or PG4) pilot, you require supervision at every site." That statement is ONLY true for PG2. PG3 pilots are fully qualified to fly PG2 and PG3 rated sites without any supervision whatsoever. Only mention supervision when the pilot's specific rating falls below a specific site's minimum.

ECHO THE PILOT'S EXACT RATING — MANDATORY: Throughout your entire response, use the exact rating the pilot stated. If the pilot said "I am PG2", every sentence referring to their certification must say "PG2" — never "PG3" or any other level. Read the pilot's stated rating before writing each sentence and verify you are using it exactly. Substituting a different rating level (e.g. writing PG3 when the pilot said PG2) is a legal safety error.

STEP 1 — SITE-SPECIFIC RATING CHECK (MANDATORY — DO THIS BEFORE STEP 2):
Before applying the general matrix, inspect each site's pgRating field for the "|" character (e.g., "PG5 | PG4 Supervised requires SO/SSO"). If "|" is present, this is a site-specific tier list. STOP — the general matrix in STEP 2 does NOT apply to this site at all. Use only the site-specific tiers:
- The first tier (e.g., "PG5") is the minimum rating to fly unsupervised.
- Each subsequent tier (e.g., "PG4 Supervised requires SO/SSO") means a pilot who holds EXACTLY that rating (PG4) may fly with the specified supervision type. A LOWER-rated pilot (e.g., PG3) CANNOT use this supervised slot. The tier sets a minimum pilot rating — it does not open the site to pilots below that rating with any level of supervision.
- A pilot below ALL listed tiers is completely ineligible. Example: tiers are "PG5 | PG4 Supervised requires SO/SSO" → PG5 flies unsupervised, PG4 flies with SO/SSO, PG3 and below cannot fly there regardless of who is supervising — a CFI, FI, SSO, or SO cannot make a PG3 eligible at this site.

Response rules for sites with a site-specific tier list:
- DIRECT query ("can I fly [Site]?", "what about [Site]?", "can I go to [Site]?"): If the pilot is below all tiers, your VERY FIRST SENTENCE must be a clear "No." FORBIDDEN OPENING: Do NOT start with "To fly [Site], a [rating] pilot requires supervision from..." — that sentence implies flying is possible and will mislead any pilot who reads only the first line. REQUIRED OPENING: Start with "No, a [rating] pilot cannot fly [Site] under any supervision." Then optionally state the minimum required rating in a second sentence. Do NOT say "however". Do NOT present a yes-then-no answer. Do NOT say the pilot "falls under" a supervised category. Do NOT mention CFI, FI, or any supervisor as a possible workaround. End your answer there.
- LISTING query ("where can I fly?", "what sites can I fly?"): omit ineligible sites completely — do not list them or mention them at all.

STEP 2 — GENERAL SUPERVISION MATRIX (only for sites where pgRating has no "|"):
A site's pgRating is the minimum to fly unsupervised. Pilots below that minimum may still fly with appropriate supervision:

  Pilot Cert | Site Rating 2 | Site Rating 3 | Site Rating 4   | Site Rating 5
  PG2        | PG4           | PG5           | CFI, FI or SSO  | CFI, FI or SSO
  PG3        | (qualified)   | (qualified)   | PG5             | CFI, FI or SSO
  PG4        | (qualified)   | (qualified)   | (qualified)     | PG5
  PG5        | (qualified)   | (qualified)   | (qualified)     | (qualified)

"(qualified)" means the pilot meets or exceeds the site rating — no supervision needed.
CFI = Chief Flying Instructor, FI = Flying Instructor, SSO = Senior Safety Officer, SO = Safety Officer.
When supervision is required, tell the pilot clearly what level of supervisor they need and include the site in the list.

If after all exclusions no sites remain, say so: "There are no suitable open sites for a [RATING] pilot on [day]." Never pad the list with excluded sites.`;
}

router.get("/public/default-prompt", async (_req, res) => {
  res.json({ prompt: await getDefaultPublicPrompt() });
});

router.get("/public/default-eligibility-rules", (_req, res) => {
  res.json({ rules: getDefaultEligibilityRules() });
});

interface SiteRow {
  id: string;
  name: string;
  description: string;
  pgRating: string;
  hgRating: string;
  windDir: string;
  windSpeed: string;
  launch: string;
  landing: string;
  hazards: string;
  rules: string;
  type: string;
  navigateTo: string;
  isSkyHighSite: string | boolean;
  status: string;
}

interface ProcedureRow {
  id: string;
  title: string;
  description: string;
  steps: string;
}

interface SettingRow {
  key: string;
  value: string;
}

// ─── Internal search (admin bar) ───
router.post("/", asyncHandler(async (req, res) => {
  const { query } = req.body;
  if (!query || typeof query !== "string" || query.trim().length < 2) {
    return res.status(400).json({ error: "Please enter a search query" });
  }

  const apiKey = process.env.USER_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Smart search is not configured — API key missing" });
  }

  let fullContext: string;
  const contextTtl = await getContextTtl();
  if (internalContextCache && Date.now() - internalContextCache.timestamp < contextTtl) {
    fullContext = internalContextCache.data;
  } else {
    const procedures = await db.prepare("SELECT id, title, description, steps FROM procedures ORDER BY sortOrder").all() as ProcedureRow[];
    const sites = await db.prepare("SELECT id, name, pgRating, hgRating, windDir, windSpeed, type, navigateTo, isSkyHighSite, description, hazards, launch, landing, rules FROM sites ORDER BY name").all() as any[];

    let proceduresContext = "=== PROCEDURES MANUAL ===\n";
    for (const proc of procedures) {
      let steps: string[];
      try { const parsed = JSON.parse(proc.steps); steps = Array.isArray(parsed) ? parsed : []; } catch { steps = []; }
      proceduresContext += `\n## ${proc.title} [section-id: ${proc.id}]\n${proc.description}\n`;
      steps.forEach((s: string, i: number) => {
        proceduresContext += `  ${i + 1}. ${s}\n`;
      });
    }

    let sitesContext = "\n\n=== FLYING SITES ===\n";
    for (const site of sites) {
      const isSH = site.isSkyHighSite === true || site.isSkyHighSite === "true";
      sitesContext += `\n## ${site.name} [site-id: ${site.id}]${isSH ? " (Club Site)" : ""}\n`;
      sitesContext += `Type: ${site.type || "?"}, PG: ${site.pgRating || "N/A"}, HG: ${site.hgRating || "N/A"}\n`;
      if (site.windDir) sitesContext += `Wind: ${site.windDir}\n`;
      if (site.description) sitesContext += `Desc: ${site.description.substring(0, 150)}\n`;
      if (site.hazards) sitesContext += `Hazards: ${site.hazards.substring(0, 100)}\n`;
    }

    const assetData = await getCachedAssetData();
    const driveDocsContext = await getIndexedDocumentsContext();
    fullContext = proceduresContext + sitesContext + assetData + driveDocsContext;
    internalContextCache = { data: fullContext, timestamp: Date.now() };
  }

  const systemPrompt = `You are the ${await getClubName()} intelligent search assistant. You search across the club's procedures manual, flying site guides, and asset register to answer questions.

RULES:
1. Search ALL provided data to find relevant matches
2. Understand synonyms and related terms (e.g. "wind meter" could mean weather station, anemometer, porosity meter)
3. Understand intent (e.g. "who can fly X" means rating requirements, "PG2 friendly" means sites with PG2 minimum rating)
4. Return results as a JSON array of objects

RESPONSE FORMAT — return ONLY valid JSON, no markdown, no backticks:
{
  "summary": "Brief natural language answer to the question",
  "results": [
    {
      "title": "Name of the matching item",
      "type": "procedure | site | asset | step | document",
      "sectionId": "the section-id or site-id for linking",
      "stepNumber": null or the step number if matching a specific step,
      "excerpt": "The relevant text snippet (keep under 200 chars)",
      "relevance": "Why this matches the query"
    }
  ]
}

IMPORTANT:
- Always check for synonym matches (wind meter → weather station, anemometer; reserve → parachute, emergency)
- For rating queries, check both PG and HG ratings across all sites
- For "who" questions about roles, check the Committee & Contacts and role descriptions
- Return up to 15 most relevant results, ordered by relevance
- If nothing matches, return empty results array with a helpful summary suggesting what to search for instead
- The sectionId must exactly match the id values in square brackets in the data (e.g. "asset-register", "mystic", "safety-procedures")
- For answers sourced from CLUB DOCUMENTS (Google Drive), always cite the document name in the result title and excerpt so the user knows which document the information came from

ANTI-HALLUCINATION — CRITICAL:
- ONLY state facts explicitly present in the provided data. If a field says "NOT SPECIFIED IN DATABASE", report it as not recorded — NEVER guess or invent a value.
- For ratings: If a site shows "Rating: NOT SPECIFIED IN DATABASE", say the rating is not recorded — NEVER invent a PG or HG rating.`;

  const ai = new GoogleGenAI({ apiKey });
  const { text } = await generateTextWithFallback(ai, {
    contents: [
      { role: "user", parts: [{ text: `${systemPrompt}\n\n--- CLUB DATA ---\n${fullContext}\n\n--- USER QUESTION ---\n${query}` }] }
    ],
    config: {
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 }
    }
  });
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      parsed = { summary: "Search completed but could not parse results.", results: [] };
    }
  }

  res.json(parsed);
}));

interface OfficerRow {
  name: string;
  type: string;
  phone: string;
  email: string;
}

const ADMIN_NAV_INDEX = [
  { name: "Flying Sites", path: "/admin/sites", description: "Manage site guides, wind data, ratings, hazards, rules, launch/landing info. Smart site generation and bulk import." },
  { name: "Home Page Settings", path: "/admin/home", description: "Hero images, CTA buttons, quick action cards, schools section, weather cards, Telegram groups." },
  { name: "Pages (CMS)", path: "/admin/pages", description: "Create and edit dynamic pages like About, Contact, Training. Markdown editor with image toolbar." },
  { name: "News & Events", path: "/admin/pages", description: "Post announcements, club news, and manage TidyHQ events integration. Use the News & Events tab inside the Pages manager." },
  { name: "Check-ins", path: "/admin/checkins", description: "View pilot check-in metrics and flight history." },
  { name: "Weather Management", path: "/admin/weather", description: "Weather data scraping settings, wind map particle configuration, station management." },
  { name: "Page Views", path: "/admin/pageviews", description: "Page view analytics and visitor traffic tracking." },
  { name: "Documents", path: "/admin/documents", description: "Club filing system with 8 folders. Google Drive integration for upload, view, search, delete." },
  { name: "Projects", path: "/admin/projects", description: "Site works, stakeholder management, Parks Victoria liaison, document attachments, contact linking." },
  { name: "Contacts", path: "/admin/contacts", description: "External contact directory for projects. Search, add, edit, delete with cross-project warnings." },
  { name: "Sponsors", path: "/admin/sponsors", description: "Manage sponsor listings with name, logo URL, website URL, and markdown description." },
  { name: "Safety Officers", path: "/admin/contacts", description: "Manage the safety officer and committee member directory. Filter Contacts by the Safety Committee role." },
  { name: "Smart Assistant Settings", path: "/admin/connections#smart-assistant", description: "Configure public Smart search assistant behaviour, reference documents, and prompts." },
  { name: "Social Media", path: "/admin/home", description: "Manage footer social media links (Facebook, Instagram, Telegram, etc). Found in the Social Links section of Home Page Settings." },
  { name: "Admin Users", path: "/admin/contacts", description: "Manage admin user accounts and access credentials. Filter Contacts by the Admin role to view and edit admin users and passwords." },
  { name: "Admin Manual", path: "/admin/manual", description: "Comprehensive how-to guide for all admin features. Version-controlled documentation." },
  { name: "Procedures Manual", path: "/admin/procedures", description: "Club operating procedures — safety, site ops, governance, membership, events. 23 editable sections." },
  { name: "Smart Site Generator", path: "/admin/sites", description: "Scrape site guide URLs to extract and structure flying site data. Bulk import entire states." },
  { name: "Smart Image Enhancer", path: "/admin/sites", description: "Upload photos and Smart enhance. Auto-generates hero and banner image sizes." },
  { name: "Connections & APIs", path: "/admin/connections", description: "Central hub for all external service integrations. Google Drive setup, Google Sheets asset register, Open-Meteo weather API info, Weather Underground stations, AI model configuration links, TidyHQ (coming soon). Shows connection status, cost, setup instructions." },
  { name: "Platform Overview", path: "/features", description: "Overview of all platform features, categories, and capabilities. Printable." },
];

async function getDefaultAdminSearchPrompt(): Promise<string> {
  return `You are the ${await getClubName()} admin search assistant. You provide comprehensive, authoritative answers to administrators by searching across all platform data — procedures manual, flying sites, CMS pages, news, club documents from Google Drive, and the admin interface.

TASK:
Answer the admin's question thoroughly. You have access to ALL database fields for every flying site, the full procedures manual, club documents (with their text content), CMS pages, news articles, admin navigation, the full contact directory (with roles and positions), project details, sponsor listings, social media links, paragliding schools, Telegram groups, site feature toggles, and Google Drive connection status.

RULES:
1. ANSWER THE QUESTION FIRST: Provide a complete, detailed answer in the summary field. This is NOT a brief one-liner — write a thorough response with all relevant information.
2. PRIORITISE THE MOST RELEVANT SOURCE: For "who has" or "where is" questions about equipment, check the LOAN REGISTER first — if an item is currently on loan (no Actual Return Date), that person has it NOW and should be the lead answer. Then supplement with Asset Register details (custodian, location, condition). The Loan Register shows real-time possession; the Asset Register shows the default custodian/location.
3. CITE YOUR SOURCES: When your answer draws from club documents, always cite the full document name (which typically includes version and date, e.g. "SAFA Part 149 Operations Manual_V3.0_20250604.pdf"). Use the format: *Source: [document name]*.
4. CITE PROCEDURES: When referencing procedures manual sections, name the specific procedure title.
5. For diagnostic/site queries: scan all site records and report every match with specific field values.
6. After the detailed answer, list related items in the results array so the admin can navigate to relevant pages, procedures, documents, or sites.
7. Return up to 15 related results ordered by relevance.
8. If nothing matches, return an empty results array with a helpful summary explaining what was searched.

RESPONSE FORMAT — return ONLY valid JSON, no markdown fences, no backticks wrapping:
{
  "summary": "Comprehensive answer to the question. Use markdown formatting: **bold** for emphasis, *italics* for document citations, bullet points (- item) for lists. Be thorough — multiple paragraphs are fine. Always cite document names with version/date when available.",
  "results": [
    {
      "title": "Name of the related item",
      "type": "admin-page | procedure | site | cms-page | news | document",
      "path": "the URL path for navigation (e.g. /admin/sites, /admin/manual#safety, /admin/procedures)",
      "excerpt": "Relevant text snippet under 200 chars",
      "relevance": "Why this is related to the query"
    }
  ]
}`;
}

function filterAdminContext(fullContext: string, query: string, sites: any[]): string {
  const qLower = query.toLowerCase();

  const isBroadQuery = /all sites|every site|list.*sites|how many|overview|dashboard|everything/i.test(qLower);
  if (isBroadQuery) return fullContext;

  const sections = fullContext.split(/\n\n(?==== )/);
  const navSection = sections.find(s => s.startsWith("=== ADMIN NAVIGATION")) || "";

  const siteKeywords = /site|wind|weather|rating|pg\d|hg\d|flyable|launch|landing|hazard|closed|station/i;
  const procKeywords = /procedure|safety|rule|governance|membership|event|operation/i;
  const newsKeywords = /news|announcement|event|post/i;
  const pageKeywords = /page|cms|about|contact|training|content/i;
  const docKeywords = /document|manual|regulation|rule|policy|constitution|minute|financial|report|pdf|drive/i;

  const includeSites = siteKeywords.test(qLower) || !procKeywords.test(qLower);
  const includeProcs = procKeywords.test(qLower) || !siteKeywords.test(qLower);
  const includeNews = newsKeywords.test(qLower) || (!siteKeywords.test(qLower) && !procKeywords.test(qLower));
  const includePages = pageKeywords.test(qLower) || (!siteKeywords.test(qLower) && !procKeywords.test(qLower));

  const matchedSiteNames = new Set<string>();
  if (includeSites && sites.length > 0) {
    for (const site of sites) {
      const nameLower = (site.name || "").toLowerCase();
      const idLower = (site.id || "").toLowerCase();
      if (qLower.includes(nameLower) || qLower.includes(idLower)) {
        matchedSiteNames.add(site.name);
        continue;
      }
      const nameWords = nameLower.split(/[\s-]+/).filter((w: string) => w.length > 3);
      for (const word of nameWords) {
        if (qLower.includes(word)) {
          matchedSiteNames.add(site.name);
          break;
        }
      }
    }
  }

  let filtered = navSection + "\n\n";
  for (const section of sections) {
    if (section.startsWith("=== ADMIN NAVIGATION")) continue;

    if (section.startsWith("=== FLYING SITES") && includeSites) {
      if (matchedSiteNames.size > 0) {
        const header = section.split("\n")[0];
        const entries = section.split("\n").slice(1);
        const matchedEntries = entries.filter(line => {
          if (!line.startsWith("- ")) return false;
          for (const name of matchedSiteNames) {
            if (line.includes(`- ${name} `)) return true;
          }
          return false;
        });
        if (matchedEntries.length > 0) {
          filtered += header + "\n" + matchedEntries.join("\n") + "\n\n";
        } else {
          filtered += section + "\n\n";
        }
      } else {
        filtered += section + "\n\n";
      }
      continue;
    }

    if (section.startsWith("=== PROCEDURES") && includeProcs) {
      const procSections = section.split(/\n(?=## )/);
      const procHeader = procSections[0];
      const qWords = qLower.split(/\s+/).filter(w => w.length > 3);
      const matchedProcs = procSections.slice(1).filter(proc => {
        const procLower = proc.toLowerCase();
        return qWords.some(w => procLower.includes(w));
      });
      if (matchedProcs.length > 0 && matchedProcs.length < procSections.length - 1) {
        filtered += procHeader + "\n" + matchedProcs.join("\n") + "\n\n";
      } else {
        filtered += section + "\n\n";
      }
      continue;
    }

    if (section.startsWith("=== CMS PAGES") && includePages) { filtered += section + "\n\n"; continue; }
    if (section.startsWith("=== RECENT NEWS") && includeNews) { filtered += section + "\n\n"; continue; }
    if (section.startsWith("=== REFERENCE")) { filtered += section + "\n\n"; continue; }
    if (section.startsWith("=== SPONSORS")) { filtered += section + "\n\n"; continue; }
    if (section.startsWith("=== SCHEDULED TASKS")) { filtered += section + "\n\n"; continue; }
    if (section.startsWith("=== CONTACTS")) { filtered += section + "\n\n"; continue; }
    if (section.startsWith("=== PROJECTS")) { filtered += section + "\n\n"; continue; }
    if (section.startsWith("=== SOCIAL MEDIA")) { filtered += section + "\n\n"; continue; }
    if (section.startsWith("=== PARAGLIDING SCHOOLS")) { filtered += section + "\n\n"; continue; }
    if (section.startsWith("=== TELEGRAM")) { filtered += section + "\n\n"; continue; }
    if (section.startsWith("=== SITE FEATURES")) { filtered += section + "\n\n"; continue; }
    if (section.startsWith("=== GOOGLE DRIVE")) { filtered += section + "\n\n"; continue; }
    if (section.startsWith("=== ASSET REGISTER")) { filtered += section + "\n\n"; continue; }
    if (section.startsWith("=== CLUB DOCUMENTS")) {
      const shouldIncludeDocs = docKeywords.test(qLower) || (!siteKeywords.test(qLower) && !procKeywords.test(qLower));
      if (!shouldIncludeDocs) continue;

      const docBlocks = section.split(/\n(?=--- )/);
      const docHeader = docBlocks[0];
      const qWords = qLower.split(/\s+/).filter(w => w.length > 2);

      if (qWords.length > 0 && docBlocks.length > 2) {
        const scoredBlocks = docBlocks.slice(1).map(block => {
          const blockLower = block.toLowerCase();
          let score = 0;
          for (const w of qWords) {
            if (blockLower.includes(w)) score++;
          }
          return { block, score };
        });

        const matched = scoredBlocks
          .filter(b => b.score > 0)
          .sort((a, b) => b.score - a.score);

        if (matched.length > 0) {
          const topDocs = matched.slice(0, 8).map(b => b.block);
          filtered += docHeader + "\n" + topDocs.join("\n") + "\n\n";
        } else {
          filtered += section + "\n\n";
        }
      } else {
        filtered += section + "\n\n";
      }
      continue;
    }
  }

  return filtered;
}

const ADMIN_SITES_COLUMNS = "id, name, type, status, pgRating, hgRating, windDir, windSpeed, useLiveWeather, liveStationId, lat, lon, hazardLevel, isSkyHighSite, siteguideUrl, overrideHideClosed, crossLeft, crossRight";

// ─── Admin search ───
router.post("/admin", requireAuth, asyncHandler(async (req, res) => {
  const { query } = req.body;
  if (!query || typeof query !== "string" || query.trim().length < 2) {
    return res.status(400).json({ error: "Please enter a search query" });
  }

  const apiKey = process.env.USER_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Smart search is not configured — API key missing" });
  }

  let context: string;
  let sitesList: any[];
  const contextTtl = await getContextTtl();
  if (adminContextCache && Date.now() - adminContextCache.timestamp < contextTtl) {
    context = adminContextCache.data;
    sitesList = adminContextCache.sites;
  } else {
    const procedures = await db.prepare("SELECT id, title, description, steps FROM procedures ORDER BY sortOrder").all() as ProcedureRow[];
    const sites = await db.prepare(`SELECT ${ADMIN_SITES_COLUMNS} FROM sites ORDER BY name`).all() as any[];
    sitesList = sites;
    const pages = await db.prepare("SELECT slug, title, content FROM pages").all() as any[];
    const news = await db.prepare("SELECT id, title, content, date FROM news ORDER BY date DESC LIMIT 20").all() as any[];

    context = "=== ADMIN NAVIGATION & FEATURES ===\n";
    for (const nav of ADMIN_NAV_INDEX) {
      context += `- ${nav.name} [path: ${nav.path}]: ${nav.description}\n`;
    }

    context += "\n\n=== PROCEDURES MANUAL ===\n";
    for (const proc of procedures) {
      let steps: string[];
      try { const parsed = JSON.parse(proc.steps); steps = Array.isArray(parsed) ? parsed : []; } catch { steps = []; }
      context += `\n## ${proc.title} [path: /admin/procedures#${proc.id}]\n${proc.description}\n`;
      steps.forEach((s: string, i: number) => {
        context += `  ${i + 1}. ${s}\n`;
      });
    }

    context += "\n\n=== FLYING SITES ===\n";
    for (const site of sites) {
      const fields = Object.entries(site)
        .map(([k, v]) => `${k}: ${v ?? "NULL"}`)
        .join(", ");
      context += `- ${site.name} [path: /admin/sites#site-${site.id}] — ${fields}\n`;
    }

    context += "\n\n=== CMS PAGES ===\n";
    for (const page of pages) {
      context += `- ${page.title} [path: /admin/pages/${page.slug}/edit]: ${(page.content || "").substring(0, 200)}\n`;
    }

    context += "\n\n=== RECENT NEWS ===\n";
    for (const item of news) {
      context += `- ${item.title} (${item.date}) [path: /admin/news/${item.id}/edit]: ${(item.content || "").substring(0, 150)}\n`;
    }

    const adminSponsors = await db.prepare("SELECT id, name, url, markdown, sort_order FROM sponsors ORDER BY sort_order ASC, id ASC").all() as any[];
    if (adminSponsors.length > 0) {
      context += "\n\n=== SPONSORS ===\n";
      for (const s of adminSponsors) {
        context += `- ${s.name} [path: /admin/sponsors#spon-${s.id}] — URL: ${s.url || "none"}, Sort: ${s.sort_order}${s.markdown ? `, Desc: ${s.markdown.substring(0, 100)}` : ""}\n`;
      }
    }

    const businessListings = await db.prepare("SELECT id, business_name AS businessName, member_name AS memberName, category FROM business_directory ORDER BY business_name").all() as any[];
    if (businessListings.length > 0) {
      context += "\n\n=== BUSINESS DIRECTORY ===\n";
      for (const b of businessListings) {
        context += `- ${b.businessName} (Member: ${b.memberName || "unknown"}) [path: /admin/business-directory#biz-${b.id}] — Category: ${b.category}\n`;
      }
    }

    const allContacts = await db.prepare("SELECT id, name, surname, organisation, phone, email, notes, isAdmin, isCommittee, isSafetyCommittee, isContractor, isParksVic, isSocialMedia, position, displayCommittee, displaySafety FROM contacts ORDER BY name").all() as any[];
    if (allContacts.length > 0) {
      context += "\n\n=== CONTACTS & COMMITTEE ===\n";
      for (const c of allContacts) {
        const roles: string[] = [];
        if (c.isAdmin) roles.push("Admin");
        if (c.isCommittee) roles.push("Committee");
        if (c.isSafetyCommittee) roles.push("Safety Committee");
        if (c.isContractor) roles.push("Contractor");
        if (c.isParksVic) roles.push("Parks Vic");
        if (c.isSocialMedia) roles.push("Social Media");
        const roleStr = roles.length > 0 ? ` (${roles.join(", ")})` : "";
        const posStr = c.position ? ` — Position: ${c.position}` : "";
        const orgStr = c.organisation ? ` — Org: ${c.organisation}` : "";
        context += `- ${c.name}${c.surname ? " " + c.surname : ""}${roleStr}${posStr}${orgStr}${c.phone ? " — Ph: " + c.phone : ""}${c.email ? " — " + c.email : ""} [path: /admin/contacts#cont-${c.id}]\n`;
      }
    }

    const allProjects = await db.prepare("SELECT id, name, status, relatedSiteId, parksVic FROM projects ORDER BY name").all() as any[];
    if (allProjects.length > 0) {
      context += "\n\n=== PROJECTS ===\n";
      for (const p of allProjects) {
        const pvStr = p.parksVic ? " (Parks Victoria)" : "";
        context += `- ${p.name} [path: /admin/projects#proj-${p.id}] — Status: ${p.status || "Active"}${pvStr}, Site: ${p.relatedSiteId || "none"}\n`;
      }
    }

    const socialSettings = await db.prepare("SELECT key, value FROM settings WHERE key LIKE 'social%' AND value IS NOT NULL AND value != ''").all() as SettingRow[];
    if (socialSettings.length > 0) {
      context += "\n\n=== SOCIAL MEDIA LINKS ===\n";
      for (const s of socialSettings) {
        const platform = s.key.replace("social", "");
        context += `- ${platform}: ${s.value}\n`;
      }
    }

    const homeSchools = await db.prepare("SELECT value FROM settings WHERE key = 'homeSchools'").get() as SettingRow | undefined;
    const homeTelegram = await db.prepare("SELECT value FROM settings WHERE key = 'homeTelegramGroups'").get() as SettingRow | undefined;
    let widgetCtx = "";
    if (homeSchools?.value) {
      try {
        const schools = JSON.parse(homeSchools.value);
        if (Array.isArray(schools) && schools.length > 0) {
          widgetCtx += "\n\n=== PARAGLIDING SCHOOLS ===\n";
          for (const s of schools) widgetCtx += `- ${s.name}: ${s.url}\n`;
        }
      } catch {}
    }
    if (homeTelegram?.value) {
      try {
        const groups = JSON.parse(homeTelegram.value);
        if (Array.isArray(groups) && groups.length > 0) {
          widgetCtx += widgetCtx ? "\n" : "\n\n";
          widgetCtx += "=== TELEGRAM GROUPS ===\n";
          for (const g of groups) widgetCtx += `- ${g.name}: ${g.url}\n`;
        }
      } catch {}
    }
    if (widgetCtx) context += widgetCtx;

    const featureKeys = ["enableCheckins", "enableFeaturedSite", "enablePhotoCarousel", "enableVideoCarousel", "qrCodesMode", "clubName", "clubTagline", "template", "primaryColor"];
    const featureSettings = await db.prepare(`SELECT key, value FROM settings WHERE key IN (${featureKeys.map(() => "?").join(",")})`).all(...featureKeys) as SettingRow[];
    if (featureSettings.length > 0) {
      context += "\n\n=== SITE FEATURES & CONFIGURATION ===\n";
      for (const f of featureSettings) {
        context += `- ${f.key}: ${f.value}\n`;
      }
    }

    const schedKeys = ["schedSiteguideHour", "schedSiteguideMinute", "schedExtendedForecastHour", "schedExtendedForecastMinute", "submissionNotifyHour", "submissionNotifyEnabled", "weatherScraperMinInterval", "weatherScraperMaxInterval", "weatherScraperStartHour", "weatherScraperEndHour", "schedDriveSyncHour", "schedDriveSyncMinute", "driveSyncEnabled", "driveSyncLastRun", "weatherScraperLastRun"];
    const schedSettings = await db.prepare(`SELECT key, value FROM settings WHERE key IN (${schedKeys.map(() => "?").join(",")})`).all(...schedKeys) as SettingRow[];
    if (schedSettings.length > 0) {
      context += "\n\n=== SCHEDULED TASKS ===\n";
      context += "Configurable at [path: /admin/scheduled-tasks]\n";
      for (const s of schedSettings) context += `- ${s.key}: ${s.value}\n`;
    }

    const driveStatus = await db.prepare("SELECT value FROM settings WHERE key = 'drive_appscript_url'").get() as SettingRow | undefined;
    const docCount = await db.prepare("SELECT COUNT(*) as c FROM document_index WHERE readable = 1 AND charCount > 0").get() as { c: number };
    context += `\n\n=== GOOGLE DRIVE STATUS ===\n`;
    context += `Connected: ${driveStatus?.value ? "Yes" : "No"}\n`;
    context += `Indexed documents: ${docCount.c}\n`;
    if (driveStatus?.value && docCount.c === 0) {
      context += `NOTE: Google Drive is connected but no documents have been indexed yet. The admin should go to API Settings [path: /admin/connections] and click 'Sync Documents' to index Drive content for search.\n`;
    }

    const assetData = await getCachedAssetData();
    if (assetData) context += assetData;

    const driveDocsCtx = await getIndexedDocumentsContext();
    if (driveDocsCtx) context += driveDocsCtx;

    adminContextCache = { data: context, sites: sitesList, timestamp: Date.now() };
  }

  const filteredContext = filterAdminContext(context, query, sitesList);
  console.log(`>>> Admin search context: ${(context.length / 1024).toFixed(0)}KB full → ${(filteredContext.length / 1024).toFixed(0)}KB filtered (${Math.round((1 - filteredContext.length / context.length) * 100)}% reduction)`);

  const customPromptRow = await db.prepare("SELECT value FROM settings WHERE key = 'adminSearchPrompt'").get() as SettingRow | undefined;
  const searchPrompt = customPromptRow?.value || await getDefaultAdminSearchPrompt();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const ai = new GoogleGenAI({ apiKey });
  const models = await getTextModels();
  const promptText = `${searchPrompt}\n\n--- ADMIN DATA ---\n${filteredContext}\n\n--- ADMIN QUERY ---\n${query}`;

  let clientDisconnected = false;
  req.on("close", () => { clientDisconnected = true; });

  let streamed = false;

  for (const model of models) {
    if (clientDisconnected) break;
    try {
      console.log(`>>> Admin search trying model: ${model}`);
      const stream = await ai.models.generateContentStream({
        model,
        contents: [{ role: "user", parts: [{ text: promptText }] }],
        config: {
          thinkingConfig: { thinkingBudget: 0 }
        }
      });

      let fullText = "";
      let summaryStreamed = false;
      let extractedSummaryLen = 0;
      for await (const chunk of stream) {
        if (clientDisconnected) break;
        const text = chunk.text || "";
        if (text) {
          fullText += text;
          if (!summaryStreamed) {
            const resultsIdx = fullText.indexOf('"results"');
            const searchIn = resultsIdx > -1 ? fullText.substring(0, resultsIdx) : fullText;
            const sumMatch = searchIn.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/);
            if (sumMatch) {
              const currentSummary = sumMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
              if (currentSummary.length > extractedSummaryLen) {
                const newPart = currentSummary.substring(extractedSummaryLen);
                extractedSummaryLen = currentSummary.length;
                res.write(`data: ${JSON.stringify({ token: newPart })}\n\n`);
              }
              if (resultsIdx > -1) {
                summaryStreamed = true;
              }
            }
          }
        }
      }

      if (clientDisconnected) break;

      let parsed;
      try {
        parsed = JSON.parse(fullText);
      } catch {
        const jsonMatch = fullText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try { parsed = JSON.parse(jsonMatch[0]); } catch { parsed = null; }
        }
      }

      if (parsed) {
        res.write(`data: ${JSON.stringify({ results: parsed })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({ results: { summary: fullText || "Search completed but could not parse structured results.", results: [] } })}\n\n`);
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      streamed = true;
      console.log(`>>> Admin search ${model} streamed ${fullText.length} chars`);
      break;
    } catch (e: any) {
      console.log(`>>> Admin search ${model} failed: ${e.message}`);
      if (streamed) break;
    }
  }

  if (!streamed && !clientDisconnected) {
    res.write(`data: ${JSON.stringify({ error: "Search is temporarily unavailable. Please try again in a moment." })}\n\n`);
  }

  res.end();
}));

router.get("/admin/default-prompt", async (_req, res) => {
  res.json({ prompt: await getDefaultAdminSearchPrompt() });
});

// ─── Public assistant (STREAMING) ───
router.post("/public", asyncHandler(async (req, res) => {
  const { query, history } = req.body;
  if (!query || typeof query !== "string" || query.trim().length < 2) {
    return res.status(400).json({ error: "Please enter a question" });
  }

  const apiKey = process.env.USER_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Smart assistant is not configured" });
  }

  const { data: sitesContext, sites, closureMap } = await buildPublicContext();

  const allOfficers = await db.prepare("SELECT name, 'Safety Committee' as type, phone, email FROM contacts WHERE isSafetyCommittee = 1 AND displaySafety = 1 ORDER BY name ASC").all() as OfficerRow[];
  const officers = await filterByCurrentMembers(allOfficers);

  const committeeRedirectRow = await db.prepare("SELECT value FROM settings WHERE key = 'publicSearchCommitteeLink'").get() as SettingRow | undefined;
  const committeeLink = committeeRedirectRow?.value || "/page/committee";

  const filteredSitesContext = filterContextByAdvisoryExclusions(
    filterContextByClosureDates(
      filterContextByPilotType(
        filterContextBySites(sitesContext, sites, query),
        query,
        sites
      ),
      closureMap,
      sites,
      query
    ),
    query
  );

  let officersContext = "\n\n=== COMMITTEE & SAFETY OFFICERS ===\n";
  for (const o of officers) {
    officersContext += `${o.name} (${o.type})${o.phone ? ` — ${o.phone}` : ""}${o.email ? ` — ${o.email}` : ""}\n`;
  }

  const conversationHistory = Array.isArray(history) ? history.slice(-6) : [];
  let historyText = "";
  if (conversationHistory.length > 0) {
    historyText = "\n\n--- CONVERSATION HISTORY ---\n";
    for (const msg of conversationHistory) {
      historyText += `${msg.role === "user" ? "Pilot" : "Assistant"}: ${msg.text}\n`;
    }
  }

  const customPromptRow = await db.prepare("SELECT value FROM settings WHERE key = 'publicSearchPrompt'").get() as SettingRow | undefined;
  const behaviorPrompt = customPromptRow?.value || await getDefaultPublicPrompt();
  const eligibilityRow = await db.prepare("SELECT value FROM settings WHERE key = 'publicSearchEligibilityRules'").get() as SettingRow | undefined;
  const eligibilityRules = eligibilityRow?.value || getDefaultEligibilityRules();

  const ANTI_HALLUCINATION_BLOCK = `
ANTI-HALLUCINATION — CRITICAL (NON-NEGOTIABLE):
- You MUST ONLY state facts that are explicitly present in the provided site data below. If a field says "NOT SPECIFIED IN DATABASE", you MUST say the information is not recorded in the system — do NOT guess, infer, or make up a value.
- For ratings: If a site shows "PG Rating: NOT SPECIFIED IN DATABASE" or "HG Rating: NOT SPECIFIED IN DATABASE", say "the PG/HG rating for this site is not currently recorded in our system" — NEVER invent a rating.
- IMPORTANT: Many sites have MULTIPLE rating tiers separated by "|" — for example "PG4 | PG2 Supervised requires PG4". This means the base rating is PG4, but PG2 pilots can also fly under PG4 supervision. Present ALL tiers to the pilot so they get the full picture.
- For any other missing field: state that the information is not available rather than guessing.
- When a site has no rating specified, do NOT say the pilot cannot fly there — instead, tell them the rating is not recorded and suggest they check the site page or contact a safety officer for clarification.
- This is a SAFETY-CRITICAL rule: giving a pilot wrong rating information could send them to a site that is dangerous for their level.`;

  const systemPrompt = `${behaviorPrompt}

${eligibilityRules}

${ANTI_HALLUCINATION_BLOCK}

LINK FORMAT — CRITICAL:
- Site links MUST use this exact markdown format: [Site Name](/sites/site-id) — for example [Mystic](/sites/mystic) or [Flinders Golf Club](/sites/flinders-golf-club)
- Use the exact path from the [page: /sites/xxx] shown next to each site name in the data
- NEVER wrap links in bold markers. Write [Site Name](/sites/id) NOT **[Site Name](/sites/id)** and NOT [**Site Name**](/sites/id)
- Committee page link: [committee page](${committeeLink})
- External document links: [Document Name](https://url)
- NEVER output raw URLs or (page: ...) syntax — ALWAYS wrap in [text](url) markdown format
- NEVER use square brackets around a URL without the [text](url) pattern

COMMITTEE CONTACT PAGE: ${committeeLink}

DOCUMENT CITATIONS:
- When your answer is based on information from CLUB DOCUMENTS (Google Drive), always cite the document name. For example: "According to the *Club Operations Manual*..." or "Source: Safety Procedures v3.2".
- This helps pilots verify the information and find the original document if needed.

RESPONSE FORMAT:
Reply in plain text with markdown formatting ([text](url) for links, **bold** for emphasis).
Include a conversational answer to the pilot's question.
If you need more info (like their rating), ask for it at the end.
Do NOT wrap your response in JSON or code blocks.`;

  const sponsors = await db.prepare("SELECT name, url, markdown FROM sponsors ORDER BY sort_order ASC, id ASC").all() as any[];
  let sponsorsContext = "";
  if (sponsors.length > 0) {
    sponsorsContext = "\n\n=== CLUB SPONSORS ===\n";
    sponsorsContext += "The club's sponsors are listed on the dedicated sponsors page at /sponsors.\n";
    for (const s of sponsors) {
      sponsorsContext += `- ${s.name}${s.url ? ` (${s.url})` : ""}${s.markdown ? `: ${s.markdown.substring(0, 150)}` : ""}\n`;
    }
  }

  const driveDocsContext = await getPublicDocumentsContext();
  const fullContext = filteredSitesContext + officersContext + sponsorsContext + driveDocsContext;

  const ai = new GoogleGenAI({ apiKey });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const models = await getTextModels();

  const nowMelb = new Date().toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Australia/Melbourne' });
  const tomorrowMelb = new Date(Date.now() + 86400000).toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Australia/Melbourne' });
  const dateContext = `CURRENT DATE (Melbourne time): ${nowMelb}\nTomorrow is: ${tomorrowMelb}\n\n`;
  const promptText = `${systemPrompt}\n\n--- CLUB DATA ---\n${dateContext}${fullContext}${historyText}\n\n--- PILOT'S QUESTION ---\n${query}`;

  let clientDisconnected = false;
  req.on("close", () => { clientDisconnected = true; });

  let streamed = false;
  let loggedResponse = "";

  for (const model of models) {
    if (clientDisconnected) break;
    try {
      console.log(`>>> Public assistant trying model: ${model}`);
      const stream = await ai.models.generateContentStream({
        model,
        contents: [{ role: "user", parts: [{ text: promptText }] }],
        config: {
          thinkingConfig: { thinkingBudget: 0 }
        }
      });

      let fullText = "";
      let tokensSent = false;
      for await (const chunk of stream) {
        if (clientDisconnected) break;
        const text = chunk.text || "";
        if (text) {
          fullText += text;
          tokensSent = true;
          res.write(`data: ${JSON.stringify({ token: text })}\n\n`);
        }
      }

      if (clientDisconnected) break;

      let cleanedText = fullText;
      cleanedText = cleanedText.replace(/\(page:\s*([^\s\])]+)\]/g, '($1)');
      cleanedText = cleanedText.replace(/\[page:\s*([^\]]+)\]/g, (_, path: string) => `[View Site](${path.trim()})`);
      cleanedText = cleanedText.replace(/\(page:\s*([^\s)]+)\)/g, '($1)');
      cleanedText = cleanedText.replace(/\*\*\[([^\]]+)\]\(([^)]+)\)\*\*/g, '[$1]($2)');
      cleanedText = cleanedText.replace(/\[\*\*([^\]]*?)\*\*\]\(([^)]+)\)/g, '[$1]($2)');
      cleanedText = cleanedText.replace(/\*\*\[([^\]]+)\]\*\*\(([^)]+)\)/g, '[$1]($2)');

      if (cleanedText !== fullText) {
        res.write(`data: ${JSON.stringify({ replace: cleanedText })}\n\n`);
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      streamed = true;
      loggedResponse = cleanedText;
      console.log(`>>> Public assistant ${model} streamed ${fullText.length} chars`);
      break;
    } catch (e: any) {
      console.log(`>>> Public assistant ${model} failed: ${e.message}`);
      if (streamed) break;
    }
  }

  if (!streamed && !clientDisconnected) {
    res.write(`data: ${JSON.stringify({ error: "I'm having trouble connecting right now. Please try again in a moment." })}\n\n`);
  }

  res.end();

  if (streamed && loggedResponse) {
    logPublicSearch(query, loggedResponse).catch(() => {});
  }
}));

export async function seedPublicPrompt(): Promise<void> {
  // ── Behavior prompt ──
  const promptRow = await db.prepare("SELECT value FROM settings WHERE key = 'publicSearchPrompt'").get() as { value: string } | undefined;
  const prompt = await getDefaultPublicPrompt();
  if (promptRow === undefined) {
    await db.prepare("INSERT INTO settings (key, value) VALUES ('publicSearchPrompt', ?)").run(prompt);
    console.log("[search] Seeded publicSearchPrompt into settings (first-run)");
  } else if (!promptRow.value) {
    await db.prepare("UPDATE settings SET value = ? WHERE key = 'publicSearchPrompt'").run(prompt);
    console.log("[search] Populated empty publicSearchPrompt in settings");
  } else if (promptRow.value.includes("HARD EXCLUSION RULES") || promptRow.value.includes("SITE ELIGIBILITY — apply these rules") || !promptRow.value.includes("FUTURE DATE WITH NO FORECAST") || !promptRow.value.includes("do NOT substitute numbers from another day")) {
    // Old embedded eligibility rules or missing NOT FLYABLE / future-date instructions — upgrade
    await db.prepare("UPDATE settings SET value = ? WHERE key = 'publicSearchPrompt'").run(prompt);
    console.log("[search] Upgraded publicSearchPrompt: unflyable days now included with [NOT FLYABLE] label");
  }

  // ── Eligibility rules (separate setting) ──
  const eligibilityRow = await db.prepare("SELECT value FROM settings WHERE key = 'publicSearchEligibilityRules'").get() as { value: string } | undefined;
  const rules = getDefaultEligibilityRules();
  if (eligibilityRow === undefined) {
    await db.prepare("INSERT INTO settings (key, value) VALUES ('publicSearchEligibilityRules', ?)").run(rules);
    console.log("[search] Seeded publicSearchEligibilityRules into settings (first-run)");
  } else if (!eligibilityRow.value) {
    await db.prepare("UPDATE settings SET value = ? WHERE key = 'publicSearchEligibilityRules'").run(rules);
    console.log("[search] Populated empty publicSearchEligibilityRules in settings");
  } else if (!eligibilityRow.value.includes("STEP 1 — SITE-SPECIFIC RATING CHECK") || !eligibilityRow.value.includes("STEP 2 — GENERAL SUPERVISION MATRIX") || !eligibilityRow.value.includes("PG3 AND ABOVE — DO NOT GENERALISE") || !eligibilityRow.value.includes("cannot use this supervised slot") || !eligibilityRow.value.includes("WEATHER PRE-FILTERING") || !eligibilityRow.value.includes("HG ONLY [ABSOLUTE]") || !eligibilityRow.value.includes("ECHO THE PILOT'S EXACT RATING") || !eligibilityRow.value.includes("FORBIDDEN OPENING")) {
    // Missing one or more required rule sections — upgrade to current default
    await db.prepare("UPDATE settings SET value = ? WHERE key = 'publicSearchEligibilityRules'").run(rules);
    console.log("[search] Upgraded publicSearchEligibilityRules: added ECHO RATING, ANSWER STRUCTURE, and FORBIDDEN OPENING rules");
  }
  // Otherwise: admin has customized the rules — leave them alone
}

export default router;
