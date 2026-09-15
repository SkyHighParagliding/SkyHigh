import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Map, Sliders, Monitor } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useSettings } from "@/contexts/SettingsContext";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────────────────────────

interface ThresholdField {
  key: string;
  label: string;
  description: string;
  defaultVal: number;
  unit: string;
  min: number;
  max: number;
  step: number;
}

// ── Config ───────────────────────────────────────────────────────────────────

// These defaults mirror DEFAULT_THERMAL_TUNING in
// src/components/windmap/thermalRenderer.ts. An unset setting makes the renderer
// fall back to the same value, so leaving a field at its default is a no-op.
const THRESHOLD_FIELDS: ThresholdField[] = [
  { key: "thermalClearSkyCloudPct", label: "Clear-sky cloud limit",         description: "Low-cloud % below which the sky reads as clear: full cumulus glyph density and no grey sheet. Maps to CU_CLOUD_MIN_PCT.",            defaultVal: 12,  unit: "%",    min: 0,   max: 40,   step: 1 },
  { key: "thermalOvercastOnsetPct", label: "Overcast onset",                description: "Cloud % at which the grey overcast sheet begins to appear (cumulus glyphs fade out). Maps to OVERCAST_MIN_PCT.",                     defaultVal: 70,  unit: "%",    min: 40,  max: 90,   step: 1 },
  { key: "thermalOvercastFullPct",  label: "Full overcast",                 description: "Cloud % at which the grey sheet reaches full strength. The ramp runs from onset to here. Maps to OVERCAST_FULL_PCT.",              defaultVal: 95,  unit: "%",    min: 70,  max: 100,  step: 1 },
  { key: "thermalMinWstar",         label: "Minimum thermal strength shown", description: "W* (updraft velocity, m/s) below which no heat colour is painted. Cells below this can still show grey when overcast.",            defaultVal: 0.3, unit: "m/s",  min: 0,   max: 2,    step: 0.1 },
  { key: "thermalStormCapeGate",    label: "Storm-risk CAPE gate",          description: "CAPE (J/kg) floor below which the overdevelopment warning triangle never appears, regardless of the stability indices.",          defaultVal: 500, unit: "J/kg", min: 100, max: 2000, step: 50 },
];

const THERMAL_DEFAULT_HOUR = 12;

// ── Main component ────────────────────────────────────────────────────────────

