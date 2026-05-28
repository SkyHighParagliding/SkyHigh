import { Router } from "express";
import multer from "multer";
import { query, queryOne, execute, transaction } from "../pg.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";
import createLogger from "../utils/logger.js";
import { invalidateSearchCaches } from "../utils/searchCacheInvalidation.js";
import {
  isDriveConnected,
  uploadFile,
  listFiles,
  deleteFile,
  searchFiles,
  CATEGORY_FOLDERS,
  ensureFolderStructure,
  getAppScriptUrl,
} from "../googleDrive.js";

const router = Router();
const log = createLogger("document-index");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

function generateId() {
  return `doc-${Math.random().toString(36).substr(2, 9)}`;
}

router.get("/status", requireAuth, asyncHandler(async (req, res) => {
  const driveApiConnected = await isDriveConnected();
  const settingRow = await queryOne<{ value: string }>(
    `SELECT value FROM settings WHERE key = 'drive_appscript_url'`
  );
  const appScriptConnected = !!(settingRow?.value);
  res.json({ connected: driveApiConnected || appScriptConnected });
}));

router.get("/categories", requireAuth, asyncHandler(async (req, res) => {
  const driveApiConnected = await isDriveConnected();
  const appScriptUrl = await getAppScriptUrl();
  const connected = driveApiConnected || !!appScriptUrl;

  if (appScriptUrl) {
    try {
      const response = await fetch(`${appScriptUrl}?action=categories`);
      const data = await response.json() as any;
      if (data.success && data.categories) {
        const categories = data.categories.map((cat: any) => ({
          code: cat.code,
          name: cat.name,
          documentCount: cat.fileCount || 0,
        }));
        return res.json({ connected, categories });
      }
    } catch (err: any) {
      log.warn("Failed to fetch categories from Apps Script, falling back to local:", err.message);
    }
  }

  const categories = await Promise.all(CATEGORY_FOLDERS.map(async cat => {
    const count = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM documents WHERE category = $1`,
      [cat.code]
    );
    return {
      code: cat.code,
      name: cat.name,
      documentCount: Number(count?.count) || 0,
    };
  }));
  res.json({ connected, categories });
}));

router.get("/category/:code", requireAuth, asyncHandler(async (req, res) => {
  const { code } = req.params;
  const validCodes = CATEGORY_FOLDERS.map(c => c.code);
  if (!validCodes.includes(code)) {
    return res.status(400).json({ error: "Invalid category code" });
  }

  const appScriptUrl = await getAppScriptUrl();
  if (appScriptUrl) {
    const folderName = CATEGORY_FOLDERS.find(c => c.code === code)?.name || "";
    try {
      const response = await fetch(`${appScriptUrl}?action=list&folder=${encodeURIComponent(folderName)}`);
      const data = await response.json() as any;
      if (data.success && data.files) {
        const documents = data.files.map((f: any) => ({
          id: f.id,
          driveFileId: f.id,
          name: f.name,
          mimeType: f.mimeType,
          size: f.size || 0,
          category: code,
          driveFolderId: null,
          webViewLink: f.url,
          uploadedBy: "",
          createdAt: f.dateCreated || f.lastUpdated || new Date().toISOString(),
        }));
        return res.json(documents);
      }
    } catch (err: any) {
      log.warn("Failed to list files from Apps Script, falling back to local:", err.message);
    }
  }

  const documents = await query<any>(
    `SELECT * FROM documents WHERE category = $1 ORDER BY "createdAt" DESC`,
    [code]
  );
  res.json(documents);
}));

router.get("/category/:code/subfolders", requireAuth, asyncHandler(async (req, res) => {
  const { code } = req.params;
  const subfolderPath = (req.query.path as string) || "";
  const validCodes = CATEGORY_FOLDERS.map(c => c.code);
  if (!validCodes.includes(code)) {
    return res.status(400).json({ error: "Invalid category code" });
  }

  const appScriptUrl = await getAppScriptUrl();
  if (!appScriptUrl) {
    return res.json([]);
  }

  const folderName = CATEGORY_FOLDERS.find(c => c.code === code)?.name || "";
  try {
    const subParam = subfolderPath ? `&subfolder=${encodeURIComponent(subfolderPath)}` : "";
    const response = await fetch(`${appScriptUrl}?action=listSubfolders&folder=${encodeURIComponent(folderName)}${subParam}`);
    const data = await response.json() as any;
    if (data.success && data.subfolders) {
      return res.json(data.subfolders);
    }
    if (data.success) {
      return res.json([]);
    }
    return res.status(502).json({ error: data.error || "Failed to load folders from Google Drive" });
  } catch (err: any) {
    log.warn("Failed to list subfolders from Apps Script:", err.message);
    return res.status(502).json({ error: "Could not reach Google Drive. Check your connection." });
  }
}));

router.post("/category/:code/subfolders", requireAuth, asyncHandler(async (req, res) => {
  const { code } = req.params;
  const { name, parentPath } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Folder name is required" });
  }
  if (/[\/\\]/.test(name.trim())) {
    return res.status(400).json({ error: "Folder name cannot contain slashes" });
  }
  const validCodes = CATEGORY_FOLDERS.map(c => c.code);
  if (!validCodes.includes(code)) {
    return res.status(400).json({ error: "Invalid category code" });
  }

  const appScriptUrl = await getAppScriptUrl();
  if (!appScriptUrl) {
    return res.status(503).json({ error: "Google Drive not connected" });
  }

  const folderName = CATEGORY_FOLDERS.find(c => c.code === code)?.name || "";
  try {
    const parentParam = parentPath ? `&parentPath=${encodeURIComponent(parentPath)}` : "";
    const response = await fetch(`${appScriptUrl}?action=createSubfolder&folder=${encodeURIComponent(folderName)}&name=${encodeURIComponent(name.trim())}${parentParam}`);
    const data = await response.json() as any;
    if (data.success) {
      return res.json(data);
    }
    return res.status(500).json({ error: data.error || "Failed to create folder" });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to create folder: " + err.message });
  }
}));

router.get("/category/:code/subfolder/:name", requireAuth, asyncHandler(async (req, res) => {
  const { code, name } = req.params;
  const validCodes = CATEGORY_FOLDERS.map(c => c.code);
  if (!validCodes.includes(code)) {
    return res.status(400).json({ error: "Invalid category code" });
  }

  const appScriptUrl = await getAppScriptUrl();
  if (!appScriptUrl) {
    return res.json([]);
  }

  const folderName = CATEGORY_FOLDERS.find(c => c.code === code)?.name || "";
  try {
    const response = await fetch(`${appScriptUrl}?action=list&folder=${encodeURIComponent(folderName)}&subfolder=${encodeURIComponent(name)}`);
    const data = await response.json() as any;
    if (data.success && data.files) {
      const documents = data.files.map((f: any) => ({
        id: f.id,
        driveFileId: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size || 0,
        category: code,
        driveFolderId: null,
        webViewLink: f.url,
        uploadedBy: "",
        createdAt: f.dateCreated || f.lastUpdated || new Date().toISOString(),
      }));
      return res.json(documents);
    }
    if (data.success) {
      return res.json([]);
    }
    return res.status(502).json({ error: data.error || "Failed to load files from Google Drive" });
  } catch (err: any) {
    log.warn("Failed to list subfolder files from Apps Script:", err.message);
    return res.status(502).json({ error: "Could not reach Google Drive. Check your connection." });
  }
}));

router.get("/sites/names", requireAuth, asyncHandler(async (_req, res) => {
  const sites = await query<{ name: string }>(
    `SELECT name FROM sites ORDER BY name`
  );
  res.json(sites.map(s => s.name));
}));

router.get("/search", requireAuth, asyncHandler(async (req, res) => {
  const q = req.query.q as string;
  if (!q) return res.json([]);

  const appScriptUrl = await getAppScriptUrl();
  if (appScriptUrl) {
    try {
      const response = await fetch(`${appScriptUrl}?action=search&q=${encodeURIComponent(q)}`);
      const data = await response.json() as any;
      if (data.success && data.files) {
        const documents = data.files.map((f: any) => ({
          id: f.id,
          driveFileId: f.id,
          name: f.name,
          mimeType: f.mimeType,
          size: f.size || 0,
          category: f.category ? f.category.substring(0, 2) : "",
          driveFolderId: null,
          webViewLink: f.url,
          uploadedBy: "",
          createdAt: f.dateCreated || f.lastUpdated || new Date().toISOString(),
        }));
        return res.json(documents);
      }
    } catch (err: any) {
      log.warn("Failed to search via Apps Script, falling back to local:", err.message);
    }
  }

  const term = `%${q}%`;
  const documents = await query<any>(
    `SELECT * FROM documents WHERE name ILIKE $1 ORDER BY "createdAt" DESC`,
    [term]
  );
  res.json(documents);
}));

router.get("/drive-search", requireAuth, asyncHandler(async (req, res) => {
  const connected = await isDriveConnected();
  if (!connected) {
    return res.status(503).json({ error: "Google Drive not connected" });
  }
  const q = req.query.q as string;
  if (!q) return res.json([]);
  const files = await searchFiles(q);
  res.json(files);
}));

router.post("/upload", requireAuth, upload.single("file"), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file provided" });
  }

  const category = req.body.category;
  const subfolder = req.body.subfolder || "";
  if (!category) {
    return res.status(400).json({ error: "Category is required" });
  }

  const appScriptUrl = await getAppScriptUrl();
  if (appScriptUrl) {
    const folderName = CATEGORY_FOLDERS.find(c => c.code === category)?.name || category;
    try {
      const base64Data = req.file.buffer.toString("base64");
      const subParam = subfolder ? `&subfolder=${encodeURIComponent(subfolder)}` : "";
      const response = await fetch(
        `${appScriptUrl}?action=upload&folder=${encodeURIComponent(folderName)}&name=${encodeURIComponent(req.file.originalname)}&mimeType=${encodeURIComponent(req.file.mimetype)}${subParam}`,
        {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: base64Data,
        }
      );
      const data = await response.json() as any;
      if (data.success && data.file) {
        return res.status(201).json({
          id: data.file.id,
          driveFileId: data.file.id,
          name: data.file.name,
          mimeType: data.file.mimeType,
          size: data.file.size || req.file.size,
          category,
          driveFolderId: null,
          webViewLink: data.file.url,
          uploadedBy: (req as any).user?.name || "admin",
          createdAt: data.file.dateCreated || new Date().toISOString(),
        });
      }
      return res.status(500).json({ error: data.error || "Upload failed" });
    } catch (err: any) {
      log.error("Apps Script upload failed:", err.message);
      return res.status(500).json({ error: "Failed to upload file to Google Drive: " + err.message });
    }
  }

  const connected = await isDriveConnected();
  if (!connected) {
    return res.status(503).json({ error: "Google Drive not connected. Connect Google Drive to enable file uploads." });
  }

  const folderMap = await ensureFolderStructure();
  if (!folderMap || !folderMap[category]) {
    return res.status(500).json({ error: "Could not find or create the target Drive folder" });
  }

  const folderId = folderMap[category];
  const result = await uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype, folderId);
  if (!result) {
    return res.status(500).json({ error: "Failed to upload file to Google Drive" });
  }

  const id = generateId();
  await execute(
    `INSERT INTO documents (id, "driveFileId", name, "mimeType", size, category, "driveFolderId", "webViewLink", "uploadedBy")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, result.id, result.name, req.file.mimetype, req.file.size, category, folderId, result.webViewLink, (req as any).user?.name || "admin"]
  );

  const doc = await queryOne<any>(
    `SELECT * FROM documents WHERE id = $1`,
    [id]
  );
  res.status(201).json(doc);
}));

router.delete("/:id", requireAuth, asyncHandler(async (req, res) => {
  const doc = await queryOne<any>(
    `SELECT * FROM documents WHERE id = $1`,
    [req.params.id]
  );

  if (!doc) {
    const appScriptUrl = await getAppScriptUrl();
    if (appScriptUrl) {
      try {
        const response = await fetch(
          `${appScriptUrl}?action=delete&fileId=${encodeURIComponent(req.params.id)}`,
          { method: "POST" }
        );
        const data = await response.json() as any;
        if (data.success) {
          return res.json({ success: true });
        }
        return res.status(500).json({ error: data.error || "Delete failed" });
      } catch (err: any) {
        return res.status(500).json({ error: "Failed to delete from Drive: " + err.message });
      }
    }
    return res.status(404).json({ error: "Document not found" });
  }

  if (doc.driveFileId) {
    const connected = await isDriveConnected();
    if (connected) {
      await deleteFile(doc.driveFileId);
    }
  }

  await transaction(async (client) => {
    await client.query(
      `DELETE FROM project_documents WHERE "documentId" = $1`,
      [req.params.id]
    );
    await client.query(
      `DELETE FROM documents WHERE id = $1`,
      [req.params.id]
    );
  });
  res.json({ success: true });
}));

router.post("/move", requireAuth, asyncHandler(async (req, res) => {
  const { fileId, destCategory, destSubfolder } = req.body;
  if (!fileId) return res.status(400).json({ error: "fileId is required" });
  if (!destCategory) return res.status(400).json({ error: "destCategory is required" });

  const validCodes = CATEGORY_FOLDERS.map(c => c.code);
  if (!validCodes.includes(destCategory)) {
    return res.status(400).json({ error: "Invalid destination category" });
  }

  const appScriptUrl = await getAppScriptUrl();
  if (!appScriptUrl) {
    return res.status(503).json({ error: "Google Drive not connected" });
  }

  const folderName = CATEGORY_FOLDERS.find(c => c.code === destCategory)?.name || "";
  try {
    const subParam = destSubfolder ? `&subfolder=${encodeURIComponent(destSubfolder)}` : "";
    const response = await fetch(
      `${appScriptUrl}?action=moveFile&fileId=${encodeURIComponent(fileId)}&folder=${encodeURIComponent(folderName)}${subParam}`,
      { method: "POST" }
    );
    const data = await response.json() as any;
    if (data.success) {
      return res.json(data);
    }
    return res.status(500).json({ error: data.error || "Move failed" });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to move file: " + err.message });
  }
}));

router.post("/copy", requireAuth, asyncHandler(async (req, res) => {
  const { fileId, destCategory, destSubfolder } = req.body;
  if (!fileId) return res.status(400).json({ error: "fileId is required" });
  if (!destCategory) return res.status(400).json({ error: "destCategory is required" });

  const validCodes = CATEGORY_FOLDERS.map(c => c.code);
  if (!validCodes.includes(destCategory)) {
    return res.status(400).json({ error: "Invalid destination category" });
  }

  const appScriptUrl = await getAppScriptUrl();
  if (!appScriptUrl) {
    return res.status(503).json({ error: "Google Drive not connected" });
  }

  const folderName = CATEGORY_FOLDERS.find(c => c.code === destCategory)?.name || "";
  try {
    const subParam = destSubfolder ? `&subfolder=${encodeURIComponent(destSubfolder)}` : "";
    const response = await fetch(
      `${appScriptUrl}?action=copyFile&fileId=${encodeURIComponent(fileId)}&folder=${encodeURIComponent(folderName)}${subParam}`,
      { method: "POST" }
    );
    const data = await response.json() as any;
    if (data.success) {
      return res.json(data);
    }
    return res.status(500).json({ error: data.error || "Copy failed" });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to copy file: " + err.message });
  }
}));

router.get("/download/:fileId", requireAuth, asyncHandler(async (req, res) => {
  const { fileId } = req.params;
  if (!fileId) return res.status(400).json({ error: "fileId is required" });

  const appScriptUrl = await getAppScriptUrl();
  if (!appScriptUrl) {
    return res.status(503).json({ error: "Google Drive not connected" });
  }

  try {
    const response = await fetch(
      `${appScriptUrl}?action=downloadFile&fileId=${encodeURIComponent(fileId)}`
    );
    const data = await response.json() as any;
    if (data.success && data.data) {
      const buffer = Buffer.from(data.data, "base64");
      const safeName = (data.file.name || "download").replace(/["\r\n\\]/g, "_");
      const encodedName = encodeURIComponent(data.file.name || "download");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}"; filename*=UTF-8''${encodedName}`);
      res.setHeader("Content-Type", data.file.mimeType || "application/octet-stream");
      res.setHeader("Content-Length", buffer.length.toString());
      return res.send(buffer);
    }
    return res.status(500).json({ error: data.error || "Download failed" });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to download file: " + err.message });
  }
}));

router.get("/index/status", requireAuth, asyncHandler(async (_req, res) => {
  const total = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM document_index`
  );
  const readable = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM document_index WHERE readable = 1`
  );
  const lastIndexed = await queryOne<{ ts: string | null }>(
    `SELECT MAX("indexedAt") as ts FROM document_index`
  );
  const docs = await query<any>(
    `SELECT "driveFileId", name, category, "mimeType", "charCount", readable, "indexedAt", "lastModified"
     FROM document_index
     ORDER BY name`
  );
  res.json({
    totalDocuments: Number(total?.count) || 0,
    readableDocuments: Number(readable?.count) || 0,
    lastIndexedAt: lastIndexed?.ts || null,
    documents: docs,
  });
}));

export async function runDocumentIndexSync(): Promise<{ success: boolean; error?: string; totalDocuments?: number; indexed?: number; skipped?: number; pdfErrors?: string[]; message?: string }> {
  const settingRow = await queryOne<{ value: string }>(
    `SELECT value FROM settings WHERE key = 'drive_appscript_url'`
  );
  const appScriptUrl = settingRow?.value || "";

  if (!appScriptUrl) {
    return { success: false, error: "No Drive bridge Apps Script URL configured" };
  }

  const allowedDomains = ["script.google.com", "script.googleusercontent.com"];
  let isValid = false;
  try { isValid = allowedDomains.some(d => new URL(appScriptUrl).hostname.endsWith(d)); } catch {}
  if (!isValid) {
    return { success: false, error: "Invalid Apps Script URL" };
  }

  log.info("Starting document index sync via Apps Script...");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300000);
  const response = await fetch(`${appScriptUrl}?action=indexAll`, { signal: controller.signal });
  clearTimeout(timeout);

  if (!response.ok) {
    return { success: false, error: `Apps Script returned status ${response.status}` };
  }

  const data = await response.json() as any;
  if (!data.success) {
    return { success: false, error: data.error || "Apps Script returned an error" };
  }

  const documents = data.documents || [];
  let indexed = 0;
  let skipped = 0;

  const existingIds = new Set(
    (await query<{ driveFileId: string }>(
      `SELECT "driveFileId" FROM document_index`
    )).map(r => r.driveFileId)
  );

  const incomingIds = new Set<string>();
  const pdfErrors: string[] = [];

  for (const doc of documents) {
    incomingIds.add(doc.id);
    const text = doc.text || "";
    const hasPdfError = doc.mimeType === "application/pdf" && (text.startsWith("[PDF text extraction") || text.startsWith("[PDF "));
    await execute(
      `INSERT INTO document_index ("driveFileId", name, category, "mimeType", "driveUrl", "textContent", "charCount", readable, "indexedAt", "lastModified")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
       ON CONFLICT ("driveFileId") DO UPDATE SET
         name = EXCLUDED.name,
         category = EXCLUDED.category,
         "mimeType" = EXCLUDED."mimeType",
         "driveUrl" = EXCLUDED."driveUrl",
         "textContent" = EXCLUDED."textContent",
         "charCount" = EXCLUDED."charCount",
         readable = EXCLUDED.readable,
         "indexedAt" = NOW(),
         "lastModified" = EXCLUDED."lastModified"`,
      [
        doc.id,
        doc.name,
        doc.category || "",
        doc.mimeType || "",
        doc.url || "",
        hasPdfError ? "" : text,
        hasPdfError ? 0 : text.length,
        hasPdfError ? 0 : (doc.readable ? 1 : 0),
        doc.lastUpdated || doc.dateCreated || ""
      ]
    );
    if (hasPdfError) {
      pdfErrors.push(`${doc.name}: ${text}`);
      skipped++;
    } else if (text.length > 0) {
      indexed++;
    } else {
      skipped++;
    }
  }

  for (const existingId of existingIds) {
    if (!incomingIds.has(existingId)) {
      await execute(
        `DELETE FROM document_index WHERE "driveFileId" = $1`,
        [existingId]
      );
    }
  }

  if (pdfErrors.length > 0) {
    log.warn(`PDF extraction failed for ${pdfErrors.length} file(s): ${pdfErrors.map(e => e.split(":")[0]).join(", ")}`);
  }
  log.info(`Document index sync complete: ${indexed} indexed, ${skipped} skipped, ${documents.length} total`);
  invalidateSearchCaches();

  return {
    success: true,
    totalDocuments: documents.length,
    indexed,
    skipped,
    pdfErrors: pdfErrors.length > 0 ? pdfErrors : undefined,
    message: pdfErrors.length > 0
      ? `Indexed ${indexed} document(s). ${pdfErrors.length} PDF(s) could not be read. Error: ${pdfErrors[0]}`
      : `Indexed ${indexed} document(s) with text content. ${skipped} could not be read.`,
  };
}

