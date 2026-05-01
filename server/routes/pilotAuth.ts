import { Router } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import db from "../db.js";
import asyncHandler from "../utils/asyncHandler.js";
import createLogger from "../utils/logger.js";
import { requireAuth, isDevBypassActive } from "../middleware/auth.js";
import { DEMO_TOKENS, requireDemoSession } from "./demo/state.js";

const log = createLogger("pilot-auth");
const router = Router();

const PILOT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const pilotRateLimitMap = new Map<string, { count: number; resetAt: number }>();
const PILOT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const PILOT_RATE_LIMIT_MAX = 10;

function checkPilotRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = pilotRateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    pilotRateLimitMap.set(key, { count: 1, resetAt: now + PILOT_RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= PILOT_RATE_LIMIT_MAX) {
    return false;
  }
  entry.count++;
  return true;
}

// pilot_sessions table is created by the consolidated PG migration

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const ip = req.ip || "unknown";
    if (!checkPilotRateLimit(`register:${ip}`)) {
      return res.status(429).json({ error: "Too many attempts. Please try again later." });
    }

    const { email, password, name, firstName, lastName } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const existing = await db.prepare("SELECT id FROM pilots WHERE email = ?").get(email.toLowerCase().trim());
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    const id = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);

    const fName = (firstName || name || "").trim();
    const lName = (lastName || "").trim();
    const fullName = [fName, lName].filter(Boolean).join(" ");

    const garminMs = (req.body.garminMapshare || "").trim() || null;
    const spotFi = (req.body.spotFeedId || "").trim() || null;
    const zoleoIm = (req.body.zoleoImei || "").trim() || null;

    await db.prepare("INSERT INTO pilots (id, email, passwordHash, name, firstName, lastName, garminMapshare, spotFeedId, zoleoImei) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      id,
      email.toLowerCase().trim(),
      passwordHash,
      fullName,
      fName,
      lName,
      garminMs,
      spotFi,
      zoleoIm
    );

    const token = crypto.randomBytes(32).toString("hex");
    await db.prepare("INSERT INTO pilot_sessions (token, pilotId) VALUES (?, ?)").run(token, id);

    log.info(`Pilot registered: ${email}`);
    res.json({ token, pilot: { id, email: email.toLowerCase().trim(), name: fullName, firstName: fName, lastName: lName, garminMapshare: garminMs, spotFeedId: spotFi, zoleoImei: zoleoIm } });
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const ip = req.ip || "unknown";
    if (!checkPilotRateLimit(`login:${ip}`)) {
      return res.status(429).json({ error: "Too many attempts. Please try again later." });
    }

    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const pilot = await db.prepare("SELECT * FROM pilots WHERE email = ?").get(email.toLowerCase().trim()) as any;
    if (!pilot) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const valid = await bcrypt.compare(password, pilot.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    await db.prepare("INSERT INTO pilot_sessions (token, pilotId) VALUES (?, ?)").run(token, pilot.id);

    log.info(`Pilot logged in: ${email}`);
    res.json({ token, pilot: { id: pilot.id, email: pilot.email, name: pilot.name, firstName: pilot.firstName, lastName: pilot.lastName, garminMapshare: pilot.garminMapshare || null, spotFeedId: pilot.spotFeedId || null, zoleoImei: pilot.zoleoImei || null } });
  })
);

router.get(
  "/me",
  asyncHandler(async (req: any, res) => {
    if (req.headers['x-demo'] === 'true' || req.query?.demo === 'true') {
      return requireDemoSession(req, res, () => {
        const demoToken = req.headers.authorization?.replace("Bearer ", "") || req.headers["x-pilot-token"];
        const demoPilot = demoToken ? DEMO_TOKENS[demoToken] : null;
        if (!demoPilot) return res.status(401).json({ error: "Invalid demo session" });
        return res.json({ pilot: demoPilot });
      });
    }

    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const session = await db
      .prepare(
        `SELECT pilot_sessions.token, pilot_sessions.createdAt as sessionCreatedAt,
                pilots.id, pilots.email, pilots.name, pilots.firstName, pilots.lastName,
                pilots.garminMapshare, pilots.spotFeedId, pilots.zoleoImei
         FROM pilot_sessions
         JOIN pilots ON pilot_sessions.pilotId = pilots.id
         WHERE pilot_sessions.token = ?`
      )
      .get(token) as any;

    if (!session) {
      return res.status(401).json({ error: "Invalid session" });
    }

    const sessionAge = Date.now() - new Date(session.sessionCreatedAt).getTime();
    if (sessionAge > PILOT_SESSION_TTL_MS) {
      await db.prepare("DELETE FROM pilot_sessions WHERE token = ?").run(token);
      return res.status(401).json({ error: "Session expired" });
    }

    res.json({ pilot: { id: session.id, email: session.email, name: session.name, firstName: session.firstName, lastName: session.lastName, garminMapshare: session.garminMapshare || null, spotFeedId: session.spotFeedId || null, zoleoImei: session.zoleoImei || null } });
  })
);

router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (token) {
      await db.prepare("DELETE FROM pilot_sessions WHERE token = ?").run(token);
    }
    res.json({ ok: true });
  })
);

