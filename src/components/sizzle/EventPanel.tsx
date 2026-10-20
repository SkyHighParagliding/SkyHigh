import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarPlus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/apiClient";
import { Modal } from "./SellScreen";
import { FILE_EVENT_ID, FILE_EVENT_TITLE, type Till } from "./useTill";

/** "Sat 31 Oct" for a YYYY-MM-DD date, plus that date + n days. */
const dayLabel = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }).replace(",", "");
const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
};

/**
 * Admin → Event (TASK-039): which event the till is selling for, and starting
 * the next one. A new event becomes active on every device (each reloads
 * within a minute); earlier events and their records are kept.
 */
export function EventPanel({ till }: { till: Till }) {
  const { token } = useAuth();
  const { event } = till.data;
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [first, setFirst] = useState("");
  const [count, setCount] = useState(2);
  const [customers, setCustomers] = useState<string[]>(Array(14).fill("75"));
  const [busy, setBusy] = useState(false);

  // Earlier events, plus the JSON file's own event (id null), so a mistaken "new event" can be undone.
  const [list, setList] = useState<{ id: string | null; title: string }[]>([]);
  useEffect(() => {
    api.get<{ events: { id: string; title: string }[] }>("/api/sizzle/events", token)
      .then((r) => setList([...r.events.map((e) => ({ id: e.id as string | null, title: e.title })), { id: null, title: FILE_EVENT_TITLE }]))
      .catch(() => setList([]));
  }, [token]);
  const others = list.filter((o) => (o.id ?? FILE_EVENT_ID) !== event.id);

  async function switchTo(o: { id: string | null; title: string }) {
    if (!window.confirm(`Switch every device to ${o.title}? Nothing is deleted — you can switch back.`)) return;
    setBusy(true);
    try {
      await api.post("/api/sizzle/events/activate", { id: o.id }, token);
      toast.success(`Switched to ${o.title} — reloading`);
      setTimeout(() => location.reload(), 800);
    } catch (err) {
      toast.error(`Couldn't switch — ${err instanceof Error ? err.message : err}. Needs signal.`);
      setBusy(false);
    }
  }

  const days = first ? Array.from({ length: count }, (_, i) => ({ n: i + 1, date: addDays(first, i), label: dayLabel(addDays(first, i)) })) : [];

  async function create() {
    if (!title.trim() || !first) return toast.error("Give the event a name and a first day");
    setBusy(true);
    try {
      await api.post("/api/sizzle/events", { eventTitle: title.trim(), days, customersPerDay: days.map((_, i) => Math.max(0, Math.round(Number(customers[i]) || 0))) }, token);
      toast.success(`${title.trim()} started — reloading`);
      setTimeout(() => location.reload(), 800);
    } catch (err) {
      toast.error(`Couldn't start the event — ${err instanceof Error ? err.message : err}. Needs signal.`);
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white shadow p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-2xl font-bold flex-1 flex items-center gap-2"><CalendarPlus className="w-7 h-7" /> Event: {event.title}</h3>
        <button type="button" onClick={() => setOpen(true)} className="h-12 px-4 rounded-xl border-2 border-amber-700 text-amber-800 text-lg font-semibold">Start a new event…</button>
      </div>
      <p className="text-stone-600 mt-1">{event.days.map((d) => `Day ${d.n} ${d.label}`).join(" · ")}</p>
      {others.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-lg">
          <span className="text-stone-600">Other events:</span>
          {others.map((o) => (
            <button key={o.id ?? "file"} type="button" disabled={busy} onClick={() => switchTo(o)} className="h-11 px-3 rounded-lg border-2 border-stone-400 font-semibold">Switch to {o.title}</button>
          ))}
        </div>
      )}

      {open && (
        <Modal onClose={() => setOpen(false)}>
          <h2 className="text-3xl font-bold mb-2">Start a new event</h2>
          <p className="text-lg text-stone-600 mb-4">Every device switches to the new event (within a minute). <b>{event.title}</b> and all its sales and money records are kept on the website. Products and Woolworths prices stay as they are — ask for a price check before a new event. Phones need a new QR code.</p>
          <label className="block text-lg mb-3">Event name
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 2027 NTVO" className="mt-1 w-full h-12 rounded-lg border-2 border-stone-300 px-3 text-xl" />
          </label>
          <div className="grid grid-cols-2 gap-4 mb-3">
            <label className="block text-lg">First day
              <input type="date" value={first} onChange={(e) => setFirst(e.target.value)} className="mt-1 w-full h-12 rounded-lg border-2 border-stone-300 px-3 text-xl" />
            </label>
            <label className="block text-lg">Number of days
              <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="mt-1 w-full h-12 rounded-lg border-2 border-stone-300 px-3 text-xl">
                {Array.from({ length: 7 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
          {days.length > 0 && (
            <div className="mb-4">
              <p className="text-lg mb-1">Customers expected each day (change later in Customers per day):</p>
              {days.map((d, i) => (
                <label key={d.n} className="flex items-center gap-3 py-1 border-b text-lg">
                  <span className="flex-1">Day {d.n} · {d.label}</span>
                  <input inputMode="numeric" aria-label={`Customers Day ${d.n}`} value={customers[i]} onChange={(e) => setCustomers((c) => c.map((v, j) => (j === i ? e.target.value.replace(/\D/g, "") : v)))} className="w-28 h-12 rounded-lg border-2 border-stone-300 px-2 text-xl text-right" />
                </label>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <button type="button" onClick={() => setOpen(false)} className="h-16 rounded-2xl bg-stone-200 text-xl font-bold">Cancel</button>
            <button type="button" disabled={busy || !title.trim() || !first} onClick={create} className="h-16 rounded-2xl bg-amber-700 text-white text-xl font-bold disabled:opacity-40">Start {title.trim() || "event"}</button>
          </div>
        </Modal>
      )}
    </section>
  );
}
