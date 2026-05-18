import "dotenv/config";
import { Router } from "express";
import { GoogleGenAI } from "@google/genai";
import db from "../db.js";
import multer from "multer";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import asyncHandler from "../utils/asyncHandler.js";
import { parseAiJsonResponse } from "../utils/aiJsonParser.js";
import { requireAuth } from "../middleware/auth.js";
import { generateTextWithFallback, getTextModels, getImageModels, setTextModels, setImageModels, DEFAULT_TEXT_MODELS, DEFAULT_IMAGE_MODELS } from "../utils/aiModels.js";
import { extractEssentialInfo, isAllowedScrapeUrl } from "../utils/essentialInfo.js";
import { scrapeSiteguidePage, extractResponsibleClub } from "../utils/siteScraper.js";
import { getAppScriptUrl, isDriveConnected, ensureFolderStructure, uploadFile } from "../googleDrive.js";
import { validateURLSafety } from "../utils/urlValidator.js";
import { applyWatermark, normalizePosition } from "../utils/watermark.js";
import { saveFile, readFile, fileExists, keyFromUrl, isR2Configured, StorageKey } from "../storage.js";

async function rotateAndCrop(buffer: Buffer, angleDeg: number): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  const W = meta.width!;
  const H = meta.height!;
  const rad = Math.abs(angleDeg) * (Math.PI / 180);
  const sinA = Math.sin(rad);
  const cosA = Math.cos(rad);

  const aspect = W / H;
  let cropW: number, cropH: number;

  if (aspect >= 1) {
    cropH = (H * cosA - W * sinA) / (cosA * cosA - sinA * sinA);
    if (cropH <= 0 || cropH > H) {
      cropH = H * cosA * cosA;
    }
    cropW = cropH * aspect;
  } else {
    cropW = (W * cosA - H * sinA) / (cosA * cosA - sinA * sinA);
    if (cropW <= 0 || cropW > W) {
      cropW = W * cosA * cosA;
    }
    cropH = cropW / aspect;
  }

  cropW = Math.max(1, Math.floor(cropW) - 2);
  cropH = Math.max(1, Math.floor(cropH) - 2);

  const rotated = await sharp(buffer)
    .rotate(angleDeg, { background: { r: 255, g: 0, b: 255 } })
    .toBuffer();
  const rotMeta = await sharp(rotated).metadata();
  const rW = rotMeta.width!;
  const rH = rotMeta.height!;

  const finalW = Math.min(cropW, rW);
  const finalH = Math.min(cropH, rH);
  const left = Math.floor((rW - finalW) / 2);
  const top = Math.floor((rH - finalH) / 2);

  console.log(`>>> rotateAndCrop: ${W}x${H} → rotate ${angleDeg}° → ${rW}x${rH} → crop ${finalW}x${finalH} at (${left},${top})`);

  return sharp(rotated)
    .extract({ left, top, width: finalW, height: finalH })
    .jpeg({ quality: 95 })
    .toBuffer();
}

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const DEFAULT_RATING_PROMPT = `You are a paragliding/hang gliding site rating parser. Given raw rating text from an Australian site guide, extract and format the ratings into two separate fields.

RULES:
- PG ratings use: PG1, PG2, PG3, PG4, PG5
- HG ratings use: HG Supervised, HG Intermediate, HG Advanced
- IMPORTANT: PG2 is ALWAYS supervised — never output a bare "PG2". Always write "PG2 Supervised" (or "PG2 Sup" when abbreviating). If additional requirements exist, write them after, e.g. "PG2 Supervised requires PG4/SO".
- "Endorsed" means the pilot needs a site endorsement.
- If supervision is by FI/SSO, format as: "PG2 Supervised requires FI/SSO"
- If the site is unsuitable/closed for PG or HG, return "Not suitable" for that field
- If no rating info exists for PG or HG, return empty string
- There is NO rating higher than PG5 or HG Advanced
- Use full words the FIRST time they appear, then abbreviate for all subsequent uses:
  "Endorsed" → "End", "Supervised" → "Sup", "Intermediate" → "Int", "Advanced" → "Adv", "requires" → "req"
- Multiple levels separated by " | "

Return ONLY valid JSON with two fields:
{ "pgRating": "...", "hgRating": "..." }

Examples:
Input: "PG4 / HG Intermediate"
Output: { "pgRating": "PG4", "hgRating": "HG Intermediate" }

Input: "PG5 with endorsement. PG4 with endorsement, and under the on site supervision of an endorsed PG5"
Output: { "pgRating": "PG5 Endorsed | PG4 End requires PG5 End", "hgRating": "" }

Input: "PG5, PG4 Endorsed (Other PG4 under supervision of PG5) / HG Advanced"
Output: { "pgRating": "PG5 | PG4 Endorsed | PG4 End requires PG5", "hgRating": "HG Advanced" }

Input: "PG2 / HG Supervised"
Output: { "pgRating": "PG2 Supervised", "hgRating": "HG Supervised" }

Input: "PG2 / HG Supervised. PG2 require PG4/SO supervision. HG Sup require HG Int supervision."
Output: { "pgRating": "PG2 Supervised requires PG4/SO", "hgRating": "HG Supervised requires HG Int" }

Input: "Advanced HG only"
Output: { "pgRating": "Not suitable", "hgRating": "HG Advanced" }

Input: "HG only - Intermediate"
Output: { "pgRating": "Not suitable", "hgRating": "HG Intermediate" }

Input: "PG3 under supervision of PG4 or higher / HG Supervised under supervision of HG Intermediate"
Output: { "pgRating": "PG3 requires PG4+", "hgRating": "HG Supervised req HG Int" }`;

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

