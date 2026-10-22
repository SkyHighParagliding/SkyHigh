import { useEffect, useState } from "react";
import { Cloud, CloudOff, Loader2, QrCode, Share } from "lucide-react";
import { useTill } from "@/components/sizzle/useTill";
import { SellScreen } from "@/components/sizzle/SellScreen";
import { kvGet, kvSet, setDeviceId } from "@/lib/sizzleStore";
import { useTillServiceWorker } from "@/components/sizzle/useTillServiceWorker";
import { EventGate } from "@/components/sizzle/EventGate";
import { formatPairCode, normalizePairCode } from "../../shared/sizzle/pairCode.ts";

/**
 * Sausage sizzle till on a volunteer's phone (TASK-041). No admin login: the
 * phone scans a QR on the iPad (Admin → Phones), which swaps a one-time code
 * for a till-only token (TASK-040, server/routes/sizzle.ts). Just the Sell
 * screen — prices, stock and the event come from the iPad via the server.
 *
 * A home-screen icon has its own storage, separate from Safari, so the QR link
 * doesn't use the code in Safari straight away: it shows the code to type into
 * the icon, with "Use in Safari instead" for anyone who doesn't add one.
 */

interface Pass { token: string; name: string; event: string; expiresAt: string }
const PASS_KEY = "phonePass";

const standalone = () => matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

/** The code from the QR link, taken out of the address bar (it's single-use). */
function codeFromHash(): string | null {
  const code = normalizePairCode(new URLSearchParams(location.hash.slice(1)).get("pair") ?? "");
  if (location.hash) history.replaceState(null, "", location.pathname);
  return code;
}

async function pair(code: string): Promise<Pass> {
  const r = await fetch("/api/sizzle/pair", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error ?? "Pairing failed");
  await setDeviceId(body.deviceId);
  const pass: Pass = { token: body.token, name: body.name, event: body.event, expiresAt: body.expiresAt };
  await kvSet(PASS_KEY, pass);
  return pass;
}

function usePhoneHead() {
  useEffect(() => {
    document.title = "Sizzle Phone";
    let link = document.head.querySelector("link[rel='manifest']") as HTMLLinkElement | null;
    if (!link) {
      link = Object.assign(document.createElement("link"), { rel: "manifest" });
      document.head.appendChild(link);
    }
    link.href = "/sizzle-phone.webmanifest";
  }, []);
}

