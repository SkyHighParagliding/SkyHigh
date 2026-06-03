import crypto from "crypto";
import { query, queryOne, execute, transaction } from "../pg.js";
import createLogger from "../utils/logger.js";
import type { FlightService, Flight, Breadcrumb, Pilot, LivePilotPosition, FlightStats } from "./types.js";

const log = createLogger("flights");

const livePilots = new Map<string, LivePilotPosition>();

async function getSettingNum(key: string, fallback: number): Promise<number> {
  const row = await queryOne<{ value: string }>(
    "SELECT value FROM settings WHERE key = $1",
    [key]
  );
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

    await execute(
      `INSERT INTO flights (id, "pilotId", "sessionToken", "siteId", "siteName", "startedAt", status)
       VALUES ($1, $2, $3, $4, $5, NOW(), 'recording')`,
      [id, pilotId, sToken, siteId || null, siteName || ""]
    );

    log.info(`Flight created: ${id} pilot=${pilotId || "guest"}`);
    return { id, pilotId, sessionToken: sToken, siteId: siteId || null, siteName: siteName || "", startedAt: new Date().toISOString(), endedAt: null, status: "recording", maxAltitude: 0, maxSpeed: 0, totalDistance: 0, altitudeGain: 0, altitudeLoss: 0 };
  }

  async addBreadcrumbs(flightId: string, breadcrumbs: Breadcrumb[], pilot: Pilot | null, sessionToken?: string) {
    // Atomic check: verify ownership in a single query to prevent race conditions
    let authorized = false;
    if (pilot?.id) {
      const checkFlight = await queryOne(
        `SELECT id FROM flights WHERE id = $1 AND "pilotId" = $2 LIMIT 1`,
        [flightId, pilot.id]
      );
      authorized = !!checkFlight;
    } else if (sessionToken) {
      const checkSession = await queryOne(
        `SELECT id FROM flights WHERE id = $1 AND "sessionToken" = $2 LIMIT 1`,
        [flightId, sessionToken]
      );
      authorized = !!checkSession;
    }

    if (!authorized) {
      const flightCheck = await queryOne(
        "SELECT id FROM flights WHERE id = $1 LIMIT 1",
        [flightId]
      );
      if (!flightCheck) return null;
      return { error: "Not authorized for this flight", status: 403 };
    }

    const inserted = await transaction(async (client) => {
      let count = 0;
      for (const c of breadcrumbs) {
        const res = await client.query(
          `INSERT INTO breadcrumbs ("flightId", timestamp, lat, lon, altitude, speed, heading)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT ("flightId", timestamp) DO NOTHING`,
          [flightId, c.timestamp, c.lat, c.lon, c.altitude || 0, c.speed || 0, c.heading || 0]
        );
        if ((res.rowCount ?? 0) > 0) count++;
      }
      return count;
    });

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
    const flight = await queryOne("SELECT * FROM flights WHERE id = $1", [flightId]);
    if (!flight) return { ok: false, error: "Flight not found", status: 404 };
    if (!verifyFlightOwnership(flight, pilot, sessionToken)) return { ok: false, error: "Not authorized for this flight", status: 403 };

    await execute(
      `UPDATE flights SET
        "endedAt" = NOW(),
        status = 'completed',
        "maxAltitude" = $1,
        "maxSpeed" = $2,
        "totalDistance" = $3,
        "altitudeGain" = $4,
        "altitudeLoss" = $5
       WHERE id = $6`,
      [
        stats?.maxAltitude || 0,
        stats?.maxSpeed || 0,
        stats?.totalDistance || 0,
        stats?.altitudeGain || 0,
        stats?.altitudeLoss || 0,
        flightId,
      ]
    );

    let pilotName = pilot?.firstName || pilot?.name || "Pilot";
    if (flight.pilotId && flight.pilotId !== pilot?.id) {
      const p = await queryOne<{ name: string }>(
        "SELECT name FROM pilots WHERE id = $1",
        [flight.pilotId]
      );
      if (p?.name) pilotName = p.name;
    }

    log.info(`Flight ended: ${flightId}`);
    return { ok: true, pilotId: flight.pilotId, pilotName, flightId };
  }

  async getFlightWithBreadcrumbs(flightId: string, pilot: Pilot | null, sessionToken?: string) {
    const flight = await queryOne("SELECT * FROM flights WHERE id = $1", [flightId]);
    if (!flight) return null;
    if (!verifyFlightOwnership(flight, pilot, sessionToken)) return { error: "Not authorized for this flight", status: 403 };
    const breadcrumbs = await query(
      `SELECT * FROM breadcrumbs WHERE "flightId" = $1 ORDER BY timestamp ASC`,
      [flightId]
    );
    return { flight, breadcrumbs };
  }

  async listFlights(pilotId: string | null, sessionToken?: string) {
    if (pilotId) {
      return await query<Flight>(
        `SELECT * FROM flights WHERE "pilotId" = $1 ORDER BY "startedAt" DESC LIMIT 500`,
        [pilotId]
      );
    }
    if (sessionToken) {
      return await query<Flight>(
        `SELECT * FROM flights WHERE "sessionToken" = $1 ORDER BY "startedAt" DESC LIMIT 500`,
        [sessionToken]
      );
    }
    return [];
  }

  async listFlightsWithLanding(pilotId: string | null, sessionToken?: string) {
    if (pilotId) {
      return await query<Flight & { landingZone?: string | null }>(
        `SELECT f.*, s.landing AS "landingZone"
         FROM flights f
         LEFT JOIN sites s ON f."siteId" = s.id
         WHERE f."pilotId" = $1
         ORDER BY f."startedAt" DESC LIMIT 500`,
        [pilotId]
      );
    }
    if (sessionToken) {
      return await query<Flight & { landingZone?: string | null }>(
        `SELECT f.*, s.landing AS "landingZone"
         FROM flights f
         LEFT JOIN sites s ON f."siteId" = s.id
         WHERE f."sessionToken" = $1
         ORDER BY f."startedAt" DESC LIMIT 500`,
        [sessionToken]
      );
    }
    return [];
  }

  async getBreadcrumbsForFlights(flightIds: string[]) {
    if (flightIds.length === 0) return [];
    return await query<Breadcrumb>(
      `SELECT * FROM breadcrumbs WHERE "flightId" = ANY($1) ORDER BY timestamp ASC`,
      [flightIds]
    );
  }

  async deleteFlight(flightId: string, pilot: Pilot | null, sessionToken?: string) {
    const flight = await queryOne("SELECT * FROM flights WHERE id = $1", [flightId]);
    if (!flight) return { ok: false, error: "Flight not found", status: 404 };
    if (!verifyFlightOwnership(flight, pilot, sessionToken)) return { ok: false, error: "Not authorized for this flight", status: 403 };

    await transaction(async (client) => {
      await client.query(`UPDATE retrievals SET "flightId" = NULL WHERE "flightId" = $1`, [flightId]);
      await client.query(`DELETE FROM breadcrumbs WHERE "flightId" = $1`, [flightId]);
      await client.query("DELETE FROM flights WHERE id = $1", [flightId]);
    });

    log.info(`Flight deleted: ${flightId} by pilot=${pilot?.id || "guest"}`);
    return { ok: true };
  }

  async getFlight(flightId: string) {
    return await queryOne<Flight>("SELECT * FROM flights WHERE id = $1", [flightId]) ?? null;
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
