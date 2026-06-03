import { Router } from "express";
import asyncHandler from "../utils/asyncHandler.js";
import { optionalPilotAuth, requirePilotAuth } from "./pilotAuth.js";
import { optionalDemoAuth, requireDemoAuth, requireDemoSession } from "./demo/state.js";
import { isDemoRequest } from "../services/index.js";
import type { Services } from "../services/types.js";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  if (isDemoRequest(req)) {
    return requireDemoSession(req, res, () => requireDemoAuth(req, res, next));
  }
  return requirePilotAuth(req, res, next);
}

function optionalAuth(req: any, res: any, next: any) {
  if (isDemoRequest(req)) {
    return requireDemoSession(req, res, () => optionalDemoAuth(req, res, next));
  }
  return optionalPilotAuth(req, res, next);
}

router.post(
  "/",
  optionalAuth,
  asyncHandler(async (req: any, res) => {
    const svc = (req.services as Services).flights;
    const { siteId, siteName, sessionToken } = req.body;
    const pilotId = req.pilot?.id || null;
    const sToken = pilotId ? null : sessionToken || null;

    const flight = await svc.createFlight(pilotId, sToken, siteId, siteName);
    res.json({ id: flight.id, pilotId: flight.pilotId, sessionToken: flight.sessionToken, status: flight.status });
  })
);

router.post(
  "/:id/breadcrumbs",
  optionalAuth,
  asyncHandler(async (req: any, res) => {
    const svc = (req.services as Services).flights;
    const { breadcrumbs } = req.body;

    if (!Array.isArray(breadcrumbs) || breadcrumbs.length === 0) {
      return res.status(400).json({ error: "breadcrumbs array required" });
    }

    const sessionToken = req.headers["x-session-token"]; // Only accept from header, not query
    const result = await svc.addBreadcrumbs(req.params.id, breadcrumbs, req.pilot || null, sessionToken);
    if (!result) {
      return res.status(404).json({ error: "Flight not found" });
    }
    if ('error' in result && 'status' in result) {
      return res.status(result.status).json({ error: result.error });
    }
    res.json(result);
  })
);

router.post(
  "/position",
  requireAuth,
  asyncHandler(async (req: any, res) => {
    const svc = (req.services as Services).flights;
    const { lat, lon, altitude, speed, heading, verticalSpeed } = req.body;

    if (typeof lat !== "number" || typeof lon !== "number" ||
        !isFinite(lat) || !isFinite(lon) ||
        lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return res.status(400).json({ error: "Valid lat (-90..90) and lon (-180..180) required" });
    }

    svc.updatePosition(req.pilot, { lat, lon, altitude, speed, heading, verticalSpeed });
    res.json({ ok: true });
  })
);

router.get(
  "/live-pilots",
  requireAuth,
  asyncHandler(async (req: any, res) => {
    const svc = (req.services as Services).flights;
    const isDutyPilot = req.pilot.id.startsWith?.('demo-duty-') || false;
    const others = svc.getLivePilots(req.pilot.id, isDutyPilot);
    res.json(others);
  })
);

router.delete(
  "/position",
  requireAuth,
  asyncHandler(async (req: any, res) => {
    const svc = (req.services as Services).flights;
    svc.markLanded(req.pilot.id);
    res.json({ ok: true });
  })
);

router.put(
  "/:id/end",
  optionalAuth,
  asyncHandler(async (req: any, res) => {
    const svc = (req.services as Services).flights;
    const rSvc = (req.services as Services).retrievals;
    const { stats } = req.body;
    const sessionToken = req.headers["x-session-token"]; // Only accept from header, not query

    const result = await svc.endFlight(req.params.id, stats, req.pilot || null, sessionToken);
    if (!result.ok) {
      return res.status(result.status || 500).json({ error: result.error });
    }

    if (result.pilotId) {
      const pilotPos = svc.getPilotPosition(result.pilotId);
      await rSvc.createRetrievalForPilot(
        result.pilotId,
        result.pilotName || "Pilot",
        pilotPos?.lat ?? null,
        pilotPos?.lon ?? null,
        req.params.id
      );
    }

    res.json({ ok: true });
  })
);

