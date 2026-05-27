import { useState, useEffect, useRef, memo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Navigation, X as XIcon, CheckCircle, Car, MapPin, ChevronDown, ChevronUp, Maximize, Minimize, Plus, Minus, Map as MapIcon, Compass } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { PilotLoginModal } from '@/components/PilotLoginModal';
import { MapMessaging } from '@/components/MapMessaging';
import 'leaflet/dist/leaflet.css';
import { useRetrievalMap } from '@/hooks/useRetrievalMap';
import type { LivePilotData, RouteInfo, RetrievalRecord } from '@/hooks/useRetrievalMap';
import { BASEMAPS } from '@/lib/xcMapUtils';
import type { MapOrientation } from '@/lib/xcMapUtils';
import { DriverFollower, requestCompassPermission } from '@/components/xcmap/MapHelpers';

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function pilotIcon(name: string, driverName?: string | null, positionSource?: 'phone' | 'satellite') {
  const safeName = escapeHtml(name);
  const safeDriverName = driverName ? escapeHtml(driverName) : null;
  const isSatellite = positionSource === 'satellite';
  const badge = safeDriverName ? `<div style="position:absolute;top:-18px;left:50%;transform:translateX(-50%);background:rgba(33,150,243,0.95);color:white;padding:1px 6px;border-radius:8px;font-size:9px;font-weight:600;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.2);">🚗 ${safeDriverName}</div>` : '';
  const satBadge = isSatellite ? `<div style="position:absolute;bottom:-14px;left:50%;transform:translateX(-50%);background:rgba(99,102,241,0.95);color:white;padding:0px 4px;border-radius:6px;font-size:8px;font-weight:600;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.2);">📡 SAT</div>` : '';
  return L.divIcon({
    className: 'retrieval-pilot-icon',
    html: `<div style="position:relative;width:36px;height:36px;">
      <div style="width:36px;height:36px;border-radius:50%;background:${isSatellite ? 'rgba(99,102,241,0.9)' : 'rgba(255,152,0,0.9)'};border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="5" fill="white"/></svg>
      </div>
      <div style="position:absolute;top:${safeDriverName ? '-36' : '-22'}px;left:50%;transform:translateX(-50%);background:${isSatellite ? 'rgba(99,102,241,0.95)' : 'rgba(255,152,0,0.95)'};color:white;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:600;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.2);">${safeName}</div>
      ${badge}
      ${satBadge}
    </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function dutyPilotNavIcon(name: string) {
  const safeName = escapeHtml(name);
  return L.divIcon({
    className: 'duty-pilot-nav-icon',
    html: `<div style="position:relative;width:36px;height:36px;">
      <div style="width:36px;height:36px;border-radius:50%;background:rgba(147,51,234,0.9);border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
      </div>
      <div style="position:absolute;top:-22px;left:50%;transform:translateX(-50%);background:rgba(147,51,234,0.95);color:white;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:600;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.2);">${safeName}</div>
    </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function launchSiteIcon(name: string) {
  const safeName = escapeHtml(name);
  return L.divIcon({
    className: 'launch-site-icon',
    html: `<div style="position:relative;width:36px;height:36px;">
      <div style="width:36px;height:36px;border-radius:50%;background:rgba(16,185,129,0.9);border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M14 6l-1-2H5v17h2v-7h5l1 2h7V6h-6zm4 8h-4l-1-2H7V6h5l1 2h5v6z"/></svg>
      </div>
      <div style="position:absolute;top:-22px;left:50%;transform:translateX(-50%);background:rgba(16,185,129,0.95);color:white;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:600;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.2);">${safeName}</div>
    </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function driverIcon(name: string) {
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

function livePilotIcon(name: string, altitudeM: number, verticalSpeed?: number) {
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

const RouteLine = memo(function RouteLine({ route }: { route: RouteInfo }) {
  const map = useMap();
  const layerRef = useRef<L.Polyline | null>(null);

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    if (route.coords.length < 2) return;

    const polyline = L.polyline(route.coords, {
      color: '#2563eb',
      weight: 4,
      opacity: 0.7,
      dashArray: '8, 6',
      lineCap: 'round',
    }).addTo(map);

    layerRef.current = polyline;

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, route]);

  return null;
});

function AutoFitLivePilots({ livePilots, retrievals, driverPos, trackingTarget }: { livePilots: LivePilotData[]; retrievals: RetrievalRecord[]; driverPos: { lat: number; lon: number } | null; trackingTarget: 'driver' | 'pilot' | null }) {
  const map = useMap();
  const prevCountRef = useRef(0);
  const hasFittedRef = useRef(false);

  useEffect(() => {
    const points: [number, number][] = [];
    livePilots.filter(p => !p.landed).forEach(p => points.push([p.lat, p.lon]));
    retrievals.filter(r => r.pilotLat != null && r.pilotLon != null).forEach(r => points.push([r.pilotLat!, r.pilotLon!]));
    if (driverPos) points.push([driverPos.lat, driverPos.lon]);

    const currentCount = livePilots.filter(p => !p.landed).length + retrievals.filter(r => r.pilotLat != null && r.pilotLon != null).length;

    if (points.length > 0 && !hasFittedRef.current) {
      const bounds = L.latLngBounds(points.map(p => L.latLng(p[0], p[1])));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
      hasFittedRef.current = true;
    } else if (points.length > 0 && currentCount !== prevCountRef.current) {
      const bounds = L.latLngBounds(points.map(p => L.latLng(p[0], p[1])));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }

    prevCountRef.current = currentCount;
  }, [map, livePilots, retrievals]);

  useEffect(() => {
    if (trackingTarget === 'driver' && driverPos) {
      map.panTo([driverPos.lat, driverPos.lon], { animate: true, duration: 0.3 });
    }
  }, [map, trackingTarget, driverPos]);

  return null;
}

function FitBounds({ retrievals }: { retrievals: RetrievalRecord[] }) {
  const map = useMap();
  const fittedRef = useRef(false);

  useEffect(() => {
    if (fittedRef.current || retrievals.length === 0) return;
    const points = retrievals
      .filter(r => r.pilotLat != null && r.pilotLon != null)
      .map(r => [r.pilotLat!, r.pilotLon!] as [number, number]);
    if (points.length > 0) {
      const bounds = L.latLngBounds(points.map(p => L.latLng(p[0], p[1])));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
      fittedRef.current = true;
    }
  }, [map, retrievals]);

  return null;
}

const MapControls = memo(function MapControls({ onZoomIn, onZoomOut, activeBasemap, onSwitchBasemap, mapOrientation, onToggleOrientation }: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  activeBasemap: string;
  onSwitchBasemap: (id: string) => void;
  mapOrientation: MapOrientation;
  onToggleOrientation: () => void;
}) {
  const handleCycleBasemap = useCallback(() => {
    const idx = BASEMAPS.findIndex(b => b.id === activeBasemap);
    onSwitchBasemap(BASEMAPS[(idx + 1) % BASEMAPS.length].id);
  }, [activeBasemap, onSwitchBasemap]);

  return (
    <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-2">
      <div className="flex flex-col rounded-lg overflow-hidden shadow-md" style={{ border: '1px solid rgba(0,0,0,0.1)' }}>
        <button
          onClick={onZoomIn}
          onTouchEnd={(e) => { e.preventDefault(); onZoomIn(); }}
          className="flex items-center justify-center min-h-[44px] min-w-[44px] transition-all"
          style={{ background: 'rgba(255,255,255,0.95)', color: '#1d1d1f', touchAction: 'manipulation', borderBottom: '1px solid rgba(0,0,0,0.1)' }}
          title="Zoom in"
        >
          <Plus className="w-[20px] h-[20px]" />
        </button>
        <button
          onClick={onZoomOut}
          onTouchEnd={(e) => { e.preventDefault(); onZoomOut(); }}
          className="flex items-center justify-center min-h-[44px] min-w-[44px] transition-all"
          style={{ background: 'rgba(255,255,255,0.95)', color: '#1d1d1f', touchAction: 'manipulation' }}
          title="Zoom out"
        >
          <Minus className="w-[20px] h-[20px]" />
        </button>
      </div>
      <button
        onClick={handleCycleBasemap}
        onTouchEnd={(e) => { e.preventDefault(); handleCycleBasemap(); }}
        className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg shadow-md transition-all"
        style={{ background: 'rgba(255,255,255,0.95)', color: '#1d1d1f', border: '1px solid rgba(0,0,0,0.1)', touchAction: 'manipulation' }}
        title={`Map style: ${BASEMAPS.find(b => b.id === activeBasemap)?.label || 'Streets'}`}
      >
        <MapIcon className="w-[18px] h-[18px]" />
      </button>
      <button
        onClick={onToggleOrientation}
        onTouchEnd={(e) => { e.preventDefault(); onToggleOrientation(); }}
        className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg shadow-md transition-all"
        style={{
          background: mapOrientation === 'track-up' ? '#007aff' : 'rgba(255,255,255,0.95)',
          color: mapOrientation === 'track-up' ? 'white' : '#1d1d1f',
          border: mapOrientation === 'track-up' ? '1px solid #007aff' : '1px solid rgba(0,0,0,0.1)',
          touchAction: 'manipulation',
        }}
        title={mapOrientation === 'track-up' ? 'Switch to north-up' : 'Switch to track-up (direction of travel)'}
      >
        <Compass className="w-[18px] h-[18px]" />
      </button>
    </div>
  );
});


function MapResizer() {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 200);
    const handler = () => setTimeout(() => map.invalidateSize(), 100);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [map]);
  return null;
}

function MapControlBridge({ mapRef, onZoomIn, onZoomOut }: { mapRef: React.MutableRefObject<L.Map | null>; onZoomIn: React.MutableRefObject<() => void>; onZoomOut: React.MutableRefObject<() => void> }) {
  const map = useMap();

  useEffect(() => {
    mapRef.current = map;
    onZoomIn.current = () => map.zoomIn();
    onZoomOut.current = () => map.zoomOut();
    return () => { mapRef.current = null; };
  }, [map, mapRef, onZoomIn, onZoomOut]);

  return null;
}

function UserInteractionDetector({ onInteraction }: { onInteraction: () => void }) {
  const map = useMap();

  useEffect(() => {
    const onDragStart = () => onInteraction();
    map.on('dragstart', onDragStart);
    return () => { map.off('dragstart', onDragStart); };
  }, [map, onInteraction]);

  return null;
}

export function RetrievalMap() {
  const map = useRetrievalMap();
  const {
    pilot, token, demoRole, isDemo, demoSession, apiBase,
    showLogin, setShowLogin,
    retrievals, livePilots,
    selectedPilotId, setSelectedPilotId,
    listCollapsed, setListCollapsed,
    actionLoading, actionError, setActionError,
    isFullscreen, setIsFullscreen,
    driverPosState, mapRef, zoomInRef, zoomOutRef,
    activeBasemap, setActiveBasemap,
    handleZoomIn, handleZoomOut,
    routes, composeTarget, setComposeTarget,
    dutyPilotPos, launchSite,
    returnRoute, returnTarget,
    handleClaim, handleUnclaim, handleComplete,
    zoomToDriver, zoomToPilot, zoomToAll,
    navigateToTarget, cancelReturnRoute,
    fetchRetrievals, fetchLivePilots,
    apiOpts, mapHeaders,
  } = map;
  const [trackingTarget, setTrackingTarget] = useState<'driver' | 'pilot' | null>(null);
  const clearTracking = useCallback(() => setTrackingTarget(null), []);
  const [mapOrientation, setMapOrientation] = useState<MapOrientation>('north-up');
  const handleToggleOrientation = useCallback(async () => {
    if (mapOrientation === 'north-up') {
      const granted = await requestCompassPermission();
      if (!granted) return;
    }
    setMapOrientation(o => o === 'north-up' ? 'track-up' : 'north-up');
  }, [mapOrientation]);

  if (!pilot) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: 'var(--tmpl-body-bg, #f5f5f7)' }}>
        <div className="max-w-md w-full p-8 rounded-2xl text-center" style={{ background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(20px)', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
          <Car className="w-12 h-12 text-[#007aff] mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2" style={{ color: '#1d1d1f' }}>Retrieval Driver</h2>
          <p className="text-sm mb-4" style={{ color: '#86868b' }}>
            Sign in to view unretrieved pilots and manage pickups.
          </p>
          <button
            onClick={() => setShowLogin(true)}
            className="bg-[#007aff] text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-[#0066d6] mb-4"
          >
            Sign In
          </button>
          <div className="text-left p-3 rounded-lg" style={{ background: 'rgba(255,149,0,0.08)', border: '1px solid rgba(255,149,0,0.2)' }}>
            <p className="text-xs font-medium" style={{ color: '#c47600' }}>Offline Maps Tip</p>
            <p className="text-xs mt-1" style={{ color: '#86868b' }}>
              Flying sites are often in areas with poor mobile coverage. Download offline maps for your area in Google Maps (or your preferred navigation app) before heading out, so navigation works even without signal.
            </p>
          </div>
        </div>
        {showLogin && <PilotLoginModal onClose={() => setShowLogin(false)} />}
      </div>
    );
  }

  const defaultCenter: [number, number] = isDemo ? [-36.18, 147.98] : [-38.1, 145.2];
  const containerClass = isFullscreen
    ? 'fixed inset-0 z-[9999] w-screen h-screen flex flex-col'
    : 'h-screen flex flex-col';

  return (
    <div className={containerClass}>
      {!isFullscreen && (
        <div className="flex items-center gap-3 px-4 py-3 bg-white border-b shadow-sm shrink-0">
          <Link to="/xc/maps" className="p-1 hover:bg-gray-100 rounded">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <Car className="w-5 h-5 text-[#007aff]" />
          <h1 className="font-semibold text-lg flex-1" style={{ color: '#1d1d1f' }}>Retrieval Driver</h1>
          <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-600 font-medium">
            {retrievals.length} pilot{retrievals.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      <div className="flex-1 relative">
        <MapContainer
          center={defaultCenter}
          zoom={10}
          style={{ height: '100%', width: '100%', position: 'absolute', inset: 0 }}
          zoomControl={false}
        >
          <TileLayer
            key={activeBasemap}
            attribution={BASEMAPS.find(b => b.id === activeBasemap)?.attribution || ''}
            url={BASEMAPS.find(b => b.id === activeBasemap)?.url || BASEMAPS[0].url}
          />
          <MapResizer />
          <AutoFitLivePilots livePilots={livePilots} retrievals={retrievals} driverPos={driverPosState} trackingTarget={trackingTarget} />
          <MapControlBridge mapRef={mapRef} onZoomIn={zoomInRef} onZoomOut={zoomOutRef} />
          <UserInteractionDetector onInteraction={clearTracking} />
          <DriverFollower driverPosition={driverPosState} mapOrientation={mapOrientation} />

          {retrievals.map(r => {
            if (r.pilotLat == null || r.pilotLon == null) return null;
            return (
              <Marker
                key={`pilot-${r.pilotId}`}
                position={[r.pilotLat, r.pilotLon]}
                icon={pilotIcon(r.pilotName, r.driverName, r.positionSource)}
                eventHandlers={{ click: () => setSelectedPilotId(r.pilotId) }}
              >
                <Popup>
                  <div className="text-sm">
                    <strong>{r.pilotName}</strong>
                    {r.positionSource === 'satellite' && (
                      <div className="text-indigo-600 text-xs font-medium">via satellite tracker</div>
                    )}
                    {r.driverName && <div className="text-blue-600">🚗 {r.driverName} en route</div>}
                    {(() => {
                      const rt = routes.find(ro => ro.pilotId === r.pilotId);
                      if (!rt) return null;
                      const mins = Math.round(rt.durationMin);
                      const dist = rt.distanceKm < 1 ? `${Math.round(rt.distanceKm * 1000)}m` : `${rt.distanceKm.toFixed(1)}km`;
                      return <div className="text-blue-500 font-medium">{dist} · {mins < 1 ? '<1' : mins} min ETA</div>;
                    })()}
                    {r.pilotId !== pilot?.id && <button onClick={() => { setComposeTarget({ pilotId: r.pilotId, name: r.pilotName }); mapRef.current?.closePopup(); }} style={{display:'block',width:'100%',marginTop:6,padding:'5px 0',background:'#0ea5e9',color:'#fff',border:'none',borderRadius:6,fontSize:11,fontWeight:600,cursor:'pointer'}}>Message</button>}
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {livePilots.filter(p => !p.landed).map(p => {
            const vFpm = Math.round((p.verticalSpeed || 0) * 196.85);
            const vSign = vFpm > 0 ? '+' : '';
            return (
              <Marker
                key={`live-${p.pilotId}`}
                position={[p.lat, p.lon]}
                icon={livePilotIcon(p.firstName, p.altitude, p.verticalSpeed)}
              >
                <Popup>
                  <div className="text-sm">
                    <strong>{p.firstName}</strong>
                    <div className="text-green-600">In flight — {Math.round(p.altitude)}m / {Math.round(p.speed)} km/h</div>
                    <div style={{ color: vFpm > 0 ? '#16a34a' : vFpm < 0 ? '#dc2626' : '#666' }}>{vSign}{vFpm} ft/min</div>
                    {p.pilotId !== pilot?.id && <button onClick={() => { setComposeTarget({ pilotId: p.pilotId, name: p.firstName }); mapRef.current?.closePopup(); }} style={{display:'block',width:'100%',marginTop:6,padding:'5px 0',background:'#0ea5e9',color:'#fff',border:'none',borderRadius:6,fontSize:11,fontWeight:600,cursor:'pointer'}}>Message</button>}
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {retrievals
            .filter(r => r.status === 'claimed' && r.driverLat != null && r.driverLon != null && r.driverId != null)
            .filter((r, i, arr) => arr.findIndex(a => a.driverId === r.driverId) === i)
            .filter(r => r.driverId !== pilot?.id)
            .map(r => (
              <Marker
                key={`driver-${r.driverId}`}
                position={[r.driverLat!, r.driverLon!]}
                icon={driverIcon(r.driverName || 'Driver')}
              >
                <Popup>
                  <div className="text-sm">
                    <strong>{r.driverName || 'Driver'}</strong>
                    <div className="text-blue-600">En route to {r.pilotName}</div>
                    <button onClick={() => { setComposeTarget({ pilotId: r.driverId!, name: r.driverName || 'Driver' }); mapRef.current?.closePopup(); }} style={{display:'block',width:'100%',marginTop:6,padding:'5px 0',background:'#0ea5e9',color:'#fff',border:'none',borderRadius:6,fontSize:11,fontWeight:600,cursor:'pointer'}}>Message</button>
                  </div>
                </Popup>
              </Marker>
            ))}

          {driverPosState && pilot && (
            <Marker
              position={[driverPosState.lat, driverPosState.lon]}
              icon={driverIcon(pilot.firstName || pilot.name || 'You')}
            >
              <Popup>
                <div className="text-sm">
                  <strong>{pilot.firstName || pilot.name || 'You'}</strong>
                  <div className="text-blue-600">Your position</div>
                </div>
              </Popup>
            </Marker>
          )}

          {dutyPilotPos && (
            <Marker
              position={[dutyPilotPos.lat, dutyPilotPos.lon]}
              icon={dutyPilotNavIcon(`${dutyPilotPos.name || 'Duty Pilot'} - Duty Pilot`)}
            >
              <Popup>
                <div className="text-sm">
                  <strong>{dutyPilotPos.name} - Duty Pilot</strong>
                  <div className="text-purple-600">Duty Pilot position</div>
                  <button onClick={() => { navigateToTarget('duty-pilot', dutyPilotPos.lat, dutyPilotPos.lon); mapRef.current?.closePopup(); }} style={{display:'block',width:'100%',marginTop:6,padding:'5px 0',background:'#9333ea',color:'#fff',border:'none',borderRadius:6,fontSize:11,fontWeight:600,cursor:'pointer'}}>Navigate</button>
                </div>
              </Popup>
            </Marker>
          )}

          {launchSite && (
            <Marker
              position={[launchSite.lat, launchSite.lon]}
              icon={launchSiteIcon(launchSite.name || 'Launch')}
            >
              <Popup>
                <div className="text-sm">
                  <strong>{launchSite.name || 'Launch Site'}</strong>
                  <div className="text-emerald-600">Launch site</div>
                  <button onClick={() => { navigateToTarget('launch', launchSite.lat, launchSite.lon); mapRef.current?.closePopup(); }} style={{display:'block',width:'100%',marginTop:6,padding:'5px 0',background:'#10b981',color:'#fff',border:'none',borderRadius:6,fontSize:11,fontWeight:600,cursor:'pointer'}}>Navigate</button>
                </div>
              </Popup>
            </Marker>
          )}

          {routes.map(r => (
            <RouteLine key={`route-${r.pilotId}`} route={r} />
          ))}
          {returnRoute && (
            <RouteLine key={`return-${returnRoute.pilotId}`} route={returnRoute} />
          )}
        </MapContainer>

        <MapMessaging
          pilotId={pilot?.id || null}
          pilotName={pilot?.name || pilot?.firstName || null}
          pilotToken={token}
          composeTarget={composeTarget}
          onCloseCompose={() => setComposeTarget(null)}
          apiPrefix="/api/map-messages"
          demoSession={demoSession}
        />

        {(routes.length > 0 || returnRoute) && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1001] flex flex-col gap-1 items-center">
            {routes.map(r => {
              const retrieval = retrievals.find(ret => ret.pilotId === r.pilotId);
              const name = retrieval?.pilotName || 'Pilot';
              const mins = Math.round(r.durationMin);
              const dist = r.distanceKm < 1 ? `${Math.round(r.distanceKm * 1000)}m` : `${r.distanceKm.toFixed(1)}km`;
              return (
                <div
                  key={`eta-${r.pilotId}`}
                  className="rounded-lg shadow-lg px-3 py-1.5 flex items-center gap-2"
                  style={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(0,0,0,0.1)' }}
                >
                  <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                  <span className="text-xs font-semibold" style={{ color: '#1d1d1f' }}>{name}</span>
                  <span className="text-xs text-gray-500">{dist}</span>
                  <span className="text-xs font-bold text-blue-600">{mins < 1 ? '<1' : mins} min</span>
                </div>
              );
            })}
            {returnRoute && (() => {
              const targetName = returnTarget === 'launch'
                ? (launchSite?.name || 'Launch')
                : `${dutyPilotPos?.name || ''} - Duty Pilot`;
              const dotColor = returnTarget === 'launch' ? 'bg-emerald-500' : 'bg-purple-500';
              const textColor = returnTarget === 'launch' ? 'text-emerald-600' : 'text-purple-600';
              const mins = Math.round(returnRoute.durationMin);
              const dist = returnRoute.distanceKm < 1 ? `${Math.round(returnRoute.distanceKm * 1000)}m` : `${returnRoute.distanceKm.toFixed(1)}km`;
              return (
                <div className="rounded-lg shadow-lg px-3 py-1.5 flex items-center gap-2" style={{ background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(0,0,0,0.1)' }}>
                  <div className={`w-2 h-2 rounded-full ${dotColor} shrink-0`} />
                  <span className="text-xs font-semibold" style={{ color: '#1d1d1f' }}>{targetName}</span>
                  <span className="text-xs text-gray-500">{dist}</span>
                  <span className={`text-xs font-bold ${textColor}`}>{mins < 1 ? '<1' : mins} min</span>
                  <button onClick={cancelReturnRoute} className="ml-1 text-gray-400 hover:text-gray-600" title="Cancel route">
                    <XIcon className="w-3 h-3" />
                  </button>
                </div>
              );
            })()}
          </div>
        )}

        <MapControls
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          activeBasemap={activeBasemap}
          onSwitchBasemap={setActiveBasemap}
          mapOrientation={mapOrientation}
          onToggleOrientation={handleToggleOrientation}
        />

        {isFullscreen && (
          <div className="absolute top-3 right-3 z-[1000]">
            <Link to="/xc/maps" className="min-h-[44px] min-w-[44px] rounded-lg shadow-md flex items-center justify-center transition-all" style={{ background: 'rgba(255,255,255,0.95)', color: '#1d1d1f', border: '1px solid rgba(0,0,0,0.1)' }}>
              <ArrowLeft className="w-5 h-5" />
            </Link>
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 z-[1000] flex flex-col pointer-events-none">
          <div className="flex justify-center gap-2 mb-2 pointer-events-auto">
            <button
              onClick={() => { setTrackingTarget(null); zoomToAll(); }}
              className={`bg-green-500 hover:bg-green-600 text-white rounded-full font-semibold shadow-lg ${isDemo ? 'px-3 py-1.5 text-[11px]' : 'px-4 py-2 text-sm'}`}
            >
              All
            </button>
            <button
              onClick={() => { setTrackingTarget(null); zoomToPilot(); }}
              className={`bg-orange-500 hover:bg-orange-600 text-white rounded-full font-semibold shadow-lg ${isDemo ? 'px-3 py-1.5 text-[11px]' : 'px-4 py-2 text-sm'}`}
            >
              Pilot
            </button>
            <button
              onClick={() => { if (trackingTarget === 'driver') { setTrackingTarget(null); } else { setTrackingTarget('driver'); zoomToDriver(); } }}
              className={`${trackingTarget === 'driver' ? 'bg-blue-600 ring-2 ring-blue-300' : 'bg-blue-500 hover:bg-blue-600'} text-white rounded-full font-semibold shadow-lg ${isDemo ? 'px-3 py-1.5 text-[11px]' : 'px-4 py-2 text-sm'}`}
            >
              {trackingTarget === 'driver' ? '◉ Driver' : 'Driver'}
            </button>
            <button
              onClick={() => {
                if (isDemo && demoRole) {
                  try { window.parent?.postMessage({ type: 'demo-fullscreen', role: demoRole }, '*'); } catch {}
                }
                setIsFullscreen(f => !f);
              }}
              className={`flex items-center rounded-full font-semibold bg-white text-gray-600 shadow-lg hover:bg-gray-50 ${isDemo ? 'px-2 py-1.5 text-[11px]' : 'px-2.5 py-2 text-sm'}`}
            >
              {isFullscreen ? <Minimize className={isDemo ? "w-3.5 h-3.5" : "w-4 h-4"} /> : <Maximize className={isDemo ? "w-3.5 h-3.5" : "w-4 h-4"} />}
            </button>
          </div>
          <div className={`transition-all ${listCollapsed ? '' : 'max-h-[45vh]'} flex flex-col pointer-events-auto shrink-0`}>
            <button
              className="mx-auto mb-0 w-14 h-7 rounded-t-lg border border-b-0 shadow-lg flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.95)', borderColor: 'rgba(0,0,0,0.1)' }}
              onClick={() => setListCollapsed(!listCollapsed)}
            >
              {listCollapsed ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
            </button>

            <div className="border-t shadow-lg rounded-t-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.98)', borderColor: 'rgba(0,0,0,0.1)' }}>
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
                <span className="font-semibold text-sm" style={{ color: '#1d1d1f' }}>
                  Unretrieved Pilots ({retrievals.length})
                </span>
              </div>

              {!listCollapsed && (
                <div className="overflow-y-auto" style={{ maxHeight: 'calc(45vh - 60px)' }}>
                  {actionError && (
                    <div className="mx-3 mt-2 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center justify-between">
                      <span>{actionError}</span>
                      <button onClick={() => setActionError(null)} className="ml-2 text-red-400 hover:text-red-600 font-bold">&times;</button>
                    </div>
                  )}
                  {retrievals.length === 0 && (
                    <div className="px-4 py-4 text-center text-sm" style={{ color: '#86868b' }}>
                      <MapPin className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      No pilots awaiting retrieval
                      {(launchSite || dutyPilotPos) && (
                        <div className="mt-3 flex flex-col gap-2">
                          {launchSite && (
                            <button
                              onClick={() => navigateToTarget('launch', launchSite.lat, launchSite.lon)}
                              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${returnTarget === 'launch' ? 'bg-emerald-700 text-white' : 'bg-emerald-500 text-white hover:bg-emerald-600'}`}
                            >
                              <Navigation className="w-4 h-4" />
                              {returnTarget === 'launch' ? `Navigating to ${launchSite.name || 'Launch'}` : `Return to ${launchSite.name || 'Launch'}`}
                            </button>
                          )}
                          {dutyPilotPos && (
                            <button
                              onClick={() => navigateToTarget('duty-pilot', dutyPilotPos.lat, dutyPilotPos.lon)}
                              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${returnTarget === 'duty-pilot' ? 'bg-purple-700 text-white' : 'bg-purple-500 text-white hover:bg-purple-600'}`}
                            >
                              <Navigation className="w-4 h-4" />
                              {returnTarget === 'duty-pilot' ? `Navigating to ${dutyPilotPos.name} - Duty Pilot` : `Return to ${dutyPilotPos.name} - Duty Pilot`}
                            </button>
                          )}
                          {returnRoute && (
                            <>
                              <div className="text-xs font-medium text-blue-600 tabular-nums">
                                {returnRoute.distanceKm < 1 ? `${Math.round(returnRoute.distanceKm * 1000)}m` : `${returnRoute.distanceKm.toFixed(1)}km`} · {Math.round(returnRoute.durationMin) < 1 ? '<1' : Math.round(returnRoute.durationMin)} min
                              </div>
                              <button
                                onClick={cancelReturnRoute}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                              >
                                <XIcon className="w-4 h-4" /> Cancel Route
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {retrievals.map(r => (
                    <div key={r.pilotId} className="border-b border-gray-100 last:border-b-0">
                      <button
                        className={`w-full px-4 py-2.5 text-left transition-colors ${selectedPilotId === r.pilotId ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                        onClick={() => {
                          setSelectedPilotId(selectedPilotId === r.pilotId ? null : r.pilotId);
                          if (r.pilotLat != null && r.pilotLon != null && mapRef.current) {
                            mapRef.current.flyTo([r.pilotLat, r.pilotLon], 13, { duration: 0.5 });
                          }
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-2.5 h-2.5 rounded-full ${r.status === 'claimed' ? 'bg-blue-500' : 'bg-orange-400'}`} />
                          <span className="font-medium text-sm" style={{ color: '#1d1d1f' }}>{r.pilotName}</span>
                          {(() => {
                            const rt = routes.find(ro => ro.pilotId === r.pilotId);
                            if (!rt) return null;
                            const mins = Math.round(rt.durationMin);
                            const dist = rt.distanceKm < 1 ? `${Math.round(rt.distanceKm * 1000)}m` : `${rt.distanceKm.toFixed(1)}km`;
                            return (
                              <span className="ml-auto text-xs text-blue-600 font-medium tabular-nums shrink-0">
                                {dist} · {mins < 1 ? '<1' : mins} min
                              </span>
                            );
                          })()}
                        </div>
                        {r.status === 'claimed' && r.driverName && (
                          <div className="text-xs text-blue-600 mt-0.5 ml-4.5">🚗 {r.driverName} is coming</div>
                        )}
                        {r.status === 'awaiting' && (
                          <div className="text-xs mt-0.5 ml-4.5" style={{ color: '#86868b' }}>Awaiting retrieval</div>
                        )}
                        {r.positionSource === 'satellite' && (
                          <div className="text-xs text-indigo-600 mt-0.5 ml-4.5 font-medium">via satellite tracker</div>
                        )}
                      </button>

                      {selectedPilotId === r.pilotId && (
                        <div className="px-4 pb-2.5 flex flex-wrap gap-2">
                          {r.status === 'awaiting' && (
                            <button
                              onClick={() => handleClaim(r.pilotId, r.pilotLat, r.pilotLon)}
                              disabled={actionLoading === r.pilotId}
                              className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
                            >
                              <Navigation className="w-4 h-4" /> Navigate to
                            </button>
                          )}
                          {r.status === 'claimed' && (
                            <>
                              <button
                                onClick={() => {
                                  if (r.pilotLat != null && r.pilotLon != null) {
                                    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
                                    const url = isIOS
                                      ? `maps://maps.apple.com/?daddr=${r.pilotLat},${r.pilotLon}`
                                      : `https://www.google.com/maps/dir/?api=1&destination=${r.pilotLat},${r.pilotLon}`;
                                    window.open(url, '_blank');
                                  }
                                }}
                                className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600"
                              >
                                <Navigation className="w-4 h-4" /> Navigate
                              </button>
                              <button
                                onClick={() => handleUnclaim(r.pilotId)}
                                disabled={actionLoading === r.pilotId}
                                className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
                              >
                                <XIcon className="w-4 h-4" /> Cancel
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleComplete(r.pilotId)}
                            disabled={actionLoading === r.pilotId}
                            className="flex items-center gap-1.5 px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 disabled:opacity-50"
                          >
                            <CheckCircle className="w-4 h-4" /> Picked Up
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
