/**
 * Show one of the shared A4 templates (shared/sizzle/templates.ts) full-screen
 * over the till and print it. On the iPad the print sheet's Share button saves
 * it as a PDF (Files, AirDrop, Mail) — the same layout as the printed lists.
 *
 * Rendered into the current document rather than a popup: popups from a
 * home-screen web app open in a separate browser and lose the content.
 */

const OVERLAY_ID = "sizzle-print";

export function openPrintView(html: string, title: string): void {
  closePrintView();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const css = [...doc.querySelectorAll("style")].map((s) => s.textContent ?? "").join("\n");

  const style = document.createElement("style");
  style.id = `${OVERLAY_ID}-style`;
  // The template CSS is written for its own document; while the overlay is up
  // the app behind it is hidden, so its generic selectors can't disturb it.
  style.textContent = `${css}
#${OVERLAY_ID}{position:fixed;inset:0;z-index:2147483000;background:#fff;overflow:auto;-webkit-overflow-scrolling:touch}
#${OVERLAY_ID} .sz-bar{position:sticky;top:0;z-index:2;display:flex;gap:12px;align-items:center;padding:12px 16px;background:#7c2d12;color:#fff;font:600 17px system-ui}
#${OVERLAY_ID} .sz-bar button{font:700 18px system-ui;padding:12px 22px;border-radius:12px;border:0;background:#fff;color:#7c2d12}
#${OVERLAY_ID} .sz-bar .sz-close{background:transparent;color:#fff;border:2px solid #fff}
#${OVERLAY_ID} .sz-page{padding:16px;max-width:1100px;margin:0 auto}
@media print{
  #root,[data-sonner-toaster]{display:none!important}
  #${OVERLAY_ID}{position:static;overflow:visible}
  #${OVERLAY_ID} .sz-bar{display:none}
  #${OVERLAY_ID} .sz-page{padding:0;max-width:none}
}`;

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.innerHTML = `<div class="sz-bar"><button type="button" class="sz-print">Print / Save as PDF</button><span style="flex:1">${title.replace(/[<>&]/g, "")}</span><button type="button" class="sz-close">Close</button></div><div class="sz-page">${doc.body.querySelector(".page")?.innerHTML ?? doc.body.innerHTML}</div>`;
  overlay.querySelector(".sz-print")?.addEventListener("click", () => window.print());
  overlay.querySelector(".sz-close")?.addEventListener("click", closePrintView);

  const prevTitle = document.title;
  document.title = title; // becomes the PDF file name in the share sheet
  overlay.dataset.prevTitle = prevTitle;
  document.head.appendChild(style);
  document.body.appendChild(overlay);
}

export function closePrintView(): void {
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay?.dataset.prevTitle) document.title = overlay.dataset.prevTitle;
  overlay?.remove();
  document.getElementById(`${OVERLAY_ID}-style`)?.remove();
}
