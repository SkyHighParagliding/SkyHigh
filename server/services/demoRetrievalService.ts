import crypto from "crypto";
import { queryOne } from "../pg.js";
import createLogger from "../utils/logger.js";
import { calculateSequentialETAs } from "../utils/osrm.js";
import type { RetrievalService, Pilot, Retrieval, DriverPosition, LaunchSiteInfo, RetrievalStatusResponse, SseClient } from "./types.js";

const log = createLogger("demo-retrievals");

const LANDED_TTL_MS = 8 * 60 * 60 * 1000;

export class DemoRetrievalService implements RetrievalService {
  readonly retrievals = new Map<string, Retrieval>();
  readonly driverPositions = new Map<string, DriverPosition>();
  private readonly driverEtaLastCalc = new Map<string, number>();
  private readonly activeRecalcs = new Set<string>();
  private sseClients = new Set<SseClient>();
  private broadcastTimer: ReturnType<typeof setTimeout> | null = null;
  private dutyPilotPosition: { pilotId: string; name: string; lat: number; lon: number; updatedAt: number } | null = null;
  flightService: { flights: Map<string, any>; livePilots: Map<string, any> } | null = null;
  demoTokens: Record<string, Pilot> = {};

  async requestRetrieval(pilot: Pilot, lat: number | null, lon: number | null, _flightId?: string | null): Promise<{ ok: boolean; alreadyExists?: boolean; alreadyActive?: boolean }> {
    const hasActive = Array.from(this.retrievals.values()).some(
      r => r.pilotId === pilot.id && (r.status === 'awaiting' || r.status === 'claimed')
    );
    if (hasActive) {
      return { ok: true, alreadyActive: true };
    }
    const retrievalId = crypto.randomUUID();
    const retrieval: Retrieval = {
      id: retrievalId,
      pilotId: pilot.id,
      pilotName: pilot.firstName || pilot.name || "Pilot",
      pilotLat: lat || null,
      pilotLon: lon || null,
      pilotUpdatedAt: Date.now(),
      driverId: null,
      driverName: null,
      driverLat: null,
      driverLon: null,
      driverUpdatedAt: null,
      status: 'awaiting',
      flightId: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
      claimedAt: null,
      etaMinutes: null,
    };
    this.retrievals.set(retrievalId, retrieval);
    log.info(`Demo retrieval requested by pilot ${pilot.id}`);
    this.broadcastUpdate();
    return { ok: true };
  }

  async getUnretrieved(): Promise<Retrieval[]> {
    return Array.from(this.retrievals.values()).filter(
      r => r.status === 'awaiting' || r.status === 'claimed'
    );
  }

  async claimRetrieval(pilotId: string, driver: Pilot): Promise<{ ok: boolean; error?: string; status?: number }> {
    const retrieval = Array.from(this.retrievals.values()).find(
      r => r.pilotId === pilotId && r.status === 'awaiting'
    );

    if (!retrieval) {
      const claimed = Array.from(this.retrievals.values()).find(
        r => r.pilotId === pilotId && r.status === 'claimed'
      );
      if (claimed) {
        return { ok: false, error: `Already claimed by ${claimed.driverName || 'another driver'}`, status: 409 };
      }
      return { ok: false, error: "No active retrieval for this pilot", status: 404 };
    }

    retrieval.driverId = driver.id;
    retrieval.driverName = driver.firstName || driver.name || "Driver";
    retrieval.status = 'claimed';
    retrieval.claimedAt = Date.now();

    log.info(`Demo driver ${driver.id} claimed retrieval for pilot ${pilotId}`);

    const driverPos: { lat: number | null; lon: number | null } = { lat: retrieval.driverLat, lon: retrieval.driverLon };
    if (driverPos.lat == null || driverPos.lon == null) {
      const existing = Array.from(this.retrievals.values()).find(
        r => r.driverId === driver.id && r.status === 'claimed' && r.driverLat != null && r.driverLon != null && r.pilotId !== pilotId
      );
      if (existing) {
        driverPos.lat = existing.driverLat;
        driverPos.lon = existing.driverLon;
      }
    }
    if (driverPos.lat != null && driverPos.lon != null) {
      this.recalcDriverETAs(driver.id, driverPos.lat, driverPos.lon).then(() => {
        this.broadcastUpdate();
      }).catch((err: any) => log.warn(`Demo ETA recalc after claim failed: ${err.message}`));
    }

    this.broadcastUpdate();
    return { ok: true };
  }

