import { useEffect, useRef, memo, useMemo } from 'react';
import { useMap } from 'react-leaflet';
import { Marker } from 'react-leaflet';
import L from 'leaflet';
import { escapeHtml, createWindArrowIcon, parseDirection } from '@/lib/xcMapUtils';
import type { XCSite, WindData, LivePilotData } from '@/lib/xcMapUtils';

export function PilotMarker({ position, isRecording, color, verticalSpeed }: {
  position?: { lat: number; lon: number; altitude?: number; speed?: number; heading?: number } | null;
  isRecording?: boolean;
  color?: string;
  verticalSpeed?: number;
}) {
  const map = useMap();
  const markerRef = useRef<L.CircleMarker | null>(null);
  const labelRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (markerRef.current) {
      map.removeLayer(markerRef.current);
      markerRef.current = null;
    }
    if (labelRef.current) {
      map.removeLayer(labelRef.current);
      labelRef.current = null;
    }

    if (!position || !isRecording) return;

    const dotColor = color || '#0ea5e9';
    const dot = L.circleMarker([position.lat, position.lon], {
      radius: 8,
      color: '#fff',
      weight: 2,
      fillColor: dotColor,
      fillOpacity: 0.95,
    });
    dot.addTo(map);
    markerRef.current = dot;

    const hasAlt = position.altitude != null;
    if (hasAlt) {
      const altM = Math.round(position.altitude!);
      const altFt = Math.round(position.altitude! * 3.28084);
      const altText = `${altM}m / ${altFt}ft`;
      const vsFpm = verticalSpeed != null ? Math.round(verticalSpeed * 196.85) : null;
      const vsText = vsFpm != null ? ` <span style="color:${vsFpm > 0 ? '#4ade80' : vsFpm < 0 ? '#fca5a5' : '#fff'}">${vsFpm > 0 ? '+' : ''}${vsFpm}fpm</span>` : '';
      const label = L.marker([position.lat, position.lon], {
        icon: L.divIcon({
          className: 'pilot-alt-label',
          html: `<div style="background:${dotColor};color:#fff;font-size:11px;font-weight:600;padding:1px 5px;border-radius:4px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.5);width:max-content;">${altText}${vsText}</div>`,
          iconSize: [0, 0] as [number, number],
          iconAnchor: [-12, 8],
        }),
        zIndexOffset: 1001,
        interactive: false,
      });
      label.addTo(map);
      labelRef.current = label;
    }

    return () => {
      if (markerRef.current) {
        map.removeLayer(markerRef.current);
        markerRef.current = null;
      }
      if (labelRef.current) {
        map.removeLayer(labelRef.current);
        labelRef.current = null;
      }
    };
  }, [map, position, isRecording, color, verticalSpeed]);

  return null;
}

export const WindArrowMarker = memo(function WindArrowMarker({ lat, lon, site, windData, isSelected }: { lat: number; lon: number; site: XCSite; windData?: WindData | null; isSelected?: boolean }) {
  const map = useMap();
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (markerRef.current) {
      markerRef.current.remove();
    }

    const icon = createWindArrowIcon(windData, isSelected);
    const marker = L.marker([lat, lon], { icon, interactive: true, zIndexOffset: isSelected ? 1000 : 0 });

    const dirDeg = windData ? parseDirection(windData.direction) : null;
    const hasWind = windData && dirDeg !== null && windData.windSpeed !== null;
    const speed = hasWind ? Math.round(windData!.windSpeed!) : null;
    const gust = hasWind && windData!.windGust !== null ? Math.round(windData!.windGust!) : null;
    const dirLabel = windData?.direction ? escapeHtml(String(windData.direction)) : '';
    const windLabel = hasWind
      ? (gust !== null && gust > speed!) ? `${speed} G ${gust} kt ${dirLabel}` : `${speed} kt ${dirLabel}`
      : 'No live data';
    const staleNote = windData?.stale ? ' (stale)' : '';

    marker.bindPopup(
      `<div style="font-family: -apple-system, system-ui, sans-serif; min-width: 140px;">
        <div style="font-weight: 700; font-size: 13px; color: #1d1d1f; margin-bottom: 4px;">${escapeHtml(site.name)}</div>
        <div style="font-size: 11px; color: #555; line-height: 1.6;">
          Wind: ${windLabel}${staleNote}<br/>
          ${site.windDir ? `Preferred: ${escapeHtml(site.windDir)}<br/>` : ''}
          ${site.launchHeight ? `Height: ${escapeHtml(site.launchHeight)}` : ''}
        </div>
      </div>`
    );

    marker.addTo(map);
    markerRef.current = marker;

    return () => {
      if (markerRef.current) {
        markerRef.current.remove();
      }
    };
  }, [map, lat, lon, windData, site, isSelected]);

  return null;
});

