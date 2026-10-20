import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/apiClient";
import { kvGet, kvSet } from "@/lib/sizzleStore";
import { EVENT_ID, applyEvent, type ServerEvent } from "./useTill";

const CACHE_KEY = "event:current";
const CHECK_MS = 60_000;

const fetchEvent = (token: string | null | undefined) => api.get<{ event: ServerEvent | null }>("/api/sizzle/event", token).then((r) => r.event);

/**
 * Loads which event the till is selling for (the server's active event, or the
 * phone's own event) before anything mounts, so every record gets the right
 * event id (TASK-039). The last answer is kept on the device, so the till
 * still starts with no signal. If an admin starts a new event elsewhere, this
 * reloads within a minute so every device moves over together.
 */
export function EventGate({ token, children }: { token: string | null | undefined; children: (eventId: string) => React.ReactNode }) {
  const [eventId, setEventId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      let ev = (await kvGet<ServerEvent | null>(CACHE_KEY)) ?? null;
      try {
        ev = await fetchEvent(token);
        await kvSet(CACHE_KEY, ev);
      } catch {
        // offline or signed out: keep the cached event
      }
      if (!live) return;
      applyEvent(ev);
      setEventId(EVENT_ID);
    })();
    return () => {
      live = false;
    };
  }, [token]);

  useEffect(() => {
    if (!eventId) return;
    const t = window.setInterval(async () => {
      try {
        const ev = await fetchEvent(token);
        const id = ev?.id ?? null;
        const cached = (await kvGet<ServerEvent | null>(CACHE_KEY))?.id ?? null;
        if (id !== cached) {
          await kvSet(CACHE_KEY, ev);
          location.reload();
        }
      } catch {
        // try again next minute
      }
    }, CHECK_MS);
    return () => window.clearInterval(t);
  }, [eventId, token]);

  if (!eventId) return <div className="fixed inset-0 flex items-center justify-center bg-orange-50"><Loader2 className="w-12 h-12 animate-spin text-amber-700" /></div>;
  return <>{children(eventId)}</>;
}
