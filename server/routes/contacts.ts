import { Router } from "express";
import crypto from "crypto";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";
import bcrypt from "bcryptjs";
import { tidyhqFetch } from "../utils/tidyhqFetch.js";
import { buildSafeUpdateClauses } from "../utils/sqlBuilder.js";
import { filterByCurrentMembers } from "../utils/tidyhqMemberFilter.js";
import { getPaginationParams, createPaginatedResponse } from "../utils/pagination.js";

const router = Router();
const SALT_ROUNDS = 10;

function generateId() {
  return `con-${Math.random().toString(36).substr(2, 9)}`;
}

router.get("/public/committee", asyncHandler(async (req, res) => {
  const members = await db.prepare(
    "SELECT id, name, surname, organisation, phone, email, position, isSafetyCommittee, safetyOfficerType, showTelegram, showPhone, showEmail, showAdminEmail, photoUrl, photoAuthorised, fullNameDisplay FROM contacts WHERE isCommittee = 1 AND displayCommittee = 1 ORDER BY name ASC"
  ).all() as { id: string; name: string; surname: string; organisation: string; phone: string; email: string; position: string | null; isSafetyCommittee?: number; safetyOfficerType?: string | null; showTelegram: number; showPhone: number; showEmail: number; showAdminEmail: number; photoUrl?: string | null; photoAuthorised?: number; fullNameDisplay?: number }[];
  const filtered = await filterByCurrentMembers(members);
  res.json(filtered.map(m => ({
    ...m,
    phone: m.showPhone ? m.phone : "",
    email: m.showEmail ? m.email : "",
  })));
}));

router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const { limit, offset } = getPaginationParams(req.query);
  const contacts = await db.prepare("SELECT id, organisation, name, surname, phone, email, notes, position, isAdmin, isCommittee, isContractor, isParksVic, isSafetyCommittee, isSocialMedia, soAuthorised, displayCommittee, displaySafety, showTelegram, showPhone, showEmail, showAdminEmail, photoUrl, photoAuthorised, fullNameDisplay, createdAt, updatedAt FROM contacts ORDER BY organisation ASC, name ASC LIMIT ? OFFSET ?").all(limit, offset);
  const countResult = await db.prepare("SELECT COUNT(*) as count FROM contacts").get() as { count: number };
  const total = countResult.count;
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
  const contacts = await db.prepare(
    "SELECT id, organisation, name, surname, phone, email, notes, position, isAdmin, isCommittee, isContractor, isParksVic, isSafetyCommittee, isSocialMedia, soAuthorised, displayCommittee, displaySafety, showTelegram, showPhone, showEmail, showAdminEmail, photoUrl, photoAuthorised, fullNameDisplay, createdAt, updatedAt FROM contacts WHERE name LIKE ? OR surname LIKE ? OR organisation LIKE ? ORDER BY organisation ASC, name ASC LIMIT ? OFFSET ?"
  ).all(term, term, term, limit, offset);
  const countResult = await db.prepare("SELECT COUNT(*) as count FROM contacts WHERE name LIKE ? OR surname LIKE ? OR organisation LIKE ?").get(term, term, term) as { count: number };
  const total = countResult.count;
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

router.get("/tidyhq-groups/:groupId/contacts", requireAuth, asyncHandler(async (req, res) => {
  try {
    const response = await tidyhqFetch(`/groups/${req.params.groupId}/contacts`);
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: `TidyHQ API error: ${text}` });
    }
    const data = await response.json();
    const contacts = (Array.isArray(data) ? data : []).map((c: any) => {
      const emailObj = Array.isArray(c.email_addresses) ? c.email_addresses[0] : null;
      const phoneObj = Array.isArray(c.phone_numbers) ? c.phone_numbers[0] : null;
      return {
        tidyhqId: c.id,
        firstName: c.first_name || "",
        lastName: c.last_name || "",
        displayName: c.display_name || `${c.first_name || ""} ${c.last_name || ""}`.trim(),
        email: emailObj?.address || c.email_address || "",
        phone: phoneObj?.number || c.phone_number || "",
        organisation: c.company || "",
      };
    });
    res.json(contacts);
  } catch (err: any) {
    res.status(500).json({ error: `Failed to fetch group contacts: ${err.message}` });
  }
}));

