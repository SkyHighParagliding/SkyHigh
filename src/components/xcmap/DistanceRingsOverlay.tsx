import { memo, useMemo } from 'react';
import { Polyline } from 'react-leaflet';
import { destinationPoint, type buildRings } from '@/lib/xcMapUtils';

// Rings are closed polylines, not <Circle>s. Leaflet clips polylines to the
// viewport but draws a Circle's whole arc: zoomed in, a 100 km dashed ring is
// hundreds of thousands of pixels round and iOS Safari froze for 20-30 s
// rasterising every dash. 1° steps sag < 4 m on a 100 km ring.
const RING_STEPS = 360;

function ringPositions(lat: number, lon: number, radius: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= RING_STEPS; i++) pts.push(destinationPoint(lat, lon, (i * 360) / RING_STEPS, radius));
  return pts;
}

export const DistanceRingsOverlay = memo(function DistanceRingsOverlay({ lat, lon, distanceRings, bearingLines }: {
  lat: number;
  lon: number;
  distanceRings: ReturnType<typeof buildRings>;
  bearingLines: { positions: [number, number][]; angle: number }[];
}) {
  const rings = useMemo(
    () => distanceRings.map((ring) => ({ ...ring, positions: ringPositions(lat, lon, ring.radius) })),
    [lat, lon, distanceRings],
  );

  return (
    <>
      {rings.map((ring) => (
        <Polyline
          key={ring.radius}
          positions={ring.positions}
          pathOptions={{
            color: ring.color,
            weight: 2,
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
