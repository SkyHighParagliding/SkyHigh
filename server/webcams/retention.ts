export const DEFAULT_RETENTION_DAYS = 90;
export const MIN_RETENTION_DAYS = 7;

export function clampRetention(value: unknown): number {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return DEFAULT_RETENTION_DAYS;
  return Math.max(MIN_RETENTION_DAYS, Math.floor(n));
}

export function retentionCutoff(now: Date, retentionDays: number): Date {
  return new Date(now.getTime() - clampRetention(retentionDays) * 24 * 60 * 60 * 1000);
}
