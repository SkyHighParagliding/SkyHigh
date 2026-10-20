import { toast } from "sonner";
import { api } from "@/lib/apiClient";
import { BASE } from "./useTill";

/**
 * Save till documents to the club Google Drive (TASK-039). The server turns the
 * same A4 HTML the iPad prints into a PDF and files it: money → 03_Financial
 * Records, planning → 08_Projects, in a "Sizzle <event>" subfolder.
 */

export type DriveFolder = "money" | "planning";
export interface DriveSaved { id: string; url: string; name: string; folder: string }
export interface DriveStatus { drive: boolean; pdf: boolean; detail: string }

export function driveStatus(token: string | null): Promise<DriveStatus> {
  return api.get<DriveStatus>("/api/sizzle/drive/status", token);
}

export function saveDocToDrive(token: string | null, doc: { html: string; docTitle: string; folder: DriveFolder; landscape: boolean }): Promise<DriveSaved> {
  return api.post<DriveSaved>("/api/sizzle/drive/doc", { ...doc, eventTitle: BASE.event.title }, token);
}

export function saveImageToDrive(token: string | null, img: { dataUrl: string; docTitle: string }): Promise<DriveSaved> {
  return api.post<DriveSaved>("/api/sizzle/drive/image", { ...img, eventTitle: BASE.event.title }, token);
}

/** Plain-English reason a save didn't work. */
export function driveErrorText(err: unknown): string {
  const code = (err as { data?: { code?: string } })?.data?.code;
  if (code === "pdf-unavailable") return "the website can't make PDFs yet — use View / Print on the iPad";
  if (code === "drive-not-connected") return "Google Drive isn't connected to the website";
  return err instanceof Error ? err.message : String(err);
}

/** Save in the background after something else (end of day, a receipt); a toast says how it went. */
export function saveQuietly(what: string, run: () => Promise<DriveSaved>): void {
  run().then(
    (s) => toast.success(`${what} saved to Drive (${s.folder})`),
    (err) => toast.info(`${what} not saved to Drive: ${driveErrorText(err)}. Nothing is lost — it's on the iPad and the website.`),
  );
}
