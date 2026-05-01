const STORAGE_KEY = 'skyhigh_recent_sites';
const MAX_SITES = 6;

interface SiteVisit {
  id: string;
  count: number;
  lastVisit: number;
}

function getStoredVisits(): SiteVisit[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      if (parsed.length > 0 && typeof parsed[0] === 'string') {
        return parsed.map((id: string, i: number) => ({
          id,
          count: 1,
          lastVisit: Date.now() - i,
        }));
      }
      return parsed.filter((v: any) => v && v.id);
    }
    return [];
  } catch {
    return [];
  }
}

function saveVisits(visits: SiteVisit[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(visits));
  } catch {}
}

export function getRecentSites(): string[] {
  const visits = getStoredVisits();
  if (visits.length === 0) return [];
  const sorted = [...visits].sort((a, b) => b.count - a.count || b.lastVisit - a.lastVisit);
  return sorted.slice(0, MAX_SITES).map(v => v.id);
}

export function recordSiteView(siteId: string): void {
  const visits = getStoredVisits();
  const existing = visits.find(v => v.id === siteId);
  if (existing) {
    existing.count += 1;
    existing.lastVisit = Date.now();
  } else {
    visits.push({ id: siteId, count: 1, lastVisit: Date.now() });
  }
  saveVisits(visits);
}

export function seedSitesIfEmpty(siteIds: string[]): void {
  const visits = getStoredVisits();
  if (visits.length > 0) return;
  const now = Date.now();
  const seeded: SiteVisit[] = siteIds.slice(0, MAX_SITES).map((id, i) => ({
    id,
    count: 0,
    lastVisit: now - i,
  }));
  saveVisits(seeded);
}