function sanitizeName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .substring(0, 60);
}

function uniqueFilename(dir: string, prefix: string, name: string, dimensions: string, ext: string): string {
  if (isR2Configured()) {
    const id = crypto.randomBytes(4).toString("hex");
    return `${prefix}-${name}-${id}-${dimensions}${ext}`;
  }
  const base = `${prefix}-${name}-${dimensions}${ext}`;
  if (!fs.existsSync(path.join(dir, base))) return base;
  let i = 2;
  while (fs.existsSync(path.join(dir, `${prefix}-${name}-${i}-${dimensions}${ext}`))) i++;
  return `${prefix}-${name}-${i}-${dimensions}${ext}`;
}

async function copyToDriveMarketingFolder(fileBuffer: Buffer, fileName: string): Promise<void> {
  try {
    const appScriptUrl = await getAppScriptUrl();
    if (appScriptUrl) {
      const base64Data = fileBuffer.toString("base64");
      const res = await fetch(
        `${appScriptUrl}?action=upload&folder=${encodeURIComponent("07_Marketing & Photos")}&name=${encodeURIComponent(fileName)}&mimeType=${encodeURIComponent("image/jpeg")}`,
        { method: "POST", headers: { "Content-Type": "text/plain" }, body: base64Data }
      );
      if (res.ok) return;
    }
    const connected = await isDriveConnected();
    if (!connected) return;
    const folderMap = await ensureFolderStructure(db);
    if (!folderMap || !folderMap["07"]) return;
    await uploadFile(fileBuffer, fileName, "image/jpeg", folderMap["07"]);
  } catch {
  }
}

router.get("/prompt", asyncHandler(async (req, res) => {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'aiSystemPrompt'").get() as { value: string };
  res.json({ prompt: row ? row.value : "" });
}));

router.put("/prompt", requireAuth, asyncHandler(async (req, res) => {
  const { prompt } = req.body;
  await db.prepare("UPDATE settings SET value = ? WHERE key = 'aiSystemPrompt'").run(prompt);
  res.json({ success: true });
}));

router.get("/image-prompt", asyncHandler(async (req, res) => {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'aiImagePrompt'").get() as { value: string };
  const defaultPrompt = `You are an expert photo editor for a paragliding club website. The output image will be used in two ways: a 1920x1080 hero image AND a 1920x600 banner crop from it. ALL subjects (people, paragliders, hang gliders, wings, pilots) must remain fully visible in both formats.

Process this image following these rules:

1. KEEP ALL SUBJECTS VISIBLE: This is the most important rule. Every person, paraglider wing, hang glider, pilot, and any other subject in the original must be FULLY visible and not cropped in the final image. If the original shows a pilot launching with a wing above, both the pilot on the ground AND the full wing in the sky must be included.

2. EXPAND TO ULTRA-WIDE LANDSCAPE: Generate the output as an ultra-wide landscape image (at least 3:1 width-to-height ratio, ideally wider). This gives enough room for the 1920x600 banner crop to show everything. Expand generously in ALL directions — left, right, top AND bottom — to create plenty of breathing room around the subjects:
   - Ocean/sea extends as more ocean with consistent waves and water colour.
   - Beach/sand extends as more beach.
   - Vegetation/grass/scrub extends as more of the same.
   - Sky extends as more sky with matching clouds and colour.
   - Ground/hills extend naturally.
   - NEVER add people, paragliders, buildings, or objects not in the original.
   - NEVER replace one terrain type with another (no sea where land was, no land where sea was).

3. ENHANCEMENT: Enhance with warm, vibrant lighting, blue skies, and an inviting sunny-day atmosphere. Keep all landscape features and geography recognisable — only improve mood and lighting.

Return the final enhanced image.`;
  res.json({ prompt: row ? row.value : defaultPrompt });
}));

router.put("/image-prompt", requireAuth, asyncHandler(async (req, res) => {
  const { prompt } = req.body;
  await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('aiImagePrompt', ?)").run(prompt);
  res.json({ success: true });
}));

router.get("/rating-prompt", asyncHandler(async (req, res) => {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'aiRatingPrompt'").get() as { value: string };
  res.json({ prompt: row ? row.value : DEFAULT_RATING_PROMPT });
}));

router.put("/rating-prompt", requireAuth, asyncHandler(async (req, res) => {
  const { prompt } = req.body;
  await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('aiRatingPrompt', ?)").run(prompt);
  res.json({ success: true });
}));

