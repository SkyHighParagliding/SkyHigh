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

// MapResizer moved to components/map/leafletHelpers (single shared impl).

function bearingBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Track-up rotation. The map pane is rotated inside a wrapper. So no angle
// leaves blank corners, the Leaflet container is enlarged to a square the size
// of the visible area's diagonal, centred on it with negative margins (page
// layout doesn't move) and clipped by its parent; Leaflet then loads tiles for
// the whole square. The control container (attribution) is pinned back over
// the visible area so it stays upright and on screen.
interface RotationState {
  wrapper: HTMLElement;
  savedStyle: string;
  savedParentOverflow: string;
  observer: ResizeObserver | null;
}
const rotationState = new WeakMap<HTMLElement, RotationState>();

function enlargeContainer(map: L.Map, st: RotationState) {
  const c = map.getContainer();
  // Visible area = the parent box (XCMap's container has min-height 400px and
  // can hang below a short landscape screen; the parent is what's clipped to).
  const box = c.parentElement ?? c;
  const w = box.clientWidth || c.clientWidth;
  const h = box.clientHeight || c.clientHeight;
  const d = Math.ceil(Math.hypot(w, h));
  // !important: XCMaps' fullscreen CSS forces the container to 100% !important.
  const set = (prop: string, value: string) => c.style.setProperty(prop, value, 'important');
  set('width', `${d}px`); set('height', `${d}px`); set('min-height', '0');
  set('margin-left', `${(w - d) / 2}px`); set('margin-right', `${(w - d) / 2}px`);
  set('margin-top', `${(h - d) / 2}px`); set('margin-bottom', `${(h - d) / 2}px`);
  const controls = c.querySelector('.leaflet-control-container') as HTMLElement | null;
  if (controls) controls.style.cssText = `position:absolute;left:${(d - w) / 2}px;top:${(d - h) / 2}px;width:${w}px;height:${h}px;pointer-events:none;`;
  st.wrapper.style.transformOrigin = `${d / 2}px ${d / 2}px`;
  map.invalidateSize({ animate: false });
}

function restoreContainer(map: L.Map, st: RotationState) {
  const c = map.getContainer();
  c.style.cssText = st.savedStyle;
  const controls = c.querySelector('.leaflet-control-container') as HTMLElement | null;
  if (controls) controls.style.cssText = '';
}

function getRotationState(map: L.Map): RotationState | null {
  const c = map.getContainer();
  const existing = rotationState.get(c);
  if (existing && existing.wrapper.parentElement) return existing;

  const mapPane = c.querySelector('.leaflet-map-pane') as HTMLElement | null;
  if (!mapPane || !mapPane.parentElement) return null;

  const wrapper = document.createElement('div');
  wrapper.className = 'leaflet-rotate-wrapper';
  wrapper.style.position = 'absolute';
  wrapper.style.inset = '0';
  wrapper.style.willChange = 'transform';
  mapPane.parentElement.insertBefore(wrapper, mapPane);
  wrapper.appendChild(mapPane);

  const parent = c.parentElement;
  const st: RotationState = {
    wrapper,
    savedStyle: c.style.cssText,
    savedParentOverflow: parent?.style.overflow ?? '',
    observer: null,
  };
  if (parent) parent.style.overflow = 'hidden';
  enlargeContainer(map, st);

  // Re-fit when the visible area changes (fullscreen toggle, phone turned).
  if (parent && typeof ResizeObserver !== 'undefined') {
    let last = `${parent.clientWidth}x${parent.clientHeight}`;
    st.observer = new ResizeObserver(() => {
      const now = `${parent.clientWidth}x${parent.clientHeight}`;
      if (now === last) return;
      last = now;
      restoreContainer(map, st);
      enlargeContainer(map, st);
    });
    st.observer.observe(parent);
  }
  rotationState.set(c, st);
  return st;
}

function applyMapRotation(map: L.Map, rotation: number) {
  const st = getRotationState(map);
  if (st) st.wrapper.style.transform = `rotate(${rotation}deg)`;
}

