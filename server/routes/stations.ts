import { Router } from "express";
import asyncHandler from "../utils/asyncHandler.js";
import { getLiveStations, getStationHistory } from "../stations/index.js";

const router = Router();

router.get("/live", asyncHandler(async (_req, res) => {
  const body = await getLiveStations();
  res.setHeader("Cache-Control", "public, max-age=120");
  res.json(body);
}));

router.get("/history", asyncHandler(async (req, res) => {
  const id = req.query.id;
  if (typeof id !== "string" || id.length === 0 || id.length > 80) {
    return res.status(400).json({ error: "id required (string, max 80 chars)" });
  }
  const h = Number(req.query.hours ?? 6);
  const hours = Math.min(6, Math.max(1, Number.isFinite(h) ? h : 6));
  const body = await getStationHistory(id, hours);
  if (!body) return res.status(404).json({ error: "Unknown station" });
  res.setHeader("Cache-Control", "public, max-age=120");
  res.json(body);
}));

export default router;
