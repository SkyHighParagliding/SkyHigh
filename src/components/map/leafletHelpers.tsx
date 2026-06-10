import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

/**
 * Shared react-leaflet helper components used by DutyPilotMap and RetrievalMap.
 * Page-specific components (AutoFitAll, UserInteractionDetector) remain in their pages.
 */

export function MapResizer() {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 200);
    const handler = () => setTimeout(() => map.invalidateSize(), 100);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [map]);
  return null;
}

export function MapControlBridge({
  mapRef,
  onZoomIn,
  onZoomOut,
}: {
  mapRef: React.MutableRefObject<L.Map | null>;
  onZoomIn: React.MutableRefObject<() => void>;
  onZoomOut: React.MutableRefObject<() => void>;
}) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
    onZoomIn.current = () => map.zoomIn();
    onZoomOut.current = () => map.zoomOut();
    return () => { mapRef.current = null; };
  }, [map, mapRef, onZoomIn, onZoomOut]);
  return null;
}