router.post("/tidyhq-import-group", requireAuth, asyncHandler(async (req, res) => {
  const { contacts: importContacts, roles } = req.body;
  if (!Array.isArray(importContacts) || importContacts.length === 0) {
    return res.status(400).json({ error: "No contacts provided for import" });
  }

  const roleFlags = roles || {};
  const validRoleFlags = ["isCommittee", "isSafetyCommittee", "isContractor", "isParksVic"];
  const groupName = req.body.groupName || "";
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const tc of importContacts) {
    const email = (tc.email || "").trim().toLowerCase();
    const firstName = (tc.firstName || "").trim();
    const lastName = (tc.lastName || "").trim();

    if (!firstName && !email) {
      skipped++;
      continue;
    }

    const existing = email
      ? await db.prepare("SELECT id, position FROM contacts WHERE LOWER(email) = ?").get(email) as any
      : null;

    const organisation = (tc.organisation || "").trim();

    if (existing) {
      const updateClauses: Array<{ column: string; value: any }> = [];

      if (firstName) updateClauses.push({ column: "name", value: firstName });
      if (lastName) updateClauses.push({ column: "surname", value: lastName });
      if (tc.phone) updateClauses.push({ column: "phone", value: tc.phone });
      if (organisation) updateClauses.push({ column: "organisation", value: organisation });

      for (const flag of validRoleFlags) {
        if (roleFlags[flag]) {
          updateClauses.push({ column: flag, value: 1 });
        }
      }

      if (roleFlags.isCommittee) {
        updateClauses.push({ column: "isAdmin", value: 1 });
        const currentPos = (existing.position || "").trim();
        if (!currentPos) {
          updateClauses.push({ column: "position", value: "Committee" });
        }
      }

      if (roleFlags.isPosition && groupName) {
        const currentPos = (existing.position || "").trim();
        if (!currentPos || currentPos === "Committee") {
          updateClauses.push({ column: "position", value: groupName });
        } else if (!currentPos.split(", ").includes(groupName)) {
          updateClauses.push({ column: "position", value: `${currentPos}, ${groupName}` });
        }
      }

      if (updateClauses.length > 0) {
        const allowedColumns = ["name", "surname", "phone", "organisation", ...validRoleFlags, "isAdmin", "position"];
        const { sql, params } = buildSafeUpdateClauses(updateClauses, allowedColumns);
        params.push(existing.id);
        await db.prepare(`UPDATE contacts SET ${sql}, updatedAt = datetime('now') WHERE id = ?`).run(...params);
      }
      updated++;
    } else {
      const id = generateId();
      let position: string | null = null;
      if (roleFlags.isPosition && groupName) {
        position = groupName;
      } else if (roleFlags.isCommittee) {
        position = "Committee";
      }
      await db.prepare(
        `INSERT INTO contacts (id, name, surname, organisation, phone, email, isAdmin, isCommittee, isSafetyCommittee, isContractor, isParksVic, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id, firstName, lastName, organisation, tc.phone || "", email,
        roleFlags.isCommittee ? 1 : 0,
        roleFlags.isCommittee ? 1 : 0,
        roleFlags.isSafetyCommittee ? 1 : 0,
        roleFlags.isContractor ? 1 : 0,
        roleFlags.isParksVic ? 1 : 0,
        position
      );
      created++;
    }
  }

  res.json({ created, updated, skipped, total: importContacts.length });
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
  const contact = await db.prepare("SELECT id, organisation, name, surname, phone, email, notes, isAdmin, isCommittee, isContractor, isParksVic, isSafetyCommittee, isSocialMedia, soAuthorised, displayCommittee, displaySafety, showTelegram, showPhone, showEmail, showAdminEmail, photoUrl, photoAuthorised, fullNameDisplay, createdAt, updatedAt FROM contacts WHERE id = ?").get(req.params.id);
  if (!contact) return res.status(404).json({ error: "Contact not found" });
  res.json(contact);
}));

router.post("/", requireAuth, asyncHandler(async (req, res) => {
  let { organisation, name, surname, phone, email, notes, isAdmin, isCommittee, isContractor, isParksVic, isSafetyCommittee, isSocialMedia, soAuthorised, displayCommittee, displaySafety, fullNameDisplay, showTelegram, showPhone, showEmail, showAdminEmail, password } = req.body;
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
    const existing = await db.prepare("SELECT id FROM contacts WHERE email = ? AND isAdmin = 1").get(email);
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

  await db.prepare(
    `INSERT INTO contacts (id, organisation, name, surname, phone, email, notes, isAdmin, isCommittee, isContractor, isParksVic, isSafetyCommittee, isSocialMedia, soAuthorised, displayCommittee, displaySafety, showTelegram, showPhone, showEmail, showAdminEmail, password)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, organisation || "", name, surname || "", phone || "", email || "", notes || "",
    isAdmin ? 1 : 0, isCommittee ? 1 : 0, isContractor ? 1 : 0, isParksVic ? 1 : 0,
    isSafetyCommittee ? 1 : 0, isSocialMedia ? 1 : 0, soAuthorised ? 1 : 0,
    displayCommittee !== false ? 1 : 0, displaySafety !== false ? 1 : 0,
    showTelegram ? 1 : 0, showPhone ? 1 : 0, showEmail ? 1 : 0, showAdminEmail ? 1 : 0, hashedPassword);

  const contact = await db.prepare("SELECT id, organisation, name, surname, phone, email, notes, isAdmin, isCommittee, isContractor, isParksVic, isSafetyCommittee, isSocialMedia, soAuthorised, displayCommittee, displaySafety, showTelegram, showPhone, showEmail, showAdminEmail, photoUrl, photoAuthorised, fullNameDisplay, createdAt, updatedAt FROM contacts WHERE id = ?").get(id);
  res.status(201).json(contact);
}));

router.put("/:id", requireAuth, asyncHandler(async (req, res) => {
  let { organisation, name, surname, phone, email, notes, isAdmin, isCommittee, isContractor, isParksVic, isSafetyCommittee, isSocialMedia, soAuthorised, displayCommittee, displaySafety, fullNameDisplay, showTelegram, showPhone, showEmail, showAdminEmail, photoAuthorised, password } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });

  if (isCommittee) isAdmin = true;

  if (isAdmin) {
    if (!surname || !phone || !email) {
      return res.status(400).json({ error: "Admin contacts require surname, phone, and email" });
    }
  }

  if (isAdmin && email) {
    const existing = await db.prepare("SELECT id FROM contacts WHERE email = ? AND isAdmin = 1 AND id != ?").get(email, req.params.id) as any;
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

  let passwordUpdate = "";
  const params: any[] = [
    organisation || "", name, surname || "", phone || "", email || "", notes || "",
    isAdmin ? 1 : 0, isCommittee ? 1 : 0, isContractor ? 1 : 0, isParksVic ? 1 : 0,
    isSafetyCommittee ? 1 : 0, isSocialMedia ? 1 : 0, soAuthorised ? 1 : 0,
    displayCommittee !== false ? 1 : 0, displaySafety !== false ? 1 : 0,
    showTelegram ? 1 : 0, showPhone ? 1 : 0, showEmail ? 1 : 0, showAdminEmail ? 1 : 0,
  ];

  if (password && needsPassword) {
    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    passwordUpdate = ", password = ?";
    params.push(hashed);
  } else if (needsPassword && !password) {
    const current = await db.prepare("SELECT password FROM contacts WHERE id = ?").get(req.params.id) as any;
    if (!current?.password) {
      const tempPassword = crypto.randomUUID();
      const hashed = await bcrypt.hash(tempPassword, SALT_ROUNDS);
      passwordUpdate = ", password = ?";
      params.push(hashed);
    }
  } else if (!isAdmin && !(isSafetyCommittee && soAuthorised)) {
    passwordUpdate = ", password = ''";
  }

  params.push(req.params.id);

  const result = await db.prepare(
    `UPDATE contacts SET organisation = ?, name = ?, surname = ?, phone = ?, email = ?, notes = ?,
     isAdmin = ?, isCommittee = ?, isContractor = ?, isParksVic = ?, isSafetyCommittee = ?, isSocialMedia = ?, soAuthorised = ?,
     displayCommittee = ?, displaySafety = ?, showTelegram = ?, showPhone = ?, showEmail = ?, showAdminEmail = ?${passwordUpdate},
     updatedAt = datetime('now') WHERE id = ?`
  ).run(...params);

  if (result.changes === 0) return res.status(404).json({ error: "Contact not found" });
  const contact = await db.prepare("SELECT id, organisation, name, surname, phone, email, notes, isAdmin, isCommittee, isContractor, isParksVic, isSafetyCommittee, isSocialMedia, soAuthorised, displayCommittee, displaySafety, showTelegram, showPhone, showEmail, showAdminEmail, photoUrl, photoAuthorised, fullNameDisplay, createdAt, updatedAt FROM contacts WHERE id = ?").get(req.params.id);
  res.json(contact);
}));

