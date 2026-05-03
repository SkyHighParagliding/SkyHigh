import { Router } from "express";
import multer from "multer";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  isDriveConnected,
  uploadFile,
  createFolder,
  deleteFile,
  ensureFolderStructure,
  getAppScriptUrl,
} from "../googleDrive.js";
import createLogger from "../utils/logger.js";

const log = createLogger("projects");

const driveFilesCache = new Map<string, { files: any[], folderName: string, timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

function generateId() {
  return `proj-${Math.random().toString(36).substr(2, 9)}`;
}

router.get("/settings/parks-vic-defaults", requireAuth, asyncHandler(async (req, res) => {
  const expectations = await db.prepare("SELECT value FROM settings WHERE key = 'pvDefaultExpectations'").get() as any;
  res.json({
    expectations: expectations?.value || "",
  });
}));

router.put("/settings/parks-vic-defaults", requireAuth, asyncHandler(async (req, res) => {
  const { expectations } = req.body;
  await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("pvDefaultExpectations", expectations || "");
  res.json({ success: true });
}));

router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const projects = await db.prepare(`
    SELECT p.*,
      s.name as relatedSiteName,
      c.name as coordinatorName,
      c.organisation as coordinatorOrg,
      (SELECT COUNT(*) FROM project_documents pd WHERE pd.projectId = p.id) as documentCount,
      (SELECT COUNT(*) FROM project_contacts pc WHERE pc.projectId = p.id) as contactCount
    FROM projects p
    LEFT JOIN sites s ON s.id = p.relatedSiteId
    LEFT JOIN contacts c ON c.id = p.coordinatorContactId
    ORDER BY
      CASE p.status WHEN 'active' THEN 0 WHEN 'on-hold' THEN 1 WHEN 'completed' THEN 2 WHEN 'archived' THEN 3 END,
      p.updatedAt DESC
  `).all();
  res.json(projects);
}));

router.get("/:id", requireAuth, asyncHandler(async (req, res) => {
  const project = await db.prepare(`
    SELECT p.*, s.name as relatedSiteName
    FROM projects p
    LEFT JOIN sites s ON s.id = p.relatedSiteId
    WHERE p.id = ?
  `).get(req.params.id) as any;
  if (!project) return res.status(404).json({ error: "Project not found" });

  const contacts = await db.prepare(`
    SELECT c.*, pc.role FROM project_contacts pc
    JOIN contacts c ON c.id = pc.contactId
    WHERE pc.projectId = ?
    ORDER BY pc.role, c.name
  `).all(req.params.id);

  const documents = await db.prepare(`
    SELECT d.*, CASE WHEN d.driveFileId IS NOT NULL THEN 1 ELSE 0 END as linked FROM project_documents pd
    JOIN documents d ON d.id = pd.documentId
    WHERE pd.projectId = ?
    ORDER BY d.createdAt DESC
  `).all(req.params.id);

  let coordinatorContact = null;
  if (project.coordinatorContactId) {
    coordinatorContact = await db.prepare("SELECT * FROM contacts WHERE id = ?").get(project.coordinatorContactId) || null;
  }

  project.contacts = contacts;
  project.documents = documents;
  project.coordinatorContact = coordinatorContact;
  res.json(project);
}));

