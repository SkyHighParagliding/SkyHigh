import { queryOne } from "./pg.js";

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
