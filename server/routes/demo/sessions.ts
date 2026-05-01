import { Router } from "express";
import crypto from "crypto";
import {
  log, generateDemoTokens,
  activeDemoSession, demoSessionExpiry, demoPilotCount, demoDriverCount,
  setSessionState,
} from "./state.js";
import { clearDemoState } from "../../services/index.js";

const router = Router();

router.post("/session/start", (req: any, res) => {
  const reqPilots = Math.max(1, Math.min(30, Number(req.body?.pilotCount) || 2));
  const reqDrivers = Math.max(1, Math.min(10, Number(req.body?.driverCount) || 2));

  if (activeDemoSession && Date.now() < demoSessionExpiry && reqPilots === demoPilotCount && reqDrivers === demoDriverCount) {
    log.info(`Demo session reused: ${activeDemoSession}`);
    return res.json({ sessionId: activeDemoSession, pilotCount: demoPilotCount, driverCount: demoDriverCount });
  }

  const sessionId = crypto.randomUUID();
  clearDemoState();
  setSessionState({
    session: sessionId,
    expiry: Date.now() + 2 * 60 * 60 * 1000,
    pilots: reqPilots,
    drivers: reqDrivers,
  });
  generateDemoTokens(reqPilots, reqDrivers);

  log.info(`Demo session started: ${sessionId}, pilots=${reqPilots}, drivers=${reqDrivers}`);
  res.json({ sessionId, pilotCount: reqPilots, driverCount: reqDrivers });
});

router.post("/reset", (_req, res) => {
  setSessionState({ session: null, expiry: 0, pilots: 2, drivers: 2 });
  clearDemoState();
  log.info("Demo state reset");
  res.json({ ok: true });
});

router.get("/session/status", (req: any, res) => {
  const sessionId = req.headers['x-demo-session'] || req.query?.demoSession;
  if (!activeDemoSession || activeDemoSession !== sessionId || Date.now() > demoSessionExpiry) {
    return res.status(410).json({ error: "Session expired or invalid" });
  }
  res.json({ ok: true, sessionId: activeDemoSession });
});

router.get("/config", (_req, res) => {
  res.json({ pilotCount: demoPilotCount, driverCount: demoDriverCount });
});

export default router;
