import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ToggleLeft, Sliders, Monitor, Clock, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useSettings } from "@/contexts/SettingsContext";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────────────────────────

interface FeatureFlag {
  key: string;
  label: string;
  description: string;
  stage: string;
}

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

const FEATURE_FLAGS: FeatureFlag[] = [
  { key: "featureThermalMap",       label: "Thermal map overlay",             description: "Shows a [Thermal] mode toggle on the wind map — colour heatmap of thermal strength across Victoria with time slider.",         stage: "Stage 1" },
  { key: "featureMeteogramInland",  label: "Meteogram tab — inland sites",    description: "Shows a Meteogram tab on inland site pages (sites without a live weather station). This is the default tab for inland sites.", stage: "Stage 2" },
  { key: "featureMeteogramCoastal", label: "Meteogram tab — coastal sites",   description: "Also shows the Meteogram tab on coastal sites that already have a Wind History tab.",                                          stage: "Stage 2" },
  { key: "featureFlightWindow",     label: "Flying window highlight bar",     description: "Shows a green/amber bar along the time axis indicating the recommended flying window based on ceiling, CAPE, and precipitation.", stage: "Stage 2" },
  { key: "feature7DayStrip",        label: "7-day thumbnail strip",           description: "Shows a week overview below the main meteogram chart — small ceiling-line cards per day, tap to expand.",                       stage: "Stage 2" },
  { key: "featureNoviceMode",       label: "Novice mode toggle",              description: "Lets pilots switch to plain-English overlay labels on the chart: 'Thermals active here', 'Your maximum height today', etc.",    stage: "Stage 2" },
  { key: "featureTapToExplain",     label: "Tap-to-explain on chart elements", description: "Tapping the ceiling line, an inversion band, or a storm icon shows a plain-English explanation of what it means.",             stage: "Stage 2" },
  { key: "featureSkewT",            label: "Skew-T panel (advanced / XC)",   description: "Adds a Skew-T atmospheric sounding panel as a secondary tab for experienced XC pilots. Requires Stage 3 data fetch.",           stage: "Stage 5" },
];

const THRESHOLD_FIELDS: ThresholdField[] = [
  { key: "thermalCapeWeak",            label: "CAPE — weak thermal (cyan)",              description: "Minimum CAPE value to start colouring the thermal map cyan. Below this the map stays blue (no thermals).",                 defaultVal: 50,   unit: "J/kg", min: 0,   max: 500,   step: 10 },
  { key: "thermalCapeModerate",        label: "CAPE — moderate thermal (green)",          description: "CAPE threshold for green colouring — working thermals.",                                                                     defaultVal: 200,  unit: "J/kg", min: 50,  max: 1000,  step: 50 },
  { key: "thermalCapeStrong",          label: "CAPE — strong thermal (orange)",           description: "CAPE threshold for orange colouring — strong thermals, experienced pilots.",                                                  defaultVal: 500,  unit: "J/kg", min: 100, max: 2000,  step: 50 },
  { key: "thermalCapeStorm",           label: "CAPE — storm risk (red warning)",          description: "CAPE threshold that triggers the storm risk warning icon. Above this value, overdevelopment and thunderstorm risk is high.", defaultVal: 1000, unit: "J/kg", min: 500, max: 3000,  step: 100 },
  { key: "thermalBLHMinAboveSite",     label: "Min boundary layer above site",            description: "Minimum boundary layer height above the site's launch elevation for the flying window to show as green (not amber).",        defaultVal: 200,  unit: "m",    min: 0,   max: 1000,  step: 50 },
  { key: "thermalCumulusCloudPct",     label: "Cumulus icon trigger",                     description: "Low cloud cover % (cloud_cover_low) at which the cumulus cloud icon appears on the chart.",                                  defaultVal: 30,   unit: "%",    min: 5,   max: 80,    step: 5 },
  { key: "thermalOverdevPrecipPct",    label: "Overdevelopment warning trigger",           description: "Precipitation probability % at which the overdevelopment warning icon appears. Signals risk of thermals going to storm.",    defaultVal: 40,   unit: "%",    min: 10,  max: 90,    step: 5 },
  { key: "thermalRainMmHr",           label: "Rain icon trigger",                         description: "Precipitation rate (mm/hr) at which the rain icon appears on the chart.",                                                    defaultVal: 0.1,  unit: "mm/hr",min: 0,   max: 2,     step: 0.1 },
  { key: "thermalFlyWindowMinCeiling", label: "Min ceiling above site for green window",  description: "How many metres above the site's launch height the boundary layer must be before the flying window bar shows as green. Below this it shows amber.",  defaultVal: 500, unit: "m", min: 0, max: 2000, step: 50 },
];

