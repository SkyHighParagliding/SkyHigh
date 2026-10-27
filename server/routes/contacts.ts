import { Router } from "express";
import crypto from "crypto";
import { query, queryOne, execute, transaction } from "../pg.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";
import bcrypt from "bcryptjs";
import { tidyhqFetch } from "../utils/tidyhqFetch.js";
import { filterByCurrentMembers } from "../utils/tidyhqMemberFilter.js";
import { getPaginationParams, createPaginatedResponse } from "../utils/pagination.js";
import createLogger from "../utils/logger.js";
import { saveContactPhoto } from "../services/photoService.js";
import { planSync, applySync, type SyncSet } from "../services/committeeSync.js";

const log = createLogger("contacts");

const router = Router();
const SALT_ROUNDS = 10;

interface ContactRow {
  id: string;
  organisation: string;
  name: string;
  surname: string;
  phone: string;
  email: string;
  notes: string;
  position: string | null;
  isAdmin: number;
  isCommittee: number;
  isContractor: number;
  isParksVic: number;
  isSafetyCommittee: number;
  isSocialMedia: number;
  soAuthorised: number;
  safetyOfficerType: string | null;
  displayCommittee: number;
  displaySafety: number;
  showTelegram: number;
  showPhone: number;
  showEmail: number;
  showAdminEmail: number;
  photoUrl: string | null;
  photoAuthorised: number;
  fullNameDisplay: number;
  createdAt: string;
  updatedAt: string;
}

interface CommitteeRow {
  id: string;
  name: string;
  surname: string;
  organisation: string;
  phone: string;
  email: string;
  position: string | null;
  isSafetyCommittee?: number;
  safetyOfficerType?: string | null;
  showTelegram: number;
  showPhone: number;
  showEmail: number;
  showAdminEmail: number;
  photoUrl?: string | null;
  photoAuthorised?: number;
  fullNameDisplay?: number;
}

function generateId() {
  return `con-${Math.random().toString(36).substr(2, 9)}`;
}

router.get("/public/committee", asyncHandler(async (req, res) => {
  const members = await query<CommitteeRow>(
    `SELECT id, name, surname, organisation, phone, email, position, "isSafetyCommittee",
            "safetyOfficerType", "showTelegram", "showPhone", "showEmail", "showAdminEmail",
            "photoUrl", "photoAuthorised", "fullNameDisplay"
       FROM contacts
      WHERE "isCommittee" = 1 AND "displayCommittee" = 1
      ORDER BY name ASC`
  );
  const filtered = await filterByCurrentMembers(members);
  res.json(filtered.map(m => ({
    ...m,
    phone: m.showPhone ? m.phone : "",
    email: m.showEmail ? m.email : "",
  })));
}));

router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const { limit, offset } = getPaginationParams(req.query);
  const contacts = await query<ContactRow>(
    `SELECT id, organisation, name, surname, phone, email, notes, position, "isAdmin",
            "isCommittee", "isContractor", "isParksVic", "isSafetyCommittee", "isSocialMedia",
            "soAuthorised", "safetyOfficerType", "displayCommittee", "displaySafety",
            "showTelegram", "showPhone", "showEmail", "showAdminEmail", "photoUrl",
            "photoAuthorised", "fullNameDisplay", "createdAt", "updatedAt"
       FROM contacts
      ORDER BY organisation ASC, name ASC
      LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  const countResult = await queryOne<{ count: string }>(
    "SELECT COUNT(*)::int AS count FROM contacts"
  );
  const total = Number(countResult?.count ?? 0);
  res.set('X-Total-Count', String(total));
  res.json(createPaginatedResponse(contacts, total, limit, offset));
}));

router.get("/search", requireAuth, asyncHandler(async (req, res) => {
  const q = req.query.q as string;
  if (!q) {
    res.set('X-Total-Count', '0');
    return res.json(createPaginatedResponse([], 0, 50, 0));
  }
  const term = `%${q}%`;
  const { limit, offset } = getPaginationParams(req.query);
  const contacts = await query<ContactRow>(
    `SELECT id, organisation, name, surname, phone, email, notes, position, "isAdmin",
            "isCommittee", "isContractor", "isParksVic", "isSafetyCommittee", "isSocialMedia",
            "soAuthorised", "safetyOfficerType", "displayCommittee", "displaySafety",
            "showTelegram", "showPhone", "showEmail", "showAdminEmail", "photoUrl",
            "photoAuthorised", "fullNameDisplay", "createdAt", "updatedAt"
       FROM contacts
      WHERE name ILIKE $1 OR surname ILIKE $2 OR organisation ILIKE $3
      ORDER BY organisation ASC, name ASC
      LIMIT $4 OFFSET $5`,
    [term, term, term, limit, offset]
  );
  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM contacts
      WHERE name ILIKE $1 OR surname ILIKE $2 OR organisation ILIKE $3`,
    [term, term, term]
  );
  const total = Number(countResult?.count ?? 0);
  res.set('X-Total-Count', String(total));
  res.json(createPaginatedResponse(contacts, total, limit, offset));
}));