router.post("/parse-rating", requireAuth, asyncHandler(async (req, res) => {
  let apiKey = process.env.USER_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'geminiApiKey'").get() as { value: string } | undefined;
    if (row?.value) apiKey = row.value;
  }
  
  if (!apiKey) {
    return res.status(500).json({ error: "API Key not configured. Please add GEMINI_API_KEY to your .env file or database settings." });
  }

  const { ratingText } = req.body;
  if (!ratingText) {
    return res.status(400).json({ error: "Rating text is required" });
  }

  const row = await db.prepare("SELECT value FROM settings WHERE key = 'aiRatingPrompt'").get() as { value: string };
  const promptText = row ? row.value : DEFAULT_RATING_PROMPT;

  const ai = new GoogleGenAI({ apiKey });
  const { text: responseText } = await generateTextWithFallback(ai, {
    contents: `${promptText}\n\nRAW RATING TEXT:\n${ratingText}`,
    config: {
      responseMimeType: "application/json",
    },
  });

  const parsed = parseAiJsonResponse(responseText);

  res.json({ pgRating: parsed.pgRating || "", hgRating: parsed.hgRating || "" });
}));

router.get("/test", asyncHandler(async (req, res) => {
  console.log("AI Test endpoint hit - SUCCESS");
  res.setHeader('X-AI-API', 'true');
  res.status(200).send("AI API is reachable");
}));

router.get("/generate", asyncHandler(async (req, res) => {
  res.status(405).json({ error: "Method Not Allowed. Use POST." });
}));

router.post("/generate", requireAuth, asyncHandler(async (req, res) => {
  console.log(`>>> AI GENERATION START: ${req.method} ${req.url}`);
  const apiKey = process.env.USER_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API Key not configured. Please add USER_GEMINI_API_KEY to secrets." });
  }

  const { url } = req.body || {};
  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  // Validate URL to prevent SSRF attacks
  const urlValidation = validateURLSafety(url);
  if (!urlValidation.valid) {
    return res.status(400).json({ error: `Invalid URL: ${urlValidation.error}` });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let scrapeRes: Response;
  try {
    scrapeRes = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      throw new Error("Request timeout fetching the URL");
    }
    throw err;
  }

  if (!scrapeRes.ok) {
    throw new Error(`Failed to fetch the URL. Status: ${scrapeRes.status}`);
  }

  const html = await scrapeRes.text();
  const { allText, isSiteClosed, $ } = scrapeSiteguidePage(html);

  if (!allText || allText.length < 50) {
     throw new Error("Could not extract enough meaningful text from the page.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const row = await db.prepare("SELECT value FROM settings WHERE key = 'aiSystemPrompt'").get() as { value: string };
  const systemPrompt = row ? row.value : "";

  const finalPrompt = `${systemPrompt}\n\nTEXT CONTENT:\n${allText}`;

  const { text: responseText } = await generateTextWithFallback(ai, {
    contents: finalPrompt,
  });
  
  const aiResponse = parseAiJsonResponse(responseText);

  const directResponsibleClub = extractResponsibleClub(html);
  if (!aiResponse.responsibleClub && directResponsibleClub) {
    aiResponse.responsibleClub = directResponsibleClub;
  }

  aiResponse._isSiteClosed = isSiteClosed;

  const siteId = (aiResponse.name || "site").toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (isAllowedScrapeUrl(url)) {
    try {
      const essentialInfo = await extractEssentialInfo($, siteId, url);
      aiResponse._essentialImages = essentialInfo.images;
      aiResponse._essentialText = essentialInfo.text;
      console.log(`AI generate: Essential info — ${essentialInfo.images.length} map image(s), ${essentialInfo.text.length} chars safety text`);
    } catch (e: any) {
      console.log(`AI generate: Essential info extraction failed: ${e.message}`);
      aiResponse._essentialImages = [];
      aiResponse._essentialText = "";
    }
  } else {
    aiResponse._essentialImages = [];
    aiResponse._essentialText = "";
  }

  res.json(aiResponse);
}));

router.post("/enhance-image", requireAuth, upload.single("image"), asyncHandler(async (req, res) => {
  console.log(">>> AI IMAGE ENHANCE START");
  const apiKey = process.env.USER_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API Key not configured. Please add USER_GEMINI_API_KEY to secrets." });
  }

  if (!req.file) {
    return res.status(400).json({ error: "No image file uploaded" });
  }

  const prompt = req.body.prompt || "Transform this photo into a beautiful, vibrant image with a happy, fun, sunny day atmosphere.";
  const rotationAngle = parseFloat(req.body.rotation || "0");
  const cropRegionStr = req.body.cropRegion;

  const ai = new GoogleGenAI({ apiKey });

  let imageBuffer = req.file.buffer;
  let mimeType = req.file.mimetype || "image/jpeg";
  if (rotationAngle !== 0) {
    const origMeta = await sharp(req.file.buffer).metadata();
    console.log(`>>> Pre-rotating image by ${rotationAngle}° — original: ${origMeta.width}x${origMeta.height}`);
    imageBuffer = await rotateAndCrop(imageBuffer, rotationAngle);
    mimeType = "image/jpeg";
    const newMeta = await sharp(imageBuffer).metadata();
    console.log(`>>> After rotate+crop: ${newMeta.width}x${newMeta.height}`);
  }
  if (cropRegionStr) {
    imageBuffer = await applyCropRegion(imageBuffer, cropRegionStr);
    mimeType = "image/jpeg";
  }

  const imageBase64 = imageBuffer.toString("base64");

  let response: any = null;
  let lastError: Error | null = null;

  const imageModels = await getImageModels();
  for (const model of imageModels) {
    try {
      console.log(`>>> Trying image model: ${model}`);
      response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType, data: imageBase64 } },
              { text: prompt }
            ]
          }
        ],
        config: {
          responseModalities: ["TEXT", "IMAGE"]
        }
      });
      if (response?.candidates?.length) break;
    } catch (e: any) {
      console.log(`>>> Model ${model} failed: ${e.message}`);
      lastError = e;
      response = null;
    }
  }

  if (!response?.candidates || response.candidates.length === 0) {
    throw lastError || new Error("No response from Gemini image generation");
  }

  const parts = response.candidates[0].content?.parts || [];
  let resultImageBase64 = "";
  let resultMimeType = "image/png";

  for (const part of parts) {
    if (part.inlineData) {
      resultImageBase64 = part.inlineData.data || "";
      resultMimeType = part.inlineData.mimeType || "image/png";
      break;
    }
  }

  if (!resultImageBase64) {
    let textResponse = "";
    for (const part of parts) {
      if (part.text) {
        textResponse += part.text;
      }
    }
    throw new Error(textResponse || "Gemini did not return an image. Try adjusting your prompt.");
  }

  res.json({
    image: resultImageBase64,
    mimeType: resultMimeType
  });
}));

