import { query, queryOne } from "../pg.js";

export interface WebcamSource {
  id: number;
  siteId: string;
  label: string;
  provider: string;
  baseUrl: string;
  timezone: string;
  /** Per camera: true when that camera's clock stays on standard time all year. */
  clockNoDst: Record<string, boolean>;
  enabled: boolean;
  pollStartHour: number;
  pollEndHour: number;
  expectFromMin: number;
  expectToMin: number;
  backfilledAt: Date | null;
  lastRunAt: Date | null;
  lastSuccessAt: Date | null;
  lastError: string | null;
}

const COLUMNS = `id, "siteId", label, provider, "baseUrl", timezone, "clockNoDst", enabled, "pollStartHour", "pollEndHour",
  "expectFromMin", "expectToMin", "backfilledAt", "lastRunAt", "lastSuccessAt", "lastError"`;

export async function listSources(): Promise<WebcamSource[]> {
  return query<WebcamSource>(`SELECT ${COLUMNS} FROM webcam_sources ORDER BY id`);
}

export async function getSource(id: number): Promise<WebcamSource | undefined> {
  return queryOne<WebcamSource>(`SELECT ${COLUMNS} FROM webcam_sources WHERE id = $1`, [id]);
}

export async function getSourceBySite(siteId: string): Promise<WebcamSource | undefined> {
  return queryOne<WebcamSource>(`SELECT ${COLUMNS} FROM webcam_sources WHERE "siteId" = $1`, [siteId]);
}
