import crypto from "crypto";
import db from "../db.js";
import createLogger from "../utils/logger.js";
import type { FlightService, Flight, Breadcrumb, Pilot, LivePilotPosition, FlightStats } from "./types.js";

const log = createLogger("flights");

const livePilots = new Map<string, LivePilotPosition>();

async function getSettingNum(key: string, fallback: number): Promise<number> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  if (!row?.value) return fallback;
  const n = Number(row.value);
  return isNaN(n) ? fallback : n;
}

async function pruneStalePositions() {
  const activeTtl = await getSettingNum("ftActiveTtl", 60) * 1000;
  const landedTtl = await getSettingNum("ftLandedTtl", 480) * 60 * 1000;
  const now = Date.now();
  for (const [id, pos] of livePilots) {
    if (pos.landed) {
      if (pos.landedAt && now - pos.landedAt > landedTtl) livePilots.delete(id);
    } else {
      if (now - pos.updatedAt > activeTtl) livePilots.delete(id);
    }
  }
}

function verifyFlightOwnership(flight: any, pilot: Pilot | null, sessionToken?: string): boolean {
  if (flight.pilotId && pilot?.id === flight.pilotId) return true;
  if (flight.sessionToken) {
    if (sessionToken && sessionToken === flight.sessionToken) return true;
  }
  return false;
}

export class RealFlightService implements FlightService {
  async createFlight(pilotId: string | null, sessionToken: string | null, siteId: string | null, siteName: string): Promise<Flight> {
    const id = crypto.randomUUID();
    const sToken = pilotId ? null : sessionToken || crypto.randomUUID();

    await db.prepare(
      `INSERT INTO flights (id, pilotId, sessionToken, siteId, siteName, startedAt, status)
       VALUES (?, ?, ?, ?, ?, datetime('now'), 'recording')`
    ).run(id, pilotId, sToken, siteId || null, siteName || "");

    log.info(`Flight created: ${id} pilot=${pilotId || "guest"}`);
    return { id, pilotId, sessionToken: sToken, siteId: siteId || null, siteName: siteName || "", startedAt: new Date().toISOString(), endedAt: null, status: "recording", maxAltitude: 0, maxSpeed: 0, totalDistance: 0, altitudeGain: 0, altitudeLoss: 0 };
  }

