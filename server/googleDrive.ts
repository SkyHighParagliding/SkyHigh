import createLogger from "./utils/logger.js";
import db from "./db.js";

const log = createLogger("google-drive");

async function getClubName(): Promise<string> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'clubName'").get() as { value: string } | undefined;
  return row?.value || "SkyHigh";
}

const CATEGORY_FOLDERS = [
  { code: "01", name: "01_Governance & Manuals" },
  { code: "02", name: "02_Committee Meetings" },
  { code: "03", name: "03_Financial Records" },
  { code: "04", name: "04_Membership & Contact" },
  { code: "05", name: "05_Safety & Site Management" },
  { code: "06", name: "06_Assets & Equipment" },
  { code: "07", name: "07_Marketing & Photos" },
  { code: "08", name: "08_Projects" },
  { code: "09", name: "09_Public Reference" },
  { code: "10", name: "10_Admin Reference" },
];

export { CATEGORY_FOLDERS };

export async function getAppScriptUrl(): Promise<string> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'drive_appscript_url'").get() as { value: string } | undefined;
  const url = row?.value || "";
  if (!url) return "";
  const allowedDomains = ["script.google.com", "script.googleusercontent.com"];
  try {
    if (allowedDomains.some(d => new URL(url).hostname.endsWith(d))) return url;
  } catch {}
  return "";
}

let getDriveClient: (() => Promise<any>) | null = null;

export function registerDriveClient(clientGetter: () => Promise<any>) {
  getDriveClient = clientGetter;
  log.info("Google Drive client registered");
}

export async function isDriveConnected(): Promise<boolean> {
  if (!getDriveClient) return false;
  try {
    const drive = await getDriveClient();
    return !!drive;
  } catch {
    return false;
  }
}

async function getClient() {
  if (!getDriveClient) return null;
  try {
    return await getDriveClient();
  } catch (err: any) {
    log.error("Failed to get Drive client:", err.message);
    return null;
  }
}

export async function createFolder(name: string, parentId?: string): Promise<string | null> {
  const drive = await getClient();
  if (!drive) return null;
  try {
    const fileMetadata: any = {
      name,
      mimeType: "application/vnd.google-apps.folder",
    };
    if (parentId) fileMetadata.parents = [parentId];
    const res = await drive.files.create({
      requestBody: fileMetadata,
      fields: "id",
    });
    log.info(`Created folder: ${name} (${res.data.id})`);
    return res.data.id;
  } catch (err: any) {
    log.error(`Failed to create folder ${name}:`, err.message);
    return null;
  }
}

export async function findFolder(name: string, parentId?: string): Promise<string | null> {
  const drive = await getClient();
  if (!drive) return null;
  try {
    let query = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    if (parentId) query += ` and '${parentId}' in parents`;
    const res = await drive.files.list({ q: query, fields: "files(id, name)", pageSize: 1 });
    return res.data.files?.[0]?.id || null;
  } catch (err: any) {
    log.error(`Failed to find folder ${name}:`, err.message);
    return null;
  }
}

export async function ensureFolderStructure(db: any): Promise<Record<string, string> | null> {
  const drive = await getClient();
  if (!drive) return null;

  try {
    const existingRoot = await db.prepare("SELECT value FROM settings WHERE key = 'driveRootFolderId'").get();
    const existingCategories = await db.prepare("SELECT value FROM settings WHERE key = 'driveCategories'").get();

    if (existingRoot?.value && existingCategories?.value) {
      const rootId = existingRoot.value;
      try {
        await drive.files.get({ fileId: rootId, fields: "id" });
        try {
          return JSON.parse(existingCategories.value);
        } catch (e: any) {
          log.warn("Failed to parse stored categories:", e.message);
        }
      } catch {
        log.warn("Stored root folder no longer accessible, recreating...");
      }
    }

    const rootFolderName = `${await getClubName()} Documents`;
    let rootId = await findFolder(rootFolderName);
    if (!rootId) {
      rootId = await createFolder(rootFolderName);
    }
    if (!rootId) return null;

    const folderMap: Record<string, string> = {};
    for (const cat of CATEGORY_FOLDERS) {
      let folderId = await findFolder(cat.name, rootId);
      if (!folderId) {
        folderId = await createFolder(cat.name, rootId);
      }
      if (folderId) {
        folderMap[cat.code] = folderId;
      }
    }

    await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("driveRootFolderId", rootId);
    await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("driveCategories", JSON.stringify(folderMap));

    log.info("Drive folder structure ensured");
    return folderMap;
  } catch (err: any) {
    log.error("Failed to ensure folder structure:", err.message);
    return null;
  }
}

export async function uploadFile(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  folderId: string
): Promise<{ id: string; name: string; webViewLink: string; size: number } | null> {
  const drive = await getClient();
  if (!drive) return null;
  try {
    const { Readable } = await import("stream");
    const res = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
      media: {
        mimeType,
        body: Readable.from(fileBuffer),
      },
      fields: "id, name, webViewLink, size",
    });
    log.info(`Uploaded file: ${fileName} (${res.data.id})`);
    return {
      id: res.data.id,
      name: res.data.name,
      webViewLink: res.data.webViewLink || `https://drive.google.com/file/d/${res.data.id}/view`,
      size: parseInt(res.data.size || "0", 10),
    };
  } catch (err: any) {
    log.error(`Failed to upload file ${fileName}:`, err.message);
    return null;
  }
}

export async function listFiles(folderId: string): Promise<any[]> {
  const drive = await getClient();
  if (!drive) return [];
  try {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "files(id, name, mimeType, size, webViewLink, createdTime, modifiedTime)",
      pageSize: 100,
      orderBy: "name",
    });
    return res.data.files || [];
  } catch (err: any) {
    log.error(`Failed to list files in folder ${folderId}:`, err.message);
    return [];
  }
}

export async function deleteFile(driveFileId: string): Promise<boolean> {
  const drive = await getClient();
  if (!drive) return false;
  try {
    await drive.files.delete({ fileId: driveFileId });
    log.info(`Deleted file: ${driveFileId}`);
    return true;
  } catch (err: any) {
    log.error(`Failed to delete file ${driveFileId}:`, err.message);
    return false;
  }
}

export async function searchFiles(query: string): Promise<any[]> {
  const drive = await getClient();
  if (!drive) return [];
  try {
    const res = await drive.files.list({
      q: `name contains '${query.replace(/'/g, "\\'")}' and trashed=false`,
      fields: "files(id, name, mimeType, size, webViewLink, createdTime, parents)",
      pageSize: 50,
      orderBy: "modifiedTime desc",
    });
    return res.data.files || [];
  } catch (err: any) {
    log.error(`Failed to search files for "${query}":`, err.message);
    return [];
  }
}

export async function getFileWebViewLink(driveFileId: string): Promise<string | null> {
  const drive = await getClient();
  if (!drive) return null;
  try {
    const res = await drive.files.get({ fileId: driveFileId, fields: "webViewLink" });
    return res.data.webViewLink || `https://drive.google.com/file/d/${driveFileId}/view`;
  } catch (err: any) {
    log.error(`Failed to get web view link for ${driveFileId}:`, err.message);
    return null;
  }
}
