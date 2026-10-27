// One-button committee updates from TidyHQ (Contact Manager → "Update SH Committee" /
// "Update Safety Committee"). TidyHQ is the source of truth for the groups listed in
// tidyhq_group_mappings: members of those groups get the flags and position titles,
// and local contacts that are flagged but no longer in any of the groups lose them.
// preview() and apply() share planSync() so the confirm list is what gets written.
import { query, transaction } from "../pg.js";
import { tidyhqFetch } from "../utils/tidyhqFetch.js";
import { saveContactPhoto } from "./photoService.js";
import createLogger from "../utils/logger.js";

const log = createLogger("committee-sync");

export type SyncSet = "committee" | "safety";

// Which mapping flags belong to which button.
export const SET_FLAGS: Record<SyncSet, string[]> = {
  committee: ["isCommittee", "isPosition"],
  safety: ["isSafetyCommittee", "safetyOfficerType:SO", "safetyOfficerType:SSO"],
};

// Display order for position titles when someone holds more than one.
const POSITION_ORDER = ["President", "Vice President", "Secretary", "Treasurer"];

interface Mapping { tidyhqGroupId: string; tidyhqGroupName: string; localRoleFlag: string }

interface LocalContact {
  id: string; name: string; surname: string; email: string; position: string | null;
  isAdmin: number; isCommittee: number; isSafetyCommittee: number;
  safetyOfficerType: string | null; photoUrl: string | null;
}

interface TidyPerson {
  tidyhqId: string; firstName: string; lastName: string; email: string;
  phone: string; organisation: string; profileImage: string | null;
  groupIds: Set<string>;
}

export interface SyncChange {
  kind: "create" | "update" | "remove";
  contactId: string | null;      // null for create
  name: string;
  email: string;
  details: string[];             // plain-English lines for the confirm box
  removesAdmin: boolean;         // remove only: admin login will be taken away unless kept
  adminProtected?: string;       // remove only: why admin can't be removed (last admin / yourself)
  set: Record<string, any>;      // columns to write
  person?: TidyPerson;           // create only
}

export interface SyncPlan {
  set: SyncSet;
  groups: string[];
  changes: SyncChange[];
  unchanged: number;
  skippedNoEmail: string[];
  photos: Array<{ contactId: string; url: string }>; // existing contacts with no photo yet
}

function normPos(p: string | null | undefined): string {
  return (p || "").split(",").map(s => s.trim()).filter(Boolean).join(", ");
}

