import { Request, Response, NextFunction } from "express";
import db from "../db.js";

async function getSessionTtlMs(): Promise<number> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ?").get("cacheAdminSessionTtl") as { value: string } | undefined;
  const hours = parseInt(row?.value || "24", 10);
  return hours * 60 * 60 * 1000;
}

export function isDevBypassActive(): boolean {
  return process.env.DEV_BYPASS_AUTH?.toLowerCase() === "true";
}

const DEV_ADMIN_USER = { id: 0, name: "Dev Admin", email: "dev@localhost", isAdmin: true, isSafetyCommittee: false, soAuthorised: false, soSiteId: null };

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (isDevBypassActive()) {
    (req as any).user = DEV_ADMIN_USER;
    return next();
  }

  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const session = await db.prepare(`
    SELECT admin_sessions.token, admin_sessions.createdAt, admin_sessions.soSiteId,
           contacts.id, contacts.name, contacts.email,
           contacts.isAdmin, contacts.isSafetyCommittee, contacts.soAuthorised
    FROM admin_sessions
    JOIN contacts ON admin_sessions.userId = contacts.id
    WHERE admin_sessions.token = ? AND contacts.isAdmin = 1
  `).get(token) as any;

  if (!session) {
    return res.status(401).json({ error: "Invalid session" });
  }

  if (session.soSiteId) {
    return res.status(403).json({ error: "SO-restricted session cannot access admin endpoints. Use Admin Duties to switch." });
  }

  const sessionAge = Date.now() - new Date(session.createdAt).getTime();
  const sessionTtlMs = await getSessionTtlMs();
  if (sessionAge > sessionTtlMs) {
    await db.prepare("DELETE FROM admin_sessions WHERE token = ?").run(token);
    return res.status(401).json({ error: "Session expired" });
  }

  (req as any).user = { id: session.id, name: session.name, email: session.email };
  next();
}

export async function requireSOOrAdmin(req: Request, res: Response, next: NextFunction) {
  if (isDevBypassActive()) {
    (req as any).user = DEV_ADMIN_USER;
    return next();
  }

  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const session = await db.prepare(`
    SELECT admin_sessions.token, admin_sessions.createdAt, admin_sessions.soSiteId,
           contacts.id, contacts.name, contacts.email,
           contacts.isAdmin, contacts.isSafetyCommittee, contacts.soAuthorised
    FROM admin_sessions
    JOIN contacts ON admin_sessions.userId = contacts.id
    WHERE admin_sessions.token = ? AND (contacts.isAdmin = 1 OR (contacts.soAuthorised = 1 AND contacts.isSafetyCommittee = 1))
  `).get(token) as any;

  if (!session) {
    return res.status(401).json({ error: "Invalid session" });
  }

  const sessionAge = Date.now() - new Date(session.createdAt).getTime();
  const sessionTtlMs = await getSessionTtlMs();
  if (sessionAge > sessionTtlMs) {
    await db.prepare("DELETE FROM admin_sessions WHERE token = ?").run(token);
    return res.status(401).json({ error: "Session expired" });
  }

  (req as any).user = {
    id: session.id,
    name: session.name,
    email: session.email,
    isAdmin: !!session.isAdmin,
    isSafetyCommittee: !!session.isSafetyCommittee,
    soAuthorised: !!session.soAuthorised,
    soSiteId: session.soSiteId || null,
  };
  next();
}

export async function cleanExpiredSessions() {
  const sessionTtlMs = await getSessionTtlMs();
  const cutoff = new Date(Date.now() - sessionTtlMs).toISOString();
  await db.prepare("DELETE FROM admin_sessions WHERE createdAt < ?").run(cutoff);
}