async function applyCropRegion(imageBuffer: Buffer, cropRegion: any): Promise<Buffer> {
  if (!cropRegion) return imageBuffer;
  let cr: any;
  try {
    cr = typeof cropRegion === 'string' ? JSON.parse(cropRegion) : cropRegion;
  } catch { return imageBuffer; }
  if (!cr || typeof cr.x !== 'number') return imageBuffer;
  const meta = await sharp(imageBuffer).metadata();
  const imgW = meta.width!;
  const imgH = meta.height!;
  const left = Math.max(0, Math.round(cr.x * imgW));
  const top = Math.max(0, Math.round(cr.y * imgH));
  const width = Math.min(Math.round(cr.w * imgW), imgW - left);
  const height = Math.min(Math.round(cr.h * imgH), imgH - top);
  if (width > 10 && height > 10) {
    console.log(`>>> Applying crop region: left=${left}, top=${top}, width=${width}, height=${height} (from ${imgW}x${imgH})`);
    return sharp(imageBuffer).extract({ left, top, width, height }).toBuffer();
  }
  return imageBuffer;
}

async function resizeAndCompress(inputBuffer: Buffer, width: number, height: number, maxSizeKB: number): Promise<Buffer> {
  let quality = 90;
  let result = await sharp(inputBuffer)
    .resize(width, height, { fit: 'cover', position: 'center' })
    .jpeg({ quality })
    .toBuffer();

  while (result.length > maxSizeKB * 1024 && quality > 20) {
    quality -= 10;
    result = await sharp(inputBuffer)
      .resize(width, height, { fit: 'cover', position: 'center' })
      .jpeg({ quality })
      .toBuffer();
  }

  return result;
}

const SLIDER_SIZES = [
  { key: "sliderLg",       w: 600, h: 400, prefix: "slider-lg",       label: "600x400" },
  { key: "sliderSm",       w: 450, h: 300, prefix: "slider-sm",       label: "450x300" },
  { key: "sliderPortrait", w: 267, h: 400, prefix: "slider-portrait", label: "267x400" },
] as const;

async function generateSliderImages(
  sourceBuffer: Buffer,
  sanitizedName: string,
  outDir: string,
  photographerCredit?: string,
  watermarkSize?: number,
  watermarkPosition?: string,
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  const wmPos = normalizePosition(watermarkPosition);
  for (const size of SLIDER_SIZES) {
    let buf = await resizeAndCompress(sourceBuffer, size.w, size.h, 120);
    buf = await applyWatermark(buf, photographerCredit || "", watermarkSize, wmPos);
    let filename: string;
    if (sanitizedName) {
      filename = uniqueFilename(outDir, size.prefix, sanitizedName, size.label, ".jpg");
    } else {
      const id = crypto.randomBytes(8).toString("hex");
      filename = `${size.prefix}-${id}-${size.label}.jpg`;
    }
    results[size.key] = await saveFile(buf, StorageKey.slider(filename), "image/jpeg");
  }
  return results;
}

