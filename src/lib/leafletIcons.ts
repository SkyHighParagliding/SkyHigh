import L from 'leaflet';
import { escapeHtml } from '@/lib/xcMapUtils';

/**
 * Shared Leaflet icon factories used by DutyPilotMap and RetrievalMap.
 */

export function driverIcon(name: string): L.DivIcon {
  const safeName = escapeHtml(name);
  return L.divIcon({
    className: 'retrieval-driver-icon',
    html: `<div style="position:relative;width:36px;height:36px;">
      <div style="width:36px;height:36px;border-radius:50%;background:rgba(33,150,243,0.9);border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>
      </div>
      <div style="position:absolute;top:-22px;left:50%;transform:translateX(-50%);background:rgba(33,150,243,0.95);color:white;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:600;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.2);">${safeName}</div>
    </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

export function livePilotIcon(name: string, altitudeM: number, verticalSpeed?: number): L.DivIcon {
  const safeName = escapeHtml(name);
  const altFt = Math.round(altitudeM * 3.28084);
  const altM = Math.round(altitudeM);
  const vspeedMps = verticalSpeed || 0;
  const vspeedFpm = Math.round(vspeedMps * 196.85);
  const vspeedColor = vspeedFpm > 0 ? '#4ade80' : vspeedFpm < 0 ? '#f87171' : '#fff';
  const vspeedSign = vspeedFpm > 0 ? '+' : '';
  return L.divIcon({
    className: 'live-pilot-icon',
    html: `<div style="position:relative;width:28px;height:28px;">
      <div style="width:28px;height:28px;border-radius:50%;background:rgba(34,197,94,0.9);border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>
      <div style="position:absolute;top:-22px;left:50%;transform:translateX(-50%);background:rgba(34,197,94,0.95);color:white;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:600;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.2);">${safeName}</div>
      <div style="position:absolute;top:30px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.7);color:white;padding:1px 5px;border-radius:6px;font-size:9px;font-weight:500;white-space:nowrap;">${altM}m / ${altFt}ft</div>
      <div style="position:absolute;top:46px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.75);color:${vspeedColor};padding:1px 5px;border-radius:6px;font-size:9px;font-weight:600;white-space:nowrap;">${vspeedSign}${vspeedFpm} ft/m</div>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}
