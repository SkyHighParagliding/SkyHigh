import { Router } from "express";
import db from "../../db.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";

const router = Router();

router.get("/slider-photos", asyncHandler(async (_req, res) => {
  const libRow = (await db.prepare("SELECT value FROM settings WHERE key = 'imageLibrary'").get() as any);
  const result: { src: string; variant: string }[] = [];
  if (libRow) {
    try {
      const lib = JSON.parse(libRow.value);
      for (const entry of lib) {
        if (entry.sliderEnabled === false) continue;
        const lgEnabled = entry.sliderLgEnabled !== undefined ? entry.sliderLgEnabled !== false : true;
        const smEnabled = entry.sliderSmEnabled !== undefined ? entry.sliderSmEnabled !== false : true;
        const ptEnabled = entry.sliderPortraitEnabled !== undefined ? entry.sliderPortraitEnabled !== false : true;
        if (entry.sliderLg && lgEnabled) result.push({ src: entry.sliderLg, variant: "landscape-lg" });
        if (entry.sliderSm && smEnabled) result.push({ src: entry.sliderSm, variant: "landscape-sm" });
        if (entry.sliderPortrait && ptEnabled) result.push({ src: entry.sliderPortrait, variant: "portrait" });
      }
    } catch {}
  }
  res.json(result);
}));

router.get("/youtube-videos", asyncHandler(async (_req, res) => {
  const row = (await db.prepare("SELECT value FROM settings WHERE key = 'youtubeVideos'").get() as any);
  let result: { url: string }[] = [];
  if (row) {
    try {
      result = JSON.parse(row.value);
    } catch {}
  }
  res.json(result);
}));

router.post("/youtube-scrape", requireAuth, asyncHandler(async (req, res) => {
  const { channelUrl } = req.body;
  if (!channelUrl || typeof channelUrl !== "string") {
    return res.status(400).json({ error: "channelUrl is required" });
  }

  let channelId: string | null = null;

  if (channelUrl.includes("channel/UC")) {
    const match = channelUrl.match(/channel\/(UC[a-zA-Z0-9_-]+)/);
    if (match) channelId = match[1];
  }

  if (!channelId) {
    const pageRes = await fetch(channelUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SkyHighBot/1.0)" },
    });
    if (!pageRes.ok) {
      return res.status(400).json({ error: `Failed to fetch channel page: ${pageRes.status}` });
    }
    const html = await pageRes.text();
    const cidMatch = html.match(/channel_id=([^"&\s]+)/);
    if (cidMatch) channelId = cidMatch[1];
  }

  if (!channelId) {
    return res.status(400).json({ error: "Could not determine channel ID from the provided URL" });
  }

  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  const feedRes = await fetch(feedUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SkyHighBot/1.0)" },
  });
  if (!feedRes.ok) {
    return res.status(400).json({ error: `Failed to fetch RSS feed: ${feedRes.status}` });
  }

  const xml = await feedRes.text();
  const videoIdMatches = [...xml.matchAll(/<yt:videoId>([^<]+)<\/yt:videoId>/g)];
  const scrapedUrls = videoIdMatches.map((m) => `https://youtu.be/${m[1]}`);

  const row = (await db.prepare("SELECT value FROM settings WHERE key = 'youtubeVideos'").get() as any);
  let existing: { url: string }[] = [];
  if (row) {
    try { existing = JSON.parse(row.value); } catch {}
  }

  const existingIds = new Set(
    existing.map((v) => {
      try {
        const u = new URL(v.url);
        if (u.hostname === "youtu.be") return u.pathname.slice(1).split("/")[0];
        return u.searchParams.get("v") || "";
      } catch { return ""; }
    }).filter(Boolean)
  );

  const newUrls = scrapedUrls.filter((url) => {
    const id = url.replace("https://youtu.be/", "");
    return !existingIds.has(id);
  });

  const MAX_VIDEOS = 40;
  const merged = [...newUrls.map((url) => ({ url })), ...existing].slice(0, MAX_VIDEOS);

  await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('youtubeVideos', ?)").run(JSON.stringify(merged));

  res.json({
    channelId,
    scraped: scrapedUrls.length,
    newAdded: newUrls.length,
    total: merged.length,
  });
}));

export default router;
