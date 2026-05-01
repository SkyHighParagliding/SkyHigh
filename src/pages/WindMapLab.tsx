import { useState, useEffect, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { DEFAULT_ZOOM_SETPOINTS } from "@/components/windMapTypes";
import type { ZoomSetpoints, ZoomSetpoint } from "@/components/windMapTypes";
import { api } from "@/lib/apiClient";

const SitesWindMapProto = lazy(() =>
  import("@/components/SitesWindMap").then((m) => ({ default: m.SitesWindMapProto }))
);

const PARAM_DEFS: { key: keyof ZoomSetpoint; label: string; min: number; max: number; step: number }[] = [
  { key: "speed",         label: "Speed",          min: 0.05, max: 5.0,  step: 0.05 },
  { key: "lineWidth",     label: "Line Width",     min: 0.2,  max: 4.0,  step: 0.1 },
  { key: "trailLength",   label: "Trail Length",   min: 2,    max: 50,   step: 1 },
  { key: "opacity",       label: "Opacity",        min: 0.1,  max: 1.0,  step: 0.05 },
  { key: "particleCount", label: "Particle Count",  min: 200,  max: 8000, step: 200 },
];

function SetpointSlider({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-[10px] text-muted-foreground w-20 shrink-0 text-right">{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1 accent-sky-500 cursor-pointer"
      />
      <span className="text-[10px] font-mono text-foreground-label w-10 text-right">{
        Number.isInteger(step) ? value : value.toFixed(step < 0.1 ? 2 : 1)
      }</span>
    </div>
  );
}

export function WindMapLab() {
  const [sites, setSites] = useState<any[]>([]);
  const [showTuning, setShowTuning] = useState(true);
  const [setpoints, setSetpoints] = useState<ZoomSetpoints>(() => {
    const saved = localStorage.getItem("windMapLabSetpoints");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed?.z0?.speed != null && parsed?.z5?.speed != null && parsed?.z10?.speed != null) {
          return parsed;
        }
      } catch {}
    }
    return { ...DEFAULT_ZOOM_SETPOINTS };
  });

  useEffect(() => {
    localStorage.setItem("windMapLabSetpoints", JSON.stringify(setpoints));
  }, [setpoints]);

  useEffect(() => {
    api.get<Array<Record<string, string>>>("/api/sites")
      .then((data) =>
        setSites(
          data
            .filter((s) => s.lat && s.lon)
            .map((s) => ({
              id: s.id,
              name: s.name,
              lat: s.lat,
              lon: s.lon,
              type: s.type,
              status: s.status,
            }))
        )
      );
  }, []);

  const updateSetpoint = (zKey: "z0" | "z5" | "z10", param: keyof ZoomSetpoint, value: number) => {
    setSetpoints(prev => ({
      ...prev,
      [zKey]: { ...prev[zKey], [param]: value },
    }));
  };

  const resetDefaults = () => {
    setSetpoints({ ...DEFAULT_ZOOM_SETPOINTS });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <Link to="/admin" className="inline-flex items-center text-sky hover:text-sky-light mb-4 font-medium">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
        </Link>

        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-extrabold text-navy">Wind Map Lab</h1>
            <div className="mt-1 inline-block bg-amber-100 text-amber-800 text-xs font-medium px-3 py-0.5 rounded-full">
              PROTOTYPE
            </div>
          </div>
        </div>

        <div className="bg-card border border-border-subtle rounded-xl overflow-hidden" style={{ height: showTuning ? "55vh" : "75vh" }}>
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full text-foreground-faint">
                <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading wind map...
              </div>
            }
          >
            {sites.length > 0 && <SitesWindMapProto sites={sites} isAuthenticated={false} zoomSetpoints={setpoints} />}
          </Suspense>
        </div>

        <div className="mt-3 bg-card border border-border-subtle rounded-xl overflow-hidden">
          <div
            className="w-full flex items-center justify-between px-4 py-2 text-sm font-semibold text-navy hover:bg-background cursor-pointer"
            onClick={() => setShowTuning(!showTuning)}
          >
            <span>Zoom Setpoint Tuning</span>
            <div className="flex items-center gap-3">
              <button
                onClick={(e) => { e.stopPropagation(); resetDefaults(); }}
                className="text-xs text-sky hover:underline"
              >
                Reset defaults
              </button>
              {showTuning ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </div>
          {showTuning && (
            <div className="px-4 pb-4">
              <p className="text-[10px] text-foreground-faint mb-3">
                Adjust values at each zoom level. The map interpolates smoothly between these setpoints. Scroll the map to each zoom level while adjusting.
              </p>
              <div className="grid grid-cols-3 gap-4">
                {(["z0", "z5", "z10"] as const).map((zKey) => (
                  <div key={zKey} className="border border-border-subtle rounded-lg p-3">
                    <div className="text-xs font-bold text-navy mb-2">
                      {zKey === "z0" ? "Zoom 0 (max out)" : zKey === "z5" ? "Zoom 5 (mid)" : "Zoom 10 (max in)"}
                    </div>
                    <div className="space-y-1.5">
                      {PARAM_DEFS.map((def) => (
                        <SetpointSlider
                          key={def.key}
                          label={def.label}
                          value={setpoints[zKey][def.key]}
                          min={def.min}
                          max={def.max}
                          step={def.step}
                          onChange={(v) => updateSetpoint(zKey, def.key, v)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