router.post("/process-image", requireAuth, asyncHandler(async (req, res) => {
  console.log(">>> AI IMAGE PROCESS (resize/save) START");
  const { image, mimeType, rotation, cropRegion, name, photographerCredit } = req.body;
  if (!image) {
    return res.status(400).json({ error: "No image data provided" });
  }

  let imageBuffer = Buffer.from(image, "base64");
  if (rotation && parseFloat(rotation) !== 0) {
    console.log(`>>> Pre-rotating image by ${rotation}° and auto-cropping`);
    imageBuffer = await rotateAndCrop(imageBuffer, parseFloat(rotation));
  }
  imageBuffer = await applyCropRegion(imageBuffer, cropRegion);

  const wideBuf = await resizeAndCompress(imageBuffer, 1920, 1080, 550);

  let wideFilename: string;
  const sanitized = (name && typeof name === "string" && name.trim()) ? sanitizeName(name) : "";
  if (sanitized) {
    wideFilename = uniqueFilename(uploadsDir, "hero", sanitized, "1920x1080", ".jpg");
  } else {
    const id = crypto.randomBytes(8).toString("hex");
    wideFilename = `site-${id}-1920x1080.jpg`;
  }

  const wideUrl = await saveFile(wideBuf, StorageKey.hero(wideFilename), "image/jpeg");

  if (sanitized) {
    copyToDriveMarketingFolder(wideBuf, wideFilename).catch(() => {});
  }

  res.json({
    wideImage: wideUrl,
    wideSize: `${(wideBuf.length / 1024).toFixed(0)}KB`,
  });
}));

router.post("/save-screenshot", requireAuth, asyncHandler(async (req, res) => {
  const { image, mimeType, name, cropRegion, photographerCredit, watermarkSize, watermarkPosition } = req.body;
  if (!image || typeof image !== "string") {
    return res.status(400).json({ error: "No image data provided" });
  }

  let imageBuffer: Buffer;
  try {
    imageBuffer = Buffer.from(image, "base64");
    const meta = await sharp(imageBuffer).metadata();
    if (!meta.width || !meta.height) throw new Error("Not a valid image");
  } catch {
    return res.status(400).json({ error: "Invalid image data — could not decode" });
  }

  imageBuffer = await applyCropRegion(imageBuffer, cropRegion);

  const croppedMeta = await sharp(imageBuffer).metadata();
  const w = croppedMeta.width || 0;
  const h = croppedMeta.height || 0;

  let quality = 90;
  let result = await sharp(imageBuffer).jpeg({ quality }).toBuffer();
  while (result.length > 800 * 1024 && quality > 30) {
    quality -= 10;
    result = await sharp(imageBuffer).jpeg({ quality }).toBuffer();
  }

  const sanitized = (name && typeof name === "string" && name.trim()) ? sanitizeName(name) : "";
  const id = crypto.randomBytes(6).toString("hex");
  const filename = sanitized
    ? uniqueFilename(uploadsDir, "screenshot", sanitized, `${w}x${h}`, ".jpg")
    : `screenshot-${id}-${w}x${h}.jpg`;

  if (photographerCredit && typeof photographerCredit === "string" && photographerCredit.trim()) {
    result = await applyWatermark(result, photographerCredit.trim(), watermarkSize, normalizePosition(watermarkPosition));
  }

  const savedUrl = await saveFile(result, StorageKey.screenshot(filename), "image/jpeg");

  res.json({
    imagePath: savedUrl,
    width: w,
    height: h,
    fileSize: `${(result.length / 1024).toFixed(0)}KB`,
  });
}));

router.post("/process-image-url", requireAuth, asyncHandler(async (req, res) => {
  const { url, name, photographerCredit, watermarkSize, watermarkPosition } = req.body;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "No URL provided" });
  }

  const response = await fetch(url);
  if (!response.ok) {
    return res.status(400).json({ error: `Failed to download image (${response.status})` });
  }

  const arrayBuffer = await response.arrayBuffer();
  const imageBuffer = Buffer.from(arrayBuffer);

  const wideBuf = await resizeAndCompress(imageBuffer, 1920, 1080, 550);

  let wideFilename: string;
  const sanitized = (name && typeof name === "string" && name.trim()) ? sanitizeName(name) : "";
  if (sanitized) {
    wideFilename = uniqueFilename(uploadsDir, "hero", sanitized, "1920x1080", ".jpg");
  } else {
    const id = crypto.randomBytes(8).toString("hex");
    wideFilename = `site-${id}-1920x1080.jpg`;
  }

  const wideUrl2 = await saveFile(wideBuf, StorageKey.hero(wideFilename), "image/jpeg");

  if (sanitized) {
    copyToDriveMarketingFolder(wideBuf, wideFilename).catch(() => {});
  }

  res.json({
    wideImage: wideUrl2,
    wideSize: `${(wideBuf.length / 1024).toFixed(0)}KB`,
  });
}));

