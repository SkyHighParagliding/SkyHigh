/**
 * Grid fallback alerting.
 *
 * The provider chain is designed to degrade quietly, which is exactly why it
 * needs a voice: a grid served entirely from tier 4 looks fine on the map but is
 * 28 km GFS data standing in for 9 km ECMWF, and nothing else would say so.
 *
 * Two levels, deliberately different in loudness:
 *   - Every run writes a health record to settings, so the admin panel always
 *     shows the current state. A later healthy run clears it on its own; the
 *     record is a live reading, not a log.
 *   - Only "critical" (NOAA NOMADS supplied points — every Open-Meteo route
 *     failed) sends email, at most once per Melbourne day per grid. The thermal
 *     retry chain can run five times in a morning and must not send five emails.
 *
 * The email is the durable record. The settings flag is not, by design: if a
 * 5am run falls to NOMADS and the 5:30 retry succeeds, the panel should show
 * healthy and the evidence should live in your inbox.
 */

import createLogger from "./logger.js";
import { execute, query, queryOne } from "../pg.js";
import { sendEmail } from "./email.js";
import { classifyGridHealth, type GridHealth } from "../grid/health.js";
import type { Provenance } from "../grid/types.js";

const log = createLogger("grid:alerts");

/**
 * Alert recipients beyond the current admins, as a comma-separated settings
 * value. Exists so the person who maintains the weather pipeline keeps getting
 * these after they stop being an admin — the roles are not the same job.
 */
const EXTRA_RECIPIENTS_KEY = "gridAlertRecipients";
const DEFAULT_EXTRA_RECIPIENTS = "jonpamment@gmail.com";

export interface GridHealthRecord extends GridHealth {
  /** ISO timestamp of the run this record describes. */
  at: string;
}

function melbourneToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" });
}

async function setSetting(key: string, value: string): Promise<void> {
  await execute(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [key, value],
  );
}

async function getSetting(key: string): Promise<string | null> {
  const row = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = $1", [key]);
  return row?.value ?? null;
}

/** Current admins with a usable address, plus the configured extra recipients. */
async function resolveRecipients(): Promise<string[]> {
  const admins = await query<{ email: string }>(
    `SELECT email FROM contacts WHERE "isAdmin" = 1 AND email IS NOT NULL AND email != ''`,
  );

  const extraRaw = (await getSetting(EXTRA_RECIPIENTS_KEY)) ?? DEFAULT_EXTRA_RECIPIENTS;
  const extra = extraRaw.split(",").map(e => e.trim()).filter(Boolean);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const email of [...admins.map(a => a.email), ...extra]) {
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}

function buildEmailHtml(gridLabel: string, health: GridHealthRecord, provenance: Provenance): string {
  const rows = provenance.bySource
    .filter(s => s.points > 0)
    .map(s => `<tr><td style="padding:4px 12px 4px 0">${s.label}</td><td style="padding:4px 0">${s.points.toLocaleString()} points</td></tr>`)
    .join("");

  const notes = provenance.notes.length
    ? `<p style="margin:16px 0 4px"><strong>Notes from the run:</strong></p><ul>${provenance.notes.map(n => `<li>${n}</li>`).join("")}</ul>`
    : "";

  return `
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
      <h2 style="margin:0 0 8px">${gridLabel}: fell through to the last-resort provider</h2>
      <p style="margin:0 0 16px;color:#444">${health.summary}</p>

      <p style="margin:0 0 4px"><strong>What this means</strong></p>
      <p style="margin:0 0 16px;color:#444">
        Every Open-Meteo route failed — both the REST API and the S3 archive — so the grid
        was filled from NOAA NOMADS GFS at 0.25° (~28 km) instead of ECMWF IFS at 9 km.
        The map will render, but the field is coarser than normal and may show a seam
        where the two model families meet.
      </p>

      <p style="margin:0 0 4px"><strong>Where the data came from</strong></p>
      <table style="border-collapse:collapse;margin:0 0 8px">${rows}</table>
      <p style="margin:0 0 16px;color:#444">
        ${provenance.requested - provenance.missing} of ${provenance.requested} points supplied${provenance.missing ? ` — ${provenance.missing} unfilled` : ""}.
      </p>
      ${notes}

      <p style="margin:16px 0 4px"><strong>Worth checking</strong></p>
      <ul style="color:#444;margin:0">
        <li>Is Open-Meteo's S3 archive reachable, and has its file layout changed?</li>
        <li>Did the REST API rate-limit earlier and harder than usual?</li>
        <li>Admin → Weather shows the full provenance for the most recent run.</li>
      </ul>

      <p style="margin:24px 0 0;font-size:12px;color:#888">
        Sent because the grid reached its last-resort provider. At most one of these per day per grid.
      </p>
    </div>`;
}

/**
 * Records the health of a completed grid run and, when it reached the last
 * resort, emails the admins. Never throws: a failed alert must not fail the
 * fetch that triggered it — the grid itself is still good enough to serve.
 *
 * @param healthKey   settings key holding the live health record
 * @param gridLabel   human name for the grid, used in the panel and subject line
 */
export async function reportGridHealth(
  healthKey: string,
  gridLabel: string,
  provenance: Provenance | undefined,
): Promise<void> {
  try {
    const health = classifyGridHealth(provenance);
    const record: GridHealthRecord = { ...health, at: new Date().toISOString() };
    await setSetting(healthKey, JSON.stringify(record));

    if (health.severity === "ok") return;

    log.warn(`${gridLabel}: ${health.severity} — ${health.summary}`);
    if (health.severity !== "critical" || !provenance) return;

    const sentKey = `gridAlertLastEmailed:${healthKey}`;
    const today = melbourneToday();
    if ((await getSetting(sentKey)) === today) {
      log.info(`${gridLabel}: critical alert already emailed today — not repeating`);
      return;
    }

    const recipients = await resolveRecipients();
    if (recipients.length === 0) {
      log.error(`${gridLabel}: critical fallback, but no alert recipients are configured`);
      return;
    }

    const subject = `SkyHigh: ${gridLabel} fell back to NOAA NOMADS`;
    const html = buildEmailHtml(gridLabel, record, provenance);

    const results = await Promise.all(
      recipients.map(async to => {
        const res = await sendEmail({ to, subject, html });
        if (!res.success) log.error(`${gridLabel}: alert to ${to} failed — ${res.error}`);
        return res.success;
      }),
    );

    // Only mark the day as alerted if someone actually received it, so a
    // transient email outage does not silently swallow the whole day's warning.
    if (results.some(Boolean)) {
      await setSetting(sentKey, today);
      log.info(`${gridLabel}: critical alert emailed to ${results.filter(Boolean).length}/${recipients.length} recipients`);
    }
  } catch (err) {
    log.error(`${gridLabel}: health reporting failed`, err instanceof Error ? err.message : err);
  }
}
