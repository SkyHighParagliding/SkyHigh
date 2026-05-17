import { Router } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import db from "../db.js";
import { requireAuth, requireSOOrAdmin, isDevBypassActive } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";
import createLogger from "../utils/logger.js";
import { sendEmail } from "../utils/email.js";

const log = createLogger("auth");

const RESET_TOKEN_EXPIRY_HOURS = 24;

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }
  entry.count++;
  return true;
}

function haversineDistanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const SO_PROXIMITY_THRESHOLD_M = 500;
const router = Router();

const SALT_ROUNDS = 10;

function isHashed(password: string): boolean {
  return password.startsWith("$2a$") || password.startsWith("$2b$");
}

async function ensureDefaultAdmin(name: string, email: string, plainPassword: string) {
  try {
    const existing = await db.prepare("SELECT id FROM contacts WHERE email = ? AND isAdmin = 1").get(email);
    if (!existing) {
      const hashed = await bcrypt.hash(plainPassword, SALT_ROUNDS);
      const id = `con-${Math.random().toString(36).substr(2, 9)}`;
      const result = await db.prepare("INSERT OR IGNORE INTO contacts (id, name, email, password, isAdmin) VALUES (?, ?, ?, ?, 1)").run(id, name, email, hashed);
      if (result.changes > 0) {
        log.info(`Default admin contact created: ${email}`);
      } else {
        log.warn(`Default admin insert returned 0 changes for ${email} (account may already exist or constraint violation)`);
      }
    } else {
      log.info(`Default admin contact already exists: ${email}`);
    }
  } catch (err) {
    log.error(`Failed to ensure default admin ${email}:`, err instanceof Error ? err.message : String(err));
  }
}