router.get("/tidyhq-groups", requireAuth, asyncHandler(async (req, res) => {
  try {
    const response = await tidyhqFetch("/groups");
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: `TidyHQ API error: ${text}` });
    }
    const data = await response.json();
    const groups = (Array.isArray(data) ? data : []).map((g: any) => ({
      id: g.id,
      label: g.label || g.name || "",
      size: g.size || g.contacts_count || 0,
      description: g.description || "",
    }));
    res.json(groups);
  } catch (err: any) {
    res.status(500).json({ error: `Failed to fetch TidyHQ groups: ${err.message}` });
  }
}));


// One-button committee updates (see server/services/committeeSync.ts).
// preview returns the confirm list; apply re-plans and writes it.
function parseSyncSet(raw: string): SyncSet | null {
  return raw === "committee" || raw === "safety" ? raw : null;
}

router.post("/tidyhq-sync/:set/preview", requireAuth, asyncHandler(async (req, res) => {
  const set = parseSyncSet(req.params.set);
  if (!set) return res.status(400).json({ error: "Unknown update" });
  try {
    const plan = await planSync(set, (req as any).user?.id ?? null);
    res.json({
      set: plan.set,
      groups: plan.groups,
      unchanged: plan.unchanged,
      skippedNoEmail: plan.skippedNoEmail,
      photos: plan.photos.length,
      changes: plan.changes.map(c => ({
        kind: c.kind, contactId: c.contactId, name: c.name, email: c.email,
        details: c.details, removesAdmin: c.removesAdmin,
      })),
    });
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
}));

router.post("/tidyhq-sync/:set/apply", requireAuth, asyncHandler(async (req, res) => {
  const set = parseSyncSet(req.params.set);
  if (!set) return res.status(400).json({ error: "Unknown update" });
  const keepAdmin = Array.isArray(req.body?.keepAdmin) ? req.body.keepAdmin.map(String) : [];
  try {
    res.json(await applySync(set, (req as any).user?.id ?? null, keepAdmin));
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
}));

router.get("/tidyhq-search", requireAuth, asyncHandler(async (req, res) => {
  const q = req.query.q as string;
  if (!q) return res.json([]);

  try {
    const response = await tidyhqFetch(`https://api.tidyhq.com/v2/contacts?search_terms=${encodeURIComponent(q)}&limit=20`);
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: `TidyHQ API error: ${text}` });
    }
    const data = await response.json();
    const results = (Array.isArray(data) ? data : []).map((c: any) => ({
      tidyhqId: c.id,
      firstName: c.first_name || "",
      lastName: c.last_name || "",
      displayName: c.display_name || `${c.first_name || ""} ${c.last_name || ""}`.trim(),
      email: c.email_address || "",
      phone: c.phone_number || "",
    }));
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: `Failed to query TidyHQ: ${err.message}` });
  }
}));

router.get("/:id", requireAuth, asyncHandler(async (req, res) => {
  const contact = await queryOne<ContactRow>(
    `SELECT id, organisation, name, surname, phone, email, notes, position, "isAdmin", "isCommittee",
            "isContractor", "isParksVic", "isSafetyCommittee", "isSocialMedia", "soAuthorised",
            "safetyOfficerType", "displayCommittee", "displaySafety", "showTelegram", "showPhone",
            "showEmail", "showAdminEmail", "photoUrl", "photoAuthorised", "fullNameDisplay",
            "createdAt", "updatedAt"
       FROM contacts
      WHERE id = $1`,
    [req.params.id]
  );
  if (!contact) return res.status(404).json({ error: "Contact not found" });
  res.json(contact);
}));

