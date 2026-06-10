import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { Breadcrumb } from "@/lib/flightDb";

function verticalRateToColor(vRate: number): string {
  const maxRate = 5;
  const intensity = Math.min(1, Math.abs(vRate) / maxRate);

  if (vRate > 0.1) {
    const g = Math.round(100 + 155 * intensity);
    const r = Math.round(50 * (1 - intensity));
    const b = Math.round(50 * (1 - intensity));
    return `rgb(${r},${g},${b})`;
  } else if (vRate < -0.1) {
    const r = Math.round(100 + 155 * intensity);
    const g = Math.round(50 * (1 - intensity));
    const b = Math.round(50 * (1 - intensity));
    return `rgb(${r},${g},${b})`;
  }
  return 'rgb(180,180,80)';
}

function createParagliderIcon(heading: number): L.DivIcon {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="40" height="40" style="transform: rotate(${heading}deg);">
    <ellipse cx="32" cy="14" rx="22" ry="10" fill="#0ea5e9" stroke="#0369a1" stroke-width="2" opacity="0.9"/>
    <line x1="14" y1="18" x2="28" y2="38" stroke="#0369a1" stroke-width="1.5" opacity="0.7"/>
    <line x1="50" y1="18" x2="36" y2="38" stroke="#0369a1" stroke-width="1.5" opacity="0.7"/>
    <line x1="22" y1="16" x2="30" y2="38" stroke="#0369a1" stroke-width="1.5" opacity="0.7"/>
    <line x1="42" y1="16" x2="34" y2="38" stroke="#0369a1" stroke-width="1.5" opacity="0.7"/>
    <circle cx="32" cy="42" r="6" fill="#f97316" stroke="#c2410c" stroke-width="2"/>
    <circle cx="32" cy="41" r="2.5" fill="#fff" opacity="0.8"/>
  </svg>`;

  return L.divIcon({
    html: svg,
    className: "paraglider-icon",
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

interface FlightTrailProps {
  breadcrumbs: Breadcrumb[];
  trailColor?: string;
  trailWidth?: number;
  colorByAltitude?: boolean;
  isRecording?: boolean;
}

export function FlightTrail({
  breadcrumbs,
  trailColor = "#FF4444",
  trailWidth = 18,
  colorByAltitude = true,
  isRecording = false,
}: FlightTrailProps) {
  const map = useMap();
  const layersRef = useRef<L.Layer[]>([]);
  const segmentCountRef = useRef(0);
  const launchMarkerRef = useRef<L.CircleMarker | null>(null);
  const landMarkerRef = useRef<L.CircleMarker | null>(null);

  useEffect(() => {
    if (breadcrumbs.length === 0) {
      for (const layer of layersRef.current) {
        map.removeLayer(layer);
      }
      layersRef.current = [];
      segmentCountRef.current = 0;
      launchMarkerRef.current = null;
      landMarkerRef.current = null;
      return;
    }

    if (breadcrumbs.length - 1 < segmentCountRef.current) {
      for (const layer of layersRef.current) {
        map.removeLayer(layer);
      }
      layersRef.current = [];
      segmentCountRef.current = 0;
      launchMarkerRef.current = null;
      landMarkerRef.current = null;
    }

    const startIdx = segmentCountRef.current;
    const newSegments = breadcrumbs.length - 1 - startIdx;

    if (startIdx === 0 && breadcrumbs.length >= 1) {
      if (!launchMarkerRef.current) {
        const pt = breadcrumbs[0];
        const marker = L.circleMarker([pt.lat, pt.lon], {
          radius: 8,
          color: "#00CC00",
          fillColor: "#00FF00",
          fillOpacity: 0.9,
          weight: 2,
        });
        marker.bindTooltip("Launch", { permanent: false });
        marker.addTo(map);
        launchMarkerRef.current = marker;
        layersRef.current.push(marker);
      }
    }

    if (newSegments > 0) {
      for (let i = startIdx; i < breadcrumbs.length - 1; i++) {
        const b1 = breadcrumbs[i];
        const b2 = breadcrumbs[i + 1];

        let color = trailColor;
        if (colorByAltitude) {
          const altDiff = b2.altitude - b1.altitude;
          const timeDiff = (b2.timestamp - b1.timestamp) / 1000;
          const vRate = timeDiff > 0 ? altDiff / timeDiff : 0;
          color = verticalRateToColor(vRate);
        }

        const line = L.polyline(
          [[b1.lat, b1.lon], [b2.lat, b2.lon]],
          { color, weight: trailWidth, opacity: 0.85, smoothFactor: 1 }
        );
        line.addTo(map);
        layersRef.current.push(line);
      }
      segmentCountRef.current = breadcrumbs.length - 1;
    }

    if (!isRecording && breadcrumbs.length >= 2) {
      if (landMarkerRef.current) {
        map.removeLayer(landMarkerRef.current);
        landMarkerRef.current = null;
      }
      const last = breadcrumbs[breadcrumbs.length - 1];
      const marker = L.circleMarker([last.lat, last.lon], {
        radius: 8,
        color: "#CC0000",
        fillColor: "#FF0000",
        fillOpacity: 0.9,
        weight: 2,
      });
      marker.bindTooltip("Landing", { permanent: false });
      marker.addTo(map);
      landMarkerRef.current = marker;
      layersRef.current.push(marker);
    }
  }, [breadcrumbs, map, trailColor, trailWidth, colorByAltitude, isRecording]);

  useEffect(() => {
    return () => {
      for (const layer of layersRef.current) {
        map.removeLayer(layer);
      }
      layersRef.current = [];
      segmentCountRef.current = 0;
      launchMarkerRef.current = null;
      landMarkerRef.current = null;
    };
  }, [map]);

  return null;
}
