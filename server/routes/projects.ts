import { Router } from "express";
import multer from "multer";
import { query, queryOne, execute, transaction } from "../pg.js";
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
  const expectations = await queryOne<any>("SELECT value FROM settings WHERE key = 'pvDefaultExpectations'");
  res.json({
    expectations: expectations?.value || "",
  });
}));

router.put("/settings/parks-vic-defaults", requireAuth, asyncHandler(async (req, res) => {
  const { expectations } = req.body;
  await execute(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    ["pvDefaultExpectations", expectations || ""]
  );
  res.json({ success: true });
}));

router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const projects = await query<any>(`
    SELECT p.*,
      s.name as "relatedSiteName",
      c.name as "coordinatorName",
      c.organisation as "coordinatorOrg",
      (SELECT COUNT(*)::int FROM project_documents pd WHERE pd."projectId" = p.id) as "documentCount",
      (SELECT COUNT(*)::int FROM project_contacts pc WHERE pc."projectId" = p.id) as "contactCount"
    FROM projects p
    LEFT JOIN sites s ON s.id = p."relatedSiteId"
    LEFT JOIN contacts c ON c.id = p."coordinatorContactId"
    ORDER BY
      CASE p.status WHEN 'active' THEN 0 WHEN 'on-hold' THEN 1 WHEN 'completed' THEN 2 WHEN 'archived' THEN 3 END,
      p."updatedAt" DESC
  `);
  res.json(projects);
}));

router.get("/:id", requireAuth, asyncHandler(async (req, res) => {
  const project = await queryOne<any>(`
    SELECT p.*, s.name as "relatedSiteName"
    FROM projects p
    LEFT JOIN sites s ON s.id = p."relatedSiteId"
    WHERE p.id = $1
  `, [req.params.id]);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const contacts = await query<any>(`
    SELECT c.*, pc.role FROM project_contacts pc
    JOIN contacts c ON c.id = pc."contactId"
    WHERE pc."projectId" = $1
    ORDER BY pc.role, c.name
  `, [req.params.id]);

  const documents = await query<any>(`
    SELECT d.*, CASE WHEN d."driveFileId" IS NOT NULL THEN 1 ELSE 0 END as linked FROM project_documents pd
    JOIN documents d ON d.id = pd."documentId"
    WHERE pd."projectId" = $1
    ORDER BY d."createdAt" DESC
  `, [req.params.id]);

  let coordinatorContact = null;
  if (project.coordinatorContactId) {
    coordinatorContact = await queryOne<any>("SELECT * FROM contacts WHERE id = $1", [project.coordinatorContactId]) || null;
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
    const defaults = await queryOne<any>("SELECT value FROM settings WHERE key = 'pvDefaultExpectations'");
    finalPvExpectations = defaults?.value || "";
  }

  const id = generateId();
  await execute(`
    INSERT INTO projects (id, name, description, status, "relatedSiteId", "parksVic", "pvContactId", "pvExpectations", "worksRequired", "contractorNotes", "landownerNotes", "stakeholderNotes", "coordinatorContactId", "estimatedBudget", "fundingSource", "insuranceRequirements", "supplierQuotes", "complianceNotes", "approvedBy", "approvalDate")
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
  `, [id, name, description || "", status || "active", relatedSiteId || null, parksVic ? 1 : 0, pvContactId || null, finalPvExpectations || "", worksRequired || "", contractorNotes || "", landownerNotes || "", stakeholderNotes || "", coordinatorContactId || null, estimatedBudget || "", fundingSource || "", insuranceRequirements || "", supplierQuotes || "", complianceNotes || "", approvedBy || "", approvalDate || ""]);

  const project = await queryOne<any>("SELECT * FROM projects WHERE id = $1", [id]);
  res.status(201).json(project);
}));