router.post("/bulk-delete", requireAuth, asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "No contact IDs provided" });
  }

  const adminCount = (await db.prepare("SELECT COUNT(*) as count FROM contacts WHERE isAdmin = 1").get() as any).count;
  const adminIdsToDelete = (await db.prepare(
    `SELECT id FROM contacts WHERE isAdmin = 1 AND id IN (${ids.map(() => "?").join(",")})`
  ).all(...ids) as { id: string }[]).map(r => r.id);

  if (adminIdsToDelete.length >= adminCount) {
    return res.status(400).json({ error: "Cannot delete all admin contacts — at least one must remain" });
  }

  let deleted = 0;
  let skippedProjects: string[] = [];

  const deleteOne = await db.prepare("DELETE FROM contacts WHERE id = ?");
  const deleteSession = await db.prepare("DELETE FROM admin_sessions WHERE userId = ?");
  const deleteProjectLinks = await db.prepare("DELETE FROM project_contacts WHERE contactId = ?");
  const findProjects = await db.prepare(
    "SELECT p.name FROM project_contacts pc JOIN projects p ON p.id = pc.projectId WHERE pc.contactId = ?"
  );

  const tx = await db.transaction(async () => {
    for (const id of ids) {
      const linked = await findProjects.all(id) as { name: string }[];
      if (linked.length > 0) {
        await deleteProjectLinks.run(id);
      }
      await deleteSession.run(id);
      const result = await deleteOne.run(id);
      if (result.changes > 0) deleted++;
    }
  });
  await tx();

  res.json({ deleted, total: ids.length });
}));

