import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { BreadcrumbData, MapOrientation } from '@/lib/xcMapUtils';

export function MapFitter({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lon], 9);
  }, [map, lat, lon]);
  return null;
}

export function MapResizer() {
  const map = useMap();
  useEffect(() => {
    const handler = () => {
      setTimeout(() => map.invalidateSize(), 100);
    };
    document.addEventListener('fullscreenchange', handler);
    window.addEventListener('orientationchange', handler);
    window.addEventListener('resize', handler);
    return () => {
      document.removeEventListener('fullscreenchange', handler);
      window.removeEventListener('orientationchange', handler);
      window.removeEventListener('resize', handler);
    };
  }, [map]);
  return null;
}

function bearingBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const wrapperCache = new WeakMap<HTMLElement, HTMLElement>();
const dimensionCache = new WeakMap<HTMLElement, { w: number; h: number }>();

function getOrCreateWrapper(mapContainer: HTMLElement): HTMLElement | null {
  let wrapper = wrapperCache.get(mapContainer);
  if (wrapper && wrapper.parentElement) return wrapper;

  const mapPane = mapContainer.querySelector('.leaflet-map-pane') as HTMLElement | null;
  if (!mapPane || !mapPane.parentElement) return null;

  wrapper = document.createElement('div');
  wrapper.className = 'leaflet-rotate-wrapper';
  wrapper.style.position = 'absolute';
  wrapper.style.inset = '0';
  wrapper.style.willChange = 'transform';
  mapPane.parentElement.insertBefore(wrapper, mapPane);
  wrapper.appendChild(mapPane);
  mapContainer.style.overflow = 'hidden';
  wrapperCache.set(mapContainer, wrapper);
  return wrapper;
}

function getCachedCenter(mapContainer: HTMLElement): { cx: number; cy: number } {
  let cached = dimensionCache.get(mapContainer);
  const w = mapContainer.clientWidth;
  const h = mapContainer.clientHeight;
  if (!cached || cached.w !== w || cached.h !== h) {
    cached = { w, h };
    dimensionCache.set(mapContainer, cached);
  }
  return { cx: cached.w / 2, cy: cached.h / 2 };
}

function applyMapRotation(mapContainer: HTMLElement, rotation: number) {
  const wrapper = getOrCreateWrapper(mapContainer);
  if (!wrapper) return;

  if (rotation === 0) {
    wrapper.style.transform = 'none';
  } else {
    const { cx, cy } = getCachedCenter(mapContainer);
    wrapper.style.transformOrigin = `${cx}px ${cy}px`;
    wrapper.style.transform = `rotate(${rotation}deg) scale(1.42)`;
  }
}

function teardownRotationWrapper(mapContainer: HTMLElement) {
  const wrapper = wrapperCache.get(mapContainer);
  if (!wrapper) return;
  const mapPane = wrapper.querySelector('.leaflet-map-pane') as HTMLElement | null;
  if (mapPane && wrapper.parentElement) {
    wrapper.parentElement.insertBefore(mapPane, wrapper);
    wrapper.remove();
  }
  mapContainer.style.overflow = '';
  wrapperCache.delete(mapContainer);
  dimensionCache.delete(mapContainer);
}

const MOVING_SPEED_THRESHOLD = 5;

function getCompassHeading(e: DeviceOrientationEvent): number | null {
  const wk = (e as any).webkitCompassHeading;
  if (typeof wk === 'number' && isFinite(wk)) return wk;
  if (typeof e.alpha === 'number' && isFinite(e.alpha)) return (360 - e.alpha) % 360;
  return null;
}

