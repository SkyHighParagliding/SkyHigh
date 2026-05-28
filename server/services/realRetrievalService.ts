import crypto from "crypto";
import { query, queryOne, execute, transaction } from "../pg.js";
import createLogger from "../utils/logger.js";
import { calculateSequentialETAs } from "../utils/osrm.js";
import { fetchGarminPosition } from "../utils/garminMapshare.js";
import { fetchSpotPosition } from "../utils/spotTracker.js";
import { fetchZoleoPosition } from "../utils/zoleoTracker.js";
import type { RetrievalService, Pilot, Retrieval, DriverPosition, DutyPilotPosition, LaunchSiteInfo, RetrievalStatusResponse, SseClient } from "./types.js";

const log = createLogger("retrievals");

// PostgreSQL equivalent of SQLite's "start of day"
const TODAY_SCOPE = `AND "createdAt" >= date_trunc('day', NOW())`;
const driverEtaLastCalc = new Map<string, number>();
const activeRecalcs = new Set<string>();
const DRIVER_POS_TTL_MS = 8 * 60 * 60 * 1000;

const liveDriverPositions = new Map<string, DriverPosition>();
let liveDutyPilotPosition: DutyPilotPosition | null = null;

async function getSettingNum(key: string, fallback: number): Promise<number> {
  const row = await queryOne<{ value: string }>(
    "SELECT value FROM settings WHERE key = $1",
    [key]
  );
  if (!row?.value) return fallback;
  const n = Number(row.value);
  return isNaN(n) ? fallback : n;
}

async function recalcProductionDriverETAs(driverId: string, driverLat: number, driverLon: number) {
  if (activeRecalcs.has(driverId)) return;
  activeRecalcs.add(driverId);
  const start = Date.now();
  try {
    const claimed = await query<{ pilotId: string; pilotLat: number; pilotLon: number; claimedAt: number }>(
      `SELECT "pilotId", "pilotLat", "pilotLon", "claimedAt" FROM retrievals
       WHERE "driverId" = $1 AND status = 'claimed' AND "pilotLat" IS NOT NULL AND "pilotLon" IS NOT NULL
       ${TODAY_SCOPE} ORDER BY "claimedAt" ASC`,
      [driverId]
    );

    if (claimed.length === 0) return;

    const pilots = claimed.map(r => ({ pilotId: r.pilotId, lat: r.pilotLat, lon: r.pilotLon }));
    const etas = await calculateSequentialETAs({ lat: driverLat, lon: driverLon }, pilots);

    for (const eta of etas) {
      await execute(
        `UPDATE retrievals SET "etaMinutes" = $1
         WHERE "pilotId" = $2 AND "driverId" = $3 AND status = 'claimed' ${TODAY_SCOPE}`,
        [eta.etaMinutes, eta.pilotId, driverId]
      );
    }
    const elapsed = Date.now() - start;
    if (elapsed > 3000) {
      log.info(`ETA recalc for driver ${driverId}: ${elapsed}ms, ${claimed.length} pilots`);
    }
  } finally {
    activeRecalcs.delete(driverId);
  }
}

interface SatFix {
  lat: number;
  lon: number;
  timestampMs: number;
  validFix: boolean;
  source: string;
}

async function fetchBestSatellitePosition(pilot: {
  garminMapshare: string | null;
  spotFeedId: string | null;
  zoleoImei: string | null;
}): Promise<SatFix | null> {
  const promises: Promise<SatFix | null>[] = [];

  if (pilot.garminMapshare) {
    promises.push(
      fetchGarminPosition(pilot.garminMapshare).then((p) =>
        p && p.validFix ? { lat: p.lat, lon: p.lon, timestampMs: p.timestampMs, validFix: true, source: "garmin" } : null
      )
    );
  }
  if (pilot.spotFeedId) {
    promises.push(
      fetchSpotPosition(pilot.spotFeedId).then((p) =>
        p && p.validFix ? { lat: p.lat, lon: p.lon, timestampMs: p.timestampMs, validFix: true, source: "spot" } : null
      )
    );
  }
  if (pilot.zoleoImei) {
    const zoleoApiKey = process.env.ZOLEO_API_KEY || null;
    if (zoleoApiKey) {
      promises.push(
        fetchZoleoPosition(pilot.zoleoImei, zoleoApiKey).then((p) =>
          p && p.validFix ? { lat: p.lat, lon: p.lon, timestampMs: p.timestampMs, validFix: true, source: "zoleo" } : null
        )
      );
    }
  }

  if (promises.length === 0) return null;

  const results = await Promise.allSettled(promises);
  let best: SatFix | null = null;
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) {
      if (!best || r.value.timestampMs > best.timestampMs) {
        best = r.value;
      }
    }
  }
  return best;
}

