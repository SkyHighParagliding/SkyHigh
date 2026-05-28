import { Router } from "express";
import crypto from "crypto";
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

// ── SSE Ticket Exchange ──────────────────────────────────────────────
// Short-lived tickets let EventSource connections authenticate without
// putting bearer tokens in URL query parameters.

interface SseTicket {
  token: string;
  role: string;
  isDemo: boolean;
  demoSession?: string;
  expiresAt: number;
}

const sseTickets = new Map<string, SseTicket>();
const TICKET_TTL_MS = 30_000;

// Clean up expired tickets every 15 seconds
const ticketCleanup = setInterval(() => {
  const now = Date.now();
  for (const [id, t] of sseTickets) {
    if (t.expiresAt < now) sseTickets.delete(id);
  }
}, 15_000);

// Allow the cleanup interval to be cleared for testing / graceful shutdown
if (typeof process !== "undefined" && process?.on) {
  process.on("exit", () => clearInterval(ticketCleanup));
}

router.get(
  "/sse-ticket",
  requireAuth,
  (req: any, res) => {
    const token = req.headers["x-pilot-token"] || req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const isDemo = isDemoRequest(req);
    const ticket = crypto.randomBytes(16).toString("hex");
    sseTickets.set(ticket, {
      token,
      role: (req.query.role as string) || (isDemo ? req.pilot?.id : "pilot"),
      isDemo,
      demoSession: isDemo ? (req.headers["x-demo-session"] as string) : undefined,
      expiresAt: Date.now() + TICKET_TTL_MS,
    });
    res.json({ ticket });
  }
);

// ── SSE Events with ticket support ────────────────────────────────

router.get(
  "/events",
  // Ticket middleware runs BEFORE requireAuth — restores auth headers
  (req: any, _res: any, next: any) => {
    const ticketId = req.query.ticket as string | undefined;
    if (ticketId) {
      const data = sseTickets.get(ticketId);
      if (!data || data.expiresAt < Date.now()) {
        if (data) sseTickets.delete(ticketId);
        // Fall through to requireAuth which will return 401
        return next();
      }
      sseTickets.delete(ticketId); // Single-use
      // Restore auth context so the normal middleware can validate
      req.headers["x-pilot-token"] = data.token;
      if (data.isDemo) {
        req.headers["x-demo"] = "true";
        if (data.demoSession) req.headers["x-demo-session"] = data.demoSession;
      }
      // Save role so the handler doesn't need query.role
      req.sseTicketRole = data.role;
    }
    next();
  },
  requireAuth,
  (req: any, res) => {
    const svc = (req.services as Services).retrievals;
    const isDemo = isDemoRequest(req);
    // Use ticket-stored role if available (avoids requiring query.role in ticket mode)
    const role = req.sseTicketRole || (isDemo ? req.pilot.id : (req.query.role === 'pilot' ? 'pilot' : 'driver'));
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
    req.on('end', () => {
      clearInterval(heartbeat);
      svc.removeSseClient(client);
    });
    res.on('error', () => {
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
    const result = await svc.requestRetrieval(req.pilot, lat ?? null, lon ?? null, flightId);
    res.json(result);
  })
);

router.get(
  "/unretrieved",
  requireAuth,
  asyncHandler(async (_req: any, res) => {
    const svc = (_req.services as Services).retrievals;
    const rows = await svc.getUnretrieved();
    res.json(rows);
  })
);

router.post(
  "/claim/:pilotId",
  requireAuth,
  asyncHandler(async (req: any, res) => {
    const svc = (req.services as Services).retrievals;
    const result = await svc.claimRetrieval(req.params.pilotId, req.pilot);
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
    const result = await svc.unclaimRetrieval(req.params.pilotId, req.pilot);
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
    const result = await svc.completeRetrieval(req.params.pilotId, req.pilot);
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

    const result = await svc.updatePilotPosition(req.pilot, lat, lon);
    res.json(result);
  })
);

router.get(
  "/status/:pilotId",
  requireAuth,
  asyncHandler(async (req: any, res) => {
    const svc = (req.services as Services).retrievals;
    const result = await svc.getRetrievalStatus(req.params.pilotId, req.pilot.id);
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
    res.json(await svc.getLaunchSite());
  })
);

export default router;