router.post("/", requireAuth, asyncHandler(async (req, res) => {
  const { name, description, status, relatedSiteId, parksVic, pvContactId, pvExpectations, worksRequired, contractorNotes, landownerNotes, stakeholderNotes, coordinatorContactId, estimatedBudget, fundingSource, insuranceRequirements, supplierQuotes, complianceNotes, approvedBy, approvalDate } = req.body;
  if (!name) return res.status(400).json({ error: "Project name is required" });

  let finalPvExpectations = pvExpectations;
  if (parksVic && !pvExpectations) {
    const defaults = await db.prepare("SELECT value FROM settings WHERE key = 'pvDefaultExpectations'").get() as any;
    finalPvExpectations = defaults?.value || "";
  }

  const id = generateId();
  await db.prepare(`
    INSERT INTO projects (id, name, description, status, relatedSiteId, parksVic, pvContactId, pvExpectations, worksRequired, contractorNotes, landownerNotes, stakeholderNotes, coordinatorContactId, estimatedBudget, fundingSource, insuranceRequirements, supplierQuotes, complianceNotes, approvedBy, approvalDate)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, description || "", status || "active", relatedSiteId || null, parksVic ? 1 : 0, pvContactId || null, finalPvExpectations || "", worksRequired || "", contractorNotes || "", landownerNotes || "", stakeholderNotes || "", coordinatorContactId || null, estimatedBudget || "", fundingSource || "", insuranceRequirements || "", supplierQuotes || "", complianceNotes || "", approvedBy || "", approvalDate || "");

  const project = await db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
  res.status(201).json(project);
}));

router.put("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { name, description, status, relatedSiteId, parksVic, pvContactId, pvExpectations, worksRequired, contractorNotes, landownerNotes, stakeholderNotes, coordinatorContactId, estimatedBudget, fundingSource, insuranceRequirements, supplierQuotes, complianceNotes, approvedBy, approvalDate } = req.body;
  if (!name) return res.status(400).json({ error: "Project name is required" });

  const result = await db.prepare(`
    UPDATE projects SET
      name = ?, description = ?, status = ?, relatedSiteId = ?,
      parksVic = ?, pvContactId = ?, pvExpectations = ?,
      worksRequired = ?, contractorNotes = ?, landownerNotes = ?, stakeholderNotes = ?,
      coordinatorContactId = ?,
      estimatedBudget = ?, fundingSource = ?, insuranceRequirements = ?,
      supplierQuotes = ?, complianceNotes = ?, approvedBy = ?, approvalDate = ?,
      updatedAt = datetime('now')
    WHERE id = ?
  `).run(name, description || "", status || "active", relatedSiteId || null, parksVic ? 1 : 0, pvContactId || null, pvExpectations || "", worksRequired || "", contractorNotes || "", landownerNotes || "", stakeholderNotes || "", coordinatorContactId || null, estimatedBudget || "", fundingSource || "", insuranceRequirements || "", supplierQuotes || "", complianceNotes || "", approvedBy || "", approvalDate || "", req.params.id);

  if (result.changes === 0) return res.status(404).json({ error: "Project not found" });
  const project = await db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id);
  res.json(project);
}));

router.delete("/:id", requireAuth, asyncHandler(async (req, res) => {
  const project = await db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });

  await db.prepare("DELETE FROM project_contacts WHERE projectId = ?").run(req.params.id);
  await db.prepare("DELETE FROM project_documents WHERE projectId = ?").run(req.params.id);
  await db.prepare("DELETE FROM projects WHERE id = ?").run(req.params.id);
  res.json({ success: true });
}));

router.post("/:id/documents/upload", requireAuth, upload.single("file"), asyncHandler(async (req, res) => {
  driveFilesCache.delete(req.params.id);
  const project = await db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id) as any;
  if (!project) return res.status(404).json({ error: "Project not found" });
  if (!req.file) return res.status(400).json({ error: "No file provided" });

  const safeName = project.driveFolderName || project.name.replace(/[^a-zA-Z0-9 _\-&]/g, "").trim() || `Project-${req.params.id}`;
  const appScriptUrl = await getAppScriptUrl();

  if (appScriptUrl) {
    try {
      const base64Data = req.file.buffer.toString("base64");
      const response = await fetch(
        `${appScriptUrl}?action=upload&folder=${encodeURIComponent("08_Projects")}&subfolder=${encodeURIComponent(safeName)}&name=${encodeURIComponent(req.file.originalname)}&mimeType=${encodeURIComponent(req.file.mimetype)}`,
        {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: base64Data,
        }
      );
      const data = await response.json() as any;
      if (data.success && data.file) {
        const docId = `doc-${Math.random().toString(36).substr(2, 9)}`;
        await db.prepare(
          "INSERT INTO documents (id, driveFileId, name, mimeType, size, category, driveFolderId, webViewLink, uploadedBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(docId, data.file.id, data.file.name, data.file.mimeType, data.file.size || req.file.size, "08", null, data.file.url, (req as any).user?.name || "admin");

        await db.prepare(
          "INSERT INTO project_documents (projectId, documentId, linked) VALUES (?, ?, 0)"
        ).run(req.params.id, docId);

        if (!project.driveFolderName) {
          await db.prepare("UPDATE projects SET driveFolderName = ? WHERE id = ?").run(safeName, req.params.id);
        }

        const doc = await db.prepare("SELECT * FROM documents WHERE id = ?").get(docId);
        return res.status(201).json(doc);
      }
      return res.status(500).json({ error: data.error || "Upload failed" });
    } catch (err: any) {
      log.error("Apps Script project upload failed:", err.message);
      return res.status(500).json({ error: "Failed to upload file: " + err.message });
    }
  }

  const connected = await isDriveConnected();
  if (!connected) {
    return res.status(503).json({ error: "Google Drive not connected. Connect Google Drive to enable file uploads." });
  }

  let folderId = project.driveFolderId;
  if (!folderId) {
    const folderMap = await ensureFolderStructure(db);
    const projectsParent = folderMap?.["08"];
    if (!projectsParent) {
      return res.status(500).json({ error: "Could not find Projects folder in Drive" });
    }
    folderId = await createFolder(safeName, projectsParent);
    if (!folderId) {
      return res.status(500).json({ error: "Failed to create project folder in Drive" });
    }
    await db.prepare("UPDATE projects SET driveFolderId = ? WHERE id = ?").run(folderId, req.params.id);
  }

  const result = await uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype, folderId);
  if (!result) {
    return res.status(500).json({ error: "Failed to upload file to Google Drive" });
  }

  const docId = `doc-${Math.random().toString(36).substr(2, 9)}`;
  await db.prepare(
    "INSERT INTO documents (id, driveFileId, name, mimeType, size, category, driveFolderId, webViewLink, uploadedBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(docId, result.id, result.name, req.file.mimetype, req.file.size, "08", folderId, result.webViewLink, (req as any).user?.name || "admin");

  await db.prepare(
    "INSERT INTO project_documents (projectId, documentId, linked) VALUES (?, ?, 0)"
  ).run(req.params.id, docId);

  const doc = await db.prepare("SELECT * FROM documents WHERE id = ?").get(docId);
  res.status(201).json(doc);
}));

router.get("/:id/documents/drive", requireAuth, asyncHandler(async (req, res) => {
  const cached = driveFilesCache.get(req.params.id);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return res.json({ files: cached.files, source: "drive", folderName: cached.folderName, cached: true });
  }

  const project = await db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id) as any;
  if (!project) return res.status(404).json({ error: "Project not found" });

  const appScriptUrl = await getAppScriptUrl();
  if (!appScriptUrl) {
    return res.json({ files: [], source: "none" });
  }

  const folderName = project.driveFolderName || project.name.replace(/[^a-zA-Z0-9 _\-&]/g, "").trim();
  try {
    const response = await fetch(
      `${appScriptUrl}?action=listProjectFiles&project=${encodeURIComponent(folderName)}`
    );
    const data = await response.json() as any;
    if (data.success) {
      driveFilesCache.set(req.params.id, { files: data.files || [], folderName, timestamp: Date.now() });
      return res.json({ files: data.files || [], source: "drive", folderName });
    }
    return res.json({ files: [], source: "error", error: data.error });
  } catch (err: any) {
    log.error("Failed to list project files from Drive:", err.message);
    return res.json({ files: [], source: "error", error: err.message });
  }
}));

router.post("/:id/documents/link", requireAuth, asyncHandler(async (req, res) => {
  driveFilesCache.delete(req.params.id);
  const { documentId, driveFileId, name, mimeType, webViewLink } = req.body;

  const project = await db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });

  let docId = documentId;

  if (!docId && driveFileId) {
    const existing = await db.prepare("SELECT id FROM documents WHERE driveFileId = ?").get(driveFileId) as any;
    if (existing) {
      docId = existing.id;
    } else {
      docId = `doc-${Math.random().toString(36).substr(2, 9)}`;
      await db.prepare(
        "INSERT INTO documents (id, driveFileId, name, mimeType, category, webViewLink) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(docId, driveFileId, name || "Linked Document", mimeType || "", "08", webViewLink || `https://drive.google.com/file/d/${driveFileId}/view`);
    }
  }

  if (!docId) return res.status(400).json({ error: "documentId or driveFileId is required" });

  const existingLink = await db.prepare("SELECT * FROM project_documents WHERE projectId = ? AND documentId = ?").get(req.params.id, docId);
  if (existingLink) return res.status(409).json({ error: "Document already linked to this project" });

  await db.prepare(
    "INSERT INTO project_documents (projectId, documentId, linked) VALUES (?, ?, 1)"
  ).run(req.params.id, docId);

  res.status(201).json({ success: true, documentId: docId });
}));