router.post("/", requireAuth, asyncHandler(async (req, res) => {
  let { organisation, name, surname, phone, email, notes, position, isAdmin, isCommittee, isContractor, isParksVic, isSafetyCommittee, isSocialMedia, soAuthorised, displayCommittee, displaySafety, fullNameDisplay, photoAuthorised, showTelegram, showPhone, showEmail, showAdminEmail, password } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });

  if (isCommittee) isAdmin = true;

  if (isAdmin) {
    if (!surname || !phone || !email) {
      return res.status(400).json({ error: "Admin contacts require surname, phone, and email" });
    }
  }

  if (isSafetyCommittee && soAuthorised) {
    if (!email) {
      return res.status(400).json({ error: "SO-authorised contacts require an email" });
    }
  }

  if (isAdmin && email) {
    const existing = await queryOne(
      `SELECT id FROM contacts WHERE email = $1 AND "isAdmin" = 1`,
      [email]
    );
    if (existing) {
      return res.status(400).json({ error: "An admin contact with that email already exists" });
    }
  }

  const id = generateId();
  let hashedPassword = "";
  if (password && (isAdmin || (isSafetyCommittee && soAuthorised))) {
    hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  } else if ((isAdmin || (isSafetyCommittee && soAuthorised)) && !password) {
    const tempPassword = crypto.randomUUID();
    hashedPassword = await bcrypt.hash(tempPassword, SALT_ROUNDS);
  }

  await execute(
    `INSERT INTO contacts (id, organisation, name, surname, phone, email, notes, position, "isAdmin",
                           "isCommittee", "isContractor", "isParksVic", "isSafetyCommittee",
                           "isSocialMedia", "soAuthorised", "displayCommittee", "displaySafety",
                           "showTelegram", "showPhone", "showEmail", "showAdminEmail",
                           "fullNameDisplay", "photoAuthorised", password)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)`,
    [id, organisation || "", name, surname || "", phone || "", email || "", notes || "",
      position || null,
      isAdmin ? 1 : 0, isCommittee ? 1 : 0, isContractor ? 1 : 0, isParksVic ? 1 : 0,
      isSafetyCommittee ? 1 : 0, isSocialMedia ? 1 : 0, soAuthorised ? 1 : 0,
      displayCommittee !== false ? 1 : 0, displaySafety !== false ? 1 : 0,
      showTelegram ? 1 : 0, showPhone ? 1 : 0, showEmail ? 1 : 0, showAdminEmail ? 1 : 0,
      fullNameDisplay !== false ? 1 : 0, photoAuthorised ? 1 : 0, hashedPassword]
  );

  const contact = await queryOne<ContactRow>(
    `SELECT id, organisation, name, surname, phone, email, notes, position, "isAdmin", "isCommittee",
            "isContractor", "isParksVic", "isSafetyCommittee", "isSocialMedia", "soAuthorised",
            "safetyOfficerType", "displayCommittee", "displaySafety", "showTelegram", "showPhone",
            "showEmail", "showAdminEmail", "photoUrl", "photoAuthorised", "fullNameDisplay",
            "createdAt", "updatedAt"
       FROM contacts
      WHERE id = $1`,
    [id]
  );
  res.status(201).json(contact);
}));