router.get(
  "/export",
  optionalAuth,
  asyncHandler(async (req: any, res) => {
    const svc = (req.services as Services).flights;
    const pilotId = req.pilot?.id || null;
    
    let finalPilotId = pilotId;
    let finalSessionToken = req.headers["x-session-token"] || req.query.sessionToken || null;
    
    if (!finalPilotId && req.query.token) {
      const { queryOne } = await import("../pg.js");
      const session = await queryOne<{ pilotId: string }>(
        `SELECT "pilotId" FROM pilot_sessions WHERE token = $1`,
        [req.query.token as string]
      );
      if (session) {
        finalPilotId = session.pilotId;
      }
    }
    
    if (isDemoRequest(req) && !finalPilotId) {
      const demoToken = req.headers["x-pilot-token"] || req.headers.authorization?.replace("Bearer ", "") || req.query?.pilotToken || req.query?.token;
      const { DEMO_TOKENS } = await import("./demo/state.js");
      const demoPilot = demoToken ? DEMO_TOKENS[demoToken as string] : null;
      if (demoPilot) {
        finalPilotId = demoPilot.id;
      }
    }

    if (!finalPilotId && !finalSessionToken) {
      return res.status(401).json({ error: "Not authorized. Please login to export flights." });
    }

    const format = req.query.format;
    if (format !== "csv" && format !== "gpx") {
      return res.status(400).json({ error: "Invalid format. Use 'csv' or 'gpx'." });
    }

    const singleFlightId = req.query.flightId ? (req.query.flightId as string) : null;
    let flightsWithLanding = [];
    
    if (singleFlightId) {
      const flight = await svc.getFlight(singleFlightId);
      if (!flight) {
        return res.status(404).json({ error: "Flight not found" });
      }
      
      const isOwner = svc.verifyOwnership(flight, req.pilot || (finalPilotId ? { id: finalPilotId } : null) as any, finalSessionToken);
      if (!isOwner) {
        return res.status(403).json({ error: "Not authorized for this flight" });
      }
      
      let landingZone = "";
      if (flight.siteId) {
        const { queryOne } = await import("../pg.js");
        const site = await queryOne<{ landing: string }>(
          `SELECT landing FROM sites WHERE id = $1`,
          [flight.siteId]
        );
        if (site) {
          landingZone = site.landing;
        }
      }
      flightsWithLanding = [{ ...flight, landingZone }];
    } else {
      flightsWithLanding = await svc.listFlightsWithLanding(finalPilotId, finalSessionToken);
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const filename = `flights_export_${todayStr}.${format}`;

    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

      const headers = ["Date", "Site", "Distance (m)", "Landing Zone"];
      const rows = flightsWithLanding.map((f) => [
        f.startedAt ? new Date(f.startedAt).toISOString() : "",
        f.siteName || "",
        f.totalDistance !== undefined ? Math.round(f.totalDistance) : "",
        f.landingZone || "",
      ]);

      const escapeCSV = (val: any) => {
        const str = String(val ?? "");
        if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const csvContent = [
        headers.join(","),
        ...rows.map((row) => row.map(escapeCSV).join(",")),
      ].join("\r\n");

      return res.send(csvContent);
    }

    if (format === "gpx") {
      res.setHeader("Content-Type", "application/gpx+xml");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

      const flightIds = flightsWithLanding.map((f) => f.id);
      const breadcrumbs = await svc.getBreadcrumbsForFlights(flightIds);

      const crumbsByFlight = new Map<string, any[]>();
      for (const b of breadcrumbs) {
        if (!crumbsByFlight.has(b.flightId!)) {
          crumbsByFlight.set(b.flightId!, []);
        }
        crumbsByFlight.get(b.flightId!)!.push(b);
      }

      const gpxLines: string[] = [];
      gpxLines.push('<?xml version="1.0" encoding="UTF-8"?>');
      gpxLines.push('<gpx version="1.1" creator="SkyHigh Flight Tracker"');
      gpxLines.push('  xmlns="http://www.topografix.com/GPX/1/1">');

      for (const f of flightsWithLanding) {
        const crumbs = crumbsByFlight.get(f.id) || [];
        if (crumbs.length < 2) continue;

        gpxLines.push("  <trk>");
        const flightDate = f.startedAt ? new Date(f.startedAt).toLocaleDateString() : "";
        gpxLines.push(`    <name>${f.siteName || "Unknown Site"} - ${flightDate}</name>`);
        gpxLines.push("    <trkseg>");

        for (const b of crumbs) {
          const t = new Date(b.timestamp).toISOString();
          gpxLines.push(`      <trkpt lat="${b.lat}" lon="${b.lon}">`);
          gpxLines.push(`        <ele>${(b.altitude || 0).toFixed(1)}</ele>`);
          gpxLines.push(`        <time>${t}</time>`);
          gpxLines.push(`        <speed>${(b.speed || 0).toFixed(1)}</speed>`);
          gpxLines.push("      </trkpt>");
        }

        gpxLines.push("    </trkseg>");
        gpxLines.push("  </trk>");
      }

      gpxLines.push("</gpx>");
      return res.send(gpxLines.join("\n"));
    }
  })
);

router.get(
  "/:id",
  optionalAuth,
  asyncHandler(async (req: any, res) => {
    const svc = (req.services as Services).flights;
    const sessionToken = req.headers["x-session-token"]; // Only accept from header, not query
    const result = await svc.getFlightWithBreadcrumbs(req.params.id, req.pilot || null, sessionToken);
    if (!result) {
      return res.status(404).json({ error: "Flight not found" });
    }
    if ('error' in result && 'status' in result) {
      return res.status(result.status).json({ error: result.error });
    }
    res.json({ ...result.flight, breadcrumbs: result.breadcrumbs });
  })
);

router.get(
  "/",
  optionalAuth,
  asyncHandler(async (req: any, res) => {
    const svc = (req.services as Services).flights;
    const pilotId = req.pilot?.id || null;
    const sessionToken = req.headers["x-session-token"]; // Only accept from header, not query
    const flights = await svc.listFlights(pilotId, sessionToken);
    res.json(flights);
  })
);

router.delete(
  "/:id",
  optionalAuth,
  asyncHandler(async (req: any, res) => {
    const svc = (req.services as Services).flights;
    const sessionToken = req.headers["x-session-token"]; // Only accept from header, not query
    const result = await svc.deleteFlight(req.params.id, req.pilot || null, sessionToken);
    if (!result.ok) {
      return res.status(result.status || 500).json({ error: result.error });
    }
    res.json({ ok: true });
  })
);

export default router;
