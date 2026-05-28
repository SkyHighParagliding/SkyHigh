import { Router } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { query, queryOne, execute } from "../pg.js";
import asyncHandler from "../utils/asyncHandler.js";
import createLogger from "../utils/logger.js";
import { requireAuth, isDevBypassActive } from "../middleware/auth.js";
import { DEMO_TOKENS, requireDemoSession } from "./demo/state.js";
import { buildSafeUpdateClauses } from "../utils/sqlBuilder.js";

const log = createLogger("pilot-auth");
const router = Router();

interface PilotRow {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  firstName: string;
  lastName: string;
  garminMapshare: string | null;
  spotFeedId: string | null;
  zoleoImei: string | null;
}

interface SessionRow {
  token: string;
  createdAt: string;
  pilotId: string;
  id: string;
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  garminMapshare: string | null;
  spotFeedId: string | null;
  zoleoImei: string | null;
  sessionCreatedAt: string;
}

const PILOT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const pilotRateLimitMap = new Map<string, { count: number; resetAt: number }>();
const PILOT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const PILOT_RATE_LIMIT_MAX = 10;

// Clean up expired entries every 30 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of pilotRateLimitMap.entries()) {
    if (now > entry.resetAt) {
      pilotRateLimitMap.delete(key);
    }
  }
}, 30 * 1000);

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
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
    
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({ error: "Password must contain at least 8 characters including uppercase, lowercase, number and special character" });
    }

    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM pilots WHERE email = $1`,
      [email.toLowerCase().trim()]
    );
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

    await execute(
      `INSERT INTO pilots (id, email, "passwordHash", name, "firstName", "lastName", "garminMapshare", "spotFeedId", "zoleoImei") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, email.toLowerCase().trim(), passwordHash, fullName, fName, lName, garminMs, spotFi, zoleoIm]
    );

    const token = crypto.randomBytes(32).toString("hex");
    await execute(
      `INSERT INTO pilot_sessions (token, "pilotId") VALUES ($1, $2)`,
      [token, id]
    );

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

    const pilot = await queryOne<PilotRow>(
      `SELECT * FROM pilots WHERE email = $1`,
      [email.toLowerCase().trim()]
    );
    
    // To prevent timing attacks, always execute bcrypt.compare
    // If pilot doesn't exist, compare against a dummy hash
    const valid = pilot 
      ? await bcrypt.compare(password, pilot.passwordHash) 
      : await bcrypt.compare(password, "$2a$10$NQzLK6bd4dMebI7JWyG8.ebg5WI6lu4GlFQq2Ha/ZkIZb0yxnYRVu");
      
    if (!valid || !pilot) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    await execute(
      `INSERT INTO pilot_sessions (token, "pilotId") VALUES ($1, $2)`,
      [token, pilot.id]
    );

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

    const session = await queryOne<SessionRow>(
      `SELECT pilot_sessions.token, pilot_sessions."createdAt" as "sessionCreatedAt",
              pilots.id, pilots.email, pilots.name, pilots."firstName", pilots."lastName",
              pilots."garminMapshare", pilots."spotFeedId", pilots."zoleoImei"
       FROM pilot_sessions
       JOIN pilots ON pilot_sessions."pilotId" = pilots.id
       WHERE pilot_sessions.token = $1`,
      [token]
    );

    if (!session) {
      return res.status(401).json({ error: "Invalid session" });
    }

    const sessionAge = Date.now() - new Date(session.sessionCreatedAt).getTime();
    if (sessionAge > PILOT_SESSION_TTL_MS) {
      await execute(`DELETE FROM pilot_sessions WHERE token = $1`, [token]);
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
      await execute(`DELETE FROM pilot_sessions WHERE token = $1`, [token]);
    }
    res.json({ ok: true });
  })
);

