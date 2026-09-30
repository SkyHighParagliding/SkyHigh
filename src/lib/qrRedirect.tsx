import { useEffect } from "react";
import { Navigate } from "react-router-dom";

/**
 * Per-site QR redirect config.
 *
 * A printed QR encodes a fixed URL (e.g. /check-in?site=x). Where that URL
 * *leads* is decided in-app: each site stores, per QR type, a { url, enabled }
 * entry. When enabled, the QR-target page (CheckIn / SiteFieldView / XCMaps)
 * sends the scanner to `url` instead of showing its normal content — so a QR
 * can be "parked" on another page until its real destination is ready, with
 * no reprint. Stored as a JSON string in Site.qrRedirects.
 */
export type QrType = "info" | "checkin" | "xcmaps";

export interface QrRedirectEntry {
  url: string;
  enabled: boolean;
}

export type QrRedirects = Record<QrType, QrRedirectEntry>;

export function emptyQrRedirects(): QrRedirects {
  return {
    info: { url: "", enabled: false },
    checkin: { url: "", enabled: false },
    xcmaps: { url: "", enabled: false },
  };
}

function normEntry(e: unknown): QrRedirectEntry {
  const o = (e ?? {}) as Record<string, unknown>;
  return {
    url: typeof o.url === "string" ? o.url : "",
    enabled: o.enabled === true || o.enabled === "true",
  };
}

/** Parse the raw Site.qrRedirects JSON string (or object) into a full config. */
export function parseQrRedirects(raw: unknown): QrRedirects {
  if (!raw) return emptyQrRedirects();
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    return {
      info: normEntry((obj as Record<string, unknown>)?.info),
      checkin: normEntry((obj as Record<string, unknown>)?.checkin),
      xcmaps: normEntry((obj as Record<string, unknown>)?.xcmaps),
    };
  } catch {
    return emptyQrRedirects();
  }
}

/** The active redirect target for a site + QR type, or null if not redirecting. */
export function qrRedirectTarget(
  site: { qrRedirects?: string } | undefined | null,
  type: QrType
): string | null {
  if (!site) return null;
  const entry = parseQrRedirects(site.qrRedirects)[type];
  const url = entry.url.trim();
  return entry.enabled && url ? url : null;
}

const isExternal = (to: string) => /^https?:\/\//i.test(to);

/**
 * Performs a QR redirect. Full http(s) URLs leave the SPA (window.location);
 * anything else is treated as an in-app route. Guards against redirecting to
 * the page you're already on (avoids a loop when a target points at itself).
 */
export function QrRedirect({ to }: { to: string }) {
  const external = isExternal(to);

  useEffect(() => {
    if (external) window.location.replace(to);
  }, [external, to]);

  if (external) return null;

  // In-app: skip if it resolves to the current path (loop guard).
  const targetPath = to.split("?")[0].split("#")[0];
  if (targetPath === window.location.pathname) return null;

  return <Navigate to={to} replace />;
}
