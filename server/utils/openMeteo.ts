/**
 * Open-Meteo API parameter builder.
 * Centralises the repeated URLSearchParams construction used by
 * extendedForecast.ts and victoriaGrid.ts.
 */

interface OpenMeteoParams {
  lats: number[];
  lons: number[];
  hourlyFields: string;
  forecastDays: number;
  apiKey?: string;
}

/**
 * Builds a URLSearchParams object for an Open-Meteo forecast request.
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
    models: 'ecmwf_ifs025',
    wind_speed_unit: 'kn',
    timezone: 'Australia/Melbourne',
    forecast_days: String(forecastDays),
  });
  if (apiKey) params.set('apikey', apiKey);
  return params;
}
