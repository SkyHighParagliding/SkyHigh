import { Router } from "express";
import { query, queryOne, execute, transaction } from "../pg.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = Router();

interface GroundHandlingSite {
  id: string;
  name: string;
  lat: number | null;
  lon: number | null;
  windDirections: string;
  description: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

interface ExistingSite {
  id: string;
  name: string;
}

function generateId() {
  return `gh-${Math.random().toString(36).substr(2, 9)}`;
}

router.get("/", asyncHandler(async (req, res) => {
  const sites = await query<GroundHandlingSite>(
    "SELECT id, name, lat, lon, \"windDirections\", description, notes, \"createdAt\", \"updatedAt\" FROM ground_handling_sites ORDER BY name ASC"
  );
  res.json(sites);
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const site = await queryOne<GroundHandlingSite>(
    "SELECT id, name, lat, lon, \"windDirections\", description, notes, \"createdAt\", \"updatedAt\" FROM ground_handling_sites WHERE id = $1",
    [req.params.id]
  );
  if (!site) return res.status(404).json({ error: "Ground handling site not found" });
  res.json(site);
}));

router.post("/", requireAuth, asyncHandler(async (req, res) => {
  const { name, lat, lon, windDirections, description, notes } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });

  const id = generateId();
  await execute(
    `INSERT INTO ground_handling_sites (id, name, lat, lon, "windDirections", description, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      name.trim(),
      lat != null ? Number(lat) : null,
      lon != null ? Number(lon) : null,
      windDirections || "",
      description || "",
      notes || ""
    ]
  );

  const site = await queryOne<GroundHandlingSite>(
    "SELECT id, name, lat, lon, \"windDirections\", description, notes, \"createdAt\", \"updatedAt\" FROM ground_handling_sites WHERE id = $1",
    [id]
  );
  res.status(201).json(site);
}));

router.put("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { name, lat, lon, windDirections, description, notes } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });

  const result = await execute(
    `UPDATE ground_handling_sites SET name = $1, lat = $2, lon = $3, "windDirections" = $4, description = $5, notes = $6,
     "updatedAt" = NOW() WHERE id = $7`,
    [
      name.trim(),
      lat != null ? Number(lat) : null,
      lon != null ? Number(lon) : null,
      windDirections || "",
      description || "",
      notes || "",
      req.params.id
    ]
  );

  if (result.rowCount === 0) return res.status(404).json({ error: "Ground handling site not found" });

  const site = await queryOne<GroundHandlingSite>(
    "SELECT id, name, lat, lon, \"windDirections\", description, notes, \"createdAt\", \"updatedAt\" FROM ground_handling_sites WHERE id = $1",
    [req.params.id]
  );
  res.json(site);
}));

router.post("/import", requireAuth, asyncHandler(async (req, res) => {
  const { sites, windDirections, overwriteDuplicates } = req.body;
  if (!Array.isArray(sites) || sites.length === 0) {
    return res.status(400).json({ error: "No sites provided" });
  }

  const existingNames = new Map<string, string>();
  const allExisting = await query<ExistingSite>("SELECT id, name FROM ground_handling_sites");
  for (const s of allExisting) {
    existingNames.set(s.name.toLowerCase().trim(), s.id);
  }

  let imported = 0;
  let skipped = 0;
  let overwritten = 0;
  const duplicates: string[] = [];

  await transaction(async (client) => {
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
          const result = await client.query(
            `UPDATE ground_handling_sites SET lat = $1, lon = $2, "windDirections" = $3, description = $4, notes = $5,
             "updatedAt" = NOW() WHERE id = $6`,
            [
              lat,
              lon,
              windDirections || "",
              site.description || "",
              site.notes || "",
              existingId
            ]
          );
          if (result.rowCount > 0) overwritten++;
        } else {
          duplicates.push(name);
          skipped++;
        }
      } else {
        const id = generateId();
        await client.query(
          `INSERT INTO ground_handling_sites (id, name, lat, lon, "windDirections", description, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            id,
            name,
            lat,
            lon,
            windDirections || "",
            site.description || "",
            site.notes || ""
          ]
        );
        existingNames.set(name.toLowerCase(), id);
        imported++;
      }
    }
  });

  res.json({ imported, skipped, overwritten, duplicates });
}));

router.delete("/:id", requireAuth, asyncHandler(async (req, res) => {
  const result = await execute("DELETE FROM ground_handling_sites WHERE id = $1", [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: "Ground handling site not found" });
  res.json({ success: true });
}));

export default router;