router.delete("/:id/documents/:docId", requireAuth, asyncHandler(async (req, res) => {
  driveFilesCache.delete(req.params.id);
  const link = await db.prepare("SELECT * FROM project_documents WHERE projectId = ? AND documentId = ?").get(req.params.id, req.params.docId) as any;
  if (!link) return res.status(404).json({ error: "Document not linked to this project" });

  await db.prepare("DELETE FROM project_documents WHERE projectId = ? AND documentId = ?").run(req.params.id, req.params.docId);

  if (link.linked === 0) {
    const otherLinks = await db.prepare("SELECT COUNT(*) as c FROM project_documents WHERE documentId = ?").get(req.params.docId) as any;
    if (!otherLinks?.c) {
      const doc = await db.prepare("SELECT * FROM documents WHERE id = ?").get(req.params.docId) as any;
      if (doc?.driveFileId) {
        let driveDeleted = false;
        const appScriptUrl = await getAppScriptUrl();
        if (appScriptUrl) {
          try {
            const delRes = await fetch(`${appScriptUrl}?action=delete&fileId=${encodeURIComponent(doc.driveFileId)}`, { method: "POST" });
            const delData = await delRes.json() as any;
            driveDeleted = !!delData.success;
            if (!driveDeleted) log.error("Apps Script delete returned error:", delData.error);
          } catch (err: any) {
            log.error("Apps Script delete failed:", err.message);
          }
        } else {
          const connected = await isDriveConnected();
          if (connected) {
            driveDeleted = await deleteFile(doc.driveFileId);
          } else {
            driveDeleted = true;
          }
        }
        if (!driveDeleted) {
          log.warn(`Drive file ${doc.driveFileId} may not have been deleted — removing local record anyway`);
        }
      }
      await db.prepare("DELETE FROM documents WHERE id = ?").run(req.params.docId);
    }
  }

  res.json({ success: true });
}));

router.post("/:id/contacts", requireAuth, asyncHandler(async (req, res) => {
  const { contactId, role } = req.body;
  if (!contactId) return res.status(400).json({ error: "contactId is required" });

  const project = await db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const contact = await db.prepare("SELECT * FROM contacts WHERE id = ?").get(contactId);
  if (!contact) return res.status(404).json({ error: "Contact not found" });

  const existing = await db.prepare("SELECT * FROM project_contacts WHERE projectId = ? AND contactId = ?").get(req.params.id, contactId);
  if (existing) return res.status(409).json({ error: "Contact already linked to this project" });

  await db.prepare(
    "INSERT INTO project_contacts (projectId, contactId, role) VALUES (?, ?, ?)"
  ).run(req.params.id, contactId, role || "stakeholder");

  res.status(201).json({ success: true });
}));

router.delete("/:id/contacts/:contactId", requireAuth, asyncHandler(async (req, res) => {
  const result = await db.prepare("DELETE FROM project_contacts WHERE projectId = ? AND contactId = ?").run(req.params.id, req.params.contactId);
  if (result.changes === 0) return res.status(404).json({ error: "Contact not linked to this project" });
  res.json({ success: true });
}));

export default router;
