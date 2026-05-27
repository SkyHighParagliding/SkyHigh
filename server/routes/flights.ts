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
        pilotPos?.lat || null,
        pilotPos?.lon || null,
        req.params.id
      );
    }

    res.json({ ok: true });
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
