import * as cheerio from 'cheerio';
import crypto from "crypto";
import { query, queryOne, execute } from "../../pg.js";
import { PUBLIC_SITES_CACHE_TTL } from "../../constants.js";

interface SitesCacheEntry {
  response: Record<string, any> | null;
  updatedAt: number;
}

let publicSitesCache: SitesCacheEntry = { response: null, updatedAt: 0 };

export function invalidateSitesCache() {
  publicSitesCache = { response: null, updatedAt: 0 };
}

export function getPublicSitesCache(): Record<string, any> | null {
  return publicSitesCache.response;
}

export function setPublicSitesCache(response: Record<string, any>) {
  publicSitesCache = { response, updatedAt: Date.now() };
}

export function isCacheValid() {
  return publicSitesCache.response && (Date.now() - publicSitesCache.updatedAt) < PUBLIC_SITES_CACHE_TTL;
}

const COMPASS_DIRS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];

export const STATE_ABBREVIATIONS: Record<string, string> = {
  "New South Wales": "NSW",
  "Victoria": "VIC",
  "Queensland": "QLD",
  "South Australia": "SA",
  "Western Australia": "WA",
  "Tasmania": "TAS",
  "Northern Territory": "NT",
  "Australian Capital Territory": "ACT",
};

export function normaliseWindDir(dir: string | null | undefined): string | null {
  if (!dir || !dir.trim()) return dir as string | null;
  let s = dir.trim().toUpperCase();

  // Simple, safe replacements to avoid complex regex that could cause ReDoS
  s = s.replace(/\bTO(?:\s+|$)/gi, '-');
  s = s.replace(/\bOR(?:\s+|$)/gi, ',');
  s = s.replace(/\band(?:\s+|$)/gi, ',');
  s = s.replace(/\blight(?:\s+|$)/gi, '');
  s = s.replace(/\bstrong(?:\s+|$)/gi, '');
  s = s.replace(/\bmoderate(?:\s+|$)/gi, '');

  // Safe handling of ALL EXCEPT/BUT pattern to prevent ReDoS
  const allExceptPattern = /ALL\s+(?:EXCEPT|BUT)\s+([^,]+)/i;
  const exceptMatch = allExceptPattern.exec(s);
  if (exceptMatch) {
    const exclusions = exceptMatch[1].split(/[\s,]+/).map(p => p.trim().toUpperCase()).filter(p => COMPASS_DIRS.includes(p));
    const included = COMPASS_DIRS.filter(d => !exclusions.includes(d.toUpperCase()));
    return included.join(',');
  }

  const segments = s.split(',').map(seg => seg.trim()).filter(Boolean);
  const result: string[] = [];

  for (const seg of segments) {
    if (seg.includes('-')) {
      const parts = seg.split('-').map(p => p.trim()).filter(p => COMPASS_DIRS.includes(p.toUpperCase()));
      if (parts.length === 2) {
        result.push(parts.join('-'));
      } else if (parts.length === 1) {
        result.push(parts[0]);
      }
    } else {
      const tokens = seg.split(/\s+/).filter(p => COMPASS_DIRS.includes(p.toUpperCase()));
      tokens.forEach(t => result.push(t));
    }
  }

  return result.length > 0 ? result.join(',') : dir.trim().toUpperCase();
}

export function normaliseWindSpeed(speed: string | null | undefined): string | null {
  if (!speed || !speed.trim()) return speed as string | null;
  const s = speed.trim();
  const rangeMatch = s.match(/(\d+)\s*[-–—to]+\s*(\d+)/i);
  if (rangeMatch) return `${rangeMatch[1]}-${rangeMatch[2]}`;
  const singleMatch = s.match(/^(\d+)/);
  if (singleMatch) return singleMatch[1];
  return s;
}

export function normalisePgRating(rating: string | null | undefined): string | null {
  if (!rating || !rating.trim()) return rating as string | null;
  const parts = rating.split("|").map(p => p.trim());
  const normalised = parts.map(part => {
    if (/^PG2$/i.test(part)) return "PG2 Supervised";
    if (/^PG2\s+(?:req\b|requires?\b)/i.test(part)) return part.replace(/^PG2/i, "PG2 Supervised");
    return part;
  });
  return normalised.join(" | ");
}

export function computeContentHash(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, noscript, nav, footer, header, .navbar, .footer').remove();
  const text = $('body').text().replace(/\s+/g, ' ').trim();
  return crypto.createHash('sha256').update(text).digest('hex');
}

