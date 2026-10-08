import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Camera, ExternalLink, Loader2, Play, RefreshCw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/Switch";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/apiClient";
import type { FeedStatus } from "@/hooks/useWebcams";

interface AdminSource {
  id: number;
  siteId: string;
  label: string;
  baseUrl: string;
  timezone: string;
  enabled: boolean;
  pollStartHour: number;
  pollEndHour: number;
  expectFromMin: number;
  expectToMin: number;
  backfilledAt: string | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  frames: number;
  bytes: number;
  oldest: string | null;
  newest: string | null;
  status: FeedStatus;
  running: boolean;
}

interface AdminOverview {
  retentionDays: number;
  totals: { frames: number; bytes: number };
  sources: AdminSource[];
}

interface CleanupResult {
  dryRun: boolean;
  retentionDays: number;
  cutoff: string;
  expired: number;
  expiredBytes: number;
  deleted: number;
  capped: boolean;
}

const MIN_RETENTION = 7;
const FALLBACK_BYTES_PER_DAY = 136 * 1024 * 1024;
const DAY_MS = 86_400_000;

const STATUS_STYLE: Record<FeedStatus, { label: string; dot: string; text: string }> = {
  live: { label: "Live", dot: "bg-emerald-500", text: "text-emerald-700" },
  overnight: { label: "Overnight, nothing expected", dot: "bg-slate-400", text: "text-slate-600" },
  stale: { label: "Stale, no new images", dot: "bg-amber-500", text: "text-amber-700" },
  offline: { label: "Offline", dot: "bg-red-500", text: "text-red-700" },
};

