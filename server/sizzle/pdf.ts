import fs from "node:fs";
import type { Browser } from "playwright-core";

/**
 * HTML → A4 PDF for the sausage sizzle documents (TASK-039), using the same
 * templates and print settings as scripts/sizzle/build-pdfs.ts.
 *
 * Needs a Chromium on the server: SIZZLE_CHROMIUM_PATH, else a system
 * chromium/chrome on Linux, else Edge/Chrome on Windows (local dev). Without
 * one, `htmlToPdf` throws PdfUnavailableError and the till falls back to
 * printing on the device.
 *
 * The page is rendered with JavaScript off and every network request blocked,
 * so the HTML (sent by an admin) can only ever produce a PDF of itself.
 */

export class PdfUnavailableError extends Error {}

const LINUX_PATHS = ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"];

let browser: Promise<Browser> | null = null;

async function launch(): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  const args = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"];
  const path = process.env.SIZZLE_CHROMIUM_PATH || LINUX_PATHS.find((p) => fs.existsSync(p));
  if (path) return chromium.launch({ executablePath: path, args });
  if (process.platform === "win32") {
    for (const channel of ["msedge", "chrome"]) {
      try {
        return await chromium.launch({ channel });
      } catch {
        // try the next one
      }
    }
  }
  throw new PdfUnavailableError("No Chromium on this server — set SIZZLE_CHROMIUM_PATH or install chromium");
}

function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = launch().then((b) => {
      b.on("disconnected", () => (browser = null));
      return b;
    });
    browser.catch(() => (browser = null));
  }
  return browser;
}

export async function htmlToPdf(html: string, landscape: boolean): Promise<Buffer> {
  const b = await getBrowser();
  const context = await b.newContext({ javaScriptEnabled: false });
  try {
    await context.route("**/*", (route) => (route.request().url().startsWith("data:") ? route.continue() : route.abort()));
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 20_000 });
    return await page.pdf({ format: "A4", landscape, printBackground: true, preferCSSPageSize: true });
  } finally {
    await context.close().catch(() => {});
  }
}

/** Can this server make PDFs? Launches the browser once and remembers the answer for 10 minutes. */
let status: { ok: boolean; detail: string; at: number } | null = null;
export async function pdfStatus(): Promise<{ ok: boolean; detail: string }> {
  if (status && Date.now() - status.at < 10 * 60_000) return status;
  try {
    const b = await getBrowser();
    status = { ok: true, detail: `Chromium ${b.version()}`, at: Date.now() };
  } catch (err) {
    status = { ok: false, detail: err instanceof Error ? err.message : String(err), at: Date.now() };
  }
  return status;
}
