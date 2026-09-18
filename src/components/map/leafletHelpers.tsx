import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

/**
 * Shared react-leaflet helper components used by DutyPilotMap and RetrievalMap.
 * Page-specific components (AutoFitAll, UserInteractionDetector) remain in their pages.
 */

/**
 * Keeps the Leaflet map sized to its container. Runs an initial invalidate (for
 * maps mounted while hidden/animating) and re-invalidates on resize, fullscreen,
 * and orientation change. Shared by every Leaflet map (XC, retrieval, duty pilot).
 */
export function MapResizer() {
  const map = useMap();
  useEffect(() => {
    const invalidate = () => setTimeout(() => map.invalidateSize(), 100);
    invalidate();
    document.addEventListener('fullscreenchange', invalidate);
    window.addEventListener('orientationchange', invalidate);
    window.addEventListener('resize', invalidate);
    return () => {
      document.removeEventListener('fullscreenchange', invalidate);
      window.removeEventListener('orientationchange', invalidate);
      window.removeEventListener('resize', invalidate);
    };
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