export function PilotFollower({ breadcrumbs, followPilot, mapOrientation, pilotPosition }: {
  breadcrumbs?: BreadcrumbData[];
  followPilot?: boolean;
  mapOrientation?: MapOrientation;
  pilotPosition?: { lat: number; lon: number; altitude?: number; speed?: number; heading?: number } | null;
}) {
  const map = useMap();
  const lastRotationRef = useRef(0);
  const compassHeadingRef = useRef<number | null>(null);
  const orientationListenerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null);
  const mapOrientationRef = useRef(mapOrientation);
  mapOrientationRef.current = mapOrientation;
  const lastTrackBearingRef = useRef(0);
  const lastPanRef = useRef<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    if (mapOrientation !== 'track-up') {
      if (orientationListenerRef.current) {
        window.removeEventListener('deviceorientation', orientationListenerRef.current);
        orientationListenerRef.current = null;
      }
      compassHeadingRef.current = null;
      const mapContainer = map.getContainer();
      teardownRotationWrapper(mapContainer);
      lastRotationRef.current = 0;
      lastPanRef.current = null;
      return;
    }

    const handler = (e: DeviceOrientationEvent) => {
      const heading = getCompassHeading(e);
      if (heading === null) return;
      compassHeadingRef.current = heading;
    };
    orientationListenerRef.current = handler;
    window.addEventListener('deviceorientation', handler);
    return () => {
      window.removeEventListener('deviceorientation', handler);
      orientationListenerRef.current = null;
    };
  }, [map, mapOrientation]);

  useEffect(() => {
    if (!followPilot) return;

    const last = breadcrumbs && breadcrumbs.length > 0
      ? breadcrumbs[breadcrumbs.length - 1]
      : null;

    const centerLat = last?.lat ?? pilotPosition?.lat;
    const centerLon = last?.lon ?? pilotPosition?.lon;
    if (centerLat === undefined || centerLon === undefined) return;

    const mapContainer = map.getContainer();

    if (mapOrientation === 'track-up') {
      let heading = 0;
      let useTrack = false;

      if (breadcrumbs && breadcrumbs.length >= 2) {
        const curr = breadcrumbs[breadcrumbs.length - 1];
        const speed = curr.speed ?? 0;
        if (speed >= MOVING_SPEED_THRESHOLD) {
          const prev = breadcrumbs[breadcrumbs.length - 2];
          const dist = Math.abs(curr.lat - prev.lat) + Math.abs(curr.lon - prev.lon);
          if (dist > 0.00001) {
            heading = bearingBetween(prev.lat, prev.lon, curr.lat, curr.lon);
            lastTrackBearingRef.current = heading;
            useTrack = true;
          }
        }
      }

      if (!useTrack) {
        if (compassHeadingRef.current !== null) {
          heading = compassHeadingRef.current;
        } else {
          heading = lastTrackBearingRef.current;
        }
      }

      const rotation = -heading;
      const rotChanged = Math.abs(rotation - lastRotationRef.current) > 0.5;
      const prevPan = lastPanRef.current;
      const posChanged = !prevPan ||
        Math.abs(centerLat - prevPan.lat) > 0.000005 ||
        Math.abs(centerLon - prevPan.lon) > 0.000005;

      if (posChanged || rotChanged) {
        applyMapRotation(mapContainer, 0);
        map.panTo([centerLat, centerLon], { animate: false });
        lastPanRef.current = { lat: centerLat, lon: centerLon };
        lastRotationRef.current = rotation;
        applyMapRotation(mapContainer, rotation);
      }
    } else {
      const containerHeight = mapContainer.clientHeight;
      const bottomOverlayPx = Math.min(containerHeight * 0.22, 120);
      const offsetY = bottomOverlayPx / 2;
      const targetPoint = map.latLngToContainerPoint([centerLat, centerLon]);
      const shiftedPoint = L.point(targetPoint.x, targetPoint.y + offsetY);
      const shiftedLatLng = map.containerPointToLatLng(shiftedPoint);
      map.panTo(shiftedLatLng, { animate: true, duration: 0.3 });
    }
  }, [map, breadcrumbs, followPilot, mapOrientation, pilotPosition]);

  useEffect(() => {
    return () => {
      teardownRotationWrapper(map.getContainer());
    };
  }, [map]);

  return null;
}

export function UserLocationMarker({ location, isRecording }: { location: { lat: number; lon: number }; isRecording?: boolean }) {
  const map = useMap();
  const markerRef = useRef<L.CircleMarker | null>(null);
  const pulseRef = useRef<L.CircleMarker | null>(null);

  useEffect(() => {
    if (markerRef.current) { map.removeLayer(markerRef.current); markerRef.current = null; }
    if (pulseRef.current) { map.removeLayer(pulseRef.current); pulseRef.current = null; }

    if (isRecording) return;

    const pulse = L.circleMarker([location.lat, location.lon], {
      radius: 18,
      color: 'rgba(0, 122, 255, 0.3)',
      weight: 0,
      fillColor: 'rgba(0, 122, 255, 0.15)',
      fillOpacity: 1,
    });
    pulse.addTo(map);
    pulseRef.current = pulse;

    const dot = L.circleMarker([location.lat, location.lon], {
      radius: 7,
      color: '#fff',
      weight: 2,
      fillColor: '#007AFF',
      fillOpacity: 1,
    });
    dot.addTo(map);
    markerRef.current = dot;

    return () => {
      if (markerRef.current) { map.removeLayer(markerRef.current); markerRef.current = null; }
      if (pulseRef.current) { map.removeLayer(pulseRef.current); pulseRef.current = null; }
    };
  }, [map, location.lat, location.lon, isRecording]);

  return null;
}