function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(0)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function formatWhen(iso: string | null, tz: string): string {
  if (!iso) return "never";
  try {
    return new Intl.DateTimeFormat("en-AU", {
      timeZone: tz,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function minutesToHhmm(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function hhmmToMinutes(v: string, isEnd: boolean): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(v);
  if (!match) return null;
  const total = Number(match[1]) * 60 + Number(match[2]);
  return isEnd && total === 0 ? 1440 : total;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

export function AdminWebcams() {
  const { token } = useAuth();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<AdminOverview>("/api/webcams/admin/sources", token);
      setOverview(data);
      setLoadError(null);
    } catch (e) {
      setLoadError(errorText(e));
    }
  }, [token]);

  useEffect(() => { void refresh(); }, [refresh]);

  const anyRunning = overview?.sources.some(s => s.running) ?? false;
  useEffect(() => {
    if (!anyRunning) return;
    const t = setInterval(() => { void refresh(); }, 4000);
    return () => clearInterval(t);
  }, [anyRunning, refresh]);

  return (
    <div className="bg-background min-h-screen py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link to="/admin" className="text-accent hover:underline text-sm flex items-center gap-1 mb-4">
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </Link>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-3xl font-extrabold text-ink flex items-center gap-2">
                <Camera className="w-8 h-8" /> Cameras
              </h1>
              <p className="text-foreground-secondary mt-1">
                Archive of the club's webcam images. New images are fetched every few minutes during the day.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => void refresh()}>
                <RefreshCw className="w-4 h-4 mr-2" /> Refresh
              </Button>
              <Link to="/cameras">
                <Button variant="outline">
                  <ExternalLink className="w-4 h-4 mr-2" /> View public page
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {loadError && (
          <Card className="border-t-4 border-t-red-500 mb-6">
            <CardContent className="pt-6 text-sm text-red-700">Could not load the camera sources: {loadError}</CardContent>
          </Card>
        )}

        {!overview && !loadError && (
          <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
        )}

        {overview && (
          <div className="space-y-6">
            {overview.sources.map(source => (
              <SourceCard key={source.id} source={source} token={token} onChanged={refresh} />
            ))}
            {overview.sources.length === 0 && (
              <Card><CardContent className="pt-6 text-sm text-muted-foreground">No camera sources are configured.</CardContent></Card>
            )}
            <StorageCard overview={overview} token={token} onChanged={refresh} />
          </div>
        )}
      </div>
    </div>
  );
}

function SourceCard({ source, token, onChanged }: { source: AdminSource; token: string | null; onChanged: () => Promise<void> }) {
  const [form, setForm] = useState(() => toForm(source));
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => { setForm(toForm(source)); }, [source.id, source.label, source.baseUrl, source.timezone, source.enabled, source.pollStartHour, source.pollEndHour, source.expectFromMin, source.expectToMin]);

  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(source));
  const style = STATUS_STYLE[source.status] ?? STATUS_STYLE.offline;

  const save = async () => {
    const from = hhmmToMinutes(form.expectFrom, false);
    const to = hhmmToMinutes(form.expectTo, true);
    if (from === null || to === null) { toast.error("Enter the expected capture times as hours and minutes"); return; }
    setSaving(true);
    try {
      await api.put(`/api/webcams/admin/sources/${source.id}`, {
        label: form.label,
        baseUrl: form.baseUrl,
        timezone: form.timezone,
        enabled: form.enabled,
        pollStartHour: form.pollStartHour,
        pollEndHour: form.pollEndHour,
        expectFromMin: from,
        expectToMin: to,
      }, token);
      toast.success("Camera settings saved");
      await onChanged();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setStarting(true);
    try {
      await api.post(`/api/webcams/admin/sources/${source.id}/run`, {}, token);
      toast.success("Fetch started. The first run also backfills the operator's last 8 days, which takes a while.");
      setTimeout(() => { void onChanged(); }, 1200);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setStarting(false);
    }
  };

  return (
    <Card className="border-t-4 border-t-accent">
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-ink">{source.label}</CardTitle>
          <span className={`inline-flex items-center gap-2 text-sm font-medium ${style.text}`}>
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${style.dot}`} />
            {style.label}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">Site: {source.siteId}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <Fact label="Newest image" value={formatWhen(source.newest, source.timezone)} />
          <Fact label="Oldest image" value={formatWhen(source.oldest, source.timezone)} />
          <Fact label="Images stored" value={source.frames.toLocaleString()} />
          <Fact label="Space used" value={formatBytes(source.bytes)} />
          <Fact label="Last fetch started" value={formatWhen(source.lastRunAt, source.timezone)} />
          <Fact label="Last fetch that stored something or found nothing new" value={formatWhen(source.lastSuccessAt, source.timezone)} />
          <Fact label="Backfill" value={source.backfilledAt ? `done ${formatWhen(source.backfilledAt, source.timezone)}` : "not yet run"} />
        </dl>

        {source.lastError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <p className="font-medium">Last error</p>
            <p className="mt-1 break-words">{source.lastError}</p>
            <p className="mt-2 text-xs text-red-700">
              If this says the host could not be reached right after a deploy, the server cannot see the operator's camera site. Tell the developer.
            </p>
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={() => void runNow()} disabled={starting || source.running || !source.enabled} className="bg-ink hover:bg-ink/90 text-white">
            {starting || source.running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
            {source.running ? "Fetching…" : "Run now"}
          </Button>
          {!source.enabled && <span className="text-xs text-muted-foreground">Switch the source on below to fetch images.</span>}
        </div>

        <hr className="border-border" />

        <div className="space-y-4">
          <Switch
            checked={form.enabled}
            onChange={v => setForm(f => ({ ...f, enabled: v }))}
            label="Fetch images for this source"
            description="Turning this off stops new images; the existing archive stays online."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Name">
              <Input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} maxLength={80} />
            </Field>
            <Field label="Time zone of the camera">
              <Input value={form.timezone} onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))} />
            </Field>
          </div>
          <Field label="Feed address">
            <Input value={form.baseUrl} onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))} />
          </Field>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Field label="Check feed from (hour)">
              <Input type="number" min={0} max={23} value={form.pollStartHour} onChange={e => setForm(f => ({ ...f, pollStartHour: Number(e.target.value) }))} />
            </Field>
            <Field label="Check feed until (hour)">
              <Input type="number" min={1} max={24} value={form.pollEndHour} onChange={e => setForm(f => ({ ...f, pollEndHour: Number(e.target.value) }))} />
            </Field>
            <Field label="Images expected from">
              <Input type="time" value={form.expectFrom} onChange={e => setForm(f => ({ ...f, expectFrom: e.target.value }))} />
            </Field>
            <Field label="Images expected until">
              <Input type="time" value={form.expectTo} onChange={e => setForm(f => ({ ...f, expectTo: e.target.value }))} />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            Times are in the camera's time zone. Outside the expected window the page shows "Overnight" instead of warning that the camera is stale.
          </p>
          <Button onClick={() => void save()} disabled={saving || !dirty} className="bg-ink hover:bg-ink/90 text-white">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save source settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function toForm(s: AdminSource) {
  return {
    label: s.label,
    baseUrl: s.baseUrl,
    timezone: s.timezone,
    enabled: s.enabled,
    pollStartHour: s.pollStartHour,
    pollEndHour: s.pollEndHour,
    expectFrom: minutesToHhmm(s.expectFromMin),
    expectTo: minutesToHhmm(s.expectToMin),
  };
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-foreground-label">{label}</span>
      {children}
    </label>
  );
}

function StorageCard({ overview, token, onChanged }: { overview: AdminOverview; token: string | null; onChanged: () => Promise<void> }) {
  const [days, setDays] = useState(String(overview.retentionDays));
  const [savingDays, setSavingDays] = useState(false);
  const [busy, setBusy] = useState<"preview" | "delete" | null>(null);
  const [result, setResult] = useState<CleanupResult | null>(null);

  useEffect(() => { setDays(String(overview.retentionDays)); }, [overview.retentionDays]);

  const parsed = Number(days);
  const valid = Number.isInteger(parsed) && parsed >= MIN_RETENTION && parsed <= 3650;
  const dirty = valid && parsed !== overview.retentionDays;

  const bytesPerDay = useMemo(() => {
    const spans = overview.sources
      .filter(s => s.oldest && s.newest)
      .map(s => ({ bytes: s.bytes, ms: new Date(s.newest as string).getTime() - new Date(s.oldest as string).getTime() }));
    const bytes = spans.reduce((a, s) => a + s.bytes, 0);
    const ms = spans.reduce((a, s) => Math.max(a, s.ms), 0);
    return ms >= 2 * DAY_MS ? bytes / (ms / DAY_MS) : FALLBACK_BYTES_PER_DAY;
  }, [overview.sources]);

  const saveDays = async () => {
    if (!valid) { toast.error(`Keep images for ${MIN_RETENTION} to 3650 days`); return; }
    setSavingDays(true);
    try {
      await api.put("/api/settings", { webcamRetentionDays: String(parsed) }, token);
      toast.success("Retention saved. It applies at the next nightly cleanup.");
      setResult(null);
      await onChanged();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setSavingDays(false);
    }
  };

  const runCleanup = async (dryRun: boolean) => {
    setBusy(dryRun ? "preview" : "delete");
    try {
      const r = await api.post<CleanupResult>("/api/webcams/admin/cleanup", { dryRun }, token);
      setResult(r);
      if (!dryRun) {
        toast.success(`Deleted ${r.deleted.toLocaleString()} images`);
        await onChanged();
      }
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="border-t-4 border-t-teal-500">
      <CardHeader>
        <CardTitle className="text-ink">Storage and retention</CardTitle>
        <p className="text-sm text-muted-foreground">
          Every image, in all its sizes, is kept for the number of days below and then deleted by a nightly cleanup at 3:30 am Melbourne time.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
          <Fact label="Images stored" value={overview.totals.frames.toLocaleString()} />
          <Fact label="Space used" value={formatBytes(overview.totals.bytes)} />
          <Fact label={`Expected at ${valid ? parsed : overview.retentionDays} days`} value={`about ${formatBytes(bytesPerDay * (valid ? parsed : overview.retentionDays))}`} />
        </dl>

        <div className="flex items-end gap-3 flex-wrap">
          <Field label="Keep images for (days)">
            <Input type="number" min={MIN_RETENTION} max={3650} value={days} onChange={e => setDays(e.target.value)} className="w-32" />
          </Field>
          <Button onClick={() => void saveDays()} disabled={savingDays || !dirty} className="bg-ink hover:bg-ink/90 text-white">
            {savingDays ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          The minimum is {MIN_RETENTION} days. A warning email goes to the admins if the archive passes 25 GB, which would mean the cleanup has stopped working.
        </p>

        <hr className="border-border" />

        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="outline" onClick={() => void runCleanup(true)} disabled={busy !== null}>
              {busy === "preview" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Preview cleanup
            </Button>
            {result?.dryRun && result.expired > 0 && (
              <Button onClick={() => void runCleanup(false)} disabled={busy !== null} className="bg-red-600 hover:bg-red-700 text-white">
                {busy === "delete" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                Delete {Math.min(result.expired, 3000).toLocaleString()} expired images now
              </Button>
            )}
          </div>
          {result && (
            <p className="text-sm text-ink">
              {result.dryRun
                ? result.expired === 0
                  ? `Nothing is older than ${result.retentionDays} days.`
                  : `${result.expired.toLocaleString()} images (${formatBytes(result.expiredBytes)}) are older than ${result.retentionDays} days and would be deleted.${result.capped ? " One run removes at most 3,000, so run it again afterwards." : ""}`
                : `Deleted ${result.deleted.toLocaleString()} images.${result.capped ? " More remain; run it again." : ""}`}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