function orderPositions(names: string[]): string[] {
  const rank = (n: string) => { const i = POSITION_ORDER.indexOf(n); return i === -1 ? 99 : i; };
  return [...names].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

async function fetchGroupMembers(groupId: string): Promise<any[]> {
  const res = await tidyhqFetch(`/groups/${groupId}/contacts`);
  if (!res.ok) throw new Error(`TidyHQ group ${groupId}: HTTP ${res.status} ${await res.text()}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error(`TidyHQ group ${groupId}: unexpected response`);
  return data;
}

export async function planSync(set: SyncSet, currentUserId: string | number | null): Promise<SyncPlan> {
  const allMappings = await query<Mapping>(
    `SELECT "tidyhqGroupId", "tidyhqGroupName", "localRoleFlag" FROM tidyhq_group_mappings`
  );
  const mappings = allMappings.filter(m => SET_FLAGS[set].includes(m.localRoleFlag));
  if (mappings.length === 0) throw new Error("No TidyHQ groups are set up for this update (Connections → TidyHQ Group Sync).");

  // Every mapped group name is "owned" by the sync; anything else in a position is a
  // hand-typed title and is kept.
  const ownedTitles = new Set([...allMappings.map(m => m.tidyhqGroupName.trim()), "Committee"]);

  // Fetch each group once, and merge people by TidyHQ id.
  const people = new Map<string, TidyPerson>();
  const groupIds = [...new Set(mappings.map(m => m.tidyhqGroupId))];
  for (const gid of groupIds) {
    for (const c of await fetchGroupMembers(gid)) {
      const id = String(c.id);
      let p = people.get(id);
      if (!p) {
        const emailObj = Array.isArray(c.email_addresses) ? c.email_addresses[0] : null;
        const phoneObj = Array.isArray(c.phone_numbers) ? c.phone_numbers[0] : null;
        p = {
          tidyhqId: id,
          firstName: (c.first_name || "").trim(),
          lastName: (c.last_name || "").trim(),
          email: (emailObj?.address || c.email_address || "").trim().toLowerCase(),
          phone: phoneObj?.number || c.phone_number || "",
          organisation: (c.company || "").trim(),
          profileImage: c.profile_image ? String(c.profile_image) : null,
          groupIds: new Set(),
        };
        people.set(id, p);
      }
      p.groupIds.add(gid);
    }
  }

  const locals = await query<LocalContact>(
    `SELECT id, name, surname, email, position, "isAdmin", "isCommittee", "isSafetyCommittee",
            "safetyOfficerType", "photoUrl" FROM contacts`
  );
  const byEmail = new Map<string, LocalContact>();
  for (const l of locals) {
    const e = (l.email || "").trim().toLowerCase();
    if (e && !byEmail.has(e)) byEmail.set(e, l);
  }

  const plan: SyncPlan = { set, groups: [...new Set(mappings.map(m => m.tidyhqGroupName.trim()))], changes: [], unchanged: 0, skippedNoEmail: [], photos: [] };
  const matchedIds = new Set<string>();
  const fullName = (first: string, last: string) => `${first} ${last}`.trim();

  for (const p of people.values()) {
    if (!p.email) { plan.skippedNoEmail.push(fullName(p.firstName, p.lastName)); continue; }
    const inFlag = (flag: string) => mappings.some(m => m.localRoleFlag === flag && p.groupIds.has(m.tidyhqGroupId));
    const local = byEmail.get(p.email);
    if (local) matchedIds.add(local.id);

    const target: Record<string, any> = {};
    if (set === "committee") {
      const titles = orderPositions(mappings
        .filter(m => m.localRoleFlag === "isPosition" && p.groupIds.has(m.tidyhqGroupId))
        .map(m => m.tidyhqGroupName.trim()));
      const kept = normPos(local?.position).split(", ").filter(t => t && !ownedTitles.has(t));
      target.isCommittee = 1;
      target.isAdmin = 1;
      target.position = [...titles, ...kept].join(", ") || null;
    } else {
      target.isSafetyCommittee = 1;
      target.safetyOfficerType = inFlag("safetyOfficerType:SSO") ? "SSO" : inFlag("safetyOfficerType:SO") ? "SO" : null;
    }

    if (!local) {
      plan.changes.push({
        kind: "create", contactId: null, name: fullName(p.firstName, p.lastName), email: p.email,
        details: describe(null, target, set), removesAdmin: false, set: target, person: p,
      });
      continue;
    }
    if (!local.photoUrl && p.profileImage) plan.photos.push({ contactId: local.id, url: p.profileImage });
    const details = describe(local, target, set);
    if (details.length === 0) { plan.unchanged++; continue; }
    plan.changes.push({
      kind: "update", contactId: local.id, name: fullName(local.name, local.surname), email: p.email,
      details, removesAdmin: false, set: target,
    });
  }

  // Flagged locally but not in any of the TidyHQ groups → remove.
  const flagCol = set === "committee" ? "isCommittee" : "isSafetyCommittee";
  const leaving = locals.filter(l => (l as any)[flagCol] === 1 && !matchedIds.has(l.id));
  let adminsLeft = locals.filter(l => l.isAdmin === 1).length;
  for (const l of leaving) {
    const target: Record<string, any> = {};
    let removesAdmin = false;
    let adminProtected: string | undefined;
    if (set === "committee") {
      target.isCommittee = 0;
      target.position = normPos(l.position).split(", ").filter(t => t && !ownedTitles.has(t)).join(", ") || null;
      if (l.isAdmin === 1) {
        if (currentUserId !== null && String(currentUserId) === l.id) adminProtected = "you are logged in as this contact";
        else if (adminsLeft <= 1) adminProtected = "they are the last admin";
        else { target.isAdmin = 0; removesAdmin = true; adminsLeft--; }
      }
    } else {
      target.isSafetyCommittee = 0;
      target.safetyOfficerType = null;
    }
    const details = describe(l, target, set);
    if (adminProtected) details.push(`Admin login kept: ${adminProtected}`);
    plan.changes.push({
      kind: "remove", contactId: l.id, name: fullName(l.name, l.surname), email: l.email,
      details, removesAdmin, adminProtected, set: target,
    });
  }

  const order = { create: 0, update: 1, remove: 2 };
  plan.changes.sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name));
  return plan;
}

function describe(local: LocalContact | null, target: Record<string, any>, set: SyncSet): string[] {
  const out: string[] = [];
  if (set === "committee") {
    if ("isCommittee" in target && (local?.isCommittee ?? 0) !== target.isCommittee) {
      out.push(target.isCommittee ? "Added to the committee" : "Removed from the committee");
    }
    if ("isAdmin" in target && (local?.isAdmin ?? 0) !== target.isAdmin) {
      out.push(target.isAdmin ? "Gets admin login" : "Admin login removed");
    }
    const before = normPos(local?.position), after = normPos(target.position);
    if (before !== after) {
      out.push(before && after ? `Position: ${before} → ${after}` : after ? `Position: ${after}` : `Position removed (was ${before})`);
    }
  } else {
    if ((local?.isSafetyCommittee ?? 0) !== target.isSafetyCommittee) {
      out.push(target.isSafetyCommittee ? "Added to the Safety Committee" : "Removed from the Safety Committee");
    }
    const before = local?.safetyOfficerType || null, after = target.safetyOfficerType || null;
    if (before !== after) {
      out.push(before && after ? `${before} → ${after}` : after ? `Safety officer: ${after}` : `No longer ${before}`);
    }
  }
  return out;
}

function newId() {
  return `con-${Math.random().toString(36).substr(2, 9)}`;
}

export async function applySync(
  set: SyncSet, currentUserId: string | number | null, keepAdminIds: string[]
): Promise<{ created: number; updated: number; removed: number; imagesSynced: number }> {
  const plan = await planSync(set, currentUserId);
  const keep = new Set(keepAdminIds);
  const allowed = new Set(["isAdmin", "isCommittee", "isSafetyCommittee", "safetyOfficerType", "position"]);
  let created = 0, updated = 0, removed = 0;
  const photoJobs = [...plan.photos];

  await transaction(async (client) => {
    for (const c of plan.changes) {
      const cols = { ...c.set };
      if (c.kind === "remove" && keep.has(c.contactId!)) delete cols.isAdmin;
      if (c.kind === "create") {
        const p = c.person!;
        const id = newId();
        await client.query(
          `INSERT INTO contacts (id, name, surname, organisation, phone, email, "isAdmin", "isCommittee",
                                 "isSafetyCommittee", "safetyOfficerType", position)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [id, p.firstName, p.lastName, p.organisation, p.phone, p.email,
           cols.isAdmin ?? 0, cols.isCommittee ?? 0, cols.isSafetyCommittee ?? 0,
           cols.safetyOfficerType ?? null, cols.position ?? null]
        );
        created++;
        if (p.profileImage) photoJobs.push({ contactId: id, url: p.profileImage });
        continue;
      }
      const entries = Object.entries(cols).filter(([k]) => allowed.has(k));
      if (entries.length > 0) {
        const sets = entries.map(([k], i) => `"${k}" = $${i + 1}`).join(", ");
        await client.query(
          `UPDATE contacts SET ${sets}, "updatedAt" = NOW() WHERE id = $${entries.length + 1}`,
          [...entries.map(([, v]) => v), c.contactId]
        );
        if (c.kind === "remove") removed++; else updated++;
      }
    }
  });

  // Photos only for contacts that don't have one yet (outside the transaction: network).
  let imagesSynced = 0;
  if (photoJobs.length) {
    const ids = photoJobs.map(j => j.contactId);
    const withPhoto = new Set((await query<{ id: string }>(
      `SELECT id FROM contacts WHERE id = ANY($1) AND "photoUrl" IS NOT NULL AND "photoUrl" <> ''`, [ids]
    )).map(r => r.id));
    for (const job of photoJobs) {
      if (withPhoto.has(job.contactId)) continue;
      try {
        // TidyHQ sometimes refuses /original/ (403); the 200px version always works.
        let imgRes = await fetch(job.url.replace("/s200/", "/original/"));
        if (!imgRes.ok) imgRes = await fetch(job.url);
        if (!imgRes.ok) { log.warn(`Photo fetch failed for ${job.contactId}: HTTP ${imgRes.status}`); continue; }
        const photoUrl = await saveContactPhoto(Buffer.from(await imgRes.arrayBuffer()), job.contactId);
        await query(`UPDATE contacts SET "photoUrl" = $1, "photoAuthorised" = 1 WHERE id = $2`, [photoUrl, job.contactId]);
        imagesSynced++;
      } catch (err: any) {
        log.warn(`Photo sync failed for ${job.contactId}: ${err.message}`);
      }
    }
  }

  log.info(`${set} sync applied: ${created} created, ${updated} updated, ${removed} removed, ${imagesSynced} photos`);
  return { created, updated, removed, imagesSynced };
}
