import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/apiClient";
import { useAuth } from "@/contexts/AuthContext";
import { X } from "lucide-react";
import { toast } from "sonner";

const FINE_DELTA = 0.35;
const COARSE_DELTA = 2.0;
const FINE_MAX = 2000;
const COARSE_MAX = 3000;

const DEFAULT_FINE = { latMin: -39.2, latMax: -34.0, lonMin: 141.0, lonMax: 150.0 };
const DEFAULT_COARSE = { latMin: -50, latMax: -5, lonMin: 105, lonMax: 165 };

type Bounds = { latMin: number; latMax: number; lonMin: number; lonMax: number };

function calcPoints(b: Bounds, delta: number) {
  return Math.ceil((b.latMax - b.latMin) / delta) * Math.ceil((b.lonMax - b.lonMin) / delta);
}

function getStatus(pts: number, max: number): "good" | "ok" | "poor" {
  if (pts <= max * 0.4) return "good";
  if (pts <= max) return "ok";
  return "poor";
}

const STATUS_DOT: Record<string, string> = {
  good: "bg-emerald-500",
  ok: "bg-amber-400",
  poor: "bg-red-500",
};
const STATUS_TEXT: Record<string, string> = {
  good: "Good",
  ok: "OK",
  poor: "Too large",
};

function clampFineToCoarse(fine: Bounds, coarse: Bounds): Bounds {
  const latMin = Math.max(fine.latMin, coarse.latMin);
  const latMax = Math.min(fine.latMax, coarse.latMax);
  const lonMin = Math.max(fine.lonMin, coarse.lonMin);
  const lonMax = Math.min(fine.lonMax, coarse.lonMax);
  return {
    latMin,
    latMax: latMax <= latMin ? latMin + FINE_DELTA : latMax,
    lonMin,
    lonMax: lonMax <= lonMin ? lonMin + FINE_DELTA : lonMax,
  };
}

const cornerHandle = (color: string, border: string) =>
  L.divIcon({
    html: `<div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid ${border};cursor:grab;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>`,
    className: "",
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });

const FINE_ICON = cornerHandle("#fff", "#555");
const COARSE_ICON = cornerHandle("#3b82f6", "#1d4ed8");

// Corners: [SW, NW, NE, SE]
function boundsToCorners(b: Bounds): L.LatLngTuple[] {
  return [
    [b.latMin, b.lonMin],
    [b.latMax, b.lonMin],
    [b.latMax, b.lonMax],
    [b.latMin, b.lonMax],
  ];
}

function cornersToBounds(corners: L.LatLng[]): Bounds {
  return {
    latMin: Math.min(corners[0].lat, corners[3].lat),
    latMax: Math.max(corners[1].lat, corners[2].lat),
    lonMin: Math.min(corners[0].lng, corners[1].lng),
    lonMax: Math.max(corners[2].lng, corners[3].lng),
  };
}

