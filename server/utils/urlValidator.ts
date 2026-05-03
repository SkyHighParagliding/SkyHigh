/**
 * SSRF (Server-Side Request Forgery) Prevention
 * Validates URLs to prevent attacks on internal services
 */

import createLogger from "./logger.js";

const log = createLogger("url-validator");

/**
 * Validate a URL to prevent SSRF attacks
 * Rejects localhost, private IPs, non-HTTP protocols, etc.
 *
 * @param urlString The URL to validate
 * @returns { valid: boolean, error?: string }
 */
export function validateURLSafety(urlString: string): { valid: boolean; error?: string } {
  if (!urlString || typeof urlString !== "string") {
    return { valid: false, error: "URL must be a non-empty string" };
  }

  let url: URL;
  try {
    url = new URL(urlString);
  } catch (e) {
    return { valid: false, error: "Invalid URL format" };
  }

  // Allow only HTTP and HTTPS
  if (!["http:", "https:"].includes(url.protocol)) {
    return { valid: false, error: `Protocol ${url.protocol} is not allowed. Only http:// and https:// are permitted.` };
  }

  // Reject URLs with embedded credentials
  if (url.username || url.password) {
    return { valid: false, error: "URLs with embedded credentials are not allowed" };
  }

  const hostname = url.hostname;

  // Check for localhost variations
  const localhostPatterns = [
    "localhost",
    "127.0.0.1",
    "127.0.0.0/8",
    "::1", // IPv6 localhost
    "[::1]",
  ];

  const isLocalhost = localhostPatterns.some(
    (pattern) => hostname === pattern || hostname.startsWith("127.")
  );

  // Check for private IP ranges
  const privateIPPatterns = [
    /^10\./,                    // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[01])\./, // 172.16.0.0/12
    /^192\.168\./,              // 192.168.0.0/16
    /^169\.254\./,              // 169.254.0.0/16 (link-local)
    /^fc[0-9a-f]{2}:/i,         // IPv6 Unique Local
    /^fe80:/i,                  // IPv6 Link-Local
  ];

  const isPrivateIP = privateIPPatterns.some((pattern) => pattern.test(hostname));

  // Special cases for development
  if (isLocalhost || isPrivateIP) {
    const allowLocalhostInDev = process.env.DEV_ALLOW_LOCALHOST_URLS === "true";
    if (!allowLocalhostInDev) {
      log.warn(`Rejected SSRF attempt to ${urlString} (localhost/private IP)`);
      return { valid: false, error: "Cannot fetch from localhost or private IP addresses" };
    }
    // In dev mode, allow it but log it
    log.debug(`Allowing localhost/private IP in DEV mode: ${urlString}`);
  }

  // Reject certain hostnames that are risky
  const blockedHostnames = [
    "0.0.0.0",
    "255.255.255.255",
    "metadata.google.internal", // Google Cloud metadata
    "169.254.169.254",           // AWS metadata
    "metadata.tencentcos.com",   // Tencent metadata
  ];

  if (blockedHostnames.includes(hostname)) {
    log.warn(`Rejected SSRF attempt to blocked hostname: ${hostname}`);
    return { valid: false, error: `Hostname ${hostname} is blocked` };
  }

  return { valid: true };
}

/**
 * Fetch a URL with SSRF validation and timeout
 * @param url The URL to fetch
 * @param timeoutMs Timeout in milliseconds (default 10000)
 */
export async function fetchWithValidation(
  url: string,
  timeoutMs: number = 10000
): Promise<Response> {
  // Validate the URL first
  const validation = validateURLSafety(url);
  if (!validation.valid) {
    throw new Error(`URL validation failed: ${validation.error}`);
  }

  // Fetch with timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response;
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timeout (${timeoutMs}ms) fetching ${url}`);
    }
    throw error;
  }
}
