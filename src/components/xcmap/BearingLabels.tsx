import { useEffect, useRef, memo } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { destinationPoint, BEARINGS, type buildRings } from '@/lib/xcMapUtils';

export const BearingLabels = memo(function BearingLabels({ lat, lon, distanceRings }: { lat: number; lon: number; distanceRings: ReturnType<typeof buildRings> }) {
  const map = useMap();
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (layerRef.current) {
      layerRef.current.remove();
    }

    const group = L.layerGroup();

    distanceRings.forEach((ring) => {
      BEARINGS.forEach((bearing) => {
        const [labelLat, labelLon] = destinationPoint(lat, lon, bearing.angle, ring.radius);
        const marker = L.marker([labelLat, labelLon], {
          icon: L.divIcon({
            className: 'xc-ring-label',
            html: `<span style="
              background: rgba(255,255,255,0.85);
              backdrop-filter: blur(8px);
              -webkit-backdrop-filter: blur(8px);
              padding: 1px 4px;
              border-radius: 4px;
              font-size: 9px;
              font-weight: 600;
              color: #007aff;
              white-space: nowrap;
              border: 1px solid rgba(0,122,255,0.15);
              pointer-events: none;
            ">${ring.label}</span>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          }),
          interactive: false,
        });
        group.addLayer(marker);
      });
    });

    const maxRadius = distanceRings.length > 0 ? distanceRings[distanceRings.length - 1].radius : 100000;
    const bearingEndDistance = maxRadius * 1.1;

    BEARINGS.forEach((bearing) => {
      const endPoint = destinationPoint(lat, lon, bearing.angle, bearingEndDistance);
      const marker = L.marker(endPoint, {
        icon: L.divIcon({
          className: 'xc-bearing-label',
          html: `<span style="
            background: rgba(255,255,255,0.9);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            padding: 2px 6px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 700;
            color: #1d1d1f;
            white-space: nowrap;
            border: 1px solid rgba(0,0,0,0.08);
            box-shadow: 0 1px 4px rgba(0,0,0,0.08);
            pointer-events: none;
          ">${bearing.label}</span>`,
          iconSize: [0, 0],
          iconAnchor: [-4, 8],
        }),
        interactive: false,
      });
      group.addLayer(marker);
    });

    group.addTo(map);
    layerRef.current = group;

    return () => {
      if (layerRef.current) {
        layerRef.current.remove();
      }
    };
  }, [map, lat, lon, distanceRings]);

  return null;
});