// Initialize default admin accounts from environment configuration
(async () => {
  const defaultAdminsJson = process.env.DEFAULT_ADMINS;
  if (defaultAdminsJson) {
    try {
      const defaultAdmins = JSON.parse(defaultAdminsJson) as Array<{ name: string; email: string; password: string }>;
      for (const admin of defaultAdmins) {
        if (admin.name && admin.email && admin.password) {
          await ensureDefaultAdmin(admin.name, admin.email, admin.password);
        }
      }
    } catch (err) {
      log.error(`Failed to parse DEFAULT_ADMINS environment variable: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
})();

router.post("/login", asyncHandler(async (req, res) => {
  const { email, password, soLogin, soSiteId } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  let user: any;
  if (soLogin) {
    user = await db.prepare("SELECT * FROM contacts WHERE email = ? AND soAuthorised = 1 AND isSafetyCommittee = 1").get(email);
  } else {
    user = await db.prepare("SELECT * FROM contacts WHERE email = ? AND isAdmin = 1").get(email);
  }
  if (!user) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  let valid = false;
  if (isHashed(user.password)) {
    valid = await bcrypt.compare(password, user.password);
  } else if (process.env.ALLOW_PLAINTEXT_PASSWORDS === "true") {
    // Development-only: allow plaintext comparison and auto-migrate
    valid = password === user.password;
    if (valid) {
      const hashed = await bcrypt.hash(password, SALT_ROUNDS);
      await db.prepare("UPDATE contacts SET password = ? WHERE id = ?").run(hashed, user.id);
      log.warn(`PLAINTEXT PASSWORD ALLOWED (DEV MODE): Migrated password to bcrypt for user: ${email}`);
    }
  } else {
    // Production: reject plaintext passwords
    valid = false;
    log.warn(`Plaintext password attempted for user: ${email} (ALLOW_PLAINTEXT_PASSWORDS not enabled)`);
  }

  if (!valid) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = crypto.randomBytes(32).toString("hex");

  let boundSiteId: string | null = null;
  if (soLogin) {
    if (!soSiteId) {
      return res.status(400).json({ error: "SO login requires a site ID" });
    }
    const site = await db.prepare("SELECT id, lat, lon FROM sites WHERE id = ?").get(soSiteId) as any;
    if (!site) {
      return res.status(400).json({ error: "Invalid site ID" });
    }
    const { latitude, longitude } = req.body;
    if (site.lat && site.lon) {
      if (latitude == null || longitude == null) {
        return res.status(400).json({ error: "Location coordinates required for SO login" });
      }
      const dist = haversineDistanceM(latitude, longitude, parseFloat(site.lat), parseFloat(site.lon));
      if (dist > SO_PROXIMITY_THRESHOLD_M) {
        return res.status(403).json({ error: "You must be within proximity of the site to log in as SO" });
      }
    }
    boundSiteId = site.id;
  }

  await db.prepare("INSERT INTO admin_sessions (token, userId, createdAt, soSiteId) VALUES (?, ?, ?, ?)").run(
    token, user.id, new Date().toISOString(), boundSiteId
  );

  log.info(`User logged in: ${email}${boundSiteId ? ` (SO session for site: ${boundSiteId})` : ''}`);
  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      isSafetyCommittee: !!user.isSafetyCommittee,
      soAuthorised: !!user.soAuthorised,
      isAdmin: !!user.isAdmin,
    },
    soSiteId: boundSiteId,
  });
}));

router.post("/logout", async (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token) {
    await db.prepare("DELETE FROM admin_sessions WHERE token = ?").run(token);
  }
  res.json({ success: true });
});

router.get("/me", requireSOOrAdmin, async (req, res) => {
  const user = (req as any).user;
  const contact = await db.prepare("SELECT isSafetyCommittee, soAuthorised, isAdmin FROM contacts WHERE id = ?").get(user.id) as any;
  res.json({
    ...user,
    isSafetyCommittee: !!(contact?.isSafetyCommittee),
    soAuthorised: !!(contact?.soAuthorised),
    isAdmin: !!(contact?.isAdmin),
    soSiteId: user.soSiteId || null,
  });
});

router.post("/bind-so-session", requireSOOrAdmin, async (req, res) => {
  const user = (req as any).user;
  if (user.soSiteId) {
    return res.status(400).json({ error: "SO session already bound to a site. Log out and re-authenticate to change sites." });
  }
  if (!user.soAuthorised || !user.isSafetyCommittee) {
    return res.status(403).json({ error: "Only SO-authorised users can bind to a site" });
  }
  const { soSiteId, latitude, longitude } = req.body;
  if (!soSiteId) {
    return res.status(400).json({ error: "Site ID required" });
  }
  const site = await db.prepare("SELECT id, lat, lon FROM sites WHERE id = ?").get(soSiteId) as any;
  if (!site) {
    return res.status(400).json({ error: "Invalid site ID" });
  }
  if (site.lat && site.lon) {
    if (latitude == null || longitude == null) {
      return res.status(400).json({ error: "Location coordinates required" });
    }
    const dist = haversineDistanceM(latitude, longitude, parseFloat(site.lat), parseFloat(site.lon));
    if (dist > SO_PROXIMITY_THRESHOLD_M) {
      return res.status(403).json({ error: "You must be within proximity of the site" });
    }
  }
  const token = req.headers.authorization?.replace("Bearer ", "");
  await db.prepare("UPDATE admin_sessions SET soSiteId = ? WHERE token = ?").run(site.id, token);
  res.json({ success: true, soSiteId: site.id });
});

router.post("/elevate-to-admin", requireSOOrAdmin, async (req, res) => {
  const user = (req as any).user;
  if (!user.isAdmin) {
    return res.status(403).json({ error: "Not an admin user" });
  }
  const token = req.headers.authorization?.replace("Bearer ", "");
  await db.prepare("UPDATE admin_sessions SET soSiteId = NULL WHERE token = ?").run(token);
  res.json({ success: true });
});

router.get("/users", requireAuth, async (req, res) => {
  const users = await db.prepare("SELECT id, name, surname, email, createdAt FROM contacts WHERE isAdmin = 1 ORDER BY name ASC").all();
  res.json(users);
});

router.post("/users", requireAuth, asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email, and password are required" });
  }

  const existing = await db.prepare("SELECT id FROM contacts WHERE email = ? AND isAdmin = 1").get(email);
  if (existing) {
    return res.status(400).json({ error: "An admin with that email already exists" });
  }

  const hashed = await bcrypt.hash(password, SALT_ROUNDS);
  const id = `con-${Math.random().toString(36).substr(2, 9)}`;
  await db.prepare("INSERT INTO contacts (id, name, email, password, isAdmin) VALUES (?, ?, ?, ?, 1)").run(id, name, email, hashed);
  log.info(`New admin contact created: ${email}`);
  res.status(201).json({ success: true });
}));

router.delete("/users/:id", requireAuth, async (req, res) => {
  const adminCount = await db.prepare("SELECT COUNT(*) as count FROM contacts WHERE isAdmin = 1").get() as any;
  if (adminCount.count <= 1) {
    return res.status(400).json({ error: "Cannot delete the last admin user" });
  }

  const result = await db.prepare("UPDATE contacts SET isAdmin = 0, password = '' WHERE id = ? AND isAdmin = 1").run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: "User not found" });
  }

  await db.prepare("DELETE FROM admin_sessions WHERE userId = ?").run(req.params.id);
  res.json({ success: true });
});

async function sendPasswordResetEmail(contact: { id: string; name: string; surname?: string; email: string }, accountType: string = "contact") {
  await db.prepare("DELETE FROM password_reset_tokens WHERE contactId = ? AND accountType = ? AND usedAt IS NULL").run(contact.id, accountType);

  const token = crypto.randomBytes(32).toString("hex");
  const id = `prt-${Math.random().toString(36).substr(2, 9)}`;
  const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

  await db.prepare(
    "INSERT INTO password_reset_tokens (id, contactId, token, expiresAt, accountType) VALUES (?, ?, ?, ?, ?)"
  ).run(id, contact.id, token, expiresAt, accountType);

  const baseUrl = process.env.REPLIT_DEPLOYMENT_URL
    ? `https://${process.env.REPLIT_DEPLOYMENT_URL}`
    : process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : "https://sky-high-website.replit.app";
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;
  const displayName = [contact.name, contact.surname].filter(Boolean).join(" ");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="color: #1e3a5f; margin: 0;">SkyHigh Paragliding Club</h2>
        <p style="color: #666; font-size: 14px; margin: 4px 0 0;">Password Setup</p>
      </div>
      <p>Hi ${displayName},</p>
      <p>A password reset has been requested for your account. Click the button below to set a new password:</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${resetUrl}" style="background: #1e3a5f; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
          Set New Password
        </a>
      </div>
      <p style="font-size: 13px; color: #888;">This link expires in ${RESET_TOKEN_EXPIRY_HOURS} hours. If you didn't request this, you can safely ignore this email.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
      <p style="font-size: 12px; color: #aaa; text-align: center;">SkyHigh Paragliding Club</p>
    </div>
  `;

  const result = await sendEmail({
    to: contact.email,
    subject: "SkyHigh — Set Your Password",
    html,
  });

  if (!result.success) {
    await db.prepare("DELETE FROM password_reset_tokens WHERE id = ?").run(id);
    log.error(`Password reset email failed for ${contact.email}: ${result.error}`);
    return { success: false, error: result.error || "Failed to send email" };
  }

  log.info(`Password reset email sent to ${contact.email} (contact: ${contact.id})`);
  return { success: true };
}

router.post("/send-password-reset", requireAuth, asyncHandler(async (req, res) => {
  const { contactId } = req.body;
  if (!contactId) {
    return res.status(400).json({ error: "Contact ID required" });
  }

  const contact = await db.prepare(
    "SELECT id, name, surname, email, isAdmin, isCommittee, isSafetyCommittee FROM contacts WHERE id = ?"
  ).get(contactId) as any;

  if (!contact) {
    return res.status(404).json({ error: "Contact not found" });
  }

  if (!contact.isAdmin && !contact.isCommittee && !contact.isSafetyCommittee) {
    return res.status(400).json({ error: "Password reset only available for Admin, Committee, or Safety Committee members" });
  }

  if (!contact.email) {
    return res.status(400).json({ error: "Contact has no email address" });
  }

  const result = await sendPasswordResetEmail(contact);
  if (!result.success) {
    return res.status(500).json({ error: result.error });
  }

  res.json({ success: true, message: `Reset email sent to ${contact.email}` });
}));

router.post("/request-password-reset", asyncHandler(async (req, res) => {
  const { email, mode } = req.body;
  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Email is required" });
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (!checkRateLimit(`reset:${normalizedEmail}`)) {
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }

  const contact = await db.prepare(
    "SELECT id, name, surname, email, isAdmin, isCommittee, isSafetyCommittee FROM contacts WHERE LOWER(email) = ?"
  ).get(normalizedEmail) as any;

  if (!contact) {
    if (mode === "first-time") {
      return res.status(404).json({ error: "No account found — contact a committee member" });
    }
    return res.json({ success: true, message: "If an account exists with that email, a password reset link has been sent." });
  }

  const result = await sendPasswordResetEmail(contact);
  if (!result.success) {
    return res.status(500).json({ error: "Failed to send reset email. Please try again later." });
  }

  res.json({ success: true, message: "If an account exists with that email, a password reset link has been sent." });
}));

router.post("/register-provider", asyncHandler(async (req, res) => {
  const { name, email } = req.body;
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Name is required" });
  }
  if (!email || typeof email !== "string" || !email.trim()) {
    return res.status(400).json({ error: "Email is required" });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const trimmedName = name.trim();

  if (!checkRateLimit(`register:${normalizedEmail}`)) {
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }

  const existing = await db.prepare("SELECT id FROM contacts WHERE LOWER(email) = ?").get(normalizedEmail) as any;
  if (existing) {
    return res.status(400).json({ error: "An account with that email already exists. Try using 'Forgot password?' to reset your password." });
  }

  const nameParts = trimmedName.split(/\s+/);
  const firstName = nameParts[0];
  const surname = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

  const id = `con-${Math.random().toString(36).substr(2, 9)}`;
  await db.prepare(
    "INSERT INTO contacts (id, name, surname, email, isAdmin, isCommittee, isSafetyCommittee) VALUES (?, ?, ?, ?, 0, 0, 0)"
  ).run(id, firstName, surname, normalizedEmail);

  log.info(`New provider account created: ${normalizedEmail} (contact: ${id})`);

  const contact = { id, name: firstName, surname, email: normalizedEmail };
  const result = await sendPasswordResetEmail(contact);

  if (!result.success) {
    await db.prepare("DELETE FROM contacts WHERE id = ?").run(id);
    return res.status(500).json({ error: "Account created but failed to send setup email. Please try again." });
  }

  res.status(201).json({ success: true, message: "Account created! Check your email to set your password." });
}));

router.post("/send-pilot-password-reset", requireAuth, asyncHandler(async (req, res) => {
  const { pilotId } = req.body;
  if (!pilotId) return res.status(400).json({ error: "Pilot ID required" });

  const pilot = await db.prepare("SELECT id, firstName, lastName, email FROM pilots WHERE id = ?").get(pilotId) as any;
  if (!pilot) return res.status(404).json({ error: "Pilot not found" });
  if (!pilot.email) return res.status(400).json({ error: "Pilot has no email address" });

  const result = await sendPasswordResetEmail(
    { id: pilot.id, name: pilot.firstName, surname: pilot.lastName, email: pilot.email },
    "pilot"
  );
  if (!result.success) return res.status(500).json({ error: result.error });

  res.json({ success: true, message: `Reset email sent to ${pilot.email}` });
}));

router.post("/request-pilot-password-reset", asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== "string") return res.status(400).json({ error: "Email is required" });

  const normalizedEmail = email.trim().toLowerCase();
  if (!checkRateLimit(`pilot-reset:${normalizedEmail}`)) {
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }

  const pilot = await db.prepare("SELECT id, firstName, lastName, email FROM pilots WHERE email = ?").get(normalizedEmail) as any;
  if (pilot) {
    await sendPasswordResetEmail(
      { id: pilot.id, name: pilot.firstName, surname: pilot.lastName, email: pilot.email },
      "pilot"
    );
  }

  res.json({ success: true, message: "If an account exists with that email, a password reset link has been sent." });
}));

router.get("/validate-reset-token", asyncHandler(async (req, res) => {
  const { token } = req.query;
  if (!token || typeof token !== "string") {
    return res.status(400).json({ valid: false, error: "Token required" });
  }

  const record = await db.prepare(
    "SELECT prt.*, prt.accountType FROM password_reset_tokens prt WHERE prt.token = ?"
  ).get(token) as any;

  if (!record) {
    return res.status(404).json({ valid: false, error: "Invalid or expired reset link" });
  }

  if (record.usedAt) {
    return res.status(400).json({ valid: false, error: "This reset link has already been used" });
  }

  if (new Date(record.expiresAt) < new Date()) {
    return res.status(400).json({ valid: false, error: "This reset link has expired" });
  }

  let displayName = "";
  let email = "";
  if (record.accountType === "pilot") {
    const pilot = await db.prepare("SELECT firstName, lastName, email FROM pilots WHERE id = ?").get(record.contactId) as any;
    if (pilot) {
      displayName = [pilot.firstName, pilot.lastName].filter(Boolean).join(" ");
      email = pilot.email;
    }
  } else {
    const contact = await db.prepare("SELECT name, surname, email FROM contacts WHERE id = ?").get(record.contactId) as any;
    if (contact) {
      displayName = [contact.name, contact.surname].filter(Boolean).join(" ");
      email = contact.email;
    }
  }

  res.json({ valid: true, name: displayName, email, accountType: record.accountType });
}));

router.post("/reset-password", asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ error: "Token and password required" });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  const now = new Date().toISOString();
  const claimed = await db.prepare(
    "UPDATE password_reset_tokens SET usedAt = ? WHERE token = ? AND usedAt IS NULL AND expiresAt > ?"
  ).run(now, token, now);

  if (claimed.changes === 0) {
    return res.status(400).json({ error: "This reset link is invalid, already used, or expired" });
  }

  const record = await db.prepare(
    "SELECT contactId, accountType FROM password_reset_tokens WHERE token = ?"
  ).get(token) as any;

  const hashed = await bcrypt.hash(password, SALT_ROUNDS);

  if (record.accountType === "pilot") {
    await db.prepare("UPDATE pilots SET passwordHash = ? WHERE id = ?").run(hashed, record.contactId);
    await db.prepare("DELETE FROM pilot_sessions WHERE pilotId = ?").run(record.contactId);
    log.info(`Password reset completed for pilot: ${record.contactId}`);
  } else {
    await db.prepare("UPDATE contacts SET password = ? WHERE id = ?").run(hashed, record.contactId);
    await db.prepare("DELETE FROM admin_sessions WHERE userId = ?").run(record.contactId);
    log.info(`Password reset completed for contact: ${record.contactId}`);
  }

  res.json({ success: true });
}));

// TEMPORARY: Create admin account endpoint (one-time setup)
router.post("/setup/create-admin", asyncHandler(async (req, res) => {
  const { name, email, password, setupToken } = req.body;

  // Simple token-based auth for this endpoint
  if (setupToken !== "setup-admin-skyhigh-2026") {
    return res.status(401).json({ error: "Invalid setup token" });
  }

  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email, and password required" });
  }

  try {
    // Check if admin already exists
    const existing = await db.prepare("SELECT id FROM contacts WHERE email = ? AND isAdmin = 1").get(email);
    if (existing) {
      return res.status(400).json({ error: "Admin account already exists for this email" });
    }

    // Create admin account
    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    const id = `con-${Math.random().toString(36).substr(2, 9)}`;
    const result = await db.prepare(
      "INSERT OR IGNORE INTO contacts (id, name, email, password, isAdmin) VALUES (?, ?, ?, ?, 1)"
    ).run(id, name, email, hashed);

    if (result.changes > 0) {
      log.info(`Admin account created via setup endpoint: ${email}`);
      res.json({ success: true, message: `Admin account created for ${email}` });
    } else {
      res.status(400).json({ error: "Failed to create admin account (constraint violation or duplicate)" });
    }
  } catch (err) {
    log.error("Setup admin creation failed:", err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "Failed to create admin account" });
  }
}));

export default router;