export function LivePilotMarkers({ pilots, enableMessaging, currentPilotId }: { pilots: LivePilotData[]; enableMessaging?: boolean; currentPilotId?: string | null }) {
  const map = useMap();
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  useEffect(() => {
    const existing = markersRef.current;
    const currentIds = new Set(pilots.map((p) => p.pilotId));

    for (const [id, marker] of existing) {
      if (!currentIds.has(id)) {
        marker.remove();
        existing.delete(id);
      }
    }

    for (const p of pilots) {
      const altFt = Math.round(p.altitude * 3.281);
      const altM = Math.round(p.altitude);
      const spdKmh = Math.round(p.speed);
      const headingDeg = Math.round(p.heading || 0);
      const vspeedMps = p.verticalSpeed || 0;
      const vspeedFpm = Math.round(vspeedMps * 196.85);
      const safeName = escapeHtml(p.firstName);
      const isLanded = !!p.landed;
      const bgColor = isLanded ? 'rgba(255, 152, 0, 0.9)' : 'rgba(76, 175, 80, 0.9)';
      const badgeBg = isLanded ? 'rgba(255, 152, 0, 0.95)' : 'rgba(76, 175, 80, 0.95)';
      const badgeLabel = isLanded ? `${safeName} (Landed)` : safeName;
      const vspeedColor = vspeedFpm > 0 ? '#4ade80' : vspeedFpm < 0 ? '#f87171' : '#fff';
      const vspeedSign = vspeedFpm > 0 ? '+' : '';
      const vspeedLabel = isLanded ? '' : `<div style="
            position: absolute; top: 40px; left: 50%; transform: translateX(-50%);
            background: rgba(0,0,0,0.75); color: ${vspeedColor};
            padding: 1px 5px; border-radius: 6px; font-size: 9px;
            font-weight: 600; white-space: nowrap;
          ">${vspeedSign}${vspeedFpm} ft/m</div>`;
      const innerContent = isLanded
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none">
             <circle cx="12" cy="12" r="5" fill="white"/>
           </svg>`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" style="transform: rotate(${headingDeg}deg)">
             <path d="M12 2L6 18h12L12 2z" fill="white" stroke="white" stroke-width="1"/>
           </svg>`;
      const icon = L.divIcon({
        className: 'live-pilot-icon',
        html: `<div style="
          position: relative; width: 36px; height: 36px;
        ">
          <div style="
            width: 36px; height: 36px; border-radius: 50%;
            background: ${bgColor};
            border: 2px solid #fff;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            display: flex; align-items: center; justify-content: center;
          ">
            ${innerContent}
          </div>
          <div style="
            position: absolute; top: -22px; left: 50%; transform: translateX(-50%);
            background: ${badgeBg}; color: white;
            padding: 1px 6px; border-radius: 8px; font-size: 10px;
            font-weight: 600; white-space: nowrap;
            box-shadow: 0 1px 4px rgba(0,0,0,0.2);
          ">${badgeLabel}</div>
          ${vspeedLabel}
        </div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -24],
      });

      const vspeedPopup = isLanded ? '' : `Climb: ${vspeedSign}${vspeedFpm} ft/min<br/>`;
      const statusLine = isLanded ? 'Status: Landed' : `Speed: ${spdKmh} km/h<br/>Heading: ${headingDeg}°`;
      const canMessage = enableMessaging && currentPilotId && p.pilotId !== currentPilotId;
      const msgBtn = canMessage
        ? `<button onclick="window.dispatchEvent(new CustomEvent('map-compose-message',{detail:{pilotId:'${p.pilotId.replace(/'/g, "\\'")}',name:'${safeName.replace(/'/g, "\\'")}'}}));this.closest('.leaflet-popup').querySelector('.leaflet-popup-close-button')?.click();" style="display:block;width:100%;margin-top:6px;padding:5px 0;background:#0ea5e9;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">Message</button>`
        : '';
      const popupContent = `<div style="font-size:13px;line-height:1.4">
            <strong>${safeName}</strong><br/>
            Alt: ${altM}m / ${altFt}ft<br/>
            ${vspeedPopup}
            ${statusLine}
            ${msgBtn}
          </div>`;

      const existing_marker = existing.get(p.pilotId);
      if (existing_marker) {
        existing_marker.setLatLng([p.lat, p.lon]);
        existing_marker.setIcon(icon);
        existing_marker.setPopupContent(popupContent);
      } else {
        const marker = L.marker([p.lat, p.lon], {
          icon,
          zIndexOffset: 900,
        });
        marker.bindPopup(popupContent, { className: 'pilot-popup' });
        marker.addTo(map);
        existing.set(p.pilotId, marker);
      }
    }

    return () => {};
  }, [map, pilots, enableMessaging, currentPilotId]);

  useEffect(() => {
    return () => {
      for (const [, marker] of markersRef.current) {
        marker.remove();
      }
      markersRef.current.clear();
    };
  }, []);

  return null;
}

export const DriverMarker = memo(function DriverMarker({ driverLocation }: { driverLocation: { lat: number; lon: number; name: string } }) {
  const icon = useMemo(() => L.divIcon({
    className: 'driver-location-icon',
    html: `<div style="position:relative;width:36px;height:36px;">
      <div style="width:36px;height:36px;border-radius:50%;background:rgba(33,150,243,0.9);border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>
      </div>
      <div style="position:absolute;top:-22px;left:50%;transform:translateX(-50%);background:rgba(33,150,243,0.95);color:white;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:600;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.2);">${driverLocation.name.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
    </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  }), [driverLocation.name]);

  return (
    <Marker
      position={[driverLocation.lat, driverLocation.lon]}
      icon={icon}
    />
  );
});
