import { Router } from "express";
import { requirePilotAuth } from "./pilotAuth.js";
import { requireDemoAuth, requireDemoSession } from "./demo/state.js";
import { isDemoRequest } from "../services/index.js";
import asyncHandler from "../utils/asyncHandler.js";
import type { Services } from "../services/types.js";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  if (isDemoRequest(req)) {
    return requireDemoSession(req, res, () => requireDemoAuth(req, res, next));
  }
  return requirePilotAuth(req, res, next);
}

router.post(
  "/",
  requireAuth,
  asyncHandler(async (req: any, res) => {
    const svc = (req.services as Services).messages;
    const { recipientPilotId, recipientName, message } = req.body;
    const result = await svc.sendMessage(req.pilot, recipientPilotId, recipientName, message);
    if ('error' in result) {
      const err = result as { error: string; status: number };
      return res.status(err.status).json({ error: err.error });
    }
    res.json(result);
  })
);

router.get(
  "/inbox",
  requireAuth,
  asyncHandler(async (req: any, res) => {
    const svc = (req.services as Services).messages;
    const pilotId = String(req.pilot.id);
    res.json(await svc.getInbox(pilotId));
  })
);

router.patch(
  "/:id/thumbsup",
  requireAuth,
  asyncHandler(async (req: any, res) => {
    const svc = (req.services as Services).messages;
    const result = await svc.thumbsUp(req.params.id, String(req.pilot.id));
    if (!result.ok) {
      return res.status(result.status || 500).json({ error: result.error });
    }
    res.json({ ok: true });
  })
);

router.patch(
  "/:id/thumbsdown",
  requireAuth,
  asyncHandler(async (req: any, res) => {
    const svc = (req.services as Services).messages;
    const result = await svc.thumbsDown(req.params.id, String(req.pilot.id));
    if (!result.ok) {
      return res.status(result.status || 500).json({ error: result.error });
    }
    res.json({ ok: true });
  })
);

router.patch(
  "/:id/delivered",
  requireAuth,
  asyncHandler(async (req: any, res) => {
    const svc = (req.services as Services).messages;
    const result = await svc.markDelivered(req.params.id, String(req.pilot.id));
    if (!result.ok) {
      return res.status(result.status || 500).json({ error: result.error });
    }
    res.json({ ok: true });
  })
);

export default router;