router.post("/crop-banner", requireAuth, asyncHandler(async (req, res) => {
  const { imagePath, cropY, name, photographerCredit, watermarkSize, watermarkPosition } = req.body;
  if (!imagePath || typeof imagePath !== "string") {
    return res.status(400).json({ error: "No image path provided" });
  }
  if (typeof cropY !== "number" || !isFinite(cropY)) {
    return res.status(400).json({ error: "Invalid cropY value" });
  }

  if (!fileExists(imagePath)) {
    return res.status(404).json({ error: "Source image not found" });
  }

  const imageBuffer = await readFile(imagePath);
  const metadata = await sharp(imageBuffer).metadata();
  const imgWidth = metadata.width || 1920;
  const imgHeight = metadata.height || 1080;

  const extractTop = Math.max(0, Math.min(Math.round(cropY), imgHeight - 600));
  const extractHeight = Math.min(600, imgHeight - extractTop);

  let quality = 90;
  let bannerBuf = await sharp(imageBuffer)
    .extract({ left: 0, top: extractTop, width: imgWidth, height: extractHeight })
    .resize(1920, 600, { fit: "fill" })
    .jpeg({ quality })
    .toBuffer();

  while (bannerBuf.length > 550 * 1024 && quality > 20) {
    quality -= 10;
    bannerBuf = await sharp(imageBuffer)
      .extract({ left: 0, top: extractTop, width: imgWidth, height: extractHeight })
      .resize(1920, 600, { fit: "fill" })
      .jpeg({ quality })
      .toBuffer();
  }

  let bannerFilename: string;
  const sanitized = (name && typeof name === "string" && name.trim()) ? sanitizeName(name) : "";
  if (sanitized) {
    bannerFilename = uniqueFilename(uploadsDir, "banner", sanitized, "1920x600", ".jpg");
  } else {
    const id = crypto.randomBytes(8).toString("hex");
    bannerFilename = `site-${id}-1920x600.jpg`;
  }

  bannerBuf = await applyWatermark(bannerBuf, photographerCredit, watermarkSize, normalizePosition(watermarkPosition));
  const bannerUrl = await saveFile(bannerBuf, StorageKey.banner(bannerFilename), "image/jpeg");

  if (sanitized) {
    copyToDriveMarketingFolder(bannerBuf, bannerFilename).catch(() => {});
  }

  res.json({
    bannerImage: bannerUrl,
    bannerSize: `${(bannerBuf.length / 1024).toFixed(0)}KB`
  });
}));

const ALLOWED_PREFIXES = ["banner", "slider-lg", "slider-sm", "slider-portrait", "hero", "content"];

router.post("/crop-single", requireAuth, asyncHandler(async (req, res) => {
  const { imagePath, cropRegion, targetWidth, targetHeight, prefix, name, photographerCredit, watermarkSize, watermarkPosition } = req.body;
  if (!imagePath || typeof imagePath !== "string") {
    return res.status(400).json({ error: "No image path provided" });
  }
  if (!targetWidth || !targetHeight || !prefix) {
    return res.status(400).json({ error: "Missing targetWidth, targetHeight, or prefix" });
  }
  const tw = parseInt(targetWidth, 10);
  const th = parseInt(targetHeight, 10);
  if (!isFinite(tw) || !isFinite(th) || tw < 10 || th < 10 || tw > 4000 || th > 4000) {
    return res.status(400).json({ error: "Invalid target dimensions" });
  }
  if (!ALLOWED_PREFIXES.includes(prefix)) {
    return res.status(400).json({ error: "Invalid prefix" });
  }

  if (!fileExists(imagePath)) {
    return res.status(404).json({ error: "Source image not found" });
  }

  let imageBuffer = await readFile(imagePath);

  if (cropRegion && typeof cropRegion === "object" && typeof cropRegion.x === "number") {
    const meta = await sharp(imageBuffer).metadata();
    const imgW = meta.width!;
    const imgH = meta.height!;
    const left = Math.max(0, Math.round(cropRegion.x * imgW));
    const top = Math.max(0, Math.round(cropRegion.y * imgH));
    const width = Math.min(Math.round(cropRegion.w * imgW), imgW - left);
    const height = Math.min(Math.round(cropRegion.h * imgH), imgH - top);
    if (width > 10 && height > 10) {
      imageBuffer = await sharp(imageBuffer).extract({ left, top, width, height }).toBuffer();
    }
  }

  const maxKB = (tw <= 500 && th <= 500) ? 120 : (tw <= 1000 ? 300 : 550);
  const buf = await resizeAndCompress(imageBuffer, tw, th, maxKB);

  const label = `${tw}x${th}`;
  let outFilename: string;
  const sanitized = (name && typeof name === "string" && name.trim()) ? sanitizeName(name) : "";
  if (sanitized) {
    outFilename = uniqueFilename(uploadsDir, prefix, sanitized, label, ".jpg");
  } else {
    const id = crypto.randomBytes(8).toString("hex");
    outFilename = `${prefix}-${id}-${label}.jpg`;
  }

  const finalBuf = await applyWatermark(buf, photographerCredit, watermarkSize, normalizePosition(watermarkPosition));
  // Route to the right folder based on the image type prefix
  const prefixedKey = prefix === "slider-lg" || prefix === "slider-sm" || prefix === "slider-portrait"
    ? StorageKey.slider(outFilename)
    : prefix === "hero" ? StorageKey.hero(outFilename)
    : prefix === "banner" ? StorageKey.banner(outFilename)
    : prefix === "content" ? StorageKey.content(outFilename)
    : StorageKey.screenshot(outFilename);
  const outUrl = await saveFile(finalBuf, prefixedKey, "image/jpeg");

  if (sanitized) {
    copyToDriveMarketingFolder(finalBuf, outFilename).catch(() => {});
  }

  res.json({
    image: outUrl,
    size: `${(finalBuf.length / 1024).toFixed(0)}KB`,
  });
}));

