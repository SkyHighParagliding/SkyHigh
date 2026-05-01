const CACHE_KEY = "cachedUserLocation";
const CONSENT_KEY = "locationConsent";
const MAX_AGE_MS = 30 * 60 * 1000;

interface CachedLocation {
  lat: number;
  lon: number;
  timestamp: number;
}

function getCached(): CachedLocation | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data: CachedLocation = JSON.parse(raw);
    if (Date.now() - data.timestamp > MAX_AGE_MS) return null;
    return data;
  } catch {
    return null;
  }
}

function setCache(lat: number, lon: number) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ lat, lon, timestamp: Date.now() }));
  } catch {}
}

export function getLocationConsent(): "granted" | "declined" | null {
  try {
    const val = localStorage.getItem(CONSENT_KEY);
    if (val === "granted" || val === "declined") return val;
    return null;
  } catch {
    return null;
  }
}

export function setLocationConsent(value: "granted" | "declined") {
  try {
    localStorage.setItem(CONSENT_KEY, value);
  } catch {}
}

export function requestBrowserLocation(
  onSuccess: (lat: number, lon: number) => void,
  onError: () => void,
  options?: { timeout?: number }
) {
  if (!navigator.geolocation) {
    onError();
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      setCache(pos.coords.latitude, pos.coords.longitude);
      onSuccess(pos.coords.latitude, pos.coords.longitude);
    },
    () => onError(),
    { timeout: options?.timeout ?? 5000, maximumAge: MAX_AGE_MS }
  );
}

export function getCachedLocation(
  onSuccess: (lat: number, lon: number) => void,
  onError: () => void,
  options?: { timeout?: number; maxAge?: number }
) {
  const cached = getCached();
  if (cached) {
    onSuccess(cached.lat, cached.lon);
    return;
  }

  const consent = getLocationConsent();
  if (consent === "declined") {
    onError();
    return;
  }

  if (consent !== "granted") {
    onError();
    return;
  }

  requestBrowserLocation(onSuccess, onError, options);
}
