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

  // Validate URL to prevent SSRF attacks
  const urlValidation = validateURLSafety(channelUrl);
  if (!urlValidation.valid) {
    return res.status(400).json({ error: `Invalid URL: ${urlValidation.error}` });
  }

  let feedUrl: string | null = null;

  // Case 1: Direct channel ID URL — most reliable
  const channelIdMatch = channelUrl.match(/channel\/(UC[a-zA-Z0-9_-]+)/);
  if (channelIdMatch) {
    feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelIdMatch[1]}`;
  }

  // Case 2: Legacy /user/ URL — use user= RSS directly, no HTML scraping needed
  if (!feedUrl) {
    const userMatch = channelUrl.match(/youtube\.com\/user\/([^/?&#]+)/);
    if (userMatch) {
      feedUrl = `https://www.youtube.com/feeds/videos.xml?user=${encodeURIComponent(userMatch[1])}`;
    }
  }

  // Case 3: @handle URL — YouTube serves bot-detection HTML server-side, channel ID
  // cannot be reliably extracted without the YouTube Data API. Guide the user instead.
  if (!feedUrl && channelUrl.match(/youtube\.com\/@/)) {
    return res.status(400).json({
      error: "YouTube @handle URLs cannot be resolved automatically. Please use your Channel ID URL instead.\n\nTo find your Channel ID: open YouTube Studio → Settings → Channel → Advanced settings — it starts with \"UC\".\n\nThen enter: https://www.youtube.com/channel/YOUR_CHANNEL_ID",
    });
  }

  // Case 4: Other URL formats — attempt HTML scrape as last resort
  if (!feedUrl) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const pageRes = await fetch(channelUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!pageRes.ok) {
        return res.status(400).json({ error: `Failed to fetch channel page: ${pageRes.status}` });
      }
      const html = await pageRes.text();
      const cidPatterns = [
        /channel_id=(UC[a-zA-Z0-9_-]+)/,
        /"channelId":"(UC[a-zA-Z0-9_-]+)"/,
        /"externalChannelId":"(UC[a-zA-Z0-9_-]+)"/,
        /"browseId":"(UC[a-zA-Z0-9_-]+)"/,
        /\/channel\/(UC[a-zA-Z0-9_-]+)/,
      ];
      for (const pattern of cidPatterns) {
        const m = html.match(pattern);
        if (m) { feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${m[1]}`; break; }
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        return res.status(408).json({ error: "Request timeout fetching channel page" });
      }
      return res.status(400).json({ error: `Failed to fetch channel page: ${err.message}` });
    }
  }

  if (!feedUrl) {
    return res.status(400).json({ error: "Could not determine the RSS feed URL from the provided channel URL. Try using your Channel ID URL: https://www.youtube.com/channel/UCxxxxxxxx" });
  }

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
