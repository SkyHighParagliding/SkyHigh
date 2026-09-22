/**
 * Registry of all grid providers, sorted by tier (lowest = most preferred).
 *
 * Tier ordering (reordered 2026-09-22 after the Open-Meteo quota incident):
 *   1 — Open-Meteo S3 archive (ECMWF IFS HRES, 9 km, no prob/weather_code) — primary, unlimited
 *   2 — Open-Meteo REST API (ECMWF IFS HRES, 9 km, all variables) — fallback + field top-up
 *   3 — Open-Meteo S3 archive (NCEP GFS ~0.117°, fewer variables)
 *   4 — NOAA NOMADS GFS 0.25° (last resort, no prob/weather_code/visibility)
 *
 * The S3 mirror is primary so the daily bulk fetch runs off unlimited anonymous
 * S3 reads rather than the rate-limited REST API. The mirror lacks
 * weather_code + precipitation_probability; the fine grid restores those via a
 * targeted API top-up (see pipeline.ts applyFieldTopUp). The API also remains a
 * same-family fallback for any points the mirror can't fill.
 *
 * Tiers 1–2 share the "ecmwf" family and may be mixed point-for-point with no
 * visible seam. Tiers 3–4 share the "gfs" family; mixing ECMWF and GFS
 * families produces a seam in the rendered field and is done only as a
 * last resort by the orchestrator. (Execution order is by each provider's
 * `tier`, not array order — see orchestrator.ts.)
 */

import type { GridProvider } from "./provider.js";
import { openMeteoApiProvider } from "./openMeteoApi.js";
import { openMeteoS3EcmwfProvider, openMeteoS3GfsProvider } from "./openMeteoS3.js";
import { nomadsGfsProvider } from "./nomadsGfs.js";

export const PROVIDERS: readonly GridProvider[] = [
  openMeteoS3EcmwfProvider,
  openMeteoApiProvider,
  openMeteoS3GfsProvider,
  nomadsGfsProvider,
] as const;
