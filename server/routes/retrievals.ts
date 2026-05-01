import { Router } from "express";
import asyncHandler from "../utils/asyncHandler.js";
import { requirePilotAuth } from "./pilotAuth.js";
import { requireDemoAuth, requireDemoSession } from "./demo/state.js";
import { isDemoRequest } from "../services/index.js";
import type { Services } from "../services/types.js";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  if (isDemoRequest(req)) {
    return requireDemoSession(req, res, () => requireDemoAuth(req, res, next));
  }
  return requirePilotAuth(req, res, next);
}

router.get(
  "/events",
  requireAuth,
  (req: any, res) => {
    const svc = (req.services as Services).retrievals;
    const isDemo = isDemoRequest(req);
    const role = isDemo ? req.pilot.id : (req.query.role === 'pilot' ? 'pilot' : 'driver');
    const pilotId = (!isDemo && role === 'pilot') ? req.pilot.id : undefined;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('data: {"type":"connected"}\n\n');

    const client = { res, pilotId, role };
    svc.addSseClient(client);

    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 30000);

    req.on('close', () => {
      clearInterval(heartbeat);
      svc.removeSseClient(client);
    });
  }
);

router.post(
  "/request",
  requireAuth,
  asyncHandler(async (req: any, res) => {
    const svc = (req.services as Services).retrievals;
    const { lat, lon, flightId } = req.body;
    const result = svc.requestRetrieval(req.pilot, lat ?? null, lon ?? null, flightId);
    res.json(result);
  })
);

router.get(
  "/unretrieved",
  requireAuth,
  asyncHandler(async (_req: any, res) => {
    const svc = (_req.services as Services).retrievals;
    const rows = svc.getUnretrieved();
    res.json(rows);
  })
);

router.post(
  "/claim/:pilotId",
  requireAuth,
  asyncHandler(async (req: any, res) => {
    const svc = (req.services as Services).retrievals;
    const result = svc.claimRetrieval(req.params.pilotId, req.pilot);
    if (!result.ok) {
      return res.status(result.status || 500).json({ error: result.error });
    }
    res.json({ ok: true });
  })
);

router.post(
  "/unclaim/:pilotId",
  requireAuth,
  asyncHandler(async (req: any, res) => {
    const svc = (req.services as Services).retrievals;
    const result = svc.unclaimRetrieval(req.params.pilotId, req.pilot);
    if (!result.ok) {
      return res.status(result.status || 500).json({ error: result.error });
    }
    res.json({ ok: true });
  })
);

router.post(
  "/complete/:pilotId",
  requireAuth,
  asyncHandler(async (req: any, res) => {
    const svc = (req.services as Services).retrievals;
    const result = svc.completeRetrieval(req.params.pilotId, req.pilot);
    if (!result.ok) {
      return res.status(result.status || 500).json({ error: result.error });
    }
    res.json({ ok: true });
  })
);

router.post(
  "/driver-position",
  requireAuth,
  asyncHandler(async (req: any, res) => {
    const svc = (req.services as Services).retrievals;
    const { lat, lon } = req.body;

    if (typeof lat !== "number" || typeof lon !== "number" ||
        !isFinite(lat) || !isFinite(lon) ||
        lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return res.status(400).json({ error: "Valid lat (-90..90) and lon (-180..180) required" });
    }

    const result = await svc.updateDriverPosition(req.pilot, lat, lon);
    res.json(result);
  })
);

router.get(
  "/driver-positions",
  requireAuth,
  asyncHandler(async (req: any, res) => {
    const svc = (req.services as Services).retrievals;
    res.json(svc.getDriverPositions());
  })
);

router.post(
  "/pilot-position",
  requireAuth,
  asyncHandler(async (req: any, res) => {
    const svc = (req.services as Services).retrievals;
    const { lat, lon } = req.body;

    if (typeof lat !== "number" || typeof lon !== "number" ||
        !isFinite(lat) || !isFinite(lon) ||
        lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return res.status(400).json({ error: "Valid lat (-90..90) and lon (-180..180) required" });
    }

    const result = svc.updatePilotPosition(req.pilot, lat, lon);
    res.json(result);
  })
);

router.get(
  "/status/:pilotId",
  requireAuth,
  asyncHandler(async (req: any, res) => {
    const svc = (req.services as Services).retrievals;
    const result = svc.getRetrievalStatus(req.params.pilotId, req.pilot.id);
    if ('error' in result) {
      const err = result as { error: string; status: number };
      return res.status(err.status).json({ error: err.error });
    }
    res.json(result);
  })
);

router.post(
  "/duty-pilot-position",
  requireAuth,
  asyncHandler(async (req: any, res) => {
    const svc = (req.services as Services).retrievals;
    const { lat, lon } = req.body;

    if (typeof lat !== "number" || typeof lon !== "number" ||
        !isFinite(lat) || !isFinite(lon) ||
        lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return res.status(400).json({ error: "Valid lat (-90..90) and lon (-180..180) required" });
    }

    if (isDemoRequest(req) && !req.pilot.id.startsWith('demo-duty-')) {
      return res.status(403).json({ error: "Only duty pilots can update duty position" });
    }
    svc.updateDutyPilotPosition(req.pilot, lat, lon);
    res.json({ ok: true });
  })
);

router.get(
  "/duty-pilot-position",
  requireAuth,
  asyncHandler(async (req: any, res) => {
    const svc = (req.services as Services).retrievals;
    res.json(svc.getDutyPilotPosition());
  })
);

router.get(
  "/launch-site",
  requireAuth,
  asyncHandler(async (req: any, res) => {
    const svc = (req.services as Services).retrievals;
    res.json(svc.getLaunchSite());
  })
);

export default router;
