import { Router } from "express";
import crypto from "crypto";
import { query, queryOne, execute, transaction } from "../pg.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";
import bcrypt from "bcryptjs";
import { tidyhqFetch } from "../utils/tidyhqFetch.js";
import { buildSafeUpdateClauses } from "../utils/sqlBuilder.js";
import { filterByCurrentMembers } from "../utils/tidyhqMemberFilter.js";
import { getPaginationParams, createPaginatedResponse } from "../utils/pagination.js";
import createLogger from "../utils/logger.js";
import { saveContactPhoto } from "../services/photoService.js";

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
            "soAuthorised", "displayCommittee", "displaySafety", "showTelegram", "showPhone",
            "showEmail", "showAdminEmail", "photoUrl", "photoAuthorised", "fullNameDisplay",
            "createdAt", "updatedAt"
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
            "soAuthorised", "displayCommittee", "displaySafety", "showTelegram", "showPhone",
            "showEmail", "showAdminEmail", "photoUrl", "photoAuthorised", "fullNameDisplay",
            "createdAt", "updatedAt"
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
      ? await queryOne<{ id: string; position: string | null }>(
          `SELECT id, position FROM contacts WHERE LOWER(email) = LOWER($1)`,
          [email]
        )
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
        await execute(`UPDATE contacts SET ${sql}, "updatedAt" = NOW() WHERE id = $${params.length}`, params);
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
      await execute(
        `INSERT INTO contacts (id, name, surname, organisation, phone, email, "isAdmin",
                               "isCommittee", "isSafetyCommittee", "isContractor", "isParksVic", position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          id, firstName, lastName, organisation, tc.phone || "", email,
          roleFlags.isCommittee ? 1 : 0,
          roleFlags.isCommittee ? 1 : 0,
          roleFlags.isSafetyCommittee ? 1 : 0,
          roleFlags.isContractor ? 1 : 0,
          roleFlags.isParksVic ? 1 : 0,
          position
        ]
      );
      created++;
    }
  }

  res.json({ created, updated, skipped, total: importContacts.length });
}));

// Smart import: POST { groupId }
// Fetches full contact data from TidyHQ (with embedded groups[]), walks each
// contact's group memberships, applies all matching mappings from
// tidyhq_group_mappings in a single pass, and syncs profile images.
// Use this for the two main groups: Safety Committee (143877) and Skyhigh Committee (139632).
router.post("/tidyhq-smart-import", requireAuth, asyncHandler(async (req, res) => {
  const { groupId } = req.body;
  if (!groupId) return res.status(400).json({ error: "groupId is required" });

  const tidyRes = await tidyhqFetch(`/groups/${groupId}/contacts`);
  if (!tidyRes.ok) {
    const text = await tidyRes.text();
    return res.status(tidyRes.status).json({ error: `TidyHQ API error: ${text}` });
  }
  const tidyContacts: any[] = await tidyRes.json();
  if (!Array.isArray(tidyContacts)) {
    return res.status(500).json({ error: "Unexpected TidyHQ response format" });
  }

  // Load all group mappings, indexed by TidyHQ group ID
  const mappings = await query<{ tidyhqGroupId: string; tidyhqGroupName: string; localRoleFlag: string }>(
    `SELECT "tidyhqGroupId", "tidyhqGroupName", "localRoleFlag" FROM tidyhq_group_mappings`
  );

  const byGroup = new Map<string, Array<{ flag: string; name: string }>>();
  for (const m of mappings) {
    if (!byGroup.has(m.tidyhqGroupId)) byGroup.set(m.tidyhqGroupId, []);
    byGroup.get(m.tidyhqGroupId)!.push({ flag: m.localRoleFlag, name: m.tidyhqGroupName });
  }

  let created = 0, updated = 0, skipped = 0, imagesSynced = 0;

  for (const tc of tidyContacts) {
    const emailObj = Array.isArray(tc.email_addresses) ? tc.email_addresses[0] : null;
    const email = (emailObj?.address || tc.email_address || "").trim().toLowerCase();
    const firstName = (tc.first_name || "").trim();
    const lastName = (tc.last_name || "").trim();
    const phoneObj = Array.isArray(tc.phone_numbers) ? tc.phone_numbers[0] : null;
    const phone = phoneObj?.number || tc.phone_number || "";
    const organisation = (tc.company || "").trim();

    if (!firstName && !email) { skipped++; continue; }

    // Walk embedded groups[] and derive all role flags in one pass
    const boolFlags: Record<string, number> = {};
    let safetyOfficerType: string | null = null;
    const positionParts: string[] = [];

    for (const g of tc.groups || []) {
      const entries = byGroup.get(String(g.id)) || [];
      for (const { flag, name } of entries) {
        if (flag === "safetyOfficerType:SO") {
          safetyOfficerType = "SO";
        } else if (flag === "safetyOfficerType:SSO") {
          safetyOfficerType = "SSO";
        } else if (flag === "isPosition") {
          if (name && !positionParts.includes(name)) positionParts.push(name);
        } else {
          boolFlags[flag] = 1;
        }
      }
    }

    if (boolFlags.isCommittee) boolFlags.isAdmin = 1;

    const positionValue = positionParts.length > 0
      ? positionParts.join(", ")
      : (boolFlags.isCommittee ? "Committee" : null);

    const existing = email
      ? await queryOne<{ id: string; position: string | null; photoUrl: string | null }>(
          `SELECT id, position, "photoUrl" FROM contacts WHERE LOWER(email) = LOWER($1)`,
          [email]
        )
      : null;

    let contactId: string;

    if (existing) {
      contactId = existing.id;
      const clauses: Array<{ column: string; value: any }> = [
        { column: "name", value: firstName },
      ];
      if (lastName) clauses.push({ column: "surname", value: lastName });
      if (phone) clauses.push({ column: "phone", value: phone });
      if (organisation) clauses.push({ column: "organisation", value: organisation });

      for (const [col, val] of Object.entries(boolFlags)) {
        clauses.push({ column: col, value: val });
      }
      if (safetyOfficerType !== null) {
        clauses.push({ column: "safetyOfficerType", value: safetyOfficerType });
      }
      if (positionValue !== null) {
        const currentPos = (existing.position || "").trim();
        if (!currentPos || currentPos === "Committee") {
          clauses.push({ column: "position", value: positionValue });
        }
      }

      const allowedCols = ["name", "surname", "phone", "organisation",
        "isAdmin", "isCommittee", "isSafetyCommittee", "isContractor", "isParksVic",
        "safetyOfficerType", "position"];
      const { sql, params } = buildSafeUpdateClauses(clauses, allowedCols);
      if (sql) {
        params.push(existing.id);
        await execute(`UPDATE contacts SET ${sql}, "updatedAt" = NOW() WHERE id = $${params.length}`, params);
      }
      updated++;
    } else {
      contactId = generateId();
      await execute(
        `INSERT INTO contacts (id, name, surname, organisation, phone, email, "isAdmin",
                               "isCommittee", "isSafetyCommittee", "isContractor", "isParksVic",
                               "safetyOfficerType", position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          contactId, firstName, lastName, organisation, phone, email,
          boolFlags.isAdmin || 0,
          boolFlags.isCommittee || 0,
          boolFlags.isSafetyCommittee || 0,
          boolFlags.isContractor || 0,
          boolFlags.isParksVic || 0,
          safetyOfficerType,
          positionValue
        ]
      );
      created++;
    }

    // Image sync: download from TidyHQ if present and no existing photo
    if (tc.profile_image && !existing?.photoUrl) {
      try {
        const imageUrl = String(tc.profile_image).replace("/s200/", "/original/");
        const imgRes = await fetch(imageUrl);
        if (imgRes.ok) {
          const buffer = Buffer.from(await imgRes.arrayBuffer());
          const photoUrl = await saveContactPhoto(buffer, contactId);
          await execute(
            `UPDATE contacts SET "photoUrl" = $1, "photoAuthorised" = 1 WHERE id = $2`,
            [photoUrl, contactId]
          );
          imagesSynced++;
        }
      } catch (imgErr: any) {
        log.warn(`Image sync failed for contact ${contactId}: ${imgErr.message}`);
      }
    }
  }

  res.json({ created, updated, skipped, imagesSynced, total: tidyContacts.length });
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
    `SELECT id, organisation, name, surname, phone, email, notes, "isAdmin", "isCommittee",
            "isContractor", "isParksVic", "isSafetyCommittee", "isSocialMedia", "soAuthorised",
            "displayCommittee", "displaySafety", "showTelegram", "showPhone", "showEmail",
            "showAdminEmail", "photoUrl", "photoAuthorised", "fullNameDisplay", "createdAt",
            "updatedAt"
       FROM contacts
      WHERE id = $1`,
    [req.params.id]
  );
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
    `INSERT INTO contacts (id, organisation, name, surname, phone, email, notes, "isAdmin",
                           "isCommittee", "isContractor", "isParksVic", "isSafetyCommittee",
                           "isSocialMedia", "soAuthorised", "displayCommittee", "displaySafety",
                           "showTelegram", "showPhone", "showEmail", "showAdminEmail",
                           "fullNameDisplay", password)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`,
    [id, organisation || "", name, surname || "", phone || "", email || "", notes || "",
      isAdmin ? 1 : 0, isCommittee ? 1 : 0, isContractor ? 1 : 0, isParksVic ? 1 : 0,
      isSafetyCommittee ? 1 : 0, isSocialMedia ? 1 : 0, soAuthorised ? 1 : 0,
      displayCommittee !== false ? 1 : 0, displaySafety !== false ? 1 : 0,
      showTelegram ? 1 : 0, showPhone ? 1 : 0, showEmail ? 1 : 0, showAdminEmail ? 1 : 0,
      fullNameDisplay !== false ? 1 : 0, hashedPassword]
  );

  const contact = await queryOne<ContactRow>(
    `SELECT id, organisation, name, surname, phone, email, notes, "isAdmin", "isCommittee",
            "isContractor", "isParksVic", "isSafetyCommittee", "isSocialMedia", "soAuthorised",
            "displayCommittee", "displaySafety", "showTelegram", "showPhone", "showEmail",
            "showAdminEmail", "photoUrl", "photoAuthorised", "fullNameDisplay", "createdAt",
            "updatedAt"
       FROM contacts
      WHERE id = $1`,
    [id]
  );
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
            "fullNameDisplay" = $20, "photoAuthorised" = $21${passwordUpdate},
            "updatedAt" = NOW()
      WHERE id = $${params.length}`,
    params
  );

  if (result.rowCount === 0) return res.status(404).json({ error: "Contact not found" });
  const contact = await queryOne<ContactRow>(
    `SELECT id, organisation, name, surname, phone, email, notes, "isAdmin", "isCommittee",
            "isContractor", "isParksVic", "isSafetyCommittee", "isSocialMedia", "soAuthorised",
            "displayCommittee", "displaySafety", "showTelegram", "showPhone", "showEmail",
            "showAdminEmail", "photoUrl", "photoAuthorised", "fullNameDisplay", "createdAt",
            "updatedAt"
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

  if (contact.isAdmin) {
    await execute(`DELETE FROM admin_sessions WHERE "userId" = $1`, [req.params.id]);
  }

  if (force) {
    await execute(`DELETE FROM project_contacts WHERE "contactId" = $1`, [req.params.id]);
  }

  const result = await execute(`DELETE FROM contacts WHERE id = $1`, [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: "Contact not found" });
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