router.post("/generate-slider-images", requireAuth, asyncHandler(async (req, res) => {
  const { imagePath, name, photographerCredit, watermarkSize, watermarkPosition } = req.body;
  if (!imagePath || typeof imagePath !== "string") {
    return res.status(400).json({ error: "No image path provided" });
  }

  if (!fileExists(imagePath)) {
    return res.status(404).json({ error: "Source image not found" });
  }

  const imageBuffer = await readFile(imagePath);
  const sanitized = (name && typeof name === "string" && name.trim()) ? sanitizeName(name) : "";
  const sliderResults = await generateSliderImages(imageBuffer, sanitized, uploadsDir, photographerCredit, watermarkSize, watermarkPosition);
  res.json(sliderResults);
}));

router.post("/upload-content-image", requireAuth, upload.single("image"), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No image file provided" });
  }
  const photographerCredit = req.body.photographerCredit || "";
  const watermarkSize = req.body.watermarkSize ? parseInt(req.body.watermarkSize, 10) : undefined;
  const watermarkPosition = req.body.watermarkPosition || undefined;
  const id = crypto.randomBytes(8).toString("hex");
  const filename = `content-${id}-1200x800.jpg`;
  let buf = await resizeAndCompress(req.file.buffer, 1200, 800, 300);
  buf = await applyWatermark(buf, photographerCredit, watermarkSize, normalizePosition(watermarkPosition));
  const contentUrl = await saveFile(buf, StorageKey.content(filename), "image/jpeg");
  res.json({
    imageUrl: contentUrl,
    size: `${(buf.length / 1024).toFixed(0)}KB`
  });
}));

router.post("/process-content-image", requireAuth, asyncHandler(async (req, res) => {
  const { image, mimeType, photographerCredit, watermarkSize, watermarkPosition } = req.body;
  if (!image) {
    return res.status(400).json({ error: "No image data provided" });
  }
  const imageBuffer = Buffer.from(image, "base64");
  const id = crypto.randomBytes(8).toString("hex");
  const filename = `content-${id}-1200x800.jpg`;
  let buf = await resizeAndCompress(imageBuffer, 1200, 800, 300);
  buf = await applyWatermark(buf, photographerCredit || "", watermarkSize, normalizePosition(watermarkPosition));
  const processedContentUrl = await saveFile(buf, StorageKey.content(filename), "image/jpeg");
  res.json({
    imageUrl: processedContentUrl,
    size: `${(buf.length / 1024).toFixed(0)}KB`
  });
}));

router.post("/upload-hero-image", requireAuth, upload.single("image"), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No image file provided" });
  }
  const photographerCredit = req.body.photographerCredit || "";
  const watermarkSize = req.body.watermarkSize ? parseInt(req.body.watermarkSize, 10) : undefined;
  const watermarkPosition = req.body.watermarkPosition || undefined;
  const id = crypto.randomBytes(8).toString("hex");
  const filename = `hero-${id}-1920x1080.jpg`;
  let buf = await resizeAndCompress(req.file.buffer, 1920, 1080, 550);
  buf = await applyWatermark(buf, photographerCredit, watermarkSize, normalizePosition(watermarkPosition));
  const heroUrl = await saveFile(buf, StorageKey.hero(filename), "image/jpeg");
  res.json({
    imageUrl: heroUrl,
    size: `${(buf.length / 1024).toFixed(0)}KB`
  });
}));

