/**
 * Open-Meteo API shared constants and parameter builder.
 * Consumed by the grid providers and extendedForecast.ts.
 */

export const OPEN_METEO_API_KEY = process.env.OPEN_METEO_API_KEY ?? "";
export const OPEN_METEO_URL = OPEN_METEO_API_KEY
  ? "https://customer-api.open-meteo.com/v1/forecast"
  : "https://api.open-meteo.com/v1/forecast";

interface OpenMeteoParams {
  lats: number[];
  lons: number[];
  hourlyFields: string;
  forecastDays: number;
  apiKey?: string;
}

/**
 * Builds a URLSearchParams object for an Open-Meteo forecast GET request.
 * Shared constants (models, wind_speed_unit, timezone) are applied automatically.
 * Pass `apiKey` when the customer API URL is in use — the builder appends
 * the `apikey` param only when the value is non-empty.
 */
export function buildOpenMeteoParams({
  lats,
  lons,
  hourlyFields,
  forecastDays,
  apiKey,
}: OpenMeteoParams): URLSearchParams {
  const params = new URLSearchParams({
    latitude: lats.join(','),
    longitude: lons.join(','),
    hourly: hourlyFields,
    models: 'ecmwf_ifs',
    wind_speed_unit: 'kn',
    timezone: 'Australia/Melbourne',
    forecast_days: String(forecastDays),
  });
  if (apiKey) params.set('apikey', apiKey);
  return params;
}

/**
 * Builds a JSON body for an Open-Meteo forecast POST request.
 * Use this instead of buildOpenMeteoParams when sending large batches
 * (>~90 points) to avoid URL-length limits.
 *
 * `models` and `timezone` MUST be arrays here, unlike the GET form where they
 * are plain strings. The POST decoder rejects a bare string with
 * `Expected Array<Any> at 'timezone'` and returns 400 — which, because the
 * fetch helper used to discard response bodies, surfaced only as an opaque
 * retry storm rather than a legible error. `wind_speed_unit` stays a string;
 * the decoder accepts that one either way.
 */
export function buildOpenMeteoBody({
  lats,
  lons,
  hourlyFields,
  forecastDays,
  apiKey,
}: OpenMeteoParams): Record<string, unknown> {
  const body: Record<string, unknown> = {
    latitude: lats,
    longitude: lons,
    hourly: hourlyFields.split(','),
    models: ['ecmwf_ifs'],
    wind_speed_unit: 'kn',
    timezone: ['Australia/Melbourne'],
    forecast_days: forecastDays,
  };
  if (apiKey) body.apikey = apiKey;
  return body;
}
