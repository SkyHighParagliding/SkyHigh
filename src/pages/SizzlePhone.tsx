import { useEffect, useState } from "react";
import { Cloud, CloudOff, Loader2, QrCode } from "lucide-react";
import { EVENT_ID, useTill } from "@/components/sizzle/useTill";
import { SellScreen } from "@/components/sizzle/SellScreen";
import { kvGet, kvSet, setDeviceId } from "@/lib/sizzleStore";
import { useTillServiceWorker } from "@/components/sizzle/useTillServiceWorker";

/**
 * Sausage sizzle till on a volunteer's phone (TASK-041). No admin login: the
 * phone scans a QR on the iPad (Admin → Phones), which swaps a one-time code
 * for a till-only token (TASK-040, server/routes/sizzle.ts). Just the Sell
 * screen — prices, stock and the event come from the iPad via the server.
 */

interface Pass { token: string; name: string; event: string; expiresAt: string }
const PASS_KEY = "phonePass";

async function pairFromHash(): Promise<Pass | null> {
  const code = new URLSearchParams(location.hash.slice(1)).get("pair");
  if (!code) return null;
  history.replaceState(null, "", location.pathname); // the code is single-use; don't leave it in the address bar
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
  usePhoneHead();
  useTillServiceWorker("/sizzle/");

  useEffect(() => {
    pairFromHash()
      .then(async (fresh) => setPass(fresh ?? (await kvGet<Pass>(PASS_KEY)) ?? null))
      .catch(async (err) => {
        setError(err instanceof Error ? err.message : String(err));
        setPass((await kvGet<Pass>(PASS_KEY)) ?? null);
      });
  }, []);

  if (pass === undefined) return <Centre><Loader2 className="w-12 h-12 animate-spin text-amber-700" /></Centre>;
  if (!pass || pass.event !== EVENT_ID) {
    return (
      <Centre>
        <QrCode className="w-16 h-16 text-amber-700 mx-auto" />
        <h1 className="text-2xl font-bold mt-3">Sizzle phone till</h1>
        {error && <p className="mt-3 rounded-xl bg-red-100 text-red-800 p-3">{error}</p>}
        <p className="mt-3 text-lg">{pass ? "This phone was set up for a different event." : "This phone isn't set up yet."} On the iPad, open the till → <b>Admin</b> → <b>Phones</b>, add this phone, then scan the QR code with the phone's camera.</p>
      </Centre>
    );
  }
  return <PhoneTill pass={pass} onForget={async () => { await kvSet(PASS_KEY, null); setPass(null); }} />;
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