export async function requirePilotAuth(req: any, res: any, next: any) {
  if (isDevBypassActive()) {
    req.pilot = { id: 0, email: "dev@localhost", name: "Dev Pilot", firstName: "Dev", lastName: "Pilot", garminMapshare: null, spotFeedId: null, zoleoImei: null };
    return next();
  }

  const token = req.headers["x-pilot-token"] || req.headers.authorization?.replace("Bearer ", "") || req.query?.pilotToken;
  if (!token) {
    return res.status(401).json({ error: "Pilot not authenticated" });
  }

  const session = await db
      .prepare(
      `SELECT pilot_sessions.token, pilot_sessions.createdAt as sessionCreatedAt,
              pilots.id, pilots.email, pilots.name, pilots.firstName, pilots.lastName,
              pilots.garminMapshare, pilots.spotFeedId, pilots.zoleoImei
       FROM pilot_sessions
       JOIN pilots ON pilot_sessions.pilotId = pilots.id
       WHERE pilot_sessions.token = ?`
    )
    .get(token) as any;

  if (!session) {
    return res.status(401).json({ error: "Invalid pilot session" });
  }

  const sessionAge = Date.now() - new Date(session.sessionCreatedAt).getTime();
  if (sessionAge > PILOT_SESSION_TTL_MS) {
    await db.prepare("DELETE FROM pilot_sessions WHERE token = ?").run(token);
    return res.status(401).json({ error: "Pilot session expired" });
  }

  req.pilot = { id: session.id, email: session.email, name: session.name, firstName: session.firstName, lastName: session.lastName, garminMapshare: session.garminMapshare || null, spotFeedId: session.spotFeedId || null, zoleoImei: session.zoleoImei || null };
  next();
}

export async function optionalPilotAuth(req: any, _res: any, next: any) {
  const token = req.headers["x-pilot-token"] || req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    req.pilot = null;
    return next();
  }

  const session = await db
      .prepare(
      `SELECT pilot_sessions.token, pilot_sessions.createdAt as sessionCreatedAt,
              pilots.id, pilots.email, pilots.name, pilots.firstName, pilots.lastName,
              pilots.garminMapshare, pilots.spotFeedId, pilots.zoleoImei
       FROM pilot_sessions
       JOIN pilots ON pilot_sessions.pilotId = pilots.id
       WHERE pilot_sessions.token = ?`
    )
    .get(token) as any;

  if (session) {
    const sessionAge = Date.now() - new Date(session.sessionCreatedAt).getTime();
    if (sessionAge <= PILOT_SESSION_TTL_MS) {
      req.pilot = { id: session.id, email: session.email, name: session.name, firstName: session.firstName, lastName: session.lastName, garminMapshare: session.garminMapshare || null, spotFeedId: session.spotFeedId || null, zoleoImei: session.zoleoImei || null };
    } else {
      req.pilot = null;
    }
  } else {
    req.pilot = null;
  }
  next();
}

router.put(
  "/profile",
  asyncHandler(async (req: any, res) => {
    const token = req.headers["x-pilot-token"] || req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const session = await db
      .prepare(
        `SELECT pilot_sessions.pilotId, pilot_sessions.createdAt as sessionCreatedAt
         FROM pilot_sessions WHERE token = ?`
      )
      .get(token) as any;

    if (!session) {
      return res.status(401).json({ error: "Invalid session" });
    }

    const sessionAge = Date.now() - new Date(session.sessionCreatedAt).getTime();
    if (sessionAge > PILOT_SESSION_TTL_MS) {
      return res.status(401).json({ error: "Session expired" });
    }

    const { garminMapshare, spotFeedId, zoleoImei } = req.body;
    const cleanMapshare = typeof garminMapshare === "string" ? garminMapshare.trim() || null : undefined;
    const cleanSpotFeed = typeof spotFeedId === "string" ? spotFeedId.trim() || null : undefined;
    const cleanZoleoImei = typeof zoleoImei === "string" ? zoleoImei.trim() || null : undefined;

    const updates: string[] = [];
    const params: any[] = [];
    if (cleanMapshare !== undefined) { updates.push("garminMapshare = ?"); params.push(cleanMapshare); }
    if (cleanSpotFeed !== undefined) { updates.push("spotFeedId = ?"); params.push(cleanSpotFeed); }
    if (cleanZoleoImei !== undefined) { updates.push("zoleoImei = ?"); params.push(cleanZoleoImei); }

    if (updates.length > 0) {
      params.push(session.pilotId);
      await db.prepare(`UPDATE pilots SET ${updates.join(", ")} WHERE id = ?`).run(...params);
    }

    const pilot = await db.prepare("SELECT id, email, name, firstName, lastName, garminMapshare, spotFeedId, zoleoImei FROM pilots WHERE id = ?").get(session.pilotId) as any;

    log.info(`Pilot ${session.pilotId} updated satellite tracker settings`);
    res.json({ pilot: { ...pilot, garminMapshare: pilot.garminMapshare || null, spotFeedId: pilot.spotFeedId || null, zoleoImei: pilot.zoleoImei || null } });
  })
);

router.get(
  "/stats",
  requireAuth,
  asyncHandler(async (req, res) => {
    const pilots = (await db.prepare("SELECT COUNT(*) as count FROM pilots").get() as any).count;
    const flights = (await db.prepare("SELECT COUNT(*) as count FROM flights").get() as any).count;
    res.json({ pilots, flights });
  })
);

export default router;