router.post("/index/sync", requireAuth, asyncHandler(async (req, res) => {
  try {
    const result = await runDocumentIndexSync();
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.json(result);
  } catch (err: any) {
    log.error("Document index sync failed:", err.message);
    if (err.name === "AbortError") {
      return res.status(504).json({ error: "Apps Script timed out (120s). Try again or check the script deployment." });
    }
    return res.status(500).json({ error: `Sync failed: ${err.message}` });
  }
}));

router.delete("/index/clear", requireAuth, asyncHandler(async (_req, res) => {
  await execute(`DELETE FROM document_index`);
  invalidateSearchCaches();
  log.info("Document index cleared");
  res.json({ success: true, message: "Document index cleared" });
}));

export async function getIndexedDocumentsContext(): Promise<string> {
  try {
    const docs = await query<{ name: string; category: string; textContent: string; charCount: number; driveUrl: string }>(
      `SELECT name, category, "textContent", "charCount", "driveUrl" FROM document_index
       WHERE readable = 1 AND "charCount" > 0
       ORDER BY category, name`
    );

    if (docs.length === 0) return "";

    let ctx = "\n\n=== CLUB DOCUMENTS (from Google Drive) ===\n";
    ctx += "These are the official club documents. When answering from these, cite the document name as your source.\n\n";

    for (const doc of docs) {
      const folder = doc.category || "Uncategorised";
      const maxPerDoc = Math.min(80000, Math.floor(400000 / docs.length));
      const text = doc.textContent.length > maxPerDoc
        ? doc.textContent.substring(0, maxPerDoc) + "\n[...truncated]"
        : doc.textContent;
      ctx += `--- Document: ${doc.name} (Folder: ${folder}) ---\n`;
      ctx += text + "\n\n";
    }

    const nonReadable = await query<{ name: string; category: string; mimeType: string }>(
      `SELECT name, category, "mimeType" FROM document_index
       WHERE readable = 0 OR "charCount" = 0
       ORDER BY category, name`
    );

    if (nonReadable.length > 0) {
      ctx += "--- Other files (names only, content not readable — images, videos, etc.) ---\n";
      for (const f of nonReadable) {
        ctx += `- ${f.name} (${f.category || "Uncategorised"}) [${f.mimeType || "unknown type"}]\n`;
      }
      ctx += "\n";
    }

    return ctx;
  } catch {
    return "";
  }
}

export async function getPublicDocumentsContext(): Promise<string> {
  try {
    const docs = await query<{ name: string; category: string; textContent: string; charCount: number; driveUrl: string }>(
      `SELECT name, category, "textContent", "charCount", "driveUrl" FROM document_index
       WHERE readable = 1 AND "charCount" > 0 AND category = '09_Public Reference'
       ORDER BY name`
    );

    if (docs.length === 0) return "";

    let ctx = "\n\n=== CLUB REFERENCE DOCUMENTS ===\n";
    ctx += "These are official club reference documents. When answering from these, cite the document name as your source.\n\n";

    for (const doc of docs) {
      const maxPerDoc = Math.min(80000, Math.floor(400000 / docs.length));
      const text = doc.textContent.length > maxPerDoc
        ? doc.textContent.substring(0, maxPerDoc) + "\n[...truncated]"
        : doc.textContent;
      ctx += `--- Document: ${doc.name} ---\n`;
      ctx += text + "\n\n";
    }

    return ctx;
  } catch {
    return "";
  }
}

export default router;