function teardownRotationWrapper(map: L.Map) {
  const c = map.getContainer();
  const st = rotationState.get(c);
  if (!st) return;
  st.observer?.disconnect();
  const mapPane = st.wrapper.querySelector('.leaflet-map-pane') as HTMLElement | null;
  if (mapPane && st.wrapper.parentElement) {
    st.wrapper.parentElement.insertBefore(mapPane, st.wrapper);
    st.wrapper.remove();
  }
  restoreContainer(map, st);
  if (c.parentElement) c.parentElement.style.overflow = st.savedParentOverflow;
  rotationState.delete(c);
  try { map.invalidateSize({ animate: false }); } catch { /* map already removed on unmount */ }
}

const MOVING_SPEED_THRESHOLD = 5;
// Compass jitters; ignore changes smaller than this when rotating from it.
const COMPASS_MIN_CHANGE_DEG = 2;

function angleDiff(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

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
  // True while the heading comes from GPS movement; the compass then stays out of it.
  const usingTrackRef = useRef(false);
  const followPilotRef = useRef(followPilot);
  followPilotRef.current = followPilot;

  useEffect(() => {
    if (mapOrientation !== 'track-up') {
      if (orientationListenerRef.current) {
        window.removeEventListener('deviceorientation', orientationListenerRef.current);
        orientationListenerRef.current = null;
      }
      compassHeadingRef.current = null;
      teardownRotationWrapper(map);
      lastRotationRef.current = 0;
      lastPanRef.current = null;
      return;
    }

    // Standing still (e.g. at launch) the compass turns the map directly,
    // at most once per frame, rather than waiting for the next GPS fix.
    let frame = 0;
    const handler = (e: DeviceOrientationEvent) => {
      const heading = getCompassHeading(e);
      if (heading === null) return;
      compassHeadingRef.current = heading;
      if (frame || usingTrackRef.current || !followPilotRef.current) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const h = compassHeadingRef.current;
        if (h === null || usingTrackRef.current) return;
        if (angleDiff(-h, lastRotationRef.current) < COMPASS_MIN_CHANGE_DEG) return;
        lastRotationRef.current = -h;
        applyMapRotation(map, -h);
      });
    };
    orientationListenerRef.current = handler;
    window.addEventListener('deviceorientation', handler);
    return () => {
      window.removeEventListener('deviceorientation', handler);
      if (frame) cancelAnimationFrame(frame);
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

      // Not recording: no breadcrumbs, so use the GPS course when moving.
      if (!useTrack && pilotPosition && (pilotPosition.speed ?? 0) >= MOVING_SPEED_THRESHOLD &&
          typeof pilotPosition.heading === 'number' && isFinite(pilotPosition.heading)) {
        heading = pilotPosition.heading;
        lastTrackBearingRef.current = heading;
        useTrack = true;
      }

      if (!useTrack) {
        if (compassHeadingRef.current !== null) {
          heading = compassHeadingRef.current;
        } else {
          heading = lastTrackBearingRef.current;
        }
      }
      usingTrackRef.current = useTrack;

      const rotation = -heading;
      const rotChanged = angleDiff(rotation, lastRotationRef.current) > 0.5;
      const prevPan = lastPanRef.current;
      const posChanged = !prevPan ||
        Math.abs(centerLat - prevPan.lat) > 0.000005 ||
        Math.abs(centerLon - prevPan.lon) > 0.000005;

      if (posChanged || rotChanged) {
        map.panTo([centerLat, centerLon], { animate: false });
        lastPanRef.current = { lat: centerLat, lon: centerLon };
        lastRotationRef.current = rotation;
        applyMapRotation(map, rotation);
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
      teardownRotationWrapper(map);
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
      teardownRotationWrapper(map);
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
      map.panTo([driverPosition.lat, driverPosition.lon], { animate: false });
      lastRotationRef.current = rotation;
      applyMapRotation(map, rotation);
    }
  }, [map, driverPosition, mapOrientation]);

  useEffect(() => {
    return () => {
      teardownRotationWrapper(map);
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