  async unclaimRetrieval(pilotId: string, caller: Pilot): Promise<{ ok: boolean; error?: string; status?: number }> {
    const retrieval = Array.from(this.retrievals.values()).find(
      r => r.pilotId === pilotId && r.status === 'claimed'
    );

    if (!retrieval) {
      return { ok: false, error: "No claimed retrieval for this pilot", status: 404 };
    }

    const isDutyPilot = caller.id.startsWith('demo-duty-');
    if (retrieval.driverId !== caller.id && !isDutyPilot) {
      return { ok: false, error: "Only the claiming driver can unclaim", status: 403 };
    }

    const prevDriverId = retrieval.driverId;
    const prevDriverLat = retrieval.driverLat;
    const prevDriverLon = retrieval.driverLon;
    retrieval.driverId = null;
    retrieval.driverName = null;
    retrieval.driverLat = null;
    retrieval.driverLon = null;
    retrieval.driverUpdatedAt = null;
    retrieval.status = 'awaiting';
    retrieval.claimedAt = null;
    retrieval.etaMinutes = null;

    if (prevDriverId && prevDriverLat != null && prevDriverLon != null) {
      this.recalcDriverETAs(prevDriverId, prevDriverLat, prevDriverLon).then(() => {
        this.broadcastUpdate();
      }).catch((err: any) => log.warn(`Demo ETA recalc after unclaim failed: ${err.message}`));
    }

    log.info(`Demo retrieval unclaimed for pilot ${pilotId} by ${caller.id}`);
    this.broadcastUpdate();
    return { ok: true };
  }

  async completeRetrieval(pilotId: string, caller: Pilot): Promise<{ ok: boolean; error?: string; status?: number }> {
    const retrieval = Array.from(this.retrievals.values()).find(
      r => r.pilotId === pilotId && (r.status === 'awaiting' || r.status === 'claimed')
    );

    if (!retrieval) {
      return { ok: false, error: "No active retrieval for this pilot", status: 404 };
    }

    const isDriver = retrieval.driverId === caller.id;
    const isPilot = caller.id === pilotId;
    const isDutyPilot = caller.id.startsWith('demo-duty-');
    if (!isDriver && !isPilot && !isDutyPilot) {
      return { ok: false, error: "Only the pilot or claiming driver can complete", status: 403 };
    }

    retrieval.status = 'completed';
    retrieval.completedAt = new Date().toISOString();

    log.info(`Demo retrieval completed for pilot ${pilotId} by ${caller.id}`);
    this.broadcastUpdate();
    return { ok: true };
  }

  async updateDriverPosition(driver: Pilot, lat: number, lon: number): Promise<{ ok: boolean; updated: number }> {
    this.driverPositions.set(driver.id, {
      driverId: driver.id,
      driverName: driver.firstName || driver.name || 'Driver',
      lat,
      lon,
      updatedAt: Date.now(),
    });

    let updated = 0;
    for (const retrieval of this.retrievals.values()) {
      if (retrieval.driverId === driver.id && retrieval.status === 'claimed') {
        retrieval.driverLat = lat;
        retrieval.driverLon = lon;
        retrieval.driverUpdatedAt = Date.now();
        updated++;
      }
    }

    if (updated > 0) {
      const lastCalc = this.driverEtaLastCalc.get(driver.id) || 0;
      if (Date.now() - lastCalc > 15000) {
        this.driverEtaLastCalc.set(driver.id, Date.now());
        this.recalcDriverETAs(driver.id, lat, lon).then(() => {
          this.broadcastUpdate();
        }).catch((err: any) => log.warn(`Demo ETA recalc after position update failed: ${err.message}`));
      }
    }

    return { ok: true, updated };
  }

  getDriverPositions() {
    return Array.from(this.driverPositions.values())
      .filter(d => Date.now() - d.updatedAt < LANDED_TTL_MS);
  }

  async updatePilotPosition(pilot: Pilot, lat: number, lon: number): Promise<{ ok: boolean; updated: number }> {
    let updated = 0;
    for (const retrieval of this.retrievals.values()) {
      if (retrieval.pilotId === pilot.id && (retrieval.status === 'awaiting' || retrieval.status === 'claimed')) {
        retrieval.pilotLat = lat;
        retrieval.pilotLon = lon;
        retrieval.pilotUpdatedAt = Date.now();
        updated++;
      }
    }

    if (updated === 0) {
      const hasActive = Array.from(this.retrievals.values()).some(
        r => r.pilotId === pilot.id && (r.status === 'awaiting' || r.status === 'claimed')
      );
      if (!hasActive) {
        const retrievalId = crypto.randomUUID();
        const retrieval: Retrieval = {
          id: retrievalId,
          pilotId: pilot.id,
          pilotName: pilot.firstName || pilot.name || "Pilot",
          pilotLat: lat,
          pilotLon: lon,
          pilotUpdatedAt: Date.now(),
          driverId: null,
          driverName: null,
          driverLat: null,
          driverLon: null,
          driverUpdatedAt: null,
          status: 'awaiting',
          flightId: null,
          createdAt: new Date().toISOString(),
          completedAt: null,
          claimedAt: null,
          etaMinutes: null,
        };
        this.retrievals.set(retrievalId, retrieval);
        updated = 1;
        this.broadcastUpdate();
      }
    }

    return { ok: true, updated };
  }