router.put("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { name, description, status, relatedSiteId, parksVic, pvContactId, pvExpectations, worksRequired, contractorNotes, landownerNotes, stakeholderNotes, coordinatorContactId, estimatedBudget, fundingSource, insuranceRequirements, supplierQuotes, complianceNotes, approvedBy, approvalDate } = req.body;
  if (!name) return res.status(400).json({ error: "Project name is required" });

  const result = await execute(`
    UPDATE projects SET
      name = $1, description = $2, status = $3, "relatedSiteId" = $4,
      "parksVic" = $5, "pvContactId" = $6, "pvExpectations" = $7,
      "worksRequired" = $8, "contractorNotes" = $9, "landownerNotes" = $10, "stakeholderNotes" = $11,
      "coordinatorContactId" = $12,
      "estimatedBudget" = $13, "fundingSource" = $14, "insuranceRequirements" = $15,
      "supplierQuotes" = $16, "complianceNotes" = $17, "approvedBy" = $18, "approvalDate" = $19,
      "updatedAt" = NOW()
    WHERE id = $20
  `, [name, description || "", status || "active", relatedSiteId || null, parksVic ? 1 : 0, pvContactId || null, pvExpectations || "", worksRequired || "", contractorNotes || "", landownerNotes || "", stakeholderNotes || "", coordinatorContactId || null, estimatedBudget || "", fundingSource || "", insuranceRequirements || "", supplierQuotes || "", complianceNotes || "", approvedBy || "", approvalDate || "", req.params.id]);

  if (result.rowCount === 0) return res.status(404).json({ error: "Project not found" });
  const project = await queryOne<any>("SELECT * FROM projects WHERE id = $1", [req.params.id]);
  res.json(project);
}));

router.delete("/:id", requireAuth, asyncHandler(async (req, res) => {
  const project = await queryOne<any>("SELECT * FROM projects WHERE id = $1", [req.params.id]);
  if (!project) return res.status(404).json({ error: "Project not found" });

  await execute("DELETE FROM project_contacts WHERE \"projectId\" = $1", [req.params.id]);
  await execute("DELETE FROM project_documents WHERE \"projectId\" = $1", [req.params.id]);
  await execute("DELETE FROM projects WHERE id = $1", [req.params.id]);
  res.json({ success: true });
}));

router.post("/:id/documents/upload", requireAuth, upload.single("file"), asyncHandler(async (req, res) => {
  driveFilesCache.delete(req.params.id);
  const project = await queryOne<any>("SELECT * FROM projects WHERE id = $1", [req.params.id]);
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
        await transaction(async (client) => {
          await client.query(
            "INSERT INTO documents (id, \"driveFileId\", name, \"mimeType\", size, category, \"driveFolderId\", \"webViewLink\", \"uploadedBy\") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
            [docId, data.file.id, data.file.name, data.file.mimeType, data.file.size || req.file!.size, "08", null, data.file.url, (req as any).user?.name || "admin"]
          );
          await client.query(
            "INSERT INTO project_documents (\"projectId\", \"documentId\", linked) VALUES ($1, $2, 0)",
            [req.params.id, docId]
          );
          if (!project.driveFolderName) {
            await client.query("UPDATE projects SET \"driveFolderName\" = $1 WHERE id = $2", [safeName, req.params.id]);
          }
        });

        const doc = await queryOne<any>("SELECT * FROM documents WHERE id = $1", [docId]);
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
    const folderMap = await ensureFolderStructure();
    const projectsParent = folderMap?.["08"];
    if (!projectsParent) {
      return res.status(500).json({ error: "Could not find Projects folder in Drive" });
    }
    folderId = await createFolder(safeName, projectsParent);
    if (!folderId) {
      return res.status(500).json({ error: "Failed to create project folder in Drive" });
    }
    await execute("UPDATE projects SET \"driveFolderId\" = $1 WHERE id = $2", [folderId, req.params.id]);
  }

  const result = await uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype, folderId);
  if (!result) {
    return res.status(500).json({ error: "Failed to upload file to Google Drive" });
  }

  const docId = `doc-${Math.random().toString(36).substr(2, 9)}`;
  await transaction(async (client) => {
    await client.query(
      "INSERT INTO documents (id, \"driveFileId\", name, \"mimeType\", size, category, \"driveFolderId\", \"webViewLink\", \"uploadedBy\") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
      [docId, result.id, result.name, req.file!.mimetype, req.file!.size, "08", folderId, result.webViewLink, (req as any).user?.name || "admin"]
    );
    await client.query(
      "INSERT INTO project_documents (\"projectId\", \"documentId\", linked) VALUES ($1, $2, 0)",
      [req.params.id, docId]
    );
  });

  const doc = await queryOne<any>("SELECT * FROM documents WHERE id = $1", [docId]);
  res.status(201).json(doc);
}));

