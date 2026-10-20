import { CATEGORY_FOLDERS, getAppScriptUrl } from "../googleDrive.js";

/**
 * Save a sizzle document or receipt photo into the club Google Drive through
 * the existing Apps Script bridge (same call as POST /api/documents/upload).
 * Filing (DECISION-020): money records → 03_Financial Records, planning
 * documents → 08_Projects, each in a "Sizzle <event>" subfolder.
 */

export type SizzleFolder = "money" | "planning";
const CATEGORY: Record<SizzleFolder, string> = { money: "03", planning: "08" };

export class DriveNotConnectedError extends Error {}

/** "2026-11-01 1840" in Melbourne time, so names sort by when they were saved. */
export function driveStamp(d = new Date()): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}${p.minute}`;
}

/** Drive-safe file/folder name: no slashes or control characters, at most 120 characters. */
export const driveName = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);

export async function uploadToDrive(opts: { folder: SizzleFolder; eventTitle: string; fileName: string; mimeType: string; data: Buffer }): Promise<{ id: string; url: string; name: string; folder: string }> {
  const appScriptUrl = await getAppScriptUrl();
  if (!appScriptUrl) throw new DriveNotConnectedError("Google Drive isn't connected (Admin → Connections)");
  const folderName = CATEGORY_FOLDERS.find((c) => c.code === CATEGORY[opts.folder])!.name;
  const subfolder = driveName(`Sizzle ${opts.eventTitle}`);
  const name = driveName(opts.fileName);
  const url = `${appScriptUrl}?action=upload&folder=${encodeURIComponent(folderName)}&name=${encodeURIComponent(name)}&mimeType=${encodeURIComponent(opts.mimeType)}&subfolder=${encodeURIComponent(subfolder)}`;
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain" }, body: opts.data.toString("base64") });
  const body = (await res.json().catch(() => null)) as { success?: boolean; error?: string; file?: { id: string; url: string; name: string } } | null;
  if (!body?.success || !body.file) throw new Error(body?.error || `Drive upload failed (${res.status})`);
  return { id: body.file.id, url: body.file.url, name: body.file.name, folder: `${folderName} / ${subfolder}` };
}