const SAT_POLL_INTERVAL_MS = 120_000;
let satPollTimer: ReturnType<typeof setInterval> | null = null;
let satPollRunning = false;

let serviceInstance: RealRetrievalService | null = null;

async function pollSatelliteForStaleRetrievals() {
  if (satPollRunning) return;
  satPollRunning = true;
  try {
    const staleRetrievals = await query<{
      id: string;
      pilotId: string;
      pilotUpdatedAt: number | null;
      positionSource: string | null;
      garminMapshare: string | null;
      spotFeedId: string | null;
      zoleoImei: string | null;
    }>(
      `SELECT r.id, r."pilotId", r."pilotUpdatedAt", r."positionSource",
              p."garminMapshare", p."spotFeedId", p."zoleoImei"
       FROM retrievals r
       JOIN pilots p ON r."pilotId" = p.id
       WHERE r.status IN ('awaiting', 'claimed')
         AND (
           (p."garminMapshare" IS NOT NULL AND p."garminMapshare" != '')
           OR (p."spotFeedId" IS NOT NULL AND p."spotFeedId" != '')
           OR (p."zoleoImei" IS NOT NULL AND p."zoleoImei" != '')
         )
         AND r."createdAt" >= date_trunc('day', NOW())`
    );

    if (staleRetrievals.length === 0) return;

    let anyUpdated = false;

    for (const retrieval of staleRetrievals) {
      const phoneStaleMs = await getSettingNum("ftPhoneStaleThreshold", 90) * 1000;
      const timeSinceUpdate = retrieval.pilotUpdatedAt
        ? Date.now() - retrieval.pilotUpdatedAt
        : Infinity;

      if (timeSinceUpdate < phoneStaleMs && retrieval.positionSource !== 'satellite') {
        continue;
      }

      const fix = await fetchBestSatellitePosition({
        garminMapshare: retrieval.garminMapshare,
        spotFeedId: retrieval.spotFeedId,
        zoleoImei: retrieval.zoleoImei,
      });
      if (!fix) continue;

      const satMaxAge = await getSettingNum("ftSatMaxFixAge", 15) * 60_000;
      const fixAge = Date.now() - fix.timestampMs;
      if (fixAge > satMaxAge) continue;
      if (fix.timestampMs <= (retrieval.pilotUpdatedAt || 0)) continue;

      await execute(
        `UPDATE retrievals SET "pilotLat" = $1, "pilotLon" = $2, "pilotUpdatedAt" = $3, "positionSource" = 'satellite'
         WHERE id = $4 AND status IN ('awaiting', 'claimed')`,
        [fix.lat, fix.lon, fix.timestampMs, retrieval.id]
      );

      log.info(`Satellite position update (${fix.source}) for pilot ${retrieval.pilotId}: ${fix.lat.toFixed(5)}, ${fix.lon.toFixed(5)} (fix age: ${Math.round(fixAge / 1000)}s)`);
      anyUpdated = true;
    }

    if (anyUpdated && serviceInstance) {
      serviceInstance.broadcastUpdate();
    }
  } catch (err: any) {
    log.info(`Satellite poll error: ${err.message}`);
  } finally {
    satPollRunning = false;
  }
}

function startSatellitePolling() {
  if (satPollTimer) return;
  satPollTimer = setInterval(() => {
    pollSatelliteForStaleRetrievals();
  }, SAT_POLL_INTERVAL_MS);
  log.info("Satellite tracker polling started (every 2 min) — Garmin, SPOT, ZOLEO");
}