router.get("/:id/documents/drive", requireAuth, asyncHandler(async (req, res) => {
  const cached = driveFilesCache.get(req.params.id);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return res.json({ files: cached.files, source: "drive", folderName: cached.folderName, cached: true });
  }

  const project = await queryOne<any>("SELECT * FROM projects WHERE id = $1", [req.params.id]);
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

  const project = await queryOne<any>("SELECT * FROM projects WHERE id = $1", [req.params.id]);
  if (!project) return res.status(404).json({ error: "Project not found" });

  let docId = documentId;

  let needsDocumentInsert = false;
  if (!docId && driveFileId) {
    const existing = await queryOne<any>("SELECT id FROM documents WHERE \"driveFileId\" = $1", [driveFileId]);
    if (existing) {
      docId = existing.id;
    } else {
      docId = `doc-${Math.random().toString(36).substr(2, 9)}`;
      needsDocumentInsert = true;
    }
  }

  if (!docId) return res.status(400).json({ error: "documentId or driveFileId is required" });

  const existingLink = await queryOne<any>("SELECT * FROM project_documents WHERE \"projectId\" = $1 AND \"documentId\" = $2", [req.params.id, docId]);
  if (existingLink) return res.status(409).json({ error: "Document already linked to this project" });

  // Create the document record (if new) and link atomically so no orphaned documents
  await transaction(async (client) => {
    if (needsDocumentInsert) {
      await client.query(
        "INSERT INTO documents (id, \"driveFileId\", name, \"mimeType\", category, \"webViewLink\") VALUES ($1, $2, $3, $4, $5, $6)",
        [docId, driveFileId, name || "Linked Document", mimeType || "", "08", webViewLink || `https://drive.google.com/file/d/${driveFileId}/view`]
      );
    }
    await client.query(
      "INSERT INTO project_documents (\"projectId\", \"documentId\", linked) VALUES ($1, $2, 1)",
      [req.params.id, docId]
    );
  });

  res.status(201).json({ success: true, documentId: docId });
}));

router.delete("/:id/documents/:docId", requireAuth, asyncHandler(async (req, res) => {
  driveFilesCache.delete(req.params.id);
  const link = await queryOne<any>("SELECT * FROM project_documents WHERE \"projectId\" = $1 AND \"documentId\" = $2", [req.params.id, req.params.docId]);
  if (!link) return res.status(404).json({ error: "Document not linked to this project" });

  await execute("DELETE FROM project_documents WHERE \"projectId\" = $1 AND \"documentId\" = $2", [req.params.id, req.params.docId]);

  if (link.linked === 0) {
    const otherLinks = await queryOne<any>("SELECT COUNT(*) as c FROM project_documents WHERE \"documentId\" = $1", [req.params.docId]);
    if (!Number(otherLinks?.c)) {
      const doc = await queryOne<any>("SELECT * FROM documents WHERE id = $1", [req.params.docId]);
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
      await execute("DELETE FROM documents WHERE id = $1", [req.params.docId]);
    }
  }

  res.json({ success: true });
}));

router.post("/:id/contacts", requireAuth, asyncHandler(async (req, res) => {
  const { contactId, role } = req.body;
  if (!contactId) return res.status(400).json({ error: "contactId is required" });

  const project = await queryOne<any>("SELECT * FROM projects WHERE id = $1", [req.params.id]);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const contact = await queryOne<any>("SELECT * FROM contacts WHERE id = $1", [contactId]);
  if (!contact) return res.status(404).json({ error: "Contact not found" });

  const existing = await queryOne<any>("SELECT * FROM project_contacts WHERE \"projectId\" = $1 AND \"contactId\" = $2", [req.params.id, contactId]);
  if (existing) return res.status(409).json({ error: "Contact already linked to this project" });

  await execute(
    "INSERT INTO project_contacts (\"projectId\", \"contactId\", role) VALUES ($1, $2, $3)",
    [req.params.id, contactId, role || "stakeholder"]
  );

  res.status(201).json({ success: true });
}));

router.delete("/:id/contacts/:contactId", requireAuth, asyncHandler(async (req, res) => {
  const result = await execute("DELETE FROM project_contacts WHERE \"projectId\" = $1 AND \"contactId\" = $2", [req.params.id, req.params.contactId]);
  if (result.rowCount === 0) return res.status(404).json({ error: "Contact not linked to this project" });
  res.json({ success: true });
}));

export default router;