router.post("/bulk-upload-hero/:name", requireAuth, upload.array("images", 999), asyncHandler(async (req, res) => {
  console.log("[BULK UPLOAD] Route matched! Params:", req.params, "Query:", req.query);
  if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
    return res.status(400).json({ error: "No image files provided" });
  }
  const photographerName = decodeURIComponent(req.params.name || "").trim();
  console.log("[BULK UPLOAD] Photographer name:", photographerName);
  if (!photographerName) {
    return res.status(400).json({ error: "Photographer name is required" });
  }

  const limitRow = db.prepare("SELECT value FROM settings WHERE key = 'bulkUploadLimit'").get() as { value: string } | undefined;
  const uploadLimit = Math.min(999, Math.max(1, parseInt(limitRow?.value || "20") || 20));
  if (req.files.length > uploadLimit) {
    return res.status(400).json({ error: `Too many files — maximum is ${uploadLimit} per upload` });
  }

  const results: { filename: string; url: string; size: string; error?: string }[] = [];

  for (const file of req.files as Express.Multer.File[]) {
    try {
      const id = crypto.randomBytes(8).toString("hex");
      const ext = path.extname(file.originalname) || ".jpg";
      const baseName = path.basename(file.originalname, ext);
      const filename = `hero-${baseName}-${id}-1920x1080.jpg`;

      let buf = await resizeAndCompress(file.buffer, 1920, 1080, 550);
      buf = await applyWatermark(buf, photographerName);
      const url = await saveFile(buf, StorageKey.hero(filename), "image/jpeg");

      results.push({
        filename,
        url,
        size: `${(buf.length / 1024).toFixed(0)}KB`,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      results.push({
        filename: file.originalname,
        url: "",
        size: "0KB",
        error: errorMsg,
      });
    }
  }

  res.json(results);
}));

router.post("/watermark-existing", requireAuth, asyncHandler(async (req, res) => {
  const { imagePath, photographerCredit, watermarkSize, watermarkPosition } = req.body;
  if (!imagePath || typeof imagePath !== "string") {
    return res.status(400).json({ error: "No image path provided" });
  }
  if (!photographerCredit || typeof photographerCredit !== "string" || !photographerCredit.trim()) {
    return res.status(400).json({ error: "Photographer credit is required" });
  }

  if (!fileExists(imagePath)) {
    return res.status(404).json({ error: "Image not found" });
  }

  const imageBuffer = await readFile(imagePath);
  const watermarked = await applyWatermark(imageBuffer, photographerCredit, watermarkSize, normalizePosition(watermarkPosition));
  const key = keyFromUrl(imagePath);
  await saveFile(watermarked, key, "image/jpeg");

  const meta = await sharp(watermarked).metadata();
  res.json({
    success: true,
    imagePath,
    size: `${(watermarked.length / 1024).toFixed(0)}KB`,
    width: meta.width,
    height: meta.height,
  });
}));

router.get("/models", requireAuth, asyncHandler(async (_req, res) => {
  let apiKey = process.env.USER_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'geminiApiKey'").get() as { value: string } | undefined;
    if (row?.value) apiKey = row.value;
  }

  if (!apiKey) {
    return res.status(500).json({ error: "API Key not configured" });
  }

  const ai = new GoogleGenAI({ apiKey });
  const pager = await ai.models.list({ config: { pageSize: 200 } });
  const rawModels: any[] = [];
  for await (const m of pager) {
    rawModels.push(m);
  }
  
  const models = rawModels.map((m: any) => {
    const rawName = (m.name || "").replace(/^models\//, "");
    return {
      name: rawName,
      displayName: m.displayName || rawName,
      description: (m.description || "").substring(0, 200),
    };
  }).filter((m: any) => m.name);

  res.json({ models });
}));

router.get("/models/config", requireAuth, asyncHandler(async (_req, res) => {
  res.json({
    textModels: await getTextModels(),
    imageModels: await getImageModels(),
    defaultTextModels: DEFAULT_TEXT_MODELS,
    defaultImageModels: DEFAULT_IMAGE_MODELS,
  });
}));

router.put("/models/config", requireAuth, asyncHandler(async (req, res) => {
  const { textModels, imageModels } = req.body;

  if (Array.isArray(textModels) && textModels.length > 0 && textModels.every((m: any) => typeof m === "string" && m.trim())) {
    await setTextModels(textModels.map((m: string) => m.trim()));
  }
  if (Array.isArray(imageModels) && imageModels.length > 0 && imageModels.every((m: any) => typeof m === "string" && m.trim())) {
    await setImageModels(imageModels.map((m: string) => m.trim()));
  }

  res.json({ 
    textModels: await getTextModels(), 
    imageModels: await getImageModels() 
  });
}));

router.post("/models/test", requireAuth, asyncHandler(async (req, res) => {
  let apiKey = process.env.USER_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'geminiApiKey'").get() as { value: string } | undefined;
    if (row?.value) apiKey = row.value;
  }

  if (!apiKey) {
    return res.status(500).json({ error: "API Key not configured" });
  }

  const { model, type } = req.body;
  if (!model || typeof model !== "string") {
    return res.status(400).json({ error: "Model name is required" });
  }

  const ai = new GoogleGenAI({ apiKey });
  const start = Date.now();

  try {
    if (type === "image") {
      const result = await ai.models.generateContent({
        model,
        contents: [
          { role: "user", parts: [{ text: "Generate a 50x50 pixel solid blue square image." }] }
        ],
        config: { responseModalities: ["TEXT", "IMAGE"] }
      });
      const elapsed = Date.now() - start;
      const hasImage = result?.candidates?.[0]?.content?.parts?.some((p: any) => p.inlineData) || false;
      res.json({ success: true, elapsed, hasImage, message: hasImage ? "Image generated successfully" : "Model responded but no image returned" });
    } else {
      const result = await ai.models.generateContent({
        model,
        contents: "Respond with exactly: OK",
      });
      const elapsed = Date.now() - start;
      const text = result.text || "";
      res.json({ success: true, elapsed, response: text.substring(0, 100), message: `Model responded in ${elapsed}ms` });
    }
  } catch (e: any) {
    const elapsed = Date.now() - start;
    res.json({ success: false, elapsed, error: e.message || "Unknown error" });
  }
}));

router.use((err: any, req: any, res: any, next: any) => {
  console.error("[AI ROUTER ERROR]", err);
  res.status(err.status || 500).json({
    error: err.message || "Internal AI Router Error"
  });
});

export default router;