  async addBreadcrumbs(flightId: string, breadcrumbs: Breadcrumb[], pilot: Pilot | null, sessionToken?: string) {
    const flight = await db.prepare("SELECT * FROM flights WHERE id = ?").get(flightId) as any;
    if (!flight) return null;
    if (!verifyFlightOwnership(flight, pilot, sessionToken)) return { error: "Not authorized for this flight", status: 403 };

    const insert = await db.prepare(
      `INSERT OR IGNORE INTO breadcrumbs (flightId, timestamp, lat, lon, altitude, speed, heading)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    const insertMany = await db.transaction(async (crumbs: any[]) => {
      let count = 0;
      for (const c of crumbs) {
        const result = await insert.run(flightId, c.timestamp, c.lat, c.lon, c.altitude || 0, c.speed || 0, c.heading || 0);
        if (result.changes > 0) count++;
      }
      return count;
    });

    const inserted = await insertMany(breadcrumbs);
    return { inserted, total: breadcrumbs.length };
  }

  updatePosition(pilot: Pilot, pos: { lat: number; lon: number; altitude?: number; speed?: number; heading?: number; verticalSpeed?: number }) {
    livePilots.set(pilot.id, {
      pilotId: pilot.id,
      firstName: pilot.firstName || "Pilot",
      lat: pos.lat,
      lon: pos.lon,
      altitude: pos.altitude || 0,
      speed: pos.speed || 0,
      heading: pos.heading || 0,
      verticalSpeed: pos.verticalSpeed || 0,
      updatedAt: Date.now(),
      landed: false,
      landedAt: null,
    });
  }

  getLivePilots(myId: string, _isDutyPilot?: boolean) {
    pruneStalePositions();
    const others: Omit<LivePilotPosition, 'updatedAt' | 'landedAt'>[] = [];
    for (const [id, pos] of livePilots) {
      if (id === myId) continue;
      others.push({
        pilotId: pos.pilotId,
        firstName: pos.firstName,
        lat: pos.lat,
        lon: pos.lon,
        altitude: pos.altitude,
        speed: pos.speed,
        heading: pos.heading,
        verticalSpeed: pos.verticalSpeed,
        landed: pos.landed,
      });
    }
    return others;
  }

  markLanded(pilotId: string) {
    const existing = livePilots.get(pilotId);
    if (existing) {
      existing.landed = true;
      existing.landedAt = Date.now();
      existing.speed = 0;
    }
  }

  async endFlight(flightId: string, stats: FlightStats | undefined, pilot: Pilot | null, sessionToken?: string) {
    const flight = await db.prepare("SELECT * FROM flights WHERE id = ?").get(flightId) as any;
    if (!flight) return { ok: false, error: "Flight not found", status: 404 };
    if (!verifyFlightOwnership(flight, pilot, sessionToken)) return { ok: false, error: "Not authorized for this flight", status: 403 };

    await db.prepare(
      `UPDATE flights SET
        endedAt = datetime('now'),
        status = 'completed',
        maxAltitude = ?,
        maxSpeed = ?,
        totalDistance = ?,
        altitudeGain = ?,
        altitudeLoss = ?
       WHERE id = ?`
    ).run(
      stats?.maxAltitude || 0,
      stats?.maxSpeed || 0,
      stats?.totalDistance || 0,
      stats?.altitudeGain || 0,
      stats?.altitudeLoss || 0,
      flightId
    );

    let pilotName = pilot?.firstName || pilot?.name || "Pilot";
    if (flight.pilotId && flight.pilotId !== pilot?.id) {
      const session = await db.prepare("SELECT firstName, lastName FROM pilot_sessions WHERE pilotId = ? ORDER BY createdAt DESC LIMIT 1").get(flight.pilotId) as any;
      if (session?.firstName) pilotName = session.firstName;
    }

    log.info(`Flight ended: ${flightId}`);
    return { ok: true, pilotId: flight.pilotId, pilotName, flightId };
  }

  async getFlightWithBreadcrumbs(flightId: string, pilot: Pilot | null, sessionToken?: string) {
    const flight = await db.prepare("SELECT * FROM flights WHERE id = ?").get(flightId) as any;
    if (!flight) return null;
    if (!verifyFlightOwnership(flight, pilot, sessionToken)) return { error: "Not authorized for this flight", status: 403 };
    const breadcrumbs = await db.prepare("SELECT * FROM breadcrumbs WHERE flightId = ? ORDER BY timestamp ASC").all(flightId);
    return { flight, breadcrumbs };
  }

  async listFlights(pilotId: string | null, sessionToken?: string) {
    if (pilotId) {
      return await db.prepare("SELECT * FROM flights WHERE pilotId = ? ORDER BY startedAt DESC LIMIT 500").all(pilotId) as Flight[];
    }
    if (sessionToken) {
      return await db.prepare("SELECT * FROM flights WHERE sessionToken = ? ORDER BY startedAt DESC LIMIT 500").all(sessionToken) as Flight[];
    }
    return [];
  }

  async deleteFlight(flightId: string, pilot: Pilot | null, sessionToken?: string) {
    const flight = await db.prepare("SELECT * FROM flights WHERE id = ?").get(flightId) as any;
    if (!flight) return { ok: false, error: "Flight not found", status: 404 };
    if (!verifyFlightOwnership(flight, pilot, sessionToken)) return { ok: false, error: "Not authorized for this flight", status: 403 };

    const deleteTx = await db.transaction(async () => {
      await db.prepare("DELETE FROM breadcrumbs WHERE flightId = ?").run(flightId);
      await db.prepare("DELETE FROM flights WHERE id = ?").run(flightId);
    });
    await deleteTx();

    log.info(`Flight deleted: ${flightId} by pilot=${pilot?.id || "guest"}`);
    return { ok: true };
  }

  async getFlight(flightId: string) {
    return await db.prepare("SELECT * FROM flights WHERE id = ?").get(flightId) as Flight | null;
  }

  verifyOwnership(flight: Flight, pilot: Pilot | null, sessionToken?: string) {
    return verifyFlightOwnership(flight, pilot, sessionToken);
  }

  getPilotPosition(pilotId: string) {
    const pos = livePilots.get(pilotId);
    if (!pos) return null;
    return { lat: pos.lat, lon: pos.lon };
  }
}