router.put("/:id", requireAuth, asyncHandler(async (req, res) => {
  let { organisation, name, surname, phone, email, notes, position, isAdmin, isCommittee, isContractor, isParksVic, isSafetyCommittee, isSocialMedia, soAuthorised, displayCommittee, displaySafety, fullNameDisplay, showTelegram, showPhone, showEmail, showAdminEmail, photoAuthorised, safetyOfficerType, password } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });

  if (isCommittee) isAdmin = true;

  if (isAdmin) {
    if (!surname || !phone || !email) {
      return res.status(400).json({ error: "Admin contacts require surname, phone, and email" });
    }
  }

  if (isAdmin && email) {
    const existing = await queryOne(
      `SELECT id FROM contacts WHERE email = $1 AND "isAdmin" = 1 AND id != $2`,
      [email, req.params.id]
    );
    if (existing) {
      return res.status(400).json({ error: "An admin contact with that email already exists" });
    }
  }

  if (isSafetyCommittee && soAuthorised) {
    if (!email) {
      return res.status(400).json({ error: "SO-authorised contacts require an email" });
    }
  }

  const needsPassword = isAdmin || (isSafetyCommittee && soAuthorised);

  const params: any[] = [
    organisation || "", name, surname || "", phone || "", email || "", notes || "",
    isAdmin ? 1 : 0, isCommittee ? 1 : 0, isContractor ? 1 : 0, isParksVic ? 1 : 0,
    isSafetyCommittee ? 1 : 0, isSocialMedia ? 1 : 0, soAuthorised ? 1 : 0,
    displayCommittee !== false ? 1 : 0, displaySafety !== false ? 1 : 0,
    showTelegram ? 1 : 0, showPhone ? 1 : 0, showEmail ? 1 : 0, showAdminEmail ? 1 : 0,
    fullNameDisplay !== false ? 1 : 0,  // $20
    photoAuthorised ? 1 : 0,            // $21
    safetyOfficerType || null,          // $22
    position || null,                   // $23
  ];

  let passwordUpdate = "";
  if (password && needsPassword) {
    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    params.push(hashed);
    passwordUpdate = `, password = $${params.length}`;
  } else if (needsPassword && !password) {
    const current = await queryOne<{ password: string }>(
      `SELECT password FROM contacts WHERE id = $1`,
      [req.params.id]
    );
    if (!current?.password) {
      const tempPassword = crypto.randomUUID();
      const hashed = await bcrypt.hash(tempPassword, SALT_ROUNDS);
      params.push(hashed);
      passwordUpdate = `, password = $${params.length}`;
    }
  } else if (!isAdmin && !(isSafetyCommittee && soAuthorised)) {
    passwordUpdate = ", password = ''";
  }

  params.push(req.params.id);

  const result = await execute(
    `UPDATE contacts
        SET organisation = $1, name = $2, surname = $3, phone = $4, email = $5, notes = $6,
            "isAdmin" = $7, "isCommittee" = $8, "isContractor" = $9, "isParksVic" = $10,
            "isSafetyCommittee" = $11, "isSocialMedia" = $12, "soAuthorised" = $13,
            "displayCommittee" = $14, "displaySafety" = $15, "showTelegram" = $16,
            "showPhone" = $17, "showEmail" = $18, "showAdminEmail" = $19,
            "fullNameDisplay" = $20, "photoAuthorised" = $21, "safetyOfficerType" = $22,
            position = $23${passwordUpdate},
            "updatedAt" = NOW()
      WHERE id = $${params.length}`,
    params
  );

  if (result.rowCount === 0) return res.status(404).json({ error: "Contact not found" });
  const contact = await queryOne<ContactRow>(
    `SELECT id, organisation, name, surname, phone, email, notes, position, "isAdmin", "isCommittee",
            "isContractor", "isParksVic", "isSafetyCommittee", "isSocialMedia", "soAuthorised",
            "safetyOfficerType", "displayCommittee", "displaySafety", "showTelegram", "showPhone",
            "showEmail", "showAdminEmail", "photoUrl", "photoAuthorised", "fullNameDisplay",
            "createdAt", "updatedAt"
       FROM contacts
      WHERE id = $1`,
    [req.params.id]
  );
  res.json(contact);
}));