export function SizzlePhone() {
  const [pass, setPass] = useState<Pass | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [hashCode] = useState(codeFromHash);
  const [busy, setBusy] = useState(false);
  const [claimed, setClaimed] = useState(false);
  usePhoneHead();
  useTillServiceWorker("/sizzle/");

  useEffect(() => {
    kvGet<Pass>(PASS_KEY).then((p) => setPass(p ?? null));
  }, []);

  async function claim(code: string) {
    setBusy(true);
    setError(null);
    try {
      setPass(await pair(code));
      setClaimed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (pass === undefined) return <Centre><Loader2 className="w-12 h-12 animate-spin text-amber-700" /></Centre>;
  // Fresh QR link in Safari: offer the home-screen icon first (the code is typed in there).
  if (hashCode && !standalone() && !claimed) return <InstallFirst code={hashCode} busy={busy} error={error} onSafari={() => claim(hashCode)} />;
  if (!pass) return <NotSetUp error={error} busy={busy} initial={hashCode ?? ""} onCode={claim} />;
  // The server says which event this phone's pass is for; the till then sells for exactly that event.
  return (
    <EventGate token={pass.token}>
      {(eventId) => eventId === pass.event
        ? <PhoneTill key={eventId} pass={pass} onForget={async () => { await kvSet(PASS_KEY, null); setPass(null); }} />
        : <NotSetUp error={error} busy={busy} initial="" onCode={claim} otherEvent />}
    </EventGate>
  );
}

/** Safari, just opened from the QR: show the code to type into the home-screen icon. */
function InstallFirst({ code, busy, error, onSafari }: { code: string; busy: boolean; error: string | null; onSafari: () => void }) {
  return (
    <Centre>
      <h1 className="text-2xl font-bold">Sizzle phone till</h1>
      <p className="mt-2 text-lg">Your code (works once, for 10 minutes):</p>
      <p className="mt-2 text-5xl font-extrabold tracking-widest">{formatPairCode(code)}</p>
      <ol className="mt-4 text-left text-lg list-decimal pl-6 space-y-1">
        <li>Tap <Share className="inline w-5 h-5 -mt-1" /> <b>Share</b> → <b>Add to Home Screen</b> → <b>Add</b>.</li>
        <li>Open the new <b>Sizzle Phone</b> icon.</li>
        <li>Type this code and tap <b>Set up</b>.</li>
      </ol>
      {error && <p className="mt-3 rounded-xl bg-red-100 text-red-800 p-3">{error}</p>}
      <button type="button" disabled={busy} onClick={onSafari} className="mt-5 h-12 px-4 rounded-xl border-2 border-amber-700 text-amber-800 text-lg font-semibold">Use in Safari instead</button>
    </Centre>
  );
}

function NotSetUp({ error, busy, initial, onCode, otherEvent }: { error: string | null; busy: boolean; initial: string; onCode: (code: string) => void; otherEvent?: boolean }) {
  const [text, setText] = useState(initial);
  const code = normalizePairCode(text);
  return (
    <Centre>
      <QrCode className="w-16 h-16 text-amber-700 mx-auto" />
      <h1 className="text-2xl font-bold mt-3">Sizzle phone till</h1>
      <p className="mt-3 text-lg">{otherEvent ? "This phone was set up for a different event." : "This phone isn't set up yet."} On the iPad, open the till → <b>Admin</b> → <b>Phones</b> and add this phone. Type the code it shows (or scan its QR with the camera).</p>
      <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (code) onCode(code); }}>
        <input aria-label="Till code" placeholder="K7QM-3XRP" value={text} onChange={(e) => setText(e.target.value)} autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false} className="flex-1 min-w-0 h-14 rounded-xl border-2 border-stone-300 px-3 text-2xl font-bold tracking-widest text-center uppercase" />
        <button type="submit" disabled={!code || busy} className="h-14 px-4 rounded-xl bg-amber-700 text-white text-lg font-bold disabled:opacity-40">{busy ? "…" : "Set up"}</button>
      </form>
      {error && <p className="mt-3 rounded-xl bg-red-100 text-red-800 p-3">{error}</p>}
    </Centre>
  );
}

function PhoneTill({ pass, onForget }: { pass: Pass; onForget: () => void }) {
  const till = useTill({ token: pass.token, phone: true });
  if (!till.ready) return <Centre><Loader2 className="w-12 h-12 animate-spin text-amber-700" /></Centre>;
  if (till.sync.unauthorised) {
    return (
      <Centre>
        <h1 className="text-2xl font-bold">Till pass cancelled</h1>
        <p className="mt-3 text-lg">This phone's till pass has expired or been cancelled on the iPad. Sales already rung up here are kept. Add the phone again on the iPad (Admin → Phones) and scan the new QR code.</p>
        <button type="button" onClick={onForget} className="mt-5 h-14 px-6 rounded-2xl bg-amber-700 text-white text-xl font-bold">Set up again</button>
      </Centre>
    );
  }
  const pending = till.sales.filter((s) => !s.synced && s.deviceId === till.deviceId).length;
  const dayLabel = till.data.event.days.find((d) => d.n === till.day)?.label ?? "";
  return (
    <div className="fixed inset-0 flex flex-col bg-orange-50 text-stone-900 select-none" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      {/* One slim status line, not a menu: whose phone, which day, and whether sales are uploaded. */}
      <button type="button" onClick={() => till.runSync()} className={`flex items-center gap-2 px-3 h-8 text-sm ${pending ? "bg-amber-400 text-black" : "bg-[#7c2d12] text-white"}`}>
        <span className="font-semibold truncate">{pass.name}</span>
        <span className="opacity-80">· Day {till.day}{dayLabel ? ` ${dayLabel}` : ""}</span>
        <span className="flex-1" />
        {till.online ? <Cloud className="w-4 h-4" /> : <CloudOff className="w-4 h-4" />}
        {pending ? `${pending} to upload` : "Synced"}
      </button>
      <main className="flex-1 min-h-0">
        <SellScreen till={till} compact />
      </main>
    </div>
  );
}

function Centre({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 flex items-center justify-center bg-orange-50 p-6 text-center"><div className="max-w-sm">{children}</div></div>;
}
