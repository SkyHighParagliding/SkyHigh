/**
 * Registry of all grid providers, sorted by tier (lowest = most preferred).
 *
 * Tier ordering:
 *   1 — Open-Meteo REST API (ECMWF IFS HRES, 9 km, all variables)
 *   2 — Open-Meteo S3 archive (ECMWF IFS HRES, 9 km, no prob/weather_code)
 *   3 — Open-Meteo S3 archive (NCEP GFS ~0.117°, fewer variables)
 *   4 — NOAA NOMADS GFS 0.25° (last resort, no prob/weather_code/visibility)
 *
 * Tiers 1–2 share the "ecmwf" family and may be mixed point-for-point with no
 * visible seam. Tiers 3–4 share the "gfs" family; mixing ECMWF and GFS
 * families produces a seam in the rendered field and is done only as a
 * last resort by the orchestrator.
 */

import type { GridProvider } from "./provider.js";
import { openMeteoApiProvider } from "./openMeteoApi.js";
import { openMeteoS3EcmwfProvider, openMeteoS3GfsProvider } from "./openMeteoS3.js";
import { nomadsGfsProvider } from "./nomadsGfs.js";

export const PROVIDERS: readonly GridProvider[] = [
  openMeteoApiProvider,
  openMeteoS3EcmwfProvider,
  openMeteoS3GfsProvider,
  nomadsGfsProvider,
] as const;
