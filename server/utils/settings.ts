import { queryOne } from "../pg.js";

/**
 * Reads a numeric setting from the settings table.
 * Returns fallback if the key is missing or the value is not a valid number.
 */
export async function getSettingNum(key: string, fallback: number): Promise<number> {
  const row = await queryOne<{ value: string }>(
    "SELECT value FROM settings WHERE key = $1",
    [key]
  );
  if (!row?.value) return fallback;
  const n = Number(row.value);
  return isNaN(n) ? fallback : n;
}