export function InitialLocator({ location }: { location: { lat: number; lon: number } }) {
  const map = useMap();
  const hasZoomed = useRef(false);

  useEffect(() => {
    if (hasZoomed.current) return;
    hasZoomed.current = true;
    map.flyTo([location.lat, location.lon], 12, { duration: 1.2 });
  }, [map, location.lat, location.lon]);

  return null;
}

export function DriverFollower({ driverPosition, mapOrientation }: {
  driverPosition?: { lat: number; lon: number } | null;
  mapOrientation?: MapOrientation;
}) {
  const map = useMap();
  const lastRotationRef = useRef(0);
  const prevPositionRef = useRef<{ lat: number; lon: number } | null>(null);
  const compassHeadingRef = useRef<number | null>(null);
  const orientationListenerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null);
  const lastTrackBearingRef = useRef(0);

  useEffect(() => {
    if (mapOrientation !== 'track-up') {
      if (orientationListenerRef.current) {
        window.removeEventListener('deviceorientation', orientationListenerRef.current);
        orientationListenerRef.current = null;
      }
      compassHeadingRef.current = null;
      const mapContainer = map.getContainer();
      teardownRotationWrapper(mapContainer);
      lastRotationRef.current = 0;
      return;
    }

    const handler = (e: DeviceOrientationEvent) => {
      const heading = getCompassHeading(e);
      if (heading === null) return;
      compassHeadingRef.current = heading;
    };
    orientationListenerRef.current = handler;
    window.addEventListener('deviceorientation', handler);
    return () => {
      window.removeEventListener('deviceorientation', handler);
      orientationListenerRef.current = null;
    };
  }, [map, mapOrientation]);

  useEffect(() => {
    if (mapOrientation !== 'track-up' || !driverPosition) return;
    const mapContainer = map.getContainer();

    let heading = 0;
    let useTrack = false;
    const prev = prevPositionRef.current;
    if (prev) {
      const dist = Math.abs(driverPosition.lat - prev.lat) + Math.abs(driverPosition.lon - prev.lon);
      if (dist > 0.00005) {
        heading = bearingBetween(prev.lat, prev.lon, driverPosition.lat, driverPosition.lon);
        lastTrackBearingRef.current = heading;
        useTrack = true;
      }
    }
    prevPositionRef.current = { lat: driverPosition.lat, lon: driverPosition.lon };

    if (!useTrack) {
      if (compassHeadingRef.current !== null) {
        heading = compassHeadingRef.current;
      } else {
        heading = lastTrackBearingRef.current;
      }
    }

    const rotation = -heading;
    const rotChanged = Math.abs(rotation - lastRotationRef.current) > 0.5;
    const posChanged = !prev ||
      Math.abs(driverPosition.lat - prev.lat) > 0.000005 ||
      Math.abs(driverPosition.lon - prev.lon) > 0.000005;

    if (posChanged || rotChanged) {
      applyMapRotation(mapContainer, 0);
      map.panTo([driverPosition.lat, driverPosition.lon], { animate: false });
      lastRotationRef.current = rotation;
      applyMapRotation(mapContainer, rotation);
    }
  }, [map, driverPosition, mapOrientation]);

  useEffect(() => {
    return () => {
      teardownRotationWrapper(map.getContainer());
    };
  }, [map]);

  return null;
}

export async function requestCompassPermission(): Promise<boolean> {
  const DOE = DeviceOrientationEvent as any;
  if (typeof DOE.requestPermission === 'function') {
    try {
      const result = await DOE.requestPermission();
      return result === 'granted';
    } catch {
      return false;
    }
  }
  return true;
}
