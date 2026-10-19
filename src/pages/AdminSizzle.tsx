import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Cloud, CloudOff, Loader2 } from "lucide-react";
import { useTill } from "@/components/sizzle/useTill";
import { SellScreen } from "@/components/sizzle/SellScreen";
import { EndOfDayScreen } from "@/components/sizzle/EndOfDayScreen";
import { AdminScreen } from "@/components/sizzle/AdminScreen";
import { DataScreen } from "@/components/sizzle/DataScreen";

/**
 * Sausage sizzle till — iPad, landscape. Admin login required (AdminRoute);
 * full-screen, outside the site Layout, noindex and not in any nav.
 * See wiki/03-decisions-log.md DECISION-019.
 */

type Tab = "sell" | "eod" | "admin" | "data";
const TABS: { id: Tab; label: string }[] = [
  { id: "sell", label: "Sell" },
  { id: "eod", label: "End of day" },
  { id: "admin", label: "Admin" },
  { id: "data", label: "Data" },
];

/** Point the page's head at the till's own manifest/icon while it's open; restore on leave. */
function useTillHead() {
  useEffect(() => {
    const restore: (() => void)[] = [];
    const set = (selector: string, create: () => HTMLElement, attr: string, value: string) => {
      let el = document.head.querySelector(selector) as HTMLElement | null;
      if (!el) {
        el = create();
        document.head.appendChild(el);
        const added = el;
        restore.push(() => added.remove());
      } else {
        const prev = el.getAttribute(attr);
        const existing = el;
        restore.push(() => (prev === null ? existing.removeAttribute(attr) : existing.setAttribute(attr, prev)));
      }
      el.setAttribute(attr, value);
    };
    const link = (rel: string) => () => Object.assign(document.createElement("link"), { rel });
    const meta = (name: string) => () => Object.assign(document.createElement("meta"), { name });
    set("link[rel='manifest']", link("manifest"), "href", "/sizzle.webmanifest");
    set("link[rel='apple-touch-icon']", link("apple-touch-icon"), "href", "/images/sizzle-icon-180.png");
    set("meta[name='robots']", meta("robots"), "content", "noindex, nofollow");
    set("meta[name='apple-mobile-web-app-capable']", meta("apple-mobile-web-app-capable"), "content", "yes");
    set("meta[name='mobile-web-app-capable']", meta("mobile-web-app-capable"), "content", "yes");
    set("meta[name='apple-mobile-web-app-title']", meta("apple-mobile-web-app-title"), "content", "Sizzle Till");
    set("meta[name='theme-color']", meta("theme-color"), "content", "#7c2d12");
    const prevTitle = document.title;
    document.title = "Sizzle Till";
    restore.push(() => (document.title = prevTitle));
    return () => restore.reverse().forEach((f) => f());
  }, []);
}

/** Offline shell: register the till's scoped worker and hand it what this page already loaded. */
function useTillServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sizzle-sw.js", { scope: "/admin/sizzle" })
      .then(async (reg) => {
        await navigator.serviceWorker.ready;
        const urls = performance
          .getEntriesByType("resource")
          .map((e) => new URL(e.name))
          .filter((u) => u.origin === location.origin && u.pathname.startsWith("/assets/"))
          .map((u) => u.pathname);
        (reg.active ?? reg.waiting ?? reg.installing)?.postMessage({ type: "precache", urls });
      })
      .catch((err) => console.warn("[sizzle] service worker registration failed", err));
  }, []);
}

export function AdminSizzle() {
  const till = useTill();
  const [tab, setTab] = useState<Tab>("sell");
  useTillHead();
  useTillServiceWorker();

  if (!till.ready) {
    return <div className="fixed inset-0 flex items-center justify-center bg-orange-50"><Loader2 className="w-12 h-12 animate-spin text-amber-700" /></div>;
  }

  const pending = till.sales.filter((s) => !s.synced).length;
  const { data, day } = till;

  return (
    <div className="fixed inset-0 flex flex-col bg-orange-50 text-stone-900 select-none" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <header className="flex items-center gap-3 px-3 py-2 bg-[#7c2d12] text-white">
        <Link to="/admin" aria-label="Back to admin" className="w-11 h-11 rounded-lg flex items-center justify-center active:bg-white/10"><ArrowLeft className="w-6 h-6" /></Link>
        <span className="text-xl font-bold mr-2 whitespace-nowrap">Sizzle Till</span>
        <nav className="flex gap-1">
          {TABS.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`h-12 px-4 rounded-xl text-lg font-semibold ${tab === t.id ? "bg-white text-[#7c2d12]" : "active:bg-white/10"}`}>{t.label}</button>
          ))}
        </nav>
        <div className="flex-1" />
        <div className="flex gap-1" role="group" aria-label="Trading day">
          {data.event.days.map((d) => (
            <button key={d.n} type="button" onClick={() => till.setDay(d.n)} title={d.label} className={`h-12 min-w-12 px-3 rounded-xl text-lg font-bold ${day === d.n ? "bg-amber-300 text-black" : "bg-white/10"}`}>D{d.n}</button>
          ))}
        </div>
        <button type="button" onClick={() => till.runSync()} className={`h-12 px-3 rounded-xl flex items-center gap-2 text-base ${pending ? "bg-amber-500 text-black" : "bg-white/10"}`} title={till.sync.error ?? "Backed up to the club website"}>
          {till.online ? <Cloud className="w-5 h-5" /> : <CloudOff className="w-5 h-5" />}
          {pending ? `${pending} to upload` : "Backed up"}
        </button>
      </header>
      <main className="flex-1 min-h-0">
        {tab === "sell" && <SellScreen till={till} />}
        {tab === "eod" && <EndOfDayScreen till={till} />}
        {tab === "admin" && <AdminScreen till={till} />}
        {tab === "data" && <DataScreen till={till} />}
      </main>
    </div>
  );
}