router.delete("/:id", requireAuth, asyncHandler(async (req, res) => {
  const force = req.query.force === "true";
  const currentUserId = (req as any).user?.id;

  const contact = await db.prepare("SELECT isAdmin FROM contacts WHERE id = ?").get(req.params.id) as any;
  if (!contact) return res.status(404).json({ error: "Contact not found" });

  if (req.params.id === currentUserId) {
    return res.status(400).json({ error: "Cannot delete your own account" });
  }

  if (contact.isAdmin) {
    const adminCount = await db.prepare("SELECT COUNT(*) as count FROM contacts WHERE isAdmin = 1").get() as any;
    if (adminCount.count <= 1) {
      return res.status(400).json({ error: "Cannot delete the last admin contact" });
    }
  }

  const linkedProjects = await db.prepare(
    "SELECT p.name FROM project_contacts pc JOIN projects p ON p.id = pc.projectId WHERE pc.contactId = ?"
  ).all(req.params.id) as { name: string }[];

  if (linkedProjects.length > 0 && !force) {
    return res.status(409).json({
      error: "Contact is linked to projects",
      projects: linkedProjects.map(p => p.name),
      message: `This contact is linked to ${linkedProjects.length} project(s): ${linkedProjects.map(p => p.name).join(", ")}. Use ?force=true to delete anyway.`
    });
  }

  if (contact.isAdmin) {
    await db.prepare("DELETE FROM admin_sessions WHERE userId = ?").run(req.params.id);
  }

  if (force) {
    await db.prepare("DELETE FROM project_contacts WHERE contactId = ?").run(req.params.id);
  }

  const result = await db.prepare("DELETE FROM contacts WHERE id = ?").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "Contact not found" });
  res.json({ success: true });
}));

// ─── Photo Upload/Delete ──────────────────────────────────────────────────────
import { saveContactPhoto, deleteContactPhoto } from "../services/photoService.js";
import bcrypt from "bcrypt";

// Self-service photo upload — authenticates with email + password from request body
router.post("/photo/self-upload", asyncHandler(async (req, res) => {
  const { email, password, imageBuffer } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }
  if (!imageBuffer) {
    return res.status(400).json({ error: "No photo provided" });
  }

  const contact = await db.prepare(
    "SELECT id, password, photoUrl FROM contacts WHERE LOWER(email) = LOWER(?) AND isAdmin = 1"
  ).get(email) as { id: string; password: string; photoUrl?: string } | undefined;

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
  await db.prepare("UPDATE contacts SET photoUrl = ?, photoAuthorised = 1 WHERE id = ?").run(photoUrl, contact.id);
  res.json({ success: true, photoUrl });
}));

router.post("/:id/photo", requireAuth, asyncHandler(async (req, res) => {
  const { imageBuffer } = req.body;
  if (!imageBuffer) {
    return res.status(400).json({ error: "No photo provided" });
  }
  const { id } = req.params;
  const contact = await db.prepare("SELECT id, photoUrl FROM contacts WHERE id = ?").get(id) as any;
  if (!contact) return res.status(404).json({ error: "Contact not found" });
  if (contact.photoUrl) {
    await deleteContactPhoto(contact.photoUrl);
  }
  const buffer = Buffer.from(imageBuffer, "base64");
  const photoUrl = await saveContactPhoto(buffer, id);
  await db.prepare("UPDATE contacts SET photoUrl = ?, photoAuthorised = 1 WHERE id = ?").run(photoUrl, id);
  res.json({ success: true, photoUrl });
}));

router.delete("/:id/photo", requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const contact = await db.prepare("SELECT photoUrl FROM contacts WHERE id = ?").get(id) as { photoUrl?: string };
  if (!contact) return res.status(404).json({ error: "Contact not found" });
  if (contact.photoUrl) {
    await deleteContactPhoto(contact.photoUrl);
  }
  await db.prepare("UPDATE contacts SET photoUrl = NULL WHERE id = ?").run(id);
  res.json({ success: true });
}));

export default router;