export function AdminForecast() {
  const { settings, updateSettings } = useSettings();

  // Thermal map on/off (the one live feature flag — gates the [Thermal] toggle
  // on the site wind maps).
  const [thermalMapOn, setThermalMapOn] = useState(false);
  const [flagSaving, setFlagSaving] = useState(false);

  // Thresholds
  const [thresholds, setThresholds] = useState<Record<string, number>>({});
  const [thresholdsSaving, setThresholdsSaving] = useState(false);

  // Display
  const [thermalDefaultHour, setThermalDefaultHour] = useState(THERMAL_DEFAULT_HOUR);
  const [displaySaving, setDisplaySaving] = useState(false);

  // Load from settings
  useEffect(() => {
    setThermalMapOn(settings.featureThermalMap === "true");

    const t: Record<string, number> = {};
    for (const field of THRESHOLD_FIELDS) {
      const raw = settings[field.key];
      t[field.key] = raw !== undefined && raw !== "" ? parseFloat(String(raw)) : field.defaultVal;
    }
    setThresholds(t);

    setThermalDefaultHour(parseInt(String(settings.thermalMapDefaultHour ?? THERMAL_DEFAULT_HOUR), 10));
  }, [settings]);

  const handleSaveFlag = async (next: boolean) => {
    setThermalMapOn(next);
    setFlagSaving(true);
    try {
      await updateSettings({ featureThermalMap: next ? "true" : "false" });
      toast.success(next ? "Thermal map enabled" : "Thermal map disabled");
    } catch {
      toast.error("Failed to save");
      setThermalMapOn(!next);
    } finally {
      setFlagSaving(false);
    }
  };

  const handleSaveThresholds = async () => {
    setThresholdsSaving(true);
    try {
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(thresholds)) payload[k] = String(v);
      await updateSettings(payload);
      toast.success("Thresholds saved — reload a site map to see the change");
    } catch {
      toast.error("Failed to save thresholds");
    } finally {
      setThresholdsSaving(false);
    }
  };

  const handleResetThresholds = () => {
    const reset: Record<string, number> = {};
    for (const f of THRESHOLD_FIELDS) reset[f.key] = f.defaultVal;
    setThresholds(reset);
  };

  const handleSaveDisplay = async () => {
    setDisplaySaving(true);
    try {
      await updateSettings({ thermalMapDefaultHour: String(thermalDefaultHour) });
      toast.success("Display settings saved");
    } catch {
      toast.error("Failed to save display settings");
    } finally {
      setDisplaySaving(false);
    }
  };

  function hourLabel(h: number) {
    if (h === 0) return "12:00 am (midnight)";
    if (h === 12) return "12:00 pm (noon)";
    return h < 12 ? `${h}:00 am` : `${h - 12}:00 pm`;
  }

  return (
    <div className="bg-background min-h-screen py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mb-8">
          <Link to="/admin" className="inline-flex items-center text-accent hover:text-ink transition-colors mb-4">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Dashboard
          </Link>
          <h1 className="text-3xl font-extrabold text-ink mb-2">Thermal Map</h1>
          <p className="text-muted-foreground">
            Controls for the live thermal overlay on the site wind maps. The map colours thermal
            strength by W* (updraft velocity), draws cumulus glyphs where cumulus can form, a grey
            sheet under overcast, and an overdevelopment warning triangle where the atmosphere is
            primed to overdevelop. Threshold changes take effect when a site map is reloaded.
          </p>
        </div>

        <div className="space-y-6">

          {/* ── Section 1: Thermal map toggle ── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center text-ink">
                <Map className="w-5 h-5 mr-2 text-accent" />
                Thermal Map Overlay
              </CardTitle>
              <CardDescription>
                Shows the [Thermal] mode toggle on the site wind maps. When off, only the wind map is
                available.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-start justify-between gap-4 py-1">
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-ink">Enable the thermal map</span>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                    Live for all users when on. Backed by the pre-cached thermal grid (W*, CAPE,
                    boundary-layer height, cloud) fetched daily.
                  </p>
                </div>
                <button
                  role="switch"
                  aria-checked={thermalMapOn}
                  disabled={flagSaving}
                  onClick={() => handleSaveFlag(!thermalMapOn)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:opacity-50 ${thermalMapOn ? 'bg-accent' : 'bg-muted'}`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition-transform ${thermalMapOn ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            </CardContent>
          </Card>

          {/* ── Section 2: Thresholds ── */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center text-ink">
                    <Sliders className="w-5 h-5 mr-2 text-accent" />
                    Thermal Thresholds
                  </CardTitle>
                  <CardDescription>
                    The values that drive the map's cloud states (clear / cumulus / overcast), the
                    heat-colour cut-off, and the storm-risk warning. Each defaults to the renderer's
                    built-in value — leaving a field at its default changes nothing.
                  </CardDescription>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={handleResetThresholds}>Reset Defaults</Button>
                  <Button size="sm" onClick={handleSaveThresholds} disabled={thresholdsSaving}>
                    {thresholdsSaving ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {THRESHOLD_FIELDS.map(field => (
                  <div key={field.key} className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-start py-3 border-b border-border last:border-0">
                    <div>
                      <Label htmlFor={field.key} className="text-sm font-semibold text-ink block mb-0.5">
                        {field.label}
                      </Label>
                      <p className="text-xs text-muted-foreground leading-relaxed">{field.description}</p>
                    </div>
                    <div className="flex items-center gap-2 sm:justify-end">
                      <input
                        id={field.key}
                        type="number"
                        value={thresholds[field.key] ?? field.defaultVal}
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        onChange={e => setThresholds(prev => ({ ...prev, [field.key]: parseFloat(e.target.value) }))}
                        className="w-24 border border-input rounded-md px-2 py-1.5 text-sm bg-background text-right focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                      <span className="text-xs text-muted-foreground w-12">{field.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* ── Section 3: Display ── */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center text-ink">
                    <Monitor className="w-5 h-5 mr-2 text-accent" />
                    Display
                  </CardTitle>
                  <CardDescription>
                    Where the time slider starts when a site forecast map first opens.
                  </CardDescription>
                </div>
                <Button size="sm" onClick={handleSaveDisplay} disabled={displaySaving} className="shrink-0">
                  {displaySaving ? "Saving…" : "Save"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 max-w-xs">
                <Label htmlFor="thermal-hour" className="text-sm font-semibold text-ink">Default map time</Label>
                <p className="text-xs text-muted-foreground">
                  Applies to the site wind &amp; thermal map. Clamped to the available forecast range.
                </p>
                <select
                  id="thermal-hour"
                  value={thermalDefaultHour}
                  onChange={e => setThermalDefaultHour(Number(e.target.value))}
                  className="w-full border border-input rounded-md px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  {Array.from({ length: 14 }, (_, i) => i + 7).map(h => (
                    <option key={h} value={h}>{hourLabel(h)}</option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
