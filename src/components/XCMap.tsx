import { useMemo, useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useSettings } from '@/contexts/SettingsContext';
import { FlightTrail } from './FlightTrail';
import { WindFieldLayer } from './WindFieldLayer';
import { useDataUsage } from '@/hooks/useDataUsage';
import type { XCMapProps } from '@/lib/xcMapUtils';
import { destinationPoint, buildRings, parseDistanceRings, BEARINGS, BASEMAPS } from '@/lib/xcMapUtils';
export type { MapOrientation, LivePilotData } from '@/lib/xcMapUtils';

import { BearingLabels } from './xcmap/BearingLabels';
import { AirspaceLayer } from './xcmap/AirspaceLayer';
import { SiteguideZoneLayer } from './xcmap/SiteguideZoneLayer';
import { MapFitter, MapResizer, PilotFollower, UserLocationMarker, InitialLocator } from './xcmap/MapHelpers';
import { PilotMarker, WindArrowMarker, LivePilotMarkers, DriverMarker } from './xcmap/PilotMarkers';
import { DistanceRingsOverlay } from './xcmap/DistanceRingsOverlay';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function MapRefProvider({ onMapReady }: { onMapReady?: (map: L.Map) => void }) {
  const map = useMap();
  const sentRef = useRef(false);
  useEffect(() => {
    if (map && onMapReady && !sentRef.current) {
      sentRef.current = true;
      onMapReady(map);
    }
  }, [map, onMapReady]);
  return null;
}

export function XCMap({ site, showAirspace, altitudeFt, disabledTypes, windData, allSites, windDataMap, breadcrumbs, fullTrailBreadcrumbs, trailColor, trailWidth, splineTension, isRecording, followPilot, mapOrientation, pilotPosition, verticalSpeed, proximityThresholdFt = 250, onProximityEnter, onProximityExit, dismissedSectorIds, onActiveProximityIds, pilotColor, livePilots, driverLocation, isDemo, showWindField, windObservations, windFieldSettings, enableMessaging, currentPilotId, userLocation, isFullscreen, activeBasemap, onMapReady, showZones, zoneData, disabledZoneTypes }: XCMapProps) {
  useDataUsage();
  const { settings } = useSettings();
  const { lat, lon } = site;
  const distances = useMemo(() => parseDistanceRings(settings.xcDistanceRings), [settings.xcDistanceRings]);
  const distanceRings = useMemo(() => buildRings(distances), [distances]);
  const maxRadius = useMemo(() => distanceRings.length > 0 ? distanceRings[distanceRings.length - 1].radius : 100000, [distanceRings]);
  const bearingLineEnd = maxRadius * 1.2;
  const bearingLines = useMemo(() => BEARINGS.map((b) => {
    const end = destinationPoint(lat, lon, b.angle, bearingLineEnd);
    return { positions: [[lat, lon] as [number, number], end], angle: b.angle };
  }), [lat, lon, bearingLineEnd]);

  const currentBasemap = useMemo(() => BASEMAPS.find((b) => b.id === (activeBasemap || 'streets')) || BASEMAPS[0], [activeBasemap]);
  const [airspaceData, setAirspaceData] = useState<any>(null);
  const [airspaceLoading, setAirspaceLoading] = useState(false);

  const shouldShowAirspace = showAirspace;

  useEffect(() => {
    if (shouldShowAirspace && !airspaceData) {
      setAirspaceLoading(true);
      fetch('/api/sites/xc/airspace')
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then((data) => {
          if (data?.type === 'FeatureCollection' && Array.isArray(data.features)) {
            setAirspaceData(data);
          }
        })
        .catch(() => {})
        .finally(() => setAirspaceLoading(false));
    }
  }, [shouldShowAirspace, airspaceData]);

  return (
    <MapContainer
      center={[lat, lon]}
      zoom={9}
      className="w-full h-full rounded-2xl"
      style={{ minHeight: '400px' }}
      zoomControl={false}
      attributionControl={true}
    >
      <MapRefProvider onMapReady={onMapReady} />
      <TileLayer
        key={currentBasemap.id}
        attribution={currentBasemap.attribution + ' | Airspace © <a href="https://www.openaip.net">OpenAIP</a>'}
        url={currentBasemap.url}
      />
      <MapResizer />
      <PilotFollower breadcrumbs={breadcrumbs} followPilot={followPilot} mapOrientation={mapOrientation} pilotPosition={pilotPosition} />
      <MapFitter lat={lat} lon={lon} />
      <BearingLabels lat={lat} lon={lon} distanceRings={distanceRings} />

      {shouldShowAirspace && airspaceData && (
        <AirspaceLayer data={airspaceData} altitudeFt={altitudeFt} disabledTypes={disabledTypes} isRecording={isRecording} verticalSpeed={verticalSpeed} proximityThresholdFt={proximityThresholdFt} onProximityEnter={onProximityEnter} onProximityExit={onProximityExit} dismissedSectorIds={dismissedSectorIds} onActiveProximityIds={onActiveProximityIds} />
      )}

      {showZones && zoneData && (
        <SiteguideZoneLayer data={zoneData} disabledZoneTypes={disabledZoneTypes} />
      )}

      <WindFieldLayer observations={windObservations || []} visible={!!showWindField} settings={windFieldSettings} />

      {allSites && windDataMap ? (
        <>
          {allSites
            .filter((s) => s.useLiveWeather === 'true' && windDataMap[s.id] && !windDataMap[s.id].stale)
            .map((s) => (
              <WindArrowMarker
                key={s.id}
                lat={s.lat}
                lon={s.lon}
                site={s}
                windData={windDataMap[s.id] || null}
                isSelected={s.id === site.id}
              />
            ))}
        </>
      ) : (
        windData && !windData.stale ? (
          <WindArrowMarker lat={lat} lon={lon} site={site} windData={windData} isSelected />
        ) : null
      )}

      <DistanceRingsOverlay lat={lat} lon={lon} distanceRings={distanceRings} bearingLines={bearingLines} />

      {((breadcrumbs && breadcrumbs.length >= 1) || (fullTrailBreadcrumbs && fullTrailBreadcrumbs.length >= 1)) && (
        <FlightTrail
          breadcrumbs={fullTrailBreadcrumbs || breadcrumbs || []}
          trailColor={trailColor}
          trailWidth={trailWidth}
          splineTension={splineTension}
          isRecording={isRecording}
        />
      )}

      {userLocation && (
        <>
          <UserLocationMarker location={userLocation} isRecording={isRecording} />
          {isFullscreen && <InitialLocator location={userLocation} />}
        </>
      )}

      {isRecording && pilotPosition && (
        <PilotMarker position={pilotPosition} isRecording={isRecording} color={pilotColor} verticalSpeed={verticalSpeed} />
      )}

      {livePilots && livePilots.length > 0 && (
        <LivePilotMarkers pilots={livePilots} enableMessaging={enableMessaging} currentPilotId={currentPilotId} />
      )}

      {driverLocation && (
        <DriverMarker driverLocation={driverLocation} />
      )}
    </MapContainer>
  );
}