// ── Toggle switch component ───────────────────────────────────────────────────

function FeatureToggle({ flag, value, onChange }: { flag: FeatureFlag; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-semibold text-navy">{flag.label}</span>
          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky/10 text-sky">{flag.stage}</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{flag.description}</p>
      </div>
      <button
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-sky focus:ring-offset-2 ${value ? 'bg-sky' : 'bg-muted'}`}
      >
        <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition-transform ${value ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AdminForecast() {
  const { settings, updateSettings } = useSettings();

  // Feature flags
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [flagsSaving, setFlagsSaving] = useState(false);

  // Thresholds
  const [thresholds, setThresholds] = useState<Record<string, number>>({});
  const [thresholdsSaving, setThresholdsSaving] = useState(false);

  // Display settings
  const [coastalDefault, setCoastalDefault] = useState("wind_history");
  const [inlandDefault, setInlandDefault] = useState("meteogram");
  const [thermalDefaultHour, setThermalDefaultHour] = useState(12);
  const [meteogramHeight, setMeteogramHeight] = useState(380);
  const [displaySaving, setDisplaySaving] = useState(false);

  // Schedule settings (Stage 3+)
  const [soundingHour, setSoundingHour] = useState(5);
  const [soundingMinute, setSoundingMinute] = useState(45);
  const [scheduleSaving, setScheduleSaving] = useState(false);

  // Load from settings
  useEffect(() => {
    const f: Record<string, boolean> = {};
    for (const flag of FEATURE_FLAGS) {
      f[flag.key] = settings[flag.key] === "true";
    }
    setFlags(f);

    const t: Record<string, number> = {};
    for (const field of THRESHOLD_FIELDS) {
      const raw = settings[field.key];
      t[field.key] = raw !== undefined ? parseFloat(String(raw)) : field.defaultVal;
    }
    setThresholds(t);

    setCoastalDefault(String(settings.meteogramCoastalDefaultTab ?? "wind_history"));
    setInlandDefault(String(settings.meteogramInlandDefaultTab ?? "meteogram"));
    setThermalDefaultHour(parseInt(String(settings.thermalMapDefaultHour ?? "12"), 10));
    setMeteogramHeight(parseInt(String(settings.meteogramHeightPx ?? "380"), 10));
    setSoundingHour(parseInt(String(settings.schedSoundingFetchHour ?? "5"), 10));
    setSoundingMinute(parseInt(String(settings.schedSoundingFetchMinute ?? "45"), 10));
  }, [settings]);

  const handleSaveFlags = async () => {
    setFlagsSaving(true);
    try {
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(flags)) payload[k] = v ? "true" : "false";
      await updateSettings(payload);
      toast.success("Feature flags saved");
    } catch {
      toast.error("Failed to save feature flags");
    } finally {
      setFlagsSaving(false);
    }
  };

  const handleResetFlags = () => {
    const reset: Record<string, boolean> = {};
    for (const flag of FEATURE_FLAGS) reset[flag.key] = false;
    setFlags(reset);
  };

  const handleSaveThresholds = async () => {
    setThresholdsSaving(true);
    try {
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(thresholds)) payload[k] = String(v);
      await updateSettings(payload);
      toast.success("Thresholds saved");
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
      await updateSettings({
        meteogramCoastalDefaultTab: coastalDefault,
        meteogramInlandDefaultTab: inlandDefault,
        thermalMapDefaultHour: String(thermalDefaultHour),
        meteogramHeightPx: String(meteogramHeight),
      });
      toast.success("Display settings saved");
    } catch {
      toast.error("Failed to save display settings");
    } finally {
      setDisplaySaving(false);
    }
  };

  const handleSaveSchedule = async () => {
    setScheduleSaving(true);
    try {
      await updateSettings({
        schedSoundingFetchHour: String(soundingHour),
        schedSoundingFetchMinute: String(soundingMinute),
      });
      toast.success("Schedule saved");
    } catch {
      toast.error("Failed to save schedule");
    } finally {
      setScheduleSaving(false);
    }
  };

  function hourLabel(h: number) {
    if (h === 0) return "12:00 am (midnight)";
    if (h === 12) return "12:00 pm (noon)";
    return h < 12 ? `${h}:00 am` : `${h - 12}:00 pm`;
  }

  const activeCount = Object.values(flags).filter(Boolean).length;

  return (
    <div className="bg-background min-h-screen py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mb-8">
          <Link to="/admin" className="inline-flex items-center text-sky hover:text-navy transition-colors mb-4">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Dashboard
          </Link>
          <h1 className="text-3xl font-extrabold text-navy mb-2">Forecast &amp; Thermal Features</h1>
          <p className="text-muted-foreground">
            Control the SkyHigh meteogram and thermal map features. All features are off by default —
            enable them individually once each stage has been built and reviewed.
          </p>
        </div>

        {/* Production warning banner */}
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8">
          <TriangleAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Do not enable features before they are ready</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Each feature must be fully built, tested locally, and approved before being switched on here.
              Enabling a feature flag makes it live for all users immediately.
              {activeCount > 0 && <span className="font-bold"> {activeCount} feature{activeCount > 1 ? 's are' : ' is'} currently active.</span>}
            </p>
          </div>
        </div>

        <div className="space-y-6">

          {/* ── Section 1: Feature Flags ── */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center text-navy">
                    <ToggleLeft className="w-5 h-5 mr-2 text-sky" />
                    Feature Switches
                  </CardTitle>
                  <CardDescription>
                    Turn each feature on or off. Features are organised by build stage — do not enable a
                    feature until its stage is complete and has been approved for production.
                  </CardDescription>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={handleResetFlags}>All Off</Button>
                  <Button size="sm" onClick={handleSaveFlags} disabled={flagsSaving}>
                    {flagsSaving ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {FEATURE_FLAGS.map(flag => (
                <FeatureToggle
                  key={flag.key}
                  flag={flag}
                  value={flags[flag.key] ?? false}
                  onChange={v => setFlags(prev => ({ ...prev, [flag.key]: v }))}
                />
              ))}
            </CardContent>
          </Card>

          {/* ── Section 2: Thresholds ── */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center text-navy">
                    <Sliders className="w-5 h-5 mr-2 text-sky" />
                    Thermal Thresholds
                  </CardTitle>
                  <CardDescription>
                    The numeric values that control colour bands, icons, and flying window calculations.
                    Defaults are set conservatively — adjust once real-world data shows they need tuning.
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
                      <Label htmlFor={field.key} className="text-sm font-semibold text-navy block mb-0.5">
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
                        className="w-24 border border-input rounded-md px-2 py-1.5 text-sm bg-background text-right focus:outline-none focus:ring-1 focus:ring-sky"
                      />
                      <span className="text-xs text-muted-foreground w-12">{field.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* ── Section 3: Display Settings ── */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center text-navy">
                    <Monitor className="w-5 h-5 mr-2 text-sky" />
                    Display Settings
                  </CardTitle>
                  <CardDescription>
                    Controls layout defaults — which tab opens first, chart dimensions, and the time slider start position.
                  </CardDescription>
                </div>
                <Button size="sm" onClick={handleSaveDisplay} disabled={displaySaving} className="shrink-0">
                  {displaySaving ? "Saving…" : "Save"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-5">

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="coastal-default" className="text-sm font-semibold text-navy">Coastal site default tab</Label>
                    <p className="text-xs text-muted-foreground">Which tab is selected by default on sites with a live weather station.</p>
                    <select
                      id="coastal-default"
                      value={coastalDefault}
                      onChange={e => setCoastalDefault(e.target.value)}
                      className="w-full border border-input rounded-md px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-sky"
                    >
                      <option value="wind_history">Wind History</option>
                      <option value="meteogram">Meteogram</option>
                      <option value="7day">7-Day Forecast</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="inland-default" className="text-sm font-semibold text-navy">Inland site default tab</Label>
                    <p className="text-xs text-muted-foreground">Which tab is selected by default on sites without a live weather station.</p>
                    <select
                      id="inland-default"
                      value={inlandDefault}
                      onChange={e => setInlandDefault(e.target.value)}
                      className="w-full border border-input rounded-md px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-sky"
                    >
                      <option value="meteogram">Meteogram</option>
                      <option value="7day">7-Day Forecast</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="thermal-hour" className="text-sm font-semibold text-navy">Thermal map default time</Label>
                    <p className="text-xs text-muted-foreground">Where the time slider starts when the thermal map is first opened.</p>
                    <select
                      id="thermal-hour"
                      value={thermalDefaultHour}
                      onChange={e => setThermalDefaultHour(Number(e.target.value))}
                      className="w-full border border-input rounded-md px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-sky"
                    >
                      {Array.from({ length: 14 }, (_, i) => i + 7).map(h => (
                        <option key={h} value={h}>{hourLabel(h)}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="meteogram-height" className="text-sm font-semibold text-navy">Meteogram chart height</Label>
                    <p className="text-xs text-muted-foreground">Desktop chart height in pixels.</p>
                    <div className="flex items-center gap-2">
                      <input
                        id="meteogram-height"
                        type="number"
                        value={meteogramHeight}
                        min={280}
                        max={600}
                        step={20}
                        onChange={e => setMeteogramHeight(parseInt(e.target.value, 10))}
                        className="w-24 border border-input rounded-md px-2 py-1.5 text-sm bg-background text-right focus:outline-none focus:ring-1 focus:ring-sky"
                      />
                      <span className="text-xs text-muted-foreground">px</span>
                    </div>
                  </div>
                </div>

              </div>
            </CardContent>
          </Card>

          {/* ── Section 4: Schedule Settings ── */}
          <Card className="border-dashed">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center text-navy">
                    <Clock className="w-5 h-5 mr-2 text-muted-foreground" />
                    <span className="text-muted-foreground">Schedule Settings</span>
                    <span className="ml-2 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Stage 3</span>
                  </CardTitle>
                  <CardDescription>
                    Controls the daily pressure-level atmospheric sounding fetch (per site).
                    These settings have no effect until the Stage 3 sounding fetch is built and deployed.
                  </CardDescription>
                </div>
                <Button size="sm" onClick={handleSaveSchedule} disabled={scheduleSaving} variant="outline" className="shrink-0">
                  {scheduleSaving ? "Saving…" : "Save"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1">
                  <Label htmlFor="sounding-hour" className="text-xs text-muted-foreground">Fetch hour (Melbourne time)</Label>
                  <select
                    id="sounding-hour"
                    value={soundingHour}
                    onChange={e => setSoundingHour(Number(e.target.value))}
                    className="border border-input rounded-md px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-sky opacity-60"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{hourLabel(i)}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sounding-minute" className="text-xs text-muted-foreground">Fetch minute</Label>
                  <select
                    id="sounding-minute"
                    value={soundingMinute}
                    onChange={e => setSoundingMinute(Number(e.target.value))}
                    className="border border-input rounded-md px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-sky opacity-60"
                  >
                    {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => (
                      <option key={m} value={m}>:{String(m).padStart(2, '0')}</option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-muted-foreground pb-1.5">
                  Runs after the extended forecast fetch (default 5:30 am) to avoid API rate conflicts.
                </p>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
