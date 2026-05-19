import { Router } from "express";
import db from "../../db.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";
import { validateURLSafety } from "../../utils/urlValidator.js";

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

  const urlValidation = validateURLSafety(channelUrl);
  if (!urlValidation.valid) {
    return res.status(400).json({ error: `Invalid URL: ${urlValidation.error}` });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: "YouTube API key not configured. Please ask your Webmaster to add YOUTUBE_API_KEY to the Railway environment variables.\n\nSee Admin Manual for setup instructions.",
    });
  }

  // Resolve channel ID from any supported URL format
  let channelId: string | null = null;

  // Case 1: Direct /channel/UCxxxx URL
  const channelIdMatch = channelUrl.match(/channel\/(UC[a-zA-Z0-9_-]+)/);
  if (channelIdMatch) {
    channelId = channelIdMatch[1];
  }

  // Case 2: Legacy /user/ URL — resolve via API
  if (!channelId) {
    const userMatch = channelUrl.match(/youtube\.com\/user\/([^/?&#]+)/);
    if (userMatch) {
      const username = encodeURIComponent(userMatch[1]);
      const apiRes = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?forUsername=${username}&part=id&key=${apiKey}`
      );
      if (apiRes.ok) {
        const data = await apiRes.json() as any;
        channelId = data?.items?.[0]?.id ?? null;
      }
    }
  }

  // Case 3: @handle URL — resolve via API
  if (!channelId) {
    const handleMatch = channelUrl.match(/youtube\.com\/@([^/?&#]+)/);
    if (handleMatch) {
      const handle = encodeURIComponent("@" + handleMatch[1]);
      const apiRes = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?forHandle=${handle}&part=id&key=${apiKey}`
      );
      if (apiRes.ok) {
        const data = await apiRes.json() as any;
        channelId = data?.items?.[0]?.id ?? null;
      }
      if (!channelId) {
        return res.status(400).json({
          error: `Could not resolve YouTube handle "@${handleMatch[1]}" to a channel ID. Check that the handle is correct and the channel is public.`,
        });
      }
    }
  }

  if (!channelId) {
    return res.status(400).json({
      error: "Could not determine a channel ID from the provided URL. Supported formats:\n• https://www.youtube.com/channel/UCxxxxxxxx\n• https://www.youtube.com/@handle\n• https://www.youtube.com/user/username",
    });
  }

  // Uploads playlist ID = channel ID with UC prefix replaced by UU
  const uploadsPlaylistId = "UU" + channelId.slice(2);

  const MAX_VIDEOS = 40;
  const apiRes = await fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?playlistId=${uploadsPlaylistId}&part=contentDetails&maxResults=${MAX_VIDEOS}&key=${apiKey}`
  );

  if (!apiRes.ok) {
    const errBody = await apiRes.json().catch(() => ({})) as any;
    const errMsg = errBody?.error?.message ?? apiRes.status;
    return res.status(400).json({ error: `YouTube API error: ${errMsg}` });
  }

  const data = await apiRes.json() as any;
  const scrapedUrls: string[] = (data.items ?? []).map(
    (item: any) => `https://youtu.be/${item.contentDetails.videoId}`
  );

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
