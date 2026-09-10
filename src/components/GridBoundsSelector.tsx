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

const DEFAULT_FINE = { latMin: -39.2, latMax: -34.0, lonMin: 141.0, lonMax: 150.0 };

type Bounds = { latMin: number; latMax: number; lonMin: number; lonMax: number };

function boundsArea(b: Bounds) {
  return ((b.latMax - b.latMin) * (b.lonMax - b.lonMin)).toFixed(1);
}

const FINE_ICON = L.divIcon({
  html: `<div style="width:12px;height:12px;border-radius:50%;background:#fff;border:2px solid #555;cursor:grab;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>`,
  className: "",
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

// Corners: [SW, NW, NE, SE]
function boundsToCorners(b: Bounds): L.LatLngTuple[] {
  return [
    [b.latMin, b.lonMin],
    [b.latMax, b.lonMin],
    [b.latMax, b.lonMax],
    [b.latMin, b.lonMax],
  ];
}


function GridBoundsMap({
  fine, setFine,
}: {
  fine: Bounds; setFine: (b: Bounds) => void;
}) {
  const map = useMap();
  const fineRef = useRef(fine);
  const fineRectRef = useRef<L.Rectangle | null>(null);
  const fineMarkersRef = useRef<L.Marker[]>([]);

  useEffect(() => { fineRef.current = fine; }, [fine]);

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
    // Fine rectangle (white outline)
    const fineRect = L.rectangle(
      [[fine.latMin, fine.lonMin], [fine.latMax, fine.lonMax]],
      { color: "#ffffff", weight: 2, fill: false }
    ).addTo(map);
    fineRectRef.current = fineRect;

    // Fine corner markers
    const fineMarkers: L.Marker[] = boundsToCorners(fineRef.current).map((pos, idx) => {
      const m = L.marker(pos, { icon: FINE_ICON, draggable: true }).addTo(map);
      m.on("drag", () => {
        const latlng = m.getLatLng();
        const cur = fineRef.current;
        let newFine: Bounds;
        if (idx === 0) newFine = { ...cur, latMin: Math.min(latlng.lat, cur.latMax - 0.5), lonMin: Math.min(latlng.lng, cur.lonMax - 0.5) };
        else if (idx === 1) newFine = { ...cur, latMax: Math.max(latlng.lat, cur.latMin + 0.5), lonMin: Math.min(latlng.lng, cur.lonMax - 0.5) };
        else if (idx === 2) newFine = { ...cur, latMax: Math.max(latlng.lat, cur.latMin + 0.5), lonMax: Math.max(latlng.lng, cur.lonMin + 0.5) };
        else newFine = { ...cur, latMin: Math.min(latlng.lat, cur.latMax - 0.5), lonMax: Math.max(latlng.lng, cur.lonMin + 0.5) };

        fineRef.current = newFine;
        setFine(newFine);
        if (fineRectRef.current) updateRectAndMarkers(fineRectRef.current, fineMarkers, newFine);
      });
      return m;
    });
    fineMarkersRef.current = fineMarkers;

    // Fit map to fine bounds
    map.fitBounds([[fine.latMin, fine.lonMin], [fine.latMax, fine.lonMax]], { padding: [40, 40] });

    return () => {
      fineRect.remove();
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mapKey, setMapKey] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    api.get<{ fineLatMin: number; fineLatMax: number; fineLonMin: number; fineLonMax: number }>(
      "/api/weather/grid-bounds", token
    ).then(d => {
      setFine({ latMin: d.fineLatMin, latMax: d.fineLatMax, lonMin: d.fineLonMin, lonMax: d.fineLonMax });
      setMapKey(k => k + 1);
    }).catch(() => {
      setFine(DEFAULT_FINE);
      setMapKey(k => k + 1);
    }).finally(() => setLoading(false));
  }, [isOpen, token]);

  const canSave = true;

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await api.post("/api/weather/grid-bounds", {
        fineLatMin: fine.latMin, fineLatMax: fine.latMax, fineLonMin: fine.lonMin, fineLonMax: fine.lonMax,
      }, token);
      toast.success("Grid bounds saved. Use Fetch Now to apply immediately.");
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save grid bounds");
    } finally {
      setSaving(false);
    }
  }, [fine, token, onSaved, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10001] bg-black/80 flex items-center justify-center p-4">
      <div className="bg-background rounded-xl shadow-2xl flex flex-col w-full max-w-4xl" style={{ maxHeight: "90vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-lg font-bold text-navy">Configure Grid Coverage Area</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Drag the corner handles to set the outer boundary used by all three grid fetches</p>
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
              center={[-37, 145]}
              zoom={5}
              className="w-full h-full"
              style={{ minHeight: 360 }}
              zoomControl
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <GridBoundsMap fine={fine} setFine={setFine} />
            </MapContainer>
          )}

          {/* Legend */}
          <div className="absolute bottom-4 right-4 z-[1000] bg-background/90 backdrop-blur-sm border border-border rounded-lg px-3 py-2 text-xs pointer-events-none">
            <div className="flex items-center gap-2">
              <div className="w-6 h-0 border-t-2 border-white shrink-0" />
              <span className="text-foreground font-medium">Coverage area (all grids)</span>
            </div>
          </div>
        </div>

        {/* Stats + controls */}
        <div className="px-5 py-4 border-t border-border shrink-0 space-y-3">
          <div className="bg-muted/40 rounded-lg p-3 space-y-1 text-sm">
            <span className="font-medium text-foreground">Coverage bounds</span>
            <div className="text-xs text-muted-foreground">
              {fine.latMin.toFixed(1)}°–{fine.latMax.toFixed(1)}° lat · {fine.lonMin.toFixed(1)}°–{fine.lonMax.toFixed(1)}° lon · {boundsArea(fine)}°² area
            </div>
            <div className="text-xs text-muted-foreground">
              All three grids (Fine 0.15°, Thermal 0.09°, Extended 0.5°) use these bounds. The Victoria polygon clips each column to a tighter lat range server-side, reducing actual tile count by ~35%.
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            After saving, use the Fetch Now buttons to apply the new coverage area immediately.
          </p>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={!canSave || saving}>
              {saving ? "Saving..." : "Set Grid Area"}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
