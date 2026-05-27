import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { escapeHtml, getAirspaceColor } from '@/lib/xcMapUtils';

export function AirspaceLayer({ data, altitudeFt, disabledTypes, isRecording, verticalSpeed, proximityThresholdFt, onProximityEnter, onProximityExit, dismissedSectorIds, onActiveProximityIds }: {
  data: GeoJSON.FeatureCollection | null;
  altitudeFt: number;
  disabledTypes?: Set<string>;
  isRecording?: boolean;
  verticalSpeed?: number;
  proximityThresholdFt: number;
  onProximityEnter?: () => void;
  onProximityExit?: () => void;
  dismissedSectorIds?: Set<string>;
  onActiveProximityIds?: (ids: Set<string>) => void;
}) {
  const map = useMap();
  const solidLayerRef = useRef<L.GeoJSON | null>(null);
  const flashLayerRef = useRef<L.GeoJSON | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rebuildRef = useRef<(() => void) | null>(null);
  const wasInProximityRef = useRef(false);

  useEffect(() => {
    const onMove = () => { rebuildRef.current?.(); };
    map.on('moveend', onMove);
    return () => { map.off('moveend', onMove); };
  }, [map]);
  const flashVisibleRef = useRef(true);
  const flashIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    function rebuild() {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(doRebuild, 200);
    }

    function doRebuild() {
      if (solidLayerRef.current) solidLayerRef.current.remove();
      if (flashLayerRef.current) flashLayerRef.current.remove();

      if (!data?.features || !Array.isArray(data.features)) return;

      const bounds = map.getBounds();
      const vspeed = verticalSpeed ?? 0;
      const climbing = vspeed > 0.3;
      const descending = vspeed < -0.3;

      const solidFeatures: any[] = [];
      const flashFeatures: any[] = [];
      const activeProxIds = new Set<string>();

      for (const f of data.features) {
        if (f.bbox) {
          const [minLng, minLat, maxLng, maxLat] = f.bbox;
          if (!bounds.intersects([[minLat, minLng], [maxLat, maxLng]])) continue;
        }
        const lower = f.properties?.lowerFt ?? 0;
        if (disabledTypes && disabledTypes.has(f.properties?.typeName)) continue;

        if (isRecording && (climbing || descending)) {
          const diff = lower - altitudeFt;
          const sectorId = f.properties?.id || f.properties?.name || `${f.properties?.typeName}-${lower}`;

          if (climbing && diff > 0 && diff <= proximityThresholdFt) {
            activeProxIds.add(sectorId);
            if (!dismissedSectorIds?.has(sectorId)) {
              flashFeatures.push(f);
            } else {
              solidFeatures.push(f);
            }
          } else if (descending && diff >= -proximityThresholdFt && diff <= 0) {
            activeProxIds.add(sectorId);
            if (!dismissedSectorIds?.has(sectorId)) {
              flashFeatures.push(f);
            } else {
              solidFeatures.push(f);
            }
          } else if (lower <= altitudeFt) {
            solidFeatures.push(f);
          }
        } else {
          if (lower <= altitudeFt) {
            solidFeatures.push(f);
          }
        }
      }

      onActiveProximityIds?.(activeProxIds);

      const undismissedFlashing = flashFeatures.length > 0;
      if (undismissedFlashing && !wasInProximityRef.current) {
        onProximityEnter?.();
      } else if (!undismissedFlashing && wasInProximityRef.current) {
        onProximityExit?.();
      }
      wasInProximityRef.current = undismissedFlashing;

      const makePopup = (feature: any, layer: any) => {
        const p = feature.properties;
        const safeName = escapeHtml(String(p.name || 'Unknown'));
        const safeType = escapeHtml(String(p.typeName || 'OTHER'));
        const safeClass = escapeHtml(String(p.icaoClass || 'UNCLASSIFIED'));
        const lowerLabel = p.lowerFt === 0 ? 'GND' : `${Number(p.lowerFt).toLocaleString()} ft`;
        const upperLabel = `${Number(p.upperFt).toLocaleString()} ft`;
        const certLabel = p.isCertified ? ' (CTAF — Certified)' : p.isUncertified ? ' (Uncertified)' : '';
        layer.bindPopup(
          `<div style="font-family: -apple-system, system-ui, sans-serif; min-width: 180px;">
            <div style="font-weight: 700; font-size: 13px; color: #1d1d1f; margin-bottom: 4px;">${safeName}</div>
            <div style="font-size: 11px; color: #555; line-height: 1.6;">
              <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${getAirspaceColor(p.typeName).stroke};margin-right:4px;vertical-align:middle;"></span>
              ${safeType}${certLabel}<br/>
              Class: ${safeClass}<br/>
              ${lowerLabel} → ${upperLabel}
            </div>
          </div>`,
          { className: 'airspace-popup' }
        );
      };

      const styleFunc = (feature: any) => {
        if (!feature) return {};
        const typeName = feature.properties.typeName;
        const colors = getAirspaceColor(typeName);
        return {
          fillColor: colors.fill,
          color: colors.stroke,
          weight: 2.5,
          fillOpacity: 0.18,
          opacity: 0.85,
        };
      };

      if (solidFeatures.length > 0) {
        const solidLayer = L.geoJSON({ type: 'FeatureCollection', features: solidFeatures } as any, {
          style: styleFunc,
          onEachFeature: makePopup,
        });
        solidLayer.addTo(map);
        solidLayerRef.current = solidLayer;
      }

      if (flashFeatures.length > 0) {
        const flashStyleFunc = (feature: any) => {
          if (!feature) return {};
          const typeName = feature.properties.typeName;
          const colors = getAirspaceColor(typeName);
          return {
            fillColor: colors.fill,
            color: colors.stroke,
            weight: 3.5,
            fillOpacity: 0.35,
            opacity: 1,
            dashArray: '8 4',
          };
        };

        const flashLayer = L.geoJSON({ type: 'FeatureCollection', features: flashFeatures } as any, {
          style: flashStyleFunc,
          onEachFeature: makePopup,
        });
        flashLayer.addTo(map);
        flashLayerRef.current = flashLayer;
      }

      // Start flash interval when flash features exist and recording is active
      if (flashFeatures.length > 0 && isRecording) {
        if (flashIntervalRef.current) clearInterval(flashIntervalRef.current);
        flashIntervalRef.current = setInterval(() => {
          flashVisibleRef.current = !flashVisibleRef.current;
          if (flashLayerRef.current) {
            const opacity = flashVisibleRef.current ? 1 : 0;
            flashLayerRef.current.setStyle({
              fillOpacity: opacity * 0.35,
              opacity: opacity,
            });
          }
        }, 1000);
      } else if (flashIntervalRef.current) {
        clearInterval(flashIntervalRef.current);
        flashIntervalRef.current = null;
      }
    }

    rebuildRef.current = rebuild;
    rebuild();

    return () => {
      if (flashIntervalRef.current) {
        clearInterval(flashIntervalRef.current);
        flashIntervalRef.current = null;
      }
      rebuildRef.current = null;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (solidLayerRef.current) solidLayerRef.current.remove();
      if (flashLayerRef.current) flashLayerRef.current.remove();
      onActiveProximityIds?.(new Set());
      if (wasInProximityRef.current) {
        onProximityExit?.();
        wasInProximityRef.current = false;
      }
    };
  }, [map, data, altitudeFt, disabledTypes, isRecording, verticalSpeed, proximityThresholdFt, onProximityEnter, onProximityExit, dismissedSectorIds, onActiveProximityIds]);

  return null;
}