router.post("/bulk-delete", requireAuth, asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "No contact IDs provided" });
  }

  const adminCountResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM contacts WHERE "isAdmin" = 1`
  );
  const adminCount = Number(adminCountResult?.count ?? 0);

  const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");
  const adminIdsToDelete = await query<{ id: string }>(
    `SELECT id FROM contacts WHERE "isAdmin" = 1 AND id IN (${placeholders})`,
    ids
  );

  if (adminIdsToDelete.length >= adminCount) {
    return res.status(400).json({ error: "Cannot delete all admin contacts — at least one must remain" });
  }

  let deleted = 0;

  await transaction(async (client) => {
    for (const id of ids) {
      const { rows: linked } = await client.query<{ name: string }>(
        `SELECT p.name FROM project_contacts pc JOIN projects p ON p.id = pc."projectId" WHERE pc."contactId" = $1`,
        [id]
      );
      if (linked.length > 0) {
        await client.query(`DELETE FROM project_contacts WHERE "contactId" = $1`, [id]);
      }
      await client.query(`DELETE FROM admin_sessions WHERE "userId" = $1`, [id]);
      const result = await client.query(`DELETE FROM contacts WHERE id = $1`, [id]);
      if ((result as any).rowCount > 0) deleted++;
    }
  });

  res.json({ deleted, total: ids.length });
}));

router.delete("/:id", requireAuth, asyncHandler(async (req, res) => {
  const force = req.query.force === "true";
  const currentUserId = (req as any).user?.id;

  const contact = await queryOne<{ isAdmin: number }>(
    `SELECT "isAdmin" FROM contacts WHERE id = $1`,
    [req.params.id]
  );
  if (!contact) return res.status(404).json({ error: "Contact not found" });

  if (req.params.id === currentUserId) {
    return res.status(400).json({ error: "Cannot delete your own account" });
  }

  if (contact.isAdmin) {
    const adminCount = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM contacts WHERE "isAdmin" = 1`
    );
    if (Number(adminCount?.count ?? 0) <= 1) {
      return res.status(400).json({ error: "Cannot delete the last admin contact" });
    }
  }

  const linkedProjects = await query<{ name: string }>(
    `SELECT p.name FROM project_contacts pc JOIN projects p ON p.id = pc."projectId" WHERE pc."contactId" = $1`,
    [req.params.id]
  );

  if (linkedProjects.length > 0 && !force) {
    return res.status(409).json({
      error: "Contact is linked to projects",
      projects: linkedProjects.map(p => p.name),
      message: `This contact is linked to ${linkedProjects.length} project(s): ${linkedProjects.map(p => p.name).join(", ")}. Use ?force=true to delete anyway.`
    });
  }

  let rowCount = 0;
  await transaction(async (client) => {
    if (contact.isAdmin) {
      await client.query(`DELETE FROM admin_sessions WHERE "userId" = $1`, [req.params.id]);
    }
    if (force) {
      await client.query(`DELETE FROM project_contacts WHERE "contactId" = $1`, [req.params.id]);
    }
    const result = await client.query(`DELETE FROM contacts WHERE id = $1`, [req.params.id]);
    rowCount = result.rowCount ?? 0;
  });
  if (rowCount === 0) return res.status(404).json({ error: "Contact not found" });
  res.json({ success: true });
}));

// ─── Photo Upload/Delete ──────────────────────────────────────────────────────
import { deleteContactPhoto } from "../services/photoService.js";

// Self-service photo upload — authenticates with email + password from request body
router.post("/photo/self-upload", asyncHandler(async (req, res) => {
  const { email, password, imageBuffer } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }
  if (!imageBuffer) {
    return res.status(400).json({ error: "No photo provided" });
  }

  const contact = await queryOne<{ id: string; password: string; photoUrl?: string }>(
    `SELECT id, password, "photoUrl" FROM contacts WHERE LOWER(email) = LOWER($1) AND "isAdmin" = 1`,
    [email]
  );

  if (!contact || !contact.password) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const ok = await bcrypt.compare(password, contact.password);
  if (!ok) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  if (contact.photoUrl) {
    await deleteContactPhoto(contact.photoUrl);
  }

  const buffer = Buffer.from(imageBuffer, "base64");
  const photoUrl = await saveContactPhoto(buffer, contact.id);
  await execute(
    `UPDATE contacts SET "photoUrl" = $1, "photoAuthorised" = 1 WHERE id = $2`,
    [photoUrl, contact.id]
  );
  res.json({ success: true, photoUrl });
}));

router.post("/:id/photo", requireAuth, asyncHandler(async (req, res) => {
  const { imageBuffer } = req.body;
  if (!imageBuffer) {
    return res.status(400).json({ error: "No photo provided" });
  }
  const { id } = req.params;
  const contact = await queryOne<{ id: string; photoUrl?: string }>(
    `SELECT id, "photoUrl" FROM contacts WHERE id = $1`,
    [id]
  );
  if (!contact) return res.status(404).json({ error: "Contact not found" });
  if (contact.photoUrl) {
    await deleteContactPhoto(contact.photoUrl);
  }
  const buffer = Buffer.from(imageBuffer, "base64");
  const photoUrl = await saveContactPhoto(buffer, id);
  await execute(
    `UPDATE contacts SET "photoUrl" = $1, "photoAuthorised" = 1 WHERE id = $2`,
    [photoUrl, id]
  );
  res.json({ success: true, photoUrl });
}));

router.delete("/:id/photo", requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const contact = await queryOne<{ photoUrl?: string }>(
    `SELECT "photoUrl" FROM contacts WHERE id = $1`,
    [id]
  );
  if (!contact) return res.status(404).json({ error: "Contact not found" });
  if (contact.photoUrl) {
    await deleteContactPhoto(contact.photoUrl);
  }
  await execute(`UPDATE contacts SET "photoUrl" = NULL WHERE id = $1`, [id]);
  res.json({ success: true });
}));

export default router;
