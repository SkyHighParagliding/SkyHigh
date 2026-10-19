/**
 * Sausage sizzle PDFs — regenerate after any price or quantity change.
 *
 *   npm run sizzle:pdfs            → output/sizzle/*.pdf
 *   npm run sizzle:pdfs -- --html  → also write the .html next to each PDF
 *
 * Reads data/sizzle/sizzle-2026.json, renders shared/sizzle/templates.ts and
 * prints each page with the locally installed Microsoft Edge (or Chrome) via
 * playwright-core, so no browser download is needed.
 */

import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser } from "playwright-core";
import { shoppingPlan, type SizzleData } from "../../shared/sizzle/calc.ts";
import { allDocs, esc } from "../../shared/sizzle/templates.ts";

const root = process.cwd();
const data = JSON.parse(fs.readFileSync(path.join(root, "data/sizzle/sizzle-2026.json"), "utf8")) as SizzleData;
const outDir = path.join(root, "output/sizzle");
const writeHtml = process.argv.includes("--html");

async function launch(): Promise<Browser> {
  for (const channel of ["msedge", "chrome"]) {
    try {
      return await chromium.launch({ channel });
    } catch {
      // try the next installed browser
    }
  }
  throw new Error("No Edge or Chrome install found for playwright-core.");
}

const footer = `<div style="width:100%;font-size:9px;font-family:Segoe UI,Arial,sans-serif;color:#555;padding:0 11mm;display:flex;justify-content:space-between">
<span>${esc(data.event.name)}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const plan = shoppingPlan(data);
  const docs = allDocs(data, plan);
  const browser = await launch();
  try {
    const page = await browser.newPage();
    for (const doc of docs) {
      await page.setContent(doc.html, { waitUntil: "load" });
      const file = path.join(outDir, doc.file);
      await page.pdf({
        path: file,
        format: "A4",
        landscape: doc.orientation === "landscape",
        preferCSSPageSize: true,
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: "<div></div>",
        footerTemplate: footer,
        margin: { top: "12mm", bottom: "14mm", left: "11mm", right: "11mm" },
      });
      if (writeHtml) fs.writeFileSync(file.replace(/\.pdf$/, ".html"), doc.html);
      console.log(file);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
