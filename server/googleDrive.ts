import createLogger from "./utils/logger.js";
import { queryOne, execute } from "./pg.js";

const log = createLogger("google-drive");

async function getClubName(): Promise<string> {
  const row = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'clubName'");
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
  const row = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'drive_appscript_url'");
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

/** Retry wrapper for transient Drive API errors (429, 500, 503). */
async function withRetry<T>(fn: () => Promise<T | null>, context: string, retries = 3, backoff = 1000): Promise<T | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      if (attempt < retries - 1 && (err?.code === 429 || err?.code === 500 || err?.code === 503)) {
        log.warn(`Drive API retry ${attempt + 1}/${retries} for ${context}: ${err.message}`);
        await new Promise(r => setTimeout(r, backoff * Math.pow(2, attempt)));
        continue;
      }
      log.error(`Drive API failed for ${context}: ${err.message}`);
      return null;
    }
  }
  return null;
}

export async function createFolder(name: string, parentId?: string): Promise<string | null> {
  const drive = await getClient();
  if (!drive) return null;
  return withRetry(async () => {
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
  }, `createFolder(${name})`);
}

export async function findFolder(name: string, parentId?: string): Promise<string | null> {
  const drive = await getClient();
  if (!drive) return null;
  return withRetry(async () => {
    let query = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    if (parentId) query += ` and '${parentId}' in parents`;
    const res = await drive.files.list({ q: query, fields: "files(id, name)", pageSize: 1 });
    return res.data.files?.[0]?.id || null;
  }, `findFolder(${name})`);
}

export async function ensureFolderStructure(): Promise<Record<string, string> | null> {
  const drive = await getClient();
  if (!drive) return null;

  try {
    const existingRoot = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'driveRootFolderId'");
    const existingCategories = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'driveCategories'");

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

    await execute("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", ["driveRootFolderId", rootId]);
    await execute("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", ["driveCategories", JSON.stringify(folderMap)]);

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
  return withRetry(async () => {
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
  }, `uploadFile(${fileName})`);
}

export async function listFiles(folderId: string): Promise<any[]> {
  const drive = await getClient();
  if (!drive) return [];
  return (await withRetry(async () => {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "files(id, name, mimeType, size, webViewLink, createdTime, modifiedTime)",
      pageSize: 100,
      orderBy: "name",
    });
    return res.data.files || [];
  }, `listFiles(${folderId})`)) ?? [];
}

export async function deleteFile(driveFileId: string): Promise<boolean> {
  const drive = await getClient();
  if (!drive) return false;
  return (await withRetry(async () => {
    await drive.files.delete({ fileId: driveFileId });
    log.info(`Deleted file: ${driveFileId}`);
    return true;
  }, `deleteFile(${driveFileId})`)) ?? false;
}

export async function searchFiles(query: string): Promise<any[]> {
  const drive = await getClient();
  if (!drive) return [];
  return (await withRetry(async () => {
    const safe = query.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const res = await drive.files.list({
      q: `name contains '${safe}' and trashed=false`,
      fields: "files(id, name, mimeType, size, webViewLink, createdTime, parents)",
      pageSize: 50,
      orderBy: "modifiedTime desc",
    });
    return res.data.files || [];
  }, `searchFiles(${query})`)) ?? [];
}

export async function getFileWebViewLink(driveFileId: string): Promise<string | null> {
  const drive = await getClient();
  if (!drive) return null;
  return withRetry(async () => {
    const res = await drive.files.get({ fileId: driveFileId, fields: "webViewLink" });
    return res.data.webViewLink || `https://drive.google.com/file/d/${driveFileId}/view`;
  }, `getFileWebViewLink(${driveFileId})`);
}
