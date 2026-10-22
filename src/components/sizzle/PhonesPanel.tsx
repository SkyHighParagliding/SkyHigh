import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { KeyRound, Smartphone, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/apiClient";
import { Modal } from "./SellScreen";
import { EVENT_ID, type Till } from "./useTill";
import { formatPairCode } from "../../../shared/sizzle/pairCode.ts";

interface Device { id: string; name: string; pairedAt: string | null; pairExpiresAt: string | null; expiresAt: string; revokedAt: string | null; lastSeenAt: string | null }

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

/**
 * Admin → Phones (TASK-040): add a volunteer's phone by QR, see when each phone
 * last synced, and cancel a phone's till pass. Needs signal (talks to the server).
 */
export function PhonesPanel({ till }: { till: Till }) {
  const { token } = useAuth();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [name, setName] = useState("");
  const [qr, setQr] = useState<{ url: string; code: string; name: string; until: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ devices: Device[] }>(`/api/sizzle/devices?event=${EVENT_ID}`, token);
      setDevices(r.devices);
    } catch {
      setDevices(null);
    }
  }, [token]);
  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    const n = name.trim() || `Phone ${(devices?.length ?? 0) + 1}`;
    const lastDay = till.data.event.days.at(-1)!.date;
    try {
      const r = await api.post<{ code: string; pairExpiresAt: string }>("/api/sizzle/devices", { event: EVENT_ID, name: n, until: `${lastDay}T23:59:00+11:00` }, token);
      setQr({ url: `${location.origin}/sizzle/phone?pair=${r.code}`, code: r.code, name: n, until: r.pairExpiresAt });
      setName("");
      load();
    } catch (err) {
      toast.error(`Couldn't add the phone — ${err instanceof Error ? err.message : err}. Needs signal.`);
    }
  }

  // Redo a phone without cancelling it: fresh QR + code; any pass it had stops working.
  async function newCode(d: Device) {
    try {
      const r = await api.post<{ code: string; pairExpiresAt: string }>(`/api/sizzle/devices/${d.id}/code`, {}, token);
      setQr({ url: `${location.origin}/sizzle/phone?pair=${r.code}`, code: r.code, name: d.name, until: r.pairExpiresAt });
      load();
    } catch (err) {
      toast.error(`Couldn't make a new code — ${err instanceof Error ? err.message : err}. Needs signal.`);
    }
  }

  async function cancel(d: Device) {
    try {
      await api.delete(`/api/sizzle/devices/${d.id}`, token);
      toast.success(`${d.name} can no longer use the till`);
      load();
    } catch (err) {
      toast.error(`Couldn't cancel — ${err instanceof Error ? err.message : err}`);
    }
  }

  const live = (devices ?? []).filter((d) => !d.revokedAt && Date.parse(d.expiresAt) > Date.now());
  const codeLive = (d: Device) => !!d.pairExpiresAt && Date.parse(d.pairExpiresAt) > Date.now();

  return (
    <section className="rounded-2xl bg-white shadow p-4">
      <h3 className="text-2xl font-bold flex items-center gap-2"><Smartphone className="w-7 h-7" /> Phones</h3>
      <p className="text-stone-500 mb-3">Let a volunteer's phone sell too. Type a name, tap <b>Add phone</b>, and scan the QR code with that phone's camera. The phone gets a till-only pass for this event — no website password. Sales from every phone count in End of day, Money and stock.</p>
      <div className="flex gap-2 mb-3">
        <input aria-label="Phone name" placeholder="e.g. Sam's phone" value={name} onChange={(e) => setName(e.target.value)} className="flex-1 h-12 rounded-lg border-2 border-stone-300 px-3 text-lg" />
        <button type="button" onClick={add} className="h-12 px-4 rounded-xl bg-amber-700 text-white text-lg font-semibold">Add phone</button>
      </div>
      {devices === null ? <p className="text-stone-500">Phone list needs signal.</p> : live.length === 0 ? <p className="text-stone-500">No phones yet.</p> : (
        <table className="w-full text-lg">
          <tbody>
            {live.map((d) => (
              <tr key={d.id} className="border-t">
                <td className="py-2">{d.name}</td>
                <td className="text-stone-600">{d.pairedAt ? (d.lastSeenAt ? `last synced ${ago(d.lastSeenAt)}` : "set up") : codeLive(d) ? "waiting to be set up" : "code expired — tap New code"}</td>
                <td className="text-right whitespace-nowrap"><button type="button" onClick={() => newCode(d)} className="h-11 px-3 rounded-lg border-2 border-amber-700 text-amber-800 font-semibold inline-flex items-center gap-1 mr-2"><KeyRound className="w-5 h-5" /> New code</button><button type="button" onClick={() => cancel(d)} className="h-11 px-3 rounded-lg border-2 border-red-600 text-red-700 font-semibold inline-flex items-center gap-1"><Trash2 className="w-5 h-5" /> Cancel</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {qr && (
        <Modal onClose={() => setQr(null)}>
          <div className="text-center">
            <h2 className="text-3xl font-bold">Scan with {qr.name}</h2>
            <p className="text-lg text-stone-600 mt-1">Open the phone's camera and point it at the code, then tap the link. The phone shows what to do next. Works once, for 10 minutes.</p>
            <div className="inline-block bg-white p-4 mt-4 rounded-2xl border"><QRCodeSVG value={qr.url} size={320} /></div>
            <p className="text-lg text-stone-600 mt-3">Or type this code into the phone's <b>Sizzle Phone</b> icon:</p>
            <p className="text-4xl font-extrabold tracking-widest mt-1">{formatPairCode(qr.code)}</p>
          </div>
        </Modal>
      )}
    </section>
  );
}