export class RealRetrievalService implements RetrievalService {
  private sseClients = new Set<SseClient>();
  private broadcastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    serviceInstance = this;
    startSatellitePolling();
  }

  destroy() {
    if (satPollTimer) {
      clearInterval(satPollTimer);
      satPollTimer = null;
    }
    serviceInstance = null;
  }

  async requestRetrieval(pilot: Pilot, lat: number | null, lon: number | null, flightId?: string | null) {
    const result = await transaction(async (client) => {
      const existing = await client.query(
        `SELECT id FROM retrievals WHERE "pilotId" = $1 AND status IN ('awaiting', 'claimed') AND "createdAt" >= date_trunc('day', NOW())`,
        [pilot.id]
      );

      if (existing.rows.length > 0) {
        return { alreadyExists: true };
      }

      await client.query(
        `UPDATE retrievals SET status = 'completed', "completedAt" = NOW()
         WHERE "pilotId" = $1 AND status IN ('awaiting', 'claimed') AND "createdAt" < date_trunc('day', NOW())`,
        [pilot.id]
      );

      const retrievalId = crypto.randomUUID();
      await client.query(
        `INSERT INTO retrievals (id, "pilotId", "pilotName", "pilotLat", "pilotLon", "pilotUpdatedAt", status, "flightId")
         VALUES ($1, $2, $3, $4, $5, $6, 'awaiting', $7)`,
        [
          retrievalId,
          pilot.id,
          pilot.firstName || pilot.name || "Pilot",
          typeof lat === "number" && isFinite(lat) ? lat : null,
          typeof lon === "number" && isFinite(lon) ? lon : null,
          Date.now(),
          flightId || null,
        ]
      );

      return { alreadyExists: false };
    });

    if (result.alreadyExists) {
      return { ok: true, alreadyExists: true };
    }

    log.info(`Retrieval requested by pilot ${pilot.id} (in-flight)`);
    this.broadcastUpdate();
    return { ok: true };
  }

  async getUnretrieved() {
    return await query<Retrieval>(
      `SELECT * FROM retrievals WHERE status IN ('awaiting', 'claimed') ${TODAY_SCOPE} ORDER BY "createdAt" ASC`
    );
  }

  async claimRetrieval(pilotId: string, driver: Pilot) {
    const result = await execute(
      `UPDATE retrievals SET "driverId" = $1, "driverName" = $2, status = 'claimed', "claimedAt" = $3
       WHERE "pilotId" = $4 AND status = 'awaiting' ${TODAY_SCOPE}`,
      [driver.id, driver.firstName || driver.name || "Driver", Date.now(), pilotId]
    );

    if (result.rowCount === 0) {
      const existing = await queryOne<{ status: string; driverName: string | null }>(
        `SELECT status, "driverName" FROM retrievals WHERE "pilotId" = $1 AND status IN ('awaiting', 'claimed') ${TODAY_SCOPE}`,
        [pilotId]
      );

      if (existing?.status === 'claimed') {
        return { ok: false, error: `Already claimed by ${existing.driverName || 'another driver'}`, status: 409 };
      }
      return { ok: false, error: "No active retrieval for this pilot", status: 404 };
    }

    log.info(`Driver ${driver.id} claimed retrieval for pilot ${pilotId}`);

    const driverRetrieval = await queryOne<{ driverLat: number; driverLon: number }>(
      `SELECT "driverLat", "driverLon" FROM retrievals
       WHERE "driverId" = $1 AND status = 'claimed' AND "driverLat" IS NOT NULL AND "driverLon" IS NOT NULL
       ${TODAY_SCOPE} LIMIT 1`,
      [driver.id]
    );
    if (driverRetrieval?.driverLat != null && driverRetrieval?.driverLon != null) {
      recalcProductionDriverETAs(driver.id, driverRetrieval.driverLat, driverRetrieval.driverLon).then(() => {
        this.broadcastUpdate();
      }).catch((err: any) => log.warn(`ETA recalc after claim failed: ${err.message}`));
    }

    this.broadcastUpdate();
    return { ok: true };
  }

  async unclaimRetrieval(pilotId: string, caller: Pilot) {
    const existing = await queryOne<{ driverId: string; driverLat: number | null; driverLon: number | null }>(
      `SELECT "driverId", "driverLat", "driverLon" FROM retrievals
       WHERE "pilotId" = $1 AND status = 'claimed' ${TODAY_SCOPE} LIMIT 1`,
      [pilotId]
    );

    if (!existing) {
      return { ok: false, error: "No claimed retrieval for this pilot", status: 404 };
    }

    if (existing.driverId !== caller.id) {
      return { ok: false, error: "Only the claiming driver can unclaim", status: 403 };
    }

    const result = await execute(
      `UPDATE retrievals SET "driverId" = NULL, "driverName" = NULL, "driverLat" = NULL, "driverLon" = NULL,
        "driverUpdatedAt" = NULL, "etaMinutes" = NULL, "claimedAt" = NULL, status = 'awaiting'
       WHERE "pilotId" = $1 AND status = 'claimed' AND "driverId" = $2 ${TODAY_SCOPE}`,
      [pilotId, caller.id]
    );

    if (result.rowCount === 0) {
      return { ok: false, error: "No claimed retrieval for this pilot", status: 404 };
    }

    if (existing.driverLat != null && existing.driverLon != null) {
      recalcProductionDriverETAs(caller.id, existing.driverLat, existing.driverLon).catch((err: any) => log.warn(`ETA recalc after unclaim failed: ${err.message}`));
    }

    log.info(`Retrieval unclaimed for pilot ${pilotId} by driver ${caller.id}`);
    this.broadcastUpdate();
    return { ok: true };
  }

  async completeRetrieval(pilotId: string, caller: Pilot) {
    const retrieval = await queryOne<{ driverId: string | null; status: string }>(
      `SELECT "driverId", status FROM retrievals WHERE "pilotId" = $1 AND status IN ('awaiting', 'claimed') ${TODAY_SCOPE} LIMIT 1`,
      [pilotId]
    );

    if (!retrieval) {
      return { ok: false, error: "No active retrieval for this pilot", status: 404 };
    }

    const isDriver = retrieval.driverId === caller.id;
    const isPilot = caller.id === pilotId;
    if (!isDriver && !isPilot) {
      return { ok: false, error: "Only the pilot or claiming driver can complete", status: 403 };
    }

    const result = await execute(
      `UPDATE retrievals SET status = 'completed', "completedAt" = NOW()
       WHERE "pilotId" = $1 AND status IN ('awaiting', 'claimed') ${TODAY_SCOPE}`,
      [pilotId]
    );

    if (result.rowCount === 0) {
      return { ok: false, error: "No active retrieval for this pilot", status: 404 };
    }

    log.info(`Retrieval completed for pilot ${pilotId} by ${caller.id}`);
    this.broadcastUpdate();
    return { ok: true };
  }

  async updateDriverPosition(driver: Pilot, lat: number, lon: number) {
    liveDriverPositions.set(driver.id, {
      driverId: driver.id,
      driverName: driver.firstName || driver.name || 'Driver',
      lat,
      lon,
      updatedAt: Date.now(),
    });

    const updated = await execute(
      `UPDATE retrievals SET "driverLat" = $1, "driverLon" = $2, "driverUpdatedAt" = $3
       WHERE "driverId" = $4 AND status = 'claimed' ${TODAY_SCOPE}`,
      [lat, lon, Date.now(), driver.id]
    );

    if (updated.rowCount > 0) {
      const lastCalc = driverEtaLastCalc.get(driver.id) || 0;
      if (Date.now() - lastCalc > 15000) {
        driverEtaLastCalc.set(driver.id, Date.now());
        recalcProductionDriverETAs(driver.id, lat, lon).then(() => {
          this.broadcastUpdate();
        }).catch((err: any) => log.warn(`ETA recalc after position update failed: ${err.message}`));
      }
    }

    return { ok: true, updated: updated.rowCount };
  }

  getDriverPositions() {
    const now = Date.now();
    return Array.from(liveDriverPositions.values())
      .filter(d => now - d.updatedAt < DRIVER_POS_TTL_MS);
  }

  async updatePilotPosition(pilot: Pilot, lat: number, lon: number) {
    const updated = await execute(
      `UPDATE retrievals SET "pilotLat" = $1, "pilotLon" = $2, "pilotUpdatedAt" = $3, "positionSource" = 'phone'
       WHERE "pilotId" = $4 AND status IN ('awaiting', 'claimed') ${TODAY_SCOPE}`,
      [lat, lon, Date.now(), pilot.id]
    );

    if (updated.rowCount > 0) {
      this.broadcastUpdate();
    }

    return { ok: true, updated: updated.rowCount };
  }

  async getRetrievalStatus(pilotId: string, callerId: string): Promise<RetrievalStatusResponse | { error: string; status: number }> {
    if (callerId !== pilotId) {
      return { error: "Can only check your own retrieval status", status: 403 };
    }

    const retrieval = await queryOne(
      `SELECT * FROM retrievals WHERE "pilotId" = $1 AND status IN ('awaiting', 'claimed') ${TODAY_SCOPE} ORDER BY "createdAt" DESC LIMIT 1`,
      [pilotId]
    );

    if (!retrieval) {
      return { active: false };
    }

    return {
      active: true,
      status: retrieval.status,
      driverName: retrieval.driverName,
      driverId: retrieval.driverId,
      driverLat: retrieval.driverLat,
      driverLon: retrieval.driverLon,
      driverUpdatedAt: retrieval.driverUpdatedAt,
      pilotLat: retrieval.pilotLat,
      pilotLon: retrieval.pilotLon,
      etaMinutes: retrieval.etaMinutes ?? null,
      positionSource: retrieval.positionSource || 'phone',
    };
  }

  updateDutyPilotPosition(pilot: Pilot, lat: number, lon: number) {
    liveDutyPilotPosition = {
      pilotId: pilot.id,
      name: pilot.firstName || pilot.name || 'Duty Pilot',
      lat,
      lon,
      updatedAt: Date.now(),
    };
  }

  getDutyPilotPosition() {
    if (!liveDutyPilotPosition || Date.now() - liveDutyPilotPosition.updatedAt > DRIVER_POS_TTL_MS) {
      return { available: false };
    }
    return { available: true, ...liveDutyPilotPosition };
  }

  async getLaunchSite(): Promise<LaunchSiteInfo> {
    const activeFlight = await queryOne<{ siteId: string; siteName: string }>(
      `SELECT "siteId", "siteName" FROM flights WHERE status = 'recording' AND "siteId" IS NOT NULL AND "siteId" != '' ORDER BY "startedAt" DESC LIMIT 1`
    );

    if (activeFlight?.siteId) {
      const site = await queryOne<{ id: string; name: string; lat: number; lon: number }>(
        "SELECT id, name, lat, lon FROM sites WHERE id = $1",
        [activeFlight.siteId]
      );
      if (site?.lat != null && site?.lon != null) {
        return { available: true, name: site.name, lat: site.lat, lon: site.lon };
      }
    }

    const retrieval = await queryOne<{ flightId: string }>(
      `SELECT r."flightId" FROM retrievals r WHERE r.status IN ('awaiting','claimed') ${TODAY_SCOPE} ORDER BY r."createdAt" DESC LIMIT 1`
    );

    if (retrieval?.flightId) {
      const flight = await queryOne<{ siteId: string }>(
        `SELECT "siteId" FROM flights WHERE id = $1`,
        [retrieval.flightId]
      );
      if (flight?.siteId) {
        const site = await queryOne<{ id: string; name: string; lat: number; lon: number }>(
          "SELECT id, name, lat, lon FROM sites WHERE id = $1",
          [flight.siteId]
        );
        if (site?.lat != null && site?.lon != null) {
          return { available: true, name: site.name, lat: site.lat, lon: site.lon };
        }
      }
    }

    const todaysFlight = await queryOne<{ siteId: string }>(
      `SELECT "siteId" FROM flights WHERE "siteId" IS NOT NULL AND "siteId" != '' AND "startedAt" >= date_trunc('day', NOW()) ORDER BY "startedAt" DESC LIMIT 1`
    );

    if (todaysFlight?.siteId) {
      const site = await queryOne<{ id: string; name: string; lat: number; lon: number }>(
        "SELECT id, name, lat, lon FROM sites WHERE id = $1",
        [todaysFlight.siteId]
      );
      if (site?.lat != null && site?.lon != null) {
        return { available: true, name: site.name, lat: site.lat, lon: site.lon };
      }
    }

    const setting = await queryOne<{ value: string }>(
      `SELECT value FROM settings WHERE key = 'ftDefaultSiteId'`
    );
    if (setting?.value) {
      const site = await queryOne<{ id: string; name: string; lat: number; lon: number }>(
        "SELECT id, name, lat, lon FROM sites WHERE id = $1",
        [setting.value]
      );
      if (site?.lat != null && site?.lon != null) {
        return { available: true, name: site.name, lat: site.lat, lon: site.lon };
      }
    }

    return { available: false };
  }

  async createRetrievalForPilot(pilotId: string, pilotName: string, pilotLat: number | null, pilotLon: number | null, flightId: string) {
    await transaction(async (client) => {
      const existing = await client.query(
        `SELECT id FROM retrievals WHERE "pilotId" = $1 AND status IN ('awaiting', 'claimed') AND "createdAt" >= date_trunc('day', NOW())`,
        [pilotId]
      );
      if (existing.rows.length > 0) return;

      await client.query(
        `UPDATE retrievals SET status = 'completed', "completedAt" = NOW()
         WHERE "pilotId" = $1 AND status IN ('awaiting', 'claimed') AND "createdAt" < date_trunc('day', NOW())`,
        [pilotId]
      );

      const retrievalId = crypto.randomUUID();
      await client.query(
        `INSERT INTO retrievals (id, "pilotId", "pilotName", "pilotLat", "pilotLon", "pilotUpdatedAt", status, "flightId")
         VALUES ($1, $2, $3, $4, $5, $6, 'awaiting', $7)`,
        [retrievalId, pilotId, pilotName, pilotLat, pilotLon, Date.now(), flightId]
      );
    });

    log.info(`Retrieval created for pilot ${pilotId} after flight ${flightId}`);
  }

  addSseClient(client: SseClient) {
    this.sseClients.add(client);
  }

  removeSseClient(client: SseClient) {
    this.sseClients.delete(client);
  }

  broadcastUpdate() {
    if (this.broadcastTimer) return;
    this.broadcastTimer = setTimeout(() => {
      this.broadcastTimer = null;
      this._doBroadcast();
    }, 250);
  }

  private async _doBroadcast() {
    if (this.sseClients.size === 0) return;
    const rows = await query(
      `SELECT * FROM retrievals WHERE status IN ('awaiting', 'claimed') ${TODAY_SCOPE} ORDER BY "createdAt" ASC`
    );

    const data = JSON.stringify({ type: 'retrievals', data: rows });
    for (const client of this.sseClients) {
      try {
        if (client.role === 'driver') {
          client.res.write(`data: ${data}\n\n`);
        } else if (client.role === 'pilot' && client.pilotId) {
          const myRetrieval = (rows as any[]).find(
            r => r.pilotId === client.pilotId && (r.status === 'awaiting' || r.status === 'claimed')
          );
          const pilotData = JSON.stringify({
            type: 'retrieval-status',
            data: myRetrieval ? {
              active: true,
              status: myRetrieval.status,
              driverName: myRetrieval.driverName,
              driverId: myRetrieval.driverId,
              driverLat: myRetrieval.driverLat,
              driverLon: myRetrieval.driverLon,
              driverUpdatedAt: myRetrieval.driverUpdatedAt,
              pilotLat: myRetrieval.pilotLat,
              pilotLon: myRetrieval.pilotLon,
              etaMinutes: myRetrieval.etaMinutes ?? null,
              positionSource: myRetrieval.positionSource || 'phone',
            } : { active: false },
          });
          client.res.write(`data: ${pilotData}\n\n`);
        }
      } catch {
        log.warn("Removed broken SSE client during broadcast");
        this.sseClients.delete(client);
      }
    }
  }
}
