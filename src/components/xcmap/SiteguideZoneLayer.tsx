import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { escapeHtml } from '@/lib/xcMapUtils';

export const ZONE_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  LZ: { label: 'Landing Zones', color: '#22c55e' },
  NoLZ: { label: 'No Landing', color: '#ef4444' },
  EmgyLZ: { label: 'Emergency LZ', color: '#f97316' },
  NoFly: { label: 'No-Fly Zones', color: '#dc2626' },
  Powerline: { label: 'Powerlines', color: '#eab308' },
  Haz: { label: 'Hazards', color: '#f59e0b' },
  NoLaunch: { label: 'No Launch', color: '#a855f7' },
  Feature: { label: 'Features', color: '#6366f1' },
};

export function SiteguideZoneLayer({ data, disabledZoneTypes }: {
  data: GeoJSON.FeatureCollection | null;
  disabledZoneTypes?: Set<string>;
}) {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rebuildRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const onMove = () => { rebuildRef.current?.(); };
    map.on('moveend', onMove);
    return () => { map.off('moveend', onMove); };
  }, [map]);

  useEffect(() => {
    function rebuild() {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(doRebuild, 400);
    }

    function doRebuild() {
      if (layerRef.current) layerRef.current.remove();

      if (!data?.features || !Array.isArray(data.features)) return;

      const bounds = map.getBounds();
      const filtered: GeoJSON.Feature[] = [];

      for (const f of data.features) {
        const zoneType = f.properties?.zoneType as string | undefined;
        if (disabledZoneTypes && zoneType && disabledZoneTypes.has(zoneType)) continue;

        if (f.geometry.type === 'Polygon') {
          const poly = f.geometry as GeoJSON.Polygon;
          if (poly.coordinates?.[0]) {
            const ring = poly.coordinates[0];
            let intersects = false;
            for (const coord of ring) {
              if (bounds.contains([coord[1], coord[0]])) { intersects = true; break; }
            }
            if (!intersects) {
              const polyBounds = L.geoJSON(f as GeoJSON.Feature).getBounds();
              if (!bounds.intersects(polyBounds)) continue;
            }
          }
        }

        filtered.push(f);
      }

      if (filtered.length === 0) return;

      const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: filtered };
      const layer = L.geoJSON(fc, {
        style: (feature) => {
          if (!feature) return {};
          const props = feature.properties;
          const zoneType = props.zoneType || 'Feature';
          const fillColor = props.fillColor || '#808080';
          const strokeColor = props.strokeColor || '#666666';

          if (zoneType === 'Powerline') {
            return {
              color: strokeColor,
              weight: 3,
              opacity: 0.9,
              dashArray: '8 4',
              fill: false,
            };
          }

          if (zoneType === 'NoFly') {
            return {
              fillColor,
              color: strokeColor,
              weight: 2.5,
              fillOpacity: 0.2,
              opacity: 0.85,
              dashArray: '6 3',
            };
          }

          return {
            fillColor,
            color: strokeColor,
            weight: 2,
            fillOpacity: 0.22,
            opacity: 0.8,
          };
        },
        onEachFeature: (feature, layer) => {
          const p = feature.properties;
          const safeName = escapeHtml(String(p.name || 'Unknown'));
          const info = ZONE_TYPE_LABELS[p.zoneType] || { label: p.zoneType, color: '#808080' };
          const altInfo = p.upperFt != null && p.upperFt > 0
            ? `<br/>Alt: ${p.lowerFt || 0}′ → ${p.upperFt}′`
            : '';
          const descInfo = p.description
            ? `<br/><span style="color:#777;font-size:10px;">${escapeHtml(String(p.description).substring(0, 200))}${String(p.description).length > 200 ? '…' : ''}</span>`
            : '';
          const checkInfo = p.checkType && p.checkType !== 'unknown'
            ? `<br/>Check: ${escapeHtml(p.checkType)}`
            : '';

          layer.bindPopup(
            `<div style="font-family: -apple-system, system-ui, sans-serif; min-width: 160px;">
              <div style="font-weight: 700; font-size: 13px; color: #1d1d1f; margin-bottom: 4px;">${safeName}</div>
              <div style="font-size: 11px; color: #555; line-height: 1.6;">
                <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${info.color};margin-right:4px;vertical-align:middle;"></span>
                ${escapeHtml(info.label)}${altInfo}${checkInfo}${descInfo}
              </div>
            </div>`,
            { className: 'zone-popup' }
          );
        },
      });

      layer.addTo(map);
      layerRef.current = layer;
    }

    rebuildRef.current = rebuild;
    rebuild();

    return () => {
      rebuildRef.current = null;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (layerRef.current) layerRef.current.remove();
    };
  }, [map, data, disabledZoneTypes]);

  return null;
}
