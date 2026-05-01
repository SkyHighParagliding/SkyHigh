import { memo } from 'react';
import { Circle, Polyline } from 'react-leaflet';
import type { buildRings } from '@/lib/xcMapUtils';

export const DistanceRingsOverlay = memo(function DistanceRingsOverlay({ lat, lon, distanceRings, bearingLines }: {
  lat: number;
  lon: number;
  distanceRings: ReturnType<typeof buildRings>;
  bearingLines: { positions: [number, number][]; angle: number }[];
}) {
  return (
    <>
      {distanceRings.map((ring) => (
        <Circle
          key={ring.radius}
          center={[lat, lon]}
          radius={ring.radius}
          pathOptions={{
            color: ring.color,
            weight: 2,
            fillColor: 'transparent',
            fillOpacity: 0,
            dashArray: ring.dash,
          }}
        />
      ))}
      {bearingLines.map((line) => (
        <Polyline
          key={line.angle}
          positions={line.positions}
          pathOptions={{
            color: 'rgba(0, 122, 255, 0.25)',
            weight: 1,
            dashArray: '4 4',
          }}
        />
      ))}
    </>
  );
});
