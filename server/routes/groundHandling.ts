import { Router } from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = Router();

function generateId() {
  return `gh-${Math.random().toString(36).substr(2, 9)}`;
}

router.get("/", asyncHandler(async (req, res) => {
  const sites = await db.prepare(
    "SELECT id, name, lat, lon, windDirections, description, notes, createdAt, updatedAt FROM ground_handling_sites ORDER BY name ASC"
  ).all();
  res.json(sites);
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const site = await db.prepare(
    "SELECT id, name, lat, lon, windDirections, description, notes, createdAt, updatedAt FROM ground_handling_sites WHERE id = ?"
  ).get(req.params.id);
  if (!site) return res.status(404).json({ error: "Ground handling site not found" });
  res.json(site);
}));

router.post("/", requireAuth, asyncHandler(async (req, res) => {
  const { name, lat, lon, windDirections, description, notes } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });

  const id = generateId();
  await db.prepare(
    `INSERT INTO ground_handling_sites (id, name, lat, lon, windDirections, description, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    name.trim(),
    lat != null ? Number(lat) : null,
    lon != null ? Number(lon) : null,
    windDirections || "",
    description || "",
    notes || ""
  );

  const site = await db.prepare(
    "SELECT id, name, lat, lon, windDirections, description, notes, createdAt, updatedAt FROM ground_handling_sites WHERE id = ?"
  ).get(id);
  res.status(201).json(site);
}));

router.put("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { name, lat, lon, windDirections, description, notes } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });

  const result = await db.prepare(
    `UPDATE ground_handling_sites SET name = ?, lat = ?, lon = ?, windDirections = ?, description = ?, notes = ?,
     updatedAt = datetime('now') WHERE id = ?`
  ).run(
    name.trim(),
    lat != null ? Number(lat) : null,
    lon != null ? Number(lon) : null,
    windDirections || "",
    description || "",
    notes || "",
    req.params.id
  );

  if (result.changes === 0) return res.status(404).json({ error: "Ground handling site not found" });

  const site = await db.prepare(
    "SELECT id, name, lat, lon, windDirections, description, notes, createdAt, updatedAt FROM ground_handling_sites WHERE id = ?"
  ).get(req.params.id);
  res.json(site);
}));

router.post("/import", requireAuth, asyncHandler(async (req, res) => {
  const { sites, windDirections, overwriteDuplicates } = req.body;
  if (!Array.isArray(sites) || sites.length === 0) {
    return res.status(400).json({ error: "No sites provided" });
  }

  const existingNames = new Map<string, string>();
  const allExisting = await db.prepare("SELECT id, name FROM ground_handling_sites").all() as { id: string; name: string }[];
  for (const s of allExisting) {
    existingNames.set(s.name.toLowerCase().trim(), s.id);
  }

  const insertStmt = await db.prepare(
    `INSERT INTO ground_handling_sites (id, name, lat, lon, windDirections, description, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const updateStmt = await db.prepare(
    `UPDATE ground_handling_sites SET lat = ?, lon = ?, windDirections = ?, description = ?, notes = ?,
     updatedAt = datetime('now') WHERE id = ?`
  );

  let imported = 0;
  let skipped = 0;
  let overwritten = 0;
  const duplicates: string[] = [];

  const transaction = await db.transaction(async () => {
    for (const site of sites) {
      const name = (site.name || "").trim();
      if (!name) continue;

      let lat: number | null = site.lat != null ? Number(site.lat) : null;
      let lon: number | null = site.lon != null ? Number(site.lon) : null;
      if (lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) lat = null;
      if (lon !== null && (!Number.isFinite(lon) || lon < -180 || lon > 180)) lon = null;

      const existingId = existingNames.get(name.toLowerCase());
      if (existingId) {
        if (overwriteDuplicates) {
          await updateStmt.run(
            lat,
            lon,
            windDirections || "",
            site.description || "",
            site.notes || "",
            existingId
          );
          overwritten++;
        } else {
          duplicates.push(name);
          skipped++;
        }
      } else {
        const id = generateId();
        await insertStmt.run(
          id,
          name,
          lat,
          lon,
          windDirections || "",
          site.description || "",
          site.notes || ""
        );
        existingNames.set(name.toLowerCase(), id);
        imported++;
      }
    }
  });

  await transaction();

  res.json({ imported, skipped, overwritten, duplicates });
}));

router.delete("/:id", requireAuth, asyncHandler(async (req, res) => {
  const result = await db.prepare("DELETE FROM ground_handling_sites WHERE id = ?").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "Ground handling site not found" });
  res.json({ success: true });
}));

export default router;