function extractMetersFromHeight(val: string | null | undefined): number | null {
  if (!val || !val.trim()) return null;
  const trimmed = val.trim();
  const ftMatch = trimmed.match(/(\d+)\s*(?:'|ft|feet)/i);
  const mMatch = trimmed.match(/(\d+)\s*m/i);
  const plainMatch = trimmed.match(/(\d+)/);
  if (ftMatch) return Math.round(parseInt(ftMatch[1]) * 0.3048);
  if (mMatch) return parseInt(mMatch[1]);
  if (plainMatch) return parseInt(plainMatch[1]);
  return null;
}

function formatHeightValue(meters: number): string {
  const ft = Math.round(meters * 3.28084);
  return `${meters}m / ${ft}'`;
}

export async function calculateHeights(rawHeight: string | null, lat: number | null, lon: number | null): Promise<{ amsl: string | null; rh: string | null; groundElev: number | null }> {
  if (!rawHeight || lat == null || lon == null) return { amsl: rawHeight, rh: null, groundElev: null };

  const meters = extractMetersFromHeight(rawHeight);
  if (meters == null) return { amsl: rawHeight, rh: null, groundElev: null };

  try {
    const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`);
    const data = await res.json() as { elevation?: number[] };
    const groundElev = data.elevation?.[0];
    if (groundElev == null) return { amsl: formatHeightValue(meters), rh: null, groundElev: null };
    const ground = Math.round(groundElev);

    const isRh = meters <= ground;
    if (isRh) {
      return { amsl: formatHeightValue(ground + meters), rh: formatHeightValue(meters), groundElev: ground };
    } else {
      const rh = Math.max(0, meters - ground);
      return { amsl: formatHeightValue(meters), rh: formatHeightValue(rh), groundElev: ground };
    }
  } catch {
    return { amsl: formatHeightValue(meters), rh: null, groundElev: null };
  }
}

const fallbackSiteImages = {
  coastal: [''],
  inland: ['']
};

export async function getDefaultSiteImage(siteType: string): Promise<string> {
  const typeStr = (siteType || '').toLowerCase();
  const isInland = typeStr.includes('inland') || typeStr.includes('mountain') || typeStr.includes('ridge') || typeStr.includes('tow');
  const category = isInland ? 'inland' : 'coastal';

  try {
    const row = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'imageLibrary'");
    if (row?.value) {
      const pairs: { wide: string; banner: string; category?: string }[] = JSON.parse(row.value);
      const matched = pairs.filter(p => p.banner && p.category === category);
      if (matched.length > 0) {
        return matched[Math.floor(Math.random() * matched.length)].banner;
      }
      const anyWithBanner = pairs.filter(p => p.banner);
      if (anyWithBanner.length > 0) {
        return anyWithBanner[Math.floor(Math.random() * anyWithBanner.length)].banner;
      }
    }
  } catch {}

  const pool = fallbackSiteImages[category];
  return pool[Math.floor(Math.random() * pool.length)];
}

const MAX_ARCHIVES = 10;

export async function archiveSitesBeforeImport(siteguideVersion: string): Promise<boolean> {
  const existing = await queryOne('SELECT id FROM site_archives WHERE "siteguideVersion" = $1', [siteguideVersion]);
  if (existing) return false;

  const allSites = await query("SELECT * FROM sites");
  const siteData = JSON.stringify(allSites);
  await execute(
    'INSERT INTO site_archives ("siteguideVersion", "archivedAt", "siteCount", "siteData") VALUES ($1, $2, $3, $4)',
    [siteguideVersion, new Date().toISOString(), allSites.length, siteData]
  );

  const countRow = await queryOne<{ cnt: string }>("SELECT COUNT(*) as cnt FROM site_archives");
  const archiveCount = parseInt(countRow!.cnt, 10);
  if (archiveCount > MAX_ARCHIVES) {
    await execute(
      'DELETE FROM site_archives WHERE id IN (SELECT id FROM site_archives ORDER BY "archivedAt" ASC LIMIT $1)',
      [archiveCount - MAX_ARCHIVES]
    );
  }

  return true;
}

export const SITES_COLUMNS = [
  "id", "name", "type", "windDir", "windSpeed", "status", "hazardLevel",
  "lat", "lon", "description", "launch", "landing", "hazards", "rules", "image",
  "useLiveWeather", "liveStationId", "siteguideUrl", "siteContact", "siteContactPhone",
  "navigateTo", "launchHeight", "launchHeight2", "landingHeight2", "hoodedPloversLink", "hoodedPloversActive",
  "emergencyMarker", "what3words", "weatherStationLink", "crossLeft", "crossRight",
  "isSkyHighSite", "pgRating", "hgRating", "overrideHideClosed",
  "essentialInfoImages", "essentialInfoText", "launchHeightHigh", "weatherGaugeUrl",
  "liveStationIdAlt", "siteguideVersion", "siteguideScrapedAt", "unassignedText",
  "temporarilyClosed", "preClosureOverrideHideClosed", "isTidal", "tideStationId",
  "contentHash", "skipBulkImport", "isXCSite", "closurePillsMax",
  "heroImages", "displayOnMap", "displayInList",
] as const;

export const SITES_UPDATE_COLS = SITES_COLUMNS.filter(c => c !== "id");

export function pickSiteColumns(row: Record<string, any>): Record<string, any> {
  const picked: Record<string, any> = {};
  for (const col of SITES_COLUMNS) {
    picked[col] = row[col] ?? null;
  }
  return picked;
}

export function haversineDistanceServer(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