function GridBoundsMap({
  fine, setFine, coarse, setCoarse,
}: {
  fine: Bounds; setFine: (b: Bounds) => void;
  coarse: Bounds; setCoarse: (b: Bounds) => void;
}) {
  const map = useMap();
  const fineRef = useRef(fine);
  const coarseRef = useRef(coarse);
  const fineRectRef = useRef<L.Rectangle | null>(null);
  const coarseRectRef = useRef<L.Rectangle | null>(null);
  const fineMarkersRef = useRef<L.Marker[]>([]);
  const coarseMarkersRef = useRef<L.Marker[]>([]);

  useEffect(() => { fineRef.current = fine; }, [fine]);
  useEffect(() => { coarseRef.current = coarse; }, [coarse]);

  function updateRectAndMarkers(
    rect: L.Rectangle,
    markers: L.Marker[],
    bounds: Bounds
  ) {
    rect.setBounds([[bounds.latMin, bounds.lonMin], [bounds.latMax, bounds.lonMax]]);
    const corners = boundsToCorners(bounds);
    corners.forEach((c, i) => markers[i]?.setLatLng(c));
  }

  useEffect(() => {
    // Coarse rectangle (blue outline)
    const coarseRect = L.rectangle(
      [[coarse.latMin, coarse.lonMin], [coarse.latMax, coarse.lonMax]],
      { color: "#3b82f6", weight: 2, fill: false, dashArray: "6 4" }
    ).addTo(map);
    coarseRectRef.current = coarseRect;

    // Fine rectangle (white outline)
    const fineRect = L.rectangle(
      [[fine.latMin, fine.lonMin], [fine.latMax, fine.lonMax]],
      { color: "#ffffff", weight: 2, fill: false }
    ).addTo(map);
    fineRectRef.current = fineRect;

    // Coarse corner markers
    const coarseMarkers: L.Marker[] = boundsToCorners(coarseRef.current).map((pos, idx) => {
      const m = L.marker(pos, { icon: COARSE_ICON, draggable: true }).addTo(map);
      m.on("drag", () => {
        const latlng = m.getLatLng();
        const cur = coarseRef.current;
        let newCoarse: Bounds;
        // idx: 0=SW(latMin,lonMin), 1=NW(latMax,lonMin), 2=NE(latMax,lonMax), 3=SE(latMin,lonMax)
        if (idx === 0) newCoarse = { ...cur, latMin: Math.min(latlng.lat, cur.latMax - 1), lonMin: Math.min(latlng.lng, cur.lonMax - 1) };
        else if (idx === 1) newCoarse = { ...cur, latMax: Math.max(latlng.lat, cur.latMin + 1), lonMin: Math.min(latlng.lng, cur.lonMax - 1) };
        else if (idx === 2) newCoarse = { ...cur, latMax: Math.max(latlng.lat, cur.latMin + 1), lonMax: Math.max(latlng.lng, cur.lonMin + 1) };
        else newCoarse = { ...cur, latMin: Math.min(latlng.lat, cur.latMax - 1), lonMax: Math.max(latlng.lng, cur.lonMin + 1) };

        const clampedFine = clampFineToCoarse(fineRef.current, newCoarse);
        coarseRef.current = newCoarse;
        fineRef.current = clampedFine;
        setCoarse(newCoarse);
        setFine(clampedFine);
        if (coarseRectRef.current) updateRectAndMarkers(coarseRectRef.current, coarseMarkers, newCoarse);
        if (fineRectRef.current) updateRectAndMarkers(fineRectRef.current, fineMarkersRef.current, clampedFine);
      });
      return m;
    });
    coarseMarkersRef.current = coarseMarkers;

    // Fine corner markers
    const fineMarkers: L.Marker[] = boundsToCorners(fineRef.current).map((pos, idx) => {
      const m = L.marker(pos, { icon: FINE_ICON, draggable: true }).addTo(map);
      m.on("drag", () => {
        const latlng = m.getLatLng();
        const cur = fineRef.current;
        const c = coarseRef.current;
        const clat = Math.min(Math.max(latlng.lat, c.latMin), c.latMax);
        const clon = Math.min(Math.max(latlng.lng, c.lonMin), c.lonMax);
        let newFine: Bounds;
        if (idx === 0) newFine = { ...cur, latMin: Math.min(clat, cur.latMax - FINE_DELTA), lonMin: Math.min(clon, cur.lonMax - FINE_DELTA) };
        else if (idx === 1) newFine = { ...cur, latMax: Math.max(clat, cur.latMin + FINE_DELTA), lonMin: Math.min(clon, cur.lonMax - FINE_DELTA) };
        else if (idx === 2) newFine = { ...cur, latMax: Math.max(clat, cur.latMin + FINE_DELTA), lonMax: Math.max(clon, cur.lonMin + FINE_DELTA) };
        else newFine = { ...cur, latMin: Math.min(clat, cur.latMax - FINE_DELTA), lonMax: Math.max(clon, cur.lonMin + FINE_DELTA) };

        fineRef.current = newFine;
        setFine(newFine);
        if (fineRectRef.current) updateRectAndMarkers(fineRectRef.current, fineMarkers, newFine);
      });
      return m;
    });
    fineMarkersRef.current = fineMarkers;

    // Fit map to coarse bounds
    map.fitBounds([[coarse.latMin, coarse.lonMin], [coarse.latMax, coarse.lonMax]], { padding: [40, 40] });

    return () => {
      coarseRect.remove();
      fineRect.remove();
      coarseMarkers.forEach(m => m.remove());
      fineMarkers.forEach(m => m.remove());
    };
  }, [map]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

export function GridBoundsSelector({
  isOpen, onClose, onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { token } = useAuth();
  const [fine, setFine] = useState<Bounds>(DEFAULT_FINE);
  const [coarse, setCoarse] = useState<Bounds>(DEFAULT_COARSE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mapKey, setMapKey] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    api.get<{ fineLatMin: number; fineLatMax: number; fineLonMin: number; fineLonMax: number;
               coarseLatMin: number; coarseLatMax: number; coarseLonMin: number; coarseLonMax: number }>(
      "/api/weather/grid-bounds", token
    ).then(d => {
      setFine({ latMin: d.fineLatMin, latMax: d.fineLatMax, lonMin: d.fineLonMin, lonMax: d.fineLonMax });
      setCoarse({ latMin: d.coarseLatMin, latMax: d.coarseLatMax, lonMin: d.coarseLonMin, lonMax: d.coarseLonMax });
      setMapKey(k => k + 1);
    }).catch(() => {
      setFine(DEFAULT_FINE);
      setCoarse(DEFAULT_COARSE);
      setMapKey(k => k + 1);
    }).finally(() => setLoading(false));
  }, [isOpen, token]);

  const finePts = calcPoints(fine, FINE_DELTA);
  const coarsePts = calcPoints(coarse, COARSE_DELTA);
  const fineStatus = getStatus(finePts, FINE_MAX);
  const coarseStatus = getStatus(coarsePts, COARSE_MAX);
  const canSave = fineStatus !== "poor" && coarseStatus !== "poor";

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await api.post("/api/weather/grid-bounds", {
        fineLatMin: fine.latMin, fineLatMax: fine.latMax, fineLonMin: fine.lonMin, fineLonMax: fine.lonMax,
        coarseLatMin: coarse.latMin, coarseLatMax: coarse.latMax, coarseLonMin: coarse.lonMin, coarseLonMax: coarse.lonMax,
      }, token);
      toast.success("Grid bounds saved. Use Fetch Now to apply immediately.");
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save grid bounds");
    } finally {
      setSaving(false);
    }
  }, [fine, coarse, token, onSaved, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10001] bg-black/80 flex items-center justify-center p-4">
      <div className="bg-background rounded-xl shadow-2xl flex flex-col w-full max-w-4xl" style={{ maxHeight: "90vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-lg font-bold text-navy">Configure Grid Coverage Areas</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Drag the corner handles to resize each grid area</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-muted hover:bg-muted/80 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Map */}
        <div className="flex-1 min-h-0 relative" style={{ minHeight: 360 }}>
          {loading ? (
            <div className="w-full h-full flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky" />
            </div>
          ) : (
            <MapContainer
              key={mapKey}
              center={[-25, 133]}
              zoom={4}
              className="w-full h-full"
              style={{ minHeight: 360 }}
              zoomControl
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <GridBoundsMap fine={fine} setFine={setFine} coarse={coarse} setCoarse={setCoarse} />
            </MapContainer>
          )}

          {/* Legend */}
          <div className="absolute bottom-4 right-4 z-[1000] bg-background/90 backdrop-blur-sm border border-border rounded-lg px-3 py-2 text-xs space-y-1 pointer-events-none">
            <div className="flex items-center gap-2">
              <div className="w-6 h-0 border-t-2 border-white shrink-0" />
              <span className="text-foreground font-medium">Fine grid (high res)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-0 border-t-2 border-blue-500 border-dashed shrink-0" />
              <span className="text-foreground font-medium">Coarse grid (wide area)</span>
            </div>
          </div>
        </div>

        {/* Stats + controls */}
        <div className="px-5 py-4 border-t border-border shrink-0 space-y-3">
          {/* Point count indicators */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            {[
              { label: "Fine grid", pts: finePts, max: FINE_MAX, delta: FINE_DELTA, status: fineStatus, b: fine },
              { label: "Coarse grid", pts: coarsePts, max: COARSE_MAX, delta: COARSE_DELTA, status: coarseStatus, b: coarse },
            ].map(({ label, pts, max, delta, status, b }) => (
              <div key={label} className="bg-muted/40 rounded-lg p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">{label}</span>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${STATUS_DOT[status]}`} />
                    <span className={`text-xs font-medium ${status === "poor" ? "text-red-600" : status === "ok" ? "text-amber-600" : "text-emerald-600"}`}>
                      {STATUS_TEXT[status]}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {pts.toLocaleString()} pts · ~{Math.ceil(pts / 90) * 0.5}s fetch · {delta}° spacing
                </div>
                <div className="text-xs text-muted-foreground">
                  {b.latMin.toFixed(1)}°–{b.latMax.toFixed(1)}°, {b.lonMin.toFixed(1)}°–{b.lonMax.toFixed(1)}°
                </div>
              </div>
            ))}
          </div>

          {!canSave && (
            <p className="text-xs text-red-600">
              One or more grids exceed the point limit. Reduce the area to enable saving.
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            After saving, use the Fetch Now buttons to apply the new coverage area immediately.
          </p>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={!canSave || saving}>
              {saving ? "Saving..." : "Set Grid Areas"}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
