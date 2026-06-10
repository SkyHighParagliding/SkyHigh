import { tidyhqFetch } from "./tidyhqFetch.js";
import createLogger from "./logger.js";
import { queryOne } from "../pg.js";

const log = createLogger("tidyhq-filter");

const CURRENT_MEMBERS_GROUP_ID = 135716;

async function getCacheTtlMs(): Promise<number> {
  const row = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = $1", ["cacheTidyHqMemberTtl"]);
  const minutes = parseInt(row?.value || "15", 10);
  return minutes * 60 * 1000;
}

let cachedEmails: Set<string> | null = null;
let cacheTimestamp = 0;

async function fetchCurrentMemberEmails(): Promise<Set<string>> {
  try {
    const r = await tidyhqFetch(`/groups/${CURRENT_MEMBERS_GROUP_ID}/contacts`);
    if (!r.ok) {
      log.warn(`Failed to fetch Current Members group: ${r.status}`);
      return cachedEmails || new Set();
    }
    const contacts = await r.json() as any[];
    const emails = new Set<string>();
    for (const c of contacts) {
      const emailFromArray = Array.isArray(c.email_addresses) && c.email_addresses[0]
        ? c.email_addresses[0].address
        : "";
      const email = (emailFromArray || c.email_address || "").trim().toLowerCase();
      if (email) emails.add(email);
    }
    log.info(`Refreshed Current Members cache: ${emails.size} emails`);
    return emails;
  } catch (e: any) {
    log.warn(`Error fetching Current Members: ${e.message}`);
    return cachedEmails || new Set();
  }
}

async function getCurrentMemberEmails(): Promise<Set<string>> {
  const now = Date.now();
  const cacheTtlMs = await getCacheTtlMs();
  if (cachedEmails && now - cacheTimestamp < cacheTtlMs) {
    return cachedEmails;
  }
  cachedEmails = await fetchCurrentMemberEmails();
  cacheTimestamp = Date.now();
  return cachedEmails;
}

export async function filterByCurrentMembers<T extends { email?: string }>(
  contacts: T[]
): Promise<T[]> {
  if (!process.env.TIDYHQ_ACCESS_TOKEN) {
    return contacts;
  }

  const currentEmails = await getCurrentMemberEmails();
  if (currentEmails.size === 0) {
    return contacts;
  }

  return contacts.filter((c) => {
    const email = (c.email || "").trim().toLowerCase();
    if (!email) return true;
    return currentEmails.has(email);
  });
}