export async function requirePilotAuth(req: any, res: any, next: any) {
  if (isDevBypassActive()) {
    req.pilot = { id: 0, email: "dev@localhost", name: "Dev Pilot", firstName: "Dev", lastName: "Pilot", garminMapshare: null, spotFeedId: null, zoleoImei: null };
    return next();
  }

  const token = req.headers["x-pilot-token"] || req.headers.authorization?.replace("Bearer ", ""); // Only accept from headers, not query
  if (!token) {
    return res.status(401).json({ error: "Pilot not authenticated" });
  }

  const session = await queryOne<SessionRow>(
    `SELECT pilot_sessions.token, pilot_sessions."createdAt" as "sessionCreatedAt",
            pilots.id, pilots.email, pilots.name, pilots."firstName", pilots."lastName",
            pilots."garminMapshare", pilots."spotFeedId", pilots."zoleoImei"
     FROM pilot_sessions
     JOIN pilots ON pilot_sessions."pilotId" = pilots.id
     WHERE pilot_sessions.token = $1`,
    [token]
  );

  if (!session) {
    return res.status(401).json({ error: "Invalid pilot session" });
  }

  const sessionAge = Date.now() - new Date(session.sessionCreatedAt).getTime();
  if (sessionAge > PILOT_SESSION_TTL_MS) {
    await execute(`DELETE FROM pilot_sessions WHERE token = $1`, [token]);
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

  const session = await queryOne<SessionRow>(
    `SELECT pilot_sessions.token, pilot_sessions."createdAt" as "sessionCreatedAt",
            pilots.id, pilots.email, pilots.name, pilots."firstName", pilots."lastName",
            pilots."garminMapshare", pilots."spotFeedId", pilots."zoleoImei"
     FROM pilot_sessions
     JOIN pilots ON pilot_sessions."pilotId" = pilots.id
     WHERE pilot_sessions.token = $1`,
    [token]
  );

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

    const session = await queryOne<{ pilotId: string; sessionCreatedAt: string }>(
      `SELECT pilot_sessions."pilotId", pilot_sessions."createdAt" as "sessionCreatedAt"
       FROM pilot_sessions WHERE token = $1`,
      [token]
    );

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

    const updateClauses: Array<{ column: string; value: any }> = [];
    if (cleanMapshare !== undefined) updateClauses.push({ column: "garminMapshare", value: cleanMapshare });
    if (cleanSpotFeed !== undefined) updateClauses.push({ column: "spotFeedId", value: cleanSpotFeed });
    if (cleanZoleoImei !== undefined) updateClauses.push({ column: "zoleoImei", value: cleanZoleoImei });

    if (updateClauses.length > 0) {
      const allowedColumns = ["garminMapshare", "spotFeedId", "zoleoImei"];
      const { sql, params } = buildSafeUpdateClauses(updateClauses, allowedColumns);
      params.push(session.pilotId);
      await execute(`UPDATE pilots SET ${sql} WHERE id = $${params.length}`, params);
    }

    const pilot = await queryOne<PilotRow>(
      `SELECT id, email, name, "firstName", "lastName", "garminMapshare", "spotFeedId", "zoleoImei" FROM pilots WHERE id = $1`,
      [session.pilotId]
    );

    if (!pilot) {
      return res.status(404).json({ error: "Pilot not found" });
    }

    log.info(`Pilot ${session.pilotId} updated satellite tracker settings`);
    res.json({ pilot: { ...pilot, garminMapshare: pilot.garminMapshare || null, spotFeedId: pilot.spotFeedId || null, zoleoImei: pilot.zoleoImei || null } });
  })
);

router.get(
  "/stats",
  requireAuth,
  asyncHandler(async (req, res) => {
    const pilotsResult = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int as count FROM pilots`
    );
    const flightsResult = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int as count FROM flights`
    );
    const pilots = pilotsResult?.count ?? 0;
    const flights = flightsResult?.count ?? 0;
    res.json({ pilots, flights });
  })
);

export default router;