  async getRetrievalStatus(pilotId: string, callerId: string): Promise<RetrievalStatusResponse | { error: string; status: number }> {
    if (callerId !== pilotId) {
      return { error: "Can only check your own retrieval status", status: 403 };
    }

    const retrieval = Array.from(this.retrievals.values())
      .filter(r => r.pilotId === pilotId && (r.status === 'awaiting' || r.status === 'claimed'))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

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
      etaMinutes: retrieval.etaMinutes,
    };
  }

  updateDutyPilotPosition(pilot: Pilot, lat: number, lon: number) {
    const isDutyPilot = pilot.id.startsWith('demo-duty-');
    if (!isDutyPilot) return;

    this.dutyPilotPosition = {
      pilotId: pilot.id,
      name: pilot.firstName || pilot.name || 'Duty Pilot',
      lat,
      lon,
      updatedAt: Date.now(),
    };
  }

  getDutyPilotPosition() {
    if (!this.dutyPilotPosition || Date.now() - this.dutyPilotPosition.updatedAt > LANDED_TTL_MS) {
      return { available: false };
    }
    return { available: true, ...this.dutyPilotPosition };
  }

  async getLaunchSite(): Promise<LaunchSiteInfo> {
    if (this.flightService) {
      for (const flight of this.flightService.flights.values()) {
        if (flight.status === 'recording' && flight.siteName) {
          const site = await queryOne<{ id: string; name: string; lat: number; lon: number }>(
            "SELECT id, name, lat, lon FROM sites WHERE id = $1",
            [flight.siteId || '']
          );
          if (site?.lat != null && site?.lon != null) {
            return { available: true, name: site.name, lat: site.lat, lon: site.lon };
          }
        }
      }
      for (const flight of this.flightService.flights.values()) {
        if (flight.siteName) {
          const site = await queryOne<{ id: string; name: string; lat: number; lon: number }>(
            "SELECT id, name, lat, lon FROM sites WHERE id = $1",
            [flight.siteId || '']
          );
          if (site?.lat != null && site?.lon != null) {
            return { available: true, name: site.name, lat: site.lat, lon: site.lon };
          }
        }
      }
    }
    return {
      available: true,
      name: 'Mt Elliot',
      lat: -36.18041,
      lon: 147.98305,
    };
  }

  async createRetrievalForPilot(pilotId: string, pilotName: string, pilotLat: number | null, pilotLon: number | null, flightId: string): Promise<void> {
    const hasActive = Array.from(this.retrievals.values()).some(
      r => r.pilotId === pilotId && (r.status === 'awaiting' || r.status === 'claimed')
    );
    if (hasActive) return;

    const retrievalId = crypto.randomUUID();
    const retrieval: Retrieval = {
      id: retrievalId,
      pilotId,
      pilotName,
      pilotLat,
      pilotLon,
      pilotUpdatedAt: Date.now(),
      driverId: null,
      driverName: null,
      driverLat: null,
      driverLon: null,
      driverUpdatedAt: null,
      status: 'awaiting',
      flightId,
      createdAt: new Date().toISOString(),
      completedAt: null,
      claimedAt: null,
      etaMinutes: null,
    };
    this.retrievals.set(retrievalId, retrieval);
    log.info(`Demo retrieval created for pilot ${pilotId}`);
    this.broadcastUpdate();
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

  clear() {
    this.retrievals.clear();
    this.driverPositions.clear();
    this.driverEtaLastCalc.clear();
    this.activeRecalcs.clear();
    this.dutyPilotPosition = null;
    for (const client of this.sseClients) {
      try { client.res.end(); } catch { log.warn("Error ending SSE client in clear()"); }
    }
    this.sseClients.clear();
  }

  private _doBroadcast() {
    const active = Array.from(this.retrievals.values()).filter(
      r => r.status === 'awaiting' || r.status === 'claimed'
    );
    if (this.sseClients.size === 0) return;
    const data = JSON.stringify({ type: 'retrievals', data: active });
    for (const client of this.sseClients) {
      try {
        client.res.write(`data: ${data}\n\n`);
      } catch {
        log.warn("Removed broken SSE client during demo broadcast");
        this.sseClients.delete(client);
      }
    }
  }

  private async recalcDriverETAs(driverId: string, driverLat: number, driverLon: number) {
    if (this.activeRecalcs.has(driverId)) return;
    this.activeRecalcs.add(driverId);
    const start = Date.now();
    try {
      const claimed = Array.from(this.retrievals.values())
        .filter(r => r.driverId === driverId && r.status === 'claimed' && r.pilotLat != null && r.pilotLon != null)
        .sort((a, b) => (a.claimedAt || 0) - (b.claimedAt || 0));

      if (claimed.length === 0) return;

      const pilots = claimed.map(r => ({ pilotId: r.pilotId, lat: r.pilotLat!, lon: r.pilotLon! }));
      const etas = await calculateSequentialETAs({ lat: driverLat, lon: driverLon }, pilots);

      for (const eta of etas) {
        const retrieval = claimed.find(r => r.pilotId === eta.pilotId);
        if (retrieval) retrieval.etaMinutes = eta.etaMinutes;
      }
      const elapsed = Date.now() - start;
      if (elapsed > 3000) {
        log.info(`Demo ETA recalc for driver ${driverId}: ${elapsed}ms, ${claimed.length} pilots`);
      }
    } finally {
      this.activeRecalcs.delete(driverId);
    }
  }
}
