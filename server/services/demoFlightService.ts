import crypto from "crypto";
import createLogger from "../utils/logger.js";
import type { FlightService, Flight, Breadcrumb, Pilot, LivePilotPosition, FlightStats } from "./types.js";

const log = createLogger("demo-flights");

const ACTIVE_TTL_MS = 60_000;
const LANDED_TTL_MS = 8 * 60 * 60 * 1000;

export class DemoFlightService implements FlightService {
  readonly livePilots = new Map<string, LivePilotPosition>();
  readonly flights = new Map<string, Flight>();
  readonly breadcrumbs = new Map<string, any[]>();

  createFlight(pilotId: string | null, _sessionToken: string | null, siteId: string | null, siteName: string): Flight {
    const id = crypto.randomUUID();
    const sToken = pilotId ? null : crypto.randomUUID();

    const flight: Flight = {
      id,
      pilotId,
      sessionToken: sToken,
      siteId: siteId || null,
      siteName: siteName || "",
      startedAt: new Date().toISOString(),
      endedAt: null,
      status: "recording",
      maxAltitude: 0,
      maxSpeed: 0,
      totalDistance: 0,
      altitudeGain: 0,
      altitudeLoss: 0,
    };
    this.flights.set(id, flight);
    this.breadcrumbs.set(id, []);

    log.info(`Demo flight created: ${id} pilot=${pilotId || "guest"}`);
    return flight;
  }

  addBreadcrumbs(flightId: string, breadcrumbs: Breadcrumb[], _pilot: Pilot | null, _sessionToken?: string) {
    const flight = this.flights.get(flightId);
    if (!flight) return null;

    const existing = this.breadcrumbs.get(flightId) || [];
    existing.push(...breadcrumbs);
    this.breadcrumbs.set(flightId, existing);

    return { inserted: breadcrumbs.length, total: breadcrumbs.length };
  }

  updatePosition(pilot: Pilot, pos: { lat: number; lon: number; altitude?: number; speed?: number; heading?: number; verticalSpeed?: number }) {
    this.livePilots.set(pilot.id, {
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

  getLivePilots(myId: string, isDutyPilot?: boolean) {
    this.pruneStale();
    const others: Omit<LivePilotPosition, 'updatedAt' | 'landedAt'>[] = [];
    for (const [id, pos] of this.livePilots) {
      if (!isDutyPilot && id === myId) continue;
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
    const existing = this.livePilots.get(pilotId);
    if (existing) {
      existing.landed = true;
      existing.landedAt = Date.now();
      existing.speed = 0;
    }
  }

  endFlight(flightId: string, stats: FlightStats | undefined, _pilot: Pilot | null, _sessionToken?: string) {
    const flight = this.flights.get(flightId);
    if (!flight) return { ok: false, error: "Flight not found", status: 404 };

    flight.endedAt = new Date().toISOString();
    flight.status = "completed";
    flight.maxAltitude = stats?.maxAltitude || 0;
    flight.maxSpeed = stats?.maxSpeed || 0;
    flight.totalDistance = stats?.totalDistance || 0;
    flight.altitudeGain = stats?.altitudeGain || 0;
    flight.altitudeLoss = stats?.altitudeLoss || 0;

    const pilotName = _pilot?.firstName || _pilot?.name || "Pilot";
    log.info(`Demo flight ended: ${flightId}`);
    return { ok: true, pilotId: flight.pilotId, pilotName, flightId };
  }

  getFlightWithBreadcrumbs(flightId: string, _pilot: Pilot | null, _sessionToken?: string) {
    const flight = this.flights.get(flightId);
    if (!flight) return null;
    const crumbs = this.breadcrumbs.get(flightId) || [];
    return { flight: { ...flight }, breadcrumbs: crumbs };
  }

  listFlights(pilotId: string | null, _sessionToken?: string) {
    if (!pilotId) return [];
    return Array.from(this.flights.values()).filter(f => f.pilotId === pilotId);
  }

  deleteFlight(flightId: string, pilot: Pilot | null, _sessionToken?: string) {
    const flight = this.flights.get(flightId);
    if (!flight) return { ok: false, error: "Flight not found", status: 404 };
    if (flight.pilotId !== pilot?.id) return { ok: false, error: "Not authorized for this flight", status: 403 };

    this.flights.delete(flightId);
    this.breadcrumbs.delete(flightId);
    log.info(`Demo flight deleted: ${flightId} by pilot=${pilot?.id}`);
    return { ok: true };
  }

  getFlight(flightId: string) {
    return this.flights.get(flightId) || null;
  }

  verifyOwnership(flight: Flight, pilot: Pilot | null, _sessionToken?: string) {
    return flight.pilotId === pilot?.id;
  }

  getPilotPosition(pilotId: string) {
    const pos = this.livePilots.get(pilotId);
    if (!pos) return null;
    return { lat: pos.lat, lon: pos.lon };
  }

  clear() {
    this.livePilots.clear();
    this.flights.clear();
    this.breadcrumbs.clear();
  }

  private pruneStale() {
    const now = Date.now();
    for (const [id, pos] of this.livePilots) {
      if (pos.landed) {
        if (pos.landedAt && now - pos.landedAt > LANDED_TTL_MS) this.livePilots.delete(id);
      } else {
        if (now - pos.updatedAt > ACTIVE_TTL_MS) this.livePilots.delete(id);
      }
    }
  }
}
