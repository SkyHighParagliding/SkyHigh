import crypto from "crypto";
import db from "../db.js";
import createLogger from "../utils/logger.js";
import { calculateSequentialETAs } from "../utils/osrm.js";
import { fetchGarminPosition } from "../utils/garminMapshare.js";
import { fetchSpotPosition } from "../utils/spotTracker.js";
import { fetchZoleoPosition } from "../utils/zoleoTracker.js";
import type { RetrievalService, Pilot, Retrieval, DriverPosition, DutyPilotPosition, LaunchSiteInfo, RetrievalStatusResponse, SseClient } from "./types.js";

const log = createLogger("retrievals");

const TODAY_SCOPE = "AND createdAt >= datetime('now', 'start of day')";
const driverEtaLastCalc = new Map<string, number>();
const activeRecalcs = new Set<string>();
const DRIVER_POS_TTL_MS = 8 * 60 * 60 * 1000;

const liveDriverPositions = new Map<string, DriverPosition>();
let liveDutyPilotPosition: DutyPilotPosition | null = null;

async function getSettingNum(key: string, fallback: number): Promise<number> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  if (!row?.value) return fallback;
  const n = Number(row.value);
  return isNaN(n) ? fallback : n;
}

async function recalcProductionDriverETAs(driverId: string, driverLat: number, driverLon: number) {
  if (activeRecalcs.has(driverId)) return;
  activeRecalcs.add(driverId);
  const start = Date.now();
  try {
    const claimed = await db.prepare(
      `SELECT pilotId, pilotLat, pilotLon, claimedAt FROM retrievals WHERE driverId = ? AND status = 'claimed' AND pilotLat IS NOT NULL AND pilotLon IS NOT NULL ${TODAY_SCOPE} ORDER BY claimedAt ASC`
    ).all(driverId) as Array<{ pilotId: string; pilotLat: number; pilotLon: number; claimedAt: number }>;

    if (claimed.length === 0) return;

    const pilots = claimed.map(r => ({ pilotId: r.pilotId, lat: r.pilotLat, lon: r.pilotLon }));
    const etas = await calculateSequentialETAs({ lat: driverLat, lon: driverLon }, pilots);

    const updateStmt = await db.prepare(`UPDATE retrievals SET etaMinutes = ? WHERE pilotId = ? AND driverId = ? AND status = 'claimed' ${TODAY_SCOPE}`);
    for (const eta of etas) {
      await updateStmt.run(eta.etaMinutes, eta.pilotId, driverId);
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
    const staleRetrievals = await db.prepare(
      `SELECT r.id, r.pilotId, r.pilotUpdatedAt, r.positionSource,
              p.garminMapshare, p.spotFeedId, p.zoleoImei
       FROM retrievals r
       JOIN pilots p ON r.pilotId = p.id
       WHERE r.status IN ('awaiting', 'claimed')
         AND (
           (p.garminMapshare IS NOT NULL AND p.garminMapshare != '')
           OR (p.spotFeedId IS NOT NULL AND p.spotFeedId != '')
           OR (p.zoleoImei IS NOT NULL AND p.zoleoImei != '')
         )
         AND r.createdAt >= datetime('now', 'start of day')`
    ).all() as Array<{
      id: string;
      pilotId: string;
      pilotUpdatedAt: number | null;
      positionSource: string | null;
      garminMapshare: string | null;
      spotFeedId: string | null;
      zoleoImei: string | null;
    }>;

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

      await db.prepare(
        `UPDATE retrievals SET pilotLat = ?, pilotLon = ?, pilotUpdatedAt = ?, positionSource = 'satellite'
         WHERE id = ? AND status IN ('awaiting', 'claimed')`
      ).run(fix.lat, fix.lon, fix.timestampMs, retrieval.id);

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

startSatellitePolling();

export class RealRetrievalService implements RetrievalService {
  private sseClients = new Set<SseClient>();
  private broadcastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    serviceInstance = this;
  }

  async requestRetrieval(pilot: Pilot, lat: number | null, lon: number | null, flightId?: string | null) {
    const existing = await db.prepare(
      "SELECT id FROM retrievals WHERE pilotId = ? AND status IN ('awaiting', 'claimed') AND createdAt >= datetime('now', 'start of day')"
    ).get(pilot.id);

    if (existing) {
      return { ok: true, alreadyExists: true };
    }

    await db.prepare(
      "UPDATE retrievals SET status = 'completed', completedAt = datetime('now') WHERE pilotId = ? AND status IN ('awaiting', 'claimed') AND createdAt < datetime('now', 'start of day')"
    ).run(pilot.id);

    const retrievalId = crypto.randomUUID();
    await db.prepare(
      `INSERT INTO retrievals (id, pilotId, pilotName, pilotLat, pilotLon, pilotUpdatedAt, status, flightId)
       VALUES (?, ?, ?, ?, ?, ?, 'awaiting', ?)`
    ).run(
      retrievalId,
      pilot.id,
      pilot.firstName || pilot.name || "Pilot",
      typeof lat === "number" && isFinite(lat) ? lat : null,
      typeof lon === "number" && isFinite(lon) ? lon : null,
      Date.now(),
      flightId || null
    );

    log.info(`Retrieval requested by pilot ${pilot.id} (in-flight)`);
    this.broadcastUpdate();
    return { ok: true };
  }

  async getUnretrieved() {
    return await db.prepare(
      `SELECT * FROM retrievals WHERE status IN ('awaiting', 'claimed') ${TODAY_SCOPE} ORDER BY createdAt ASC`
    ).all() as Retrieval[];
  }

  async claimRetrieval(pilotId: string, driver: Pilot) {
    const result = await db.prepare(
      `UPDATE retrievals SET driverId = ?, driverName = ?, status = 'claimed', claimedAt = ?
       WHERE pilotId = ? AND status = 'awaiting' ${TODAY_SCOPE}`
    ).run(driver.id, driver.firstName || driver.name || "Driver", Date.now(), pilotId);

    if (result.changes === 0) {
      const existing = await db.prepare(
        `SELECT status, driverName FROM retrievals WHERE pilotId = ? AND status IN ('awaiting', 'claimed') ${TODAY_SCOPE}`
      ).get(pilotId) as any;

      if (existing?.status === 'claimed') {
        return { ok: false, error: `Already claimed by ${existing.driverName || 'another driver'}`, status: 409 };
      }
      return { ok: false, error: "No active retrieval for this pilot", status: 404 };
    }

    log.info(`Driver ${driver.id} claimed retrieval for pilot ${pilotId}`);

    const driverRetrieval = await db.prepare(
      `SELECT driverLat, driverLon FROM retrievals WHERE driverId = ? AND status = 'claimed' AND driverLat IS NOT NULL AND driverLon IS NOT NULL ${TODAY_SCOPE} LIMIT 1`
    ).get(driver.id) as any;
    if (driverRetrieval?.driverLat != null && driverRetrieval?.driverLon != null) {
      recalcProductionDriverETAs(driver.id, driverRetrieval.driverLat, driverRetrieval.driverLon).then(() => {
        this.broadcastUpdate();
      }).catch(() => {});
    }

    this.broadcastUpdate();
    return { ok: true };
  }

  async unclaimRetrieval(pilotId: string, caller: Pilot) {
    const existing = await db.prepare(
      `SELECT driverId, driverLat, driverLon FROM retrievals WHERE pilotId = ? AND status = 'claimed' ${TODAY_SCOPE} LIMIT 1`
    ).get(pilotId) as any;

    if (!existing) {
      return { ok: false, error: "No claimed retrieval for this pilot", status: 404 };
    }

    if (existing.driverId !== caller.id) {
      return { ok: false, error: "Only the claiming driver can unclaim", status: 403 };
    }

    const result = await db.prepare(
      `UPDATE retrievals SET driverId = NULL, driverName = NULL, driverLat = NULL, driverLon = NULL, driverUpdatedAt = NULL, etaMinutes = NULL, claimedAt = NULL, status = 'awaiting'
       WHERE pilotId = ? AND status = 'claimed' AND driverId = ? ${TODAY_SCOPE}`
    ).run(pilotId, caller.id);

    if (result.changes === 0) {
      return { ok: false, error: "No claimed retrieval for this pilot", status: 404 };
    }

    if (existing.driverLat != null && existing.driverLon != null) {
      recalcProductionDriverETAs(caller.id, existing.driverLat, existing.driverLon).catch(() => {});
    }

    log.info(`Retrieval unclaimed for pilot ${pilotId} by driver ${caller.id}`);
    this.broadcastUpdate();
    return { ok: true };
  }

  async completeRetrieval(pilotId: string, caller: Pilot) {
    const retrieval = await db.prepare(
      `SELECT driverId, status FROM retrievals WHERE pilotId = ? AND status IN ('awaiting', 'claimed') ${TODAY_SCOPE} LIMIT 1`
    ).get(pilotId) as any;

    if (!retrieval) {
      return { ok: false, error: "No active retrieval for this pilot", status: 404 };
    }

    const isDriver = retrieval.driverId === caller.id;
    const isPilot = caller.id === pilotId;
    if (!isDriver && !isPilot) {
      return { ok: false, error: "Only the pilot or claiming driver can complete", status: 403 };
    }

    const result = await db.prepare(
      `UPDATE retrievals SET status = 'completed', completedAt = datetime('now')
       WHERE pilotId = ? AND status IN ('awaiting', 'claimed') ${TODAY_SCOPE}`
    ).run(pilotId);

    if (result.changes === 0) {
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

    const updated = await db.prepare(
      `UPDATE retrievals SET driverLat = ?, driverLon = ?, driverUpdatedAt = ? WHERE driverId = ? AND status = 'claimed' ${TODAY_SCOPE}`
    ).run(lat, lon, Date.now(), driver.id);

    if (updated.changes > 0) {
      const lastCalc = driverEtaLastCalc.get(driver.id) || 0;
      if (Date.now() - lastCalc > 15000) {
        driverEtaLastCalc.set(driver.id, Date.now());
        recalcProductionDriverETAs(driver.id, lat, lon).then(() => {
          this.broadcastUpdate();
        }).catch(() => {});
      }
    }

    return { ok: true, updated: updated.changes };
  }

  getDriverPositions() {
    const now = Date.now();
    return Array.from(liveDriverPositions.values())
      .filter(d => now - d.updatedAt < DRIVER_POS_TTL_MS);
  }

  async updatePilotPosition(pilot: Pilot, lat: number, lon: number) {
    const updated = await db.prepare(
      `UPDATE retrievals SET pilotLat = ?, pilotLon = ?, pilotUpdatedAt = ?, positionSource = 'phone' WHERE pilotId = ? AND status IN ('awaiting', 'claimed') ${TODAY_SCOPE}`
    ).run(lat, lon, Date.now(), pilot.id);

    if (updated.changes > 0) {
      this.broadcastUpdate();
    }

    return { ok: true, updated: updated.changes };
  }

  async getRetrievalStatus(pilotId: string, callerId: string): Promise<RetrievalStatusResponse | { error: string; status: number }> {
    if (callerId !== pilotId) {
      return { error: "Can only check your own retrieval status", status: 403 };
    }

    const retrieval = await db.prepare(
      `SELECT * FROM retrievals WHERE pilotId = ? AND status IN ('awaiting', 'claimed') ${TODAY_SCOPE} ORDER BY createdAt DESC LIMIT 1`
    ).get(pilotId) as any;

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
    const activeFlight = await db.prepare(
      `SELECT siteId, siteName FROM flights WHERE status = 'recording' AND siteId IS NOT NULL AND siteId != '' ORDER BY startedAt DESC LIMIT 1`
    ).get() as any;

    if (activeFlight?.siteId) {
      const site = await db.prepare("SELECT id, name, lat, lon FROM sites WHERE id = ?").get(activeFlight.siteId) as any;
      if (site?.lat != null && site?.lon != null) {
        return { available: true, name: site.name, lat: site.lat, lon: site.lon };
      }
    }

    const retrieval = await db.prepare(
      `SELECT r.flightId FROM retrievals r WHERE r.status IN ('awaiting','claimed') ${TODAY_SCOPE} ORDER BY r.createdAt DESC LIMIT 1`
    ).get() as any;

    if (retrieval?.flightId) {
      const flight = await db.prepare("SELECT siteId FROM flights WHERE id = ?").get(retrieval.flightId) as any;
      if (flight?.siteId) {
        const site = await db.prepare("SELECT id, name, lat, lon FROM sites WHERE id = ?").get(flight.siteId) as any;
        if (site?.lat != null && site?.lon != null) {
          return { available: true, name: site.name, lat: site.lat, lon: site.lon };
        }
      }
    }

    const todaysFlight = await db.prepare(
      `SELECT siteId FROM flights WHERE siteId IS NOT NULL AND siteId != '' AND startedAt >= datetime('now', 'start of day') ORDER BY startedAt DESC LIMIT 1`
    ).get() as any;

    if (todaysFlight?.siteId) {
      const site = await db.prepare("SELECT id, name, lat, lon FROM sites WHERE id = ?").get(todaysFlight.siteId) as any;
      if (site?.lat != null && site?.lon != null) {
        return { available: true, name: site.name, lat: site.lat, lon: site.lon };
      }
    }

    const setting = await db.prepare("SELECT value FROM settings WHERE key = 'ftDefaultSiteId'").get() as any;
    if (setting?.value) {
      const site = await db.prepare("SELECT id, name, lat, lon FROM sites WHERE id = ?").get(setting.value) as any;
      if (site?.lat != null && site?.lon != null) {
        return { available: true, name: site.name, lat: site.lat, lon: site.lon };
      }
    }

    return { available: false };
  }

  async createRetrievalForPilot(pilotId: string, pilotName: string, pilotLat: number | null, pilotLon: number | null, flightId: string) {
    const existing = await db.prepare(
      "SELECT id FROM retrievals WHERE pilotId = ? AND status IN ('awaiting', 'claimed') AND createdAt >= datetime('now', 'start of day')"
    ).get(pilotId);
    if (existing) return;

    await db.prepare(
      "UPDATE retrievals SET status = 'completed', completedAt = datetime('now') WHERE pilotId = ? AND status IN ('awaiting', 'claimed') AND createdAt < datetime('now', 'start of day')"
    ).run(pilotId);

    const retrievalId = crypto.randomUUID();
    await db.prepare(
      `INSERT INTO retrievals (id, pilotId, pilotName, pilotLat, pilotLon, pilotUpdatedAt, status, flightId)
       VALUES (?, ?, ?, ?, ?, ?, 'awaiting', ?)`
    ).run(retrievalId, pilotId, pilotName, pilotLat, pilotLon, Date.now(), flightId);

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
    const rows = await db.prepare(
      `SELECT * FROM retrievals WHERE status IN ('awaiting', 'claimed') ${TODAY_SCOPE} ORDER BY createdAt ASC`
    ).all();

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
        this.sseClients.delete(client);
      }
    }
  }
}
