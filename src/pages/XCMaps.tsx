import { useMemo, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, MapPin, Compass, ChevronDown, X, Layers, Maximize, Minimize, Shield, Car, CheckCircle, Monitor, Clock, BellOff, Wind, Plus, Minus, Navigation, Map as MapIcon, User } from 'lucide-react';
import { XCMap } from '@/components/XCMap';
import { FlightControls } from '@/components/FlightControls';
import { PilotProfileSettings } from '@/components/PilotProfileSettings';
import { PilotLoginModal } from '@/components/PilotLoginModal';
import { DEMO_LAUNCH } from '@/lib/demoConfig';
import { MapMessaging } from '@/components/MapMessaging';
import { THRESHOLD_OPTIONS } from '@/hooks/useProximityAlerts';
import { useXCMapState } from '@/hooks/useXCMapState';
import type { XCSite, WindData } from '@/hooks/useXCMapState';
import { haversineKm } from '@/hooks/useXCMapState';
import { BASEMAPS } from '@/lib/xcMapUtils';
import { requestCompassPermission } from '@/components/xcmap/MapHelpers';
import type L from 'leaflet';

const ALT_MIN = 0;
const ALT_MAX = 10000;
const ALT_STEP = 500;
const TICK_COUNT = ALT_MAX / ALT_STEP + 1;

function AltitudeSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const pct = ((value - ALT_MIN) / (ALT_MAX - ALT_MIN)) * 100;
  const ticks = useMemo(() => {
    const arr = [];
    for (let ft = ALT_MIN; ft <= ALT_MAX; ft += ALT_STEP) {
      arr.push(ft);
    }
    return arr;
  }, []);

  return (
    <div
      className="flex flex-col items-center py-3 px-1 rounded-2xl select-none"
      style={{
        background: 'rgba(255,255,255,0.75)',
        border: '1px solid rgba(255,255,255,0.3)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
        width: '54px',
        height: '100%',
      }}
    >
      <div className="text-[8px] font-bold uppercase tracking-widest mb-1" style={{ color: '#86868b', writingMode: 'horizontal-tb' }}>
        ALT
      </div>

      <div className="flex-1 relative flex justify-center" style={{ width: '40px', minHeight: '200px' }}>
        <div className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 w-[3px] rounded-full" style={{ background: 'rgba(0,0,0,0.08)' }}>
          <div
            className="absolute bottom-0 left-0 right-0 rounded-full transition-all duration-150"
            style={{
              height: `${pct}%`,
              background: 'linear-gradient(to top, #007aff, #5ac8fa)',
            }}
          />
        </div>

        {ticks.map((ft) => {
          const tickPct = ((ft - ALT_MIN) / (ALT_MAX - ALT_MIN)) * 100;
          const isMajor = ft % 2000 === 0;
          const showLabel = ft % 2000 === 0 || ft === ALT_MAX;
          return (
            <div
              key={ft}
              className="absolute flex items-center"
              style={{
                bottom: `${tickPct}%`,
                left: 0,
                right: 0,
                transform: 'translateY(50%)',
                pointerEvents: 'none',
              }}
            >
              <div
                className="absolute"
                style={{
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: isMajor ? '14px' : '8px',
                  height: '1px',
                  background: isMajor ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.08)',
                }}
              />
              {showLabel && (
                <div
                  className="absolute text-right"
                  style={{
                    right: '32px',
                    fontSize: '7px',
                    fontWeight: 700,
                    color: '#86868b',
                    whiteSpace: 'nowrap',
                    lineHeight: 1,
                  }}
                >
                  {ft === 0 ? 'GND' : `${(ft / 1000).toFixed(0)}k`}
                </div>
              )}
            </div>
          );
        })}

        <input
          type="range"
          min={ALT_MIN}
          max={ALT_MAX}
          step={ALT_STEP}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="altitude-slider-input"
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            appearance: 'none',
            WebkitAppearance: 'none',
            background: 'transparent',
            cursor: 'pointer',
            writingMode: 'vertical-lr',
            direction: 'rtl',
            margin: 0,
            padding: 0,
            zIndex: 10,
          }}
        />

        <div
          className="absolute flex items-center justify-center pointer-events-none transition-all duration-150"
          style={{
            bottom: `${pct}%`,
            transform: 'translateY(50%)',
            left: '-4px',
            right: '-4px',
          }}
        >
          <div
            className="px-2 py-1 rounded-full text-white font-bold"
            style={{
              fontSize: '9px',
              background: '#007aff',
              whiteSpace: 'nowrap',
              lineHeight: 1,
              minWidth: '44px',
              textAlign: 'center',
              boxShadow: '0 2px 8px rgba(0,122,255,0.4), 0 1px 3px rgba(0,0,0,0.2)',
              border: '2px solid rgba(255,255,255,0.9)',
            }}
          >
            {value === 0 ? 'GND' : `${value.toLocaleString()}'`}
          </div>
        </div>
      </div>

      <div className="text-[7px] font-semibold mt-1" style={{ color: '#86868b' }}>FT</div>
    </div>
  );
}

export function XCMaps() {
  const {
    settings, pilot, token, authUser, demoRole, isDemo, sites, loading,
    selectedSite, setSelectedSite,
    showAirspace, setShowAirspace,
    showZones, setShowZones,
    zoneData, disabledZoneTypes, setDisabledZoneTypes,
    showWindField, setShowWindField,
    altitudeFt, setAltitudeFt,
    disabledTypes, setDisabledTypes,
    windDataMap,
    tileCacheProgress,
    isFullscreen, setIsFullscreen,
    mapOrientation, setMapOrientation,
    followPilot, setFollowPilot,
    mapContainerRef,
    proximityThresholdFt, dismissedSectorIds, activeProximityIds, alertsDismissed,
    cycleThreshold, handleProximityEnter, handleProximityExit, handleActiveProximityIds,
    handleDismissAlerts, setAlertsDismissed, setDismissedSectorIds,
    userLocation,
    tracker,
    retrievalStatus, showDriverOnMap, setShowDriverOnMap,
    retrievalDrawerOpen, setRetrievalDrawerOpen, drawerDragRef,
    inFlightRetrievalRequested, handleRequestRetrieval, handlePilotPickedUp,
    composeTarget, setComposeTarget,
    showPilotSettings, setShowPilotSettings,
    toggleFullscreen,
    ringLegend,
    selectorOpen, setSelectorOpen,
    sortedSites,
    windObservations,
    windFieldSettings,
  } = useXCMapState();

  const [showPilotLogin, setShowPilotLogin] = useState(false);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [activeBasemap, setActiveBasemap] = useState('streets');
  const handleMapReady = useCallback((map: L.Map) => { mapInstanceRef.current = map; }, []);
  const handleZoomIn = useCallback(() => { mapInstanceRef.current?.zoomIn(); }, []);
  const handleZoomOut = useCallback(() => { mapInstanceRef.current?.zoomOut(); }, []);
  const handleLocateMe = useCallback(() => {
    if (userLocation && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([userLocation.lat, userLocation.lon], 14, { duration: 0.8 });
    }
  }, [userLocation]);
  const handleCycleBasemap = useCallback(() => {
    setActiveBasemap(prev => {
      const idx = BASEMAPS.findIndex(b => b.id === prev);
      return BASEMAPS[(idx + 1) % BASEMAPS.length].id;
    });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--tmpl-body-bg)' }}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#007aff]" />
      </div>
    );
  }

  if (sites.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: 'var(--tmpl-body-bg)' }}>
        <div
          className="max-w-md w-full p-8 rounded-2xl text-center"
          style={{
            background: 'rgba(255,255,255,0.65)',
            border: '1px solid rgba(255,255,255,0.3)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
          }}
        >
          <MapPin className="w-12 h-12 text-[#007aff] mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2" style={{ color: '#1d1d1f' }}>No XC Sites Available</h2>
          <p className="text-sm" style={{ color: '#86868b' }}>
            XC-capable sites haven't been configured yet. Check back soon.
          </p>
          <Link to="/" className="inline-block mt-6 text-sm font-medium text-[#007aff] hover:underline">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--tmpl-body-bg)' }}>
      <style>{`
        .fullscreen-map {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          height: 100dvh !important;
          z-index: 10001 !important;
          border-radius: 0 !important;
          border: none !important;
          margin: 0 !important;
        }
        .fullscreen-map .leaflet-container {
          width: 100% !important;
          height: 100% !important;
          border-radius: 0 !important;
        }
        .fullscreen-map .leaflet-container[style*="rotate"] {
          overflow: visible !important;
        }
        .wind-arrow-icon {
          background: none !important;
          border: none !important;
        }
        .altitude-slider-input::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 44px;
          height: 20px;
          background: transparent;
          border: none;
          cursor: pointer;
        }
        .altitude-slider-input::-moz-range-thumb {
          width: 44px;
          height: 20px;
          background: transparent;
          border: none;
          cursor: pointer;
        }
        .altitude-slider-input::-webkit-slider-runnable-track {
          background: transparent;
        }
        .altitude-slider-input::-moz-range-track {
          background: transparent;
        }
        .airspace-popup .leaflet-popup-content-wrapper {
          border-radius: 12px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.12);
        }
        .pilot-alt-label {
          background: none !important;
          border: none !important;
          overflow: visible !important;
        }
      `}</style>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <Link
          to="/"
          className="inline-flex items-center text-[#007aff] hover:opacity-80 mb-6 font-medium text-sm"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Home
        </Link>

        <div className="mb-8">
          <h1
            className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-2"
            style={{ color: '#1d1d1f', fontFamily: 'var(--tmpl-font-heading)' }}
          >
            {settings.xcMapsTitle || "XC Maps"}
          </h1>
          <p className="text-base sm:text-lg max-w-2xl whitespace-pre-line" style={{ color: '#86868b' }}>
            {settings.xcMapsDescription || "XC distance rings, Bearing Lines, Switchable Airspace Overlay, Switchable Proximity alerts with audio/haptic warnings, off & online GPS track logging, offline tile caching. Ride share style retrieval driver app.\nYou need to allow \"location\" for most features to work.\nPilots, please sign in on map below or create a login\nDrivers use the link then sign in or create a login\nHistory & track log export a future feature. (Take a screen shot to save statistics)"}
          </p>
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={() => setShowPilotLogin(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-80"
              style={{
                background: 'rgba(88,86,214,0.1)',
                color: '#5856d6',
              }}
            >
              <User className="w-4 h-4" /> {pilot ? (pilot.firstName || pilot.name || 'Pilot') : 'Pilot Sign In'}
            </button>
            <Link
              to="/xc/retrieval"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-80"
              style={{
                background: 'rgba(0,122,255,0.1)',
                color: '#007aff',
              }}
            >
              <Car className="w-4 h-4" /> Retrieval Driver
            </Link>
            <Link
              to="/xc/duty-pilot"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-80"
              style={{
                background: 'rgba(20,184,166,0.1)',
                color: '#0d9488',
              }}
            >
              <Shield className="w-4 h-4" /> Duty Pilot
            </Link>
            <Link
              to="/xc/maps/demo"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-80"
              style={{
                background: 'rgba(245,158,11,0.1)',
                color: '#d97706',
              }}
            >
              <Monitor className="w-4 h-4" /> Demo
            </Link>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          <div className="hidden lg:block w-72 shrink-0">
            <div
              className="sticky top-[100px] rounded-2xl overflow-hidden"
              style={{
                background: 'rgba(255,255,255,0.97)',
                border: '1px solid rgba(0,0,0,0.08)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
              }}
            >
              <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
                <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#86868b' }}>
                  XC Sites
                </h3>
              </div>
              <div className="p-2 max-h-[60vh] overflow-y-auto">
                {sortedSites.map((site) => (
                  <button
                    key={site.id}
                    onClick={() => setSelectedSite(site)}
                    className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
                    style={{
                      background: selectedSite?.id === site.id ? 'rgba(0,122,255,0.1)' : 'transparent',
                      color: selectedSite?.id === site.id ? '#007aff' : '#1d1d1f',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 shrink-0" style={{ color: selectedSite?.id === site.id ? '#007aff' : '#86868b' }} />
                      <span className="truncate">{site.name}</span>
                      {userLocation && (
                        <span className="ml-auto text-[10px] shrink-0 tabular-nums" style={{ color: '#86868b' }}>
                          {Math.round(haversineKm(userLocation.lat, userLocation.lon, site.lat, site.lon))} km
                        </span>
                      )}
                    </div>
                    {site.type && (
                      <span className="text-[10px] ml-5.5 mt-0.5 block" style={{ color: '#86868b' }}>
                        {site.type}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:hidden">
            <button
              onClick={() => setSelectorOpen(true)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium"
              style={{
                background: 'rgba(255,255,255,0.97)',
                border: '1px solid rgba(0,0,0,0.08)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
                color: '#1d1d1f',
              }}
            >
              <span className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#007aff]" />
                {selectedSite?.name || 'Select a site'}
              </span>
              <ChevronDown className="w-4 h-4" style={{ color: '#86868b' }} />
            </button>
          </div>

          <div className="flex-1 min-w-0">
            {selectedSite && (
              <>
                <div className="flex gap-3 mb-4">
                  <div
                    ref={mapContainerRef}
                    className={`flex-1 rounded-2xl overflow-hidden relative ${isFullscreen ? 'fullscreen-map' : ''}`}
                    style={{
                      boxShadow: isFullscreen ? 'none' : '0 4px 24px rgba(0,0,0,0.06)',
                      border: isFullscreen ? 'none' : '1px solid rgba(255,255,255,0.3)',
                      background: '#000',
                    }}
                  >
                    <div className={isFullscreen ? 'w-full h-full' : 'aspect-[4/3] sm:aspect-[16/9] lg:aspect-[16/10]'}>
                      <XCMap
                        site={selectedSite}
                        showAirspace={showAirspace}
                        altitudeFt={altitudeFt}
                        disabledTypes={disabledTypes}
                        windData={windDataMap[selectedSite.id] || null}
                        allSites={sites}
                        windDataMap={windDataMap}
                        breadcrumbs={(settings.flightTrackerEnabled || isDemo) ? tracker.breadcrumbs : undefined}
                        fullTrailBreadcrumbs={(settings.flightTrackerEnabled || isDemo) ? tracker.fullTrailRef.current : undefined}
                        trailColor={settings.ftTrailColor}
                        trailWidth={Number(settings.ftTrailWidth) || 3}
                        splineTension={Number(settings.ftSplineTension) || 0.5}
                        isRecording={(settings.flightTrackerEnabled || isDemo) && tracker.state === "recording"}
                        followPilot={followPilot && (tracker.state === "recording" || tracker.state === "pre-recording")}
                        mapOrientation={mapOrientation}
                        pilotPosition={tracker.currentPosition}
                        verticalSpeed={tracker.liveStats.verticalSpeed}
                        proximityThresholdFt={proximityThresholdFt}
                        onProximityEnter={isDemo ? undefined : handleProximityEnter}
                        onProximityExit={isDemo ? undefined : handleProximityExit}
                        dismissedSectorIds={dismissedSectorIds}
                        onActiveProximityIds={isDemo ? undefined : handleActiveProximityIds}
                        pilotColor={isDemo ? (demoRole === 'pilot1' ? '#ef4444' : demoRole === 'pilot2' ? '#3b82f6' : '#0ea5e9') : undefined}
                        livePilots={tracker.livePilots}
                        driverLocation={showDriverOnMap && retrievalStatus?.driverLat != null && retrievalStatus?.driverLon != null && retrievalStatus?.driverName
                          ? { lat: retrievalStatus.driverLat, lon: retrievalStatus.driverLon, name: retrievalStatus.driverName }
                          : null}
                        isDemo={isDemo}
                        showWindField={showWindField}
                        windObservations={windObservations}
                        windFieldSettings={windFieldSettings}
                        enableMessaging={!!pilot}
                        currentPilotId={pilot?.id || null}
                        userLocation={userLocation || null}
                        isFullscreen={isFullscreen}
                        activeBasemap={activeBasemap}
                        onMapReady={handleMapReady}
                        showZones={showZones}
                        zoneData={zoneData}
                        disabledZoneTypes={disabledZoneTypes}
                      />
                      {pilot && (
                        <MapMessaging
                          pilotId={pilot.id}
                          pilotName={pilot.firstName || pilot.name}
                          pilotToken={token}
                          composeTarget={composeTarget}
                          onCloseCompose={() => setComposeTarget(null)}
                          apiPrefix="/api/map-messages"
                          demoSession={isDemo ? new URLSearchParams(window.location.search).get('demoSession') : null}
                        />
                      )}
                    </div>

                    <div className="absolute top-3 right-3 z-[1000] flex flex-col items-end gap-2">
                      {settings.xcMapAirspaceButtonEnabled !== false && (
                        <div className="flex items-center gap-2">
                          {showAirspace && activeProximityIds.size > 0 && !alertsDismissed && tracker.state === 'recording' && (
                            <button
                              onClick={handleDismissAlerts}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold transition-all shadow-md animate-pulse min-h-[44px]"
                              style={{
                                background: '#ff3b30',
                                color: 'white',
                                border: '1px solid #ff3b30',
                                touchAction: 'manipulation',
                              }}
                              title="Dismiss airspace alerts until next boundary"
                            >
                              <X className="w-[18px] h-[18px]" />
                              Dismiss
                            </button>
                          )}
                          {showAirspace && alertsDismissed && dismissedSectorIds.size > 0 && (
                            <span
                              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold shadow-md"
                              style={{
                                background: '#ff9500',
                                color: 'white',
                                border: '1px solid #e68600',
                              }}
                            >
                              <BellOff className="w-[18px] h-[18px]" />
                              Muted
                            </span>
                          )}
                          {showAirspace && (
                            <button
                              onClick={cycleThreshold}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all shadow-md min-h-[44px]"
                              style={{
                                background: 'rgba(255,255,255,0.95)',
                                color: '#1d1d1f',
                                border: '1px solid rgba(0,0,0,0.1)',
                                touchAction: 'manipulation',
                              }}
                              title="Airspace proximity alert threshold — tap to cycle"
                            >
                              <Shield className="w-[18px] h-[18px]" style={{ color: '#007aff' }} />
                              {proximityThresholdFt}′
                            </button>
                          )}
                          <button
                            onClick={() => setShowAirspace(!showAirspace)}
                            onTouchEnd={(e) => { e.preventDefault(); setShowAirspace(v => !v); }}
                            className="flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all shadow-md min-h-[44px] min-w-[120px]"
                            style={{
                              background: showAirspace ? '#007aff' : 'rgba(255,255,255,0.95)',
                              color: showAirspace ? 'white' : '#1d1d1f',
                              border: showAirspace ? '1px solid #007aff' : '1px solid rgba(0,0,0,0.1)',
                              touchAction: 'manipulation',
                            }}
                          >
                            <Layers className="w-[18px] h-[18px]" />
                            Airspace
                          </button>
                        </div>
                      )}
                      <button
                        onClick={() => setShowZones(!showZones)}
                        onTouchEnd={(e) => { e.preventDefault(); setShowZones(v => !v); }}
                        className="flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all shadow-md min-h-[44px] min-w-[120px]"
                        style={{
                          background: showZones ? '#16a34a' : 'rgba(255,255,255,0.95)',
                          color: showZones ? 'white' : '#1d1d1f',
                          border: showZones ? '1px solid #16a34a' : '1px solid rgba(0,0,0,0.1)',
                          touchAction: 'manipulation',
                        }}
                      >
                        <MapPin className="w-[18px] h-[18px]" />
                        Zones
                      </button>
                      {settings.xcMapWindButtonEnabled !== false && (
                        <button
                          onClick={() => setShowWindField(!showWindField)}
                          onTouchEnd={(e) => { e.preventDefault(); setShowWindField(v => !v); }}
                          className="flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all shadow-md min-h-[44px] min-w-[120px]"
                          style={{
                            background: showWindField ? '#007aff' : 'rgba(255,255,255,0.95)',
                            color: showWindField ? 'white' : '#1d1d1f',
                            border: showWindField ? '1px solid #007aff' : '1px solid rgba(0,0,0,0.1)',
                            touchAction: 'manipulation',
                          }}
                        >
                          <Wind className="w-[18px] h-[18px]" />
                          Winds
                        </button>
                      )}
                    </div>

                    <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-2">
                      <div className="flex flex-col rounded-lg overflow-hidden shadow-md" style={{ border: '1px solid rgba(0,0,0,0.1)' }}>
                        <button
                          onClick={handleZoomIn}
                          onTouchEnd={(e) => { e.preventDefault(); handleZoomIn(); }}
                          className="flex items-center justify-center min-h-[44px] min-w-[44px] transition-all"
                          style={{ background: 'rgba(255,255,255,0.95)', color: '#1d1d1f', touchAction: 'manipulation', borderBottom: '1px solid rgba(0,0,0,0.1)' }}
                          title="Zoom in"
                        >
                          <Plus className="w-[20px] h-[20px]" />
                        </button>
                        <button
                          onClick={handleZoomOut}
                          onTouchEnd={(e) => { e.preventDefault(); handleZoomOut(); }}
                          className="flex items-center justify-center min-h-[44px] min-w-[44px] transition-all"
                          style={{ background: 'rgba(255,255,255,0.95)', color: '#1d1d1f', touchAction: 'manipulation' }}
                          title="Zoom out"
                        >
                          <Minus className="w-[20px] h-[20px]" />
                        </button>
                      </div>
                      {userLocation && (
                        <button
                          onClick={handleLocateMe}
                          onTouchEnd={(e) => { e.preventDefault(); handleLocateMe(); }}
                          className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg shadow-md transition-all"
                          style={{ background: 'rgba(255,255,255,0.95)', color: '#007aff', border: '1px solid rgba(0,0,0,0.1)', touchAction: 'manipulation' }}
                          title="Go to my location"
                        >
                          <Navigation className="w-[18px] h-[18px]" />
                        </button>
                      )}
                      <button
                        onClick={handleCycleBasemap}
                        onTouchEnd={(e) => { e.preventDefault(); handleCycleBasemap(); }}
                        className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg shadow-md transition-all"
                        style={{ background: 'rgba(255,255,255,0.95)', color: '#1d1d1f', border: '1px solid rgba(0,0,0,0.1)', touchAction: 'manipulation' }}
                        title={`Map style: ${BASEMAPS.find(b => b.id === activeBasemap)?.label || 'Streets'}`}
                      >
                        <MapIcon className="w-[18px] h-[18px]" />
                      </button>
                      {isFullscreen && (
                        <button
                          onClick={async () => {
                            if (mapOrientation === 'north-up') {
                              const granted = await requestCompassPermission();
                              if (!granted) return;
                            }
                            setMapOrientation(o => o === 'north-up' ? 'track-up' : 'north-up');
                          }}
                          onTouchEnd={async (e) => {
                            e.preventDefault();
                            if (mapOrientation === 'north-up') {
                              const granted = await requestCompassPermission();
                              if (!granted) return;
                            }
                            setMapOrientation(o => o === 'north-up' ? 'track-up' : 'north-up');
                          }}
                          className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg shadow-md transition-all"
                          style={{
                            background: mapOrientation === 'track-up' ? '#007aff' : 'rgba(255,255,255,0.95)',
                            color: mapOrientation === 'track-up' ? 'white' : '#1d1d1f',
                            border: mapOrientation === 'track-up' ? '1px solid #007aff' : '1px solid rgba(0,0,0,0.1)',
                            touchAction: 'manipulation',
                          }}
                          title={mapOrientation === 'track-up' ? 'Switch to north-up' : 'Switch to track-up'}
                        >
                          <Compass className="w-[18px] h-[18px]" />
                        </button>
                      )}
                    </div>

                    {tileCacheProgress && !tileCacheProgress.done && (
                      <div className="absolute bottom-2 right-2 z-[1000] rounded-lg px-3 py-1.5 shadow text-xs" style={{ background: 'rgba(255,255,255,0.95)', color: '#6b7280' }}>
                        Caching tiles: {tileCacheProgress.cached}/{tileCacheProgress.total}
                      </div>
                    )}

                    <div
                      className={`absolute bottom-0 left-0 right-0 z-[1002] flex flex-col items-center pointer-events-none ${isDemo ? 'px-1' : 'px-4'}`}
                      style={{ paddingBottom: 'max(44px, calc(env(safe-area-inset-bottom, 20px) + 24px))' }}
                    >
                      {(settings.flightTrackerEnabled || isDemo) ? (
                        <FlightControls
                          state={tracker.state}
                          liveStats={tracker.liveStats}
                          flightStats={tracker.flightStats}
                          isOnline={tracker.isOnline}
                          error={tracker.error}
                          isFullscreen={isFullscreen}
                          onToggleFullscreen={toggleFullscreen}
                          onStart={(autoStart) => {
                            setFollowPilot(true);
                            setMapOrientation('north-up');
                            tracker.startTracking(autoStart, selectedSite?.id, selectedSite?.name);
                          }}
                          onStop={() => {
                            tracker.stopTracking();
                            setFollowPilot(false);
                            setMapOrientation('north-up');
                          }}
                          onReset={() => {
                            tracker.reset();
                            setFollowPilot(false);
                            setMapOrientation('north-up');
                          }}
                          isDemo={isDemo}
                          retrievalRequested={inFlightRetrievalRequested}
                          onRequestRetrieval={handleRequestRetrieval}
                          onOpenSettings={() => setShowPilotSettings(true)}
                          inline
                          portalContainer={isFullscreen && !document.fullscreenElement ? mapContainerRef.current : undefined}
                        />
                      ) : (
                        <button
                          onClick={toggleFullscreen}
                          className="mb-2 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-white text-gray-600 shadow active:bg-gray-100 pointer-events-auto min-h-[44px]"
                          style={{ touchAction: 'manipulation' }}
                        >
                          {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                          {isFullscreen ? "Exit" : "Full"}
                        </button>
                      )}

                      {retrievalStatus?.active && (
                        <div
                          className="pointer-events-auto transition-all duration-300 ease-out"
                          style={{
                            width: 'min(80%, 320px)',
                            minWidth: '220px',
                          }}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                        >
                          <div
                            className="rounded-t-xl overflow-hidden"
                            style={{
                              background: 'rgba(255,255,255,0.97)',
                              border: '1px solid rgba(0,0,0,0.08)',
                              borderBottom: 'none',
                              boxShadow: '0 -4px 20px rgba(0,0,0,0.12)',
                            }}
                          >
                            <div
                              className="flex items-center justify-center py-1.5 cursor-pointer select-none"
                              onClick={() => setRetrievalDrawerOpen(!retrievalDrawerOpen)}
                              onTouchStart={(e) => {
                                drawerDragRef.current = { startY: e.touches[0].clientY, startOpen: retrievalDrawerOpen };
                              }}
                              onTouchMove={(e) => {
                                if (!drawerDragRef.current) return;
                                const dy = e.touches[0].clientY - drawerDragRef.current.startY;
                                if (drawerDragRef.current.startOpen && dy > 40) setRetrievalDrawerOpen(false);
                                if (!drawerDragRef.current.startOpen && dy < -40) setRetrievalDrawerOpen(true);
                              }}
                              onTouchEnd={() => { drawerDragRef.current = null; }}
                            >
                              <div className="w-8 h-1 rounded-full bg-gray-300" />
                            </div>

                            {retrievalDrawerOpen && (
                            <div className="px-4 pb-3">
                              <div className="flex items-center gap-2.5">
                                <Car className="w-5 h-5 text-[#007aff] shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <h3 className="text-sm font-semibold leading-tight" style={{ color: '#1d1d1f' }}>Retrieval</h3>
                                  {retrievalStatus?.status === 'claimed' && retrievalStatus.driverName ? (
                                    <p className="text-[13px] text-blue-600 font-medium truncate leading-tight">
                                      {retrievalStatus.driverName} is coming
                                    </p>
                                  ) : (
                                    <p className="text-[13px] leading-tight" style={{ color: '#86868b' }}>Awaiting pickup</p>
                                  )}
                                </div>
                                {retrievalStatus?.status === 'claimed' && retrievalStatus.etaMinutes != null && (
                                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg shrink-0" style={{ background: 'rgba(0,122,255,0.1)' }}>
                                    <Clock className="w-4 h-4 text-[#007aff]" />
                                    <span className="text-[13px] font-semibold text-[#007aff]">
                                      {retrievalStatus.etaMinutes < 1 ? '<1' : retrievalStatus.etaMinutes}m
                                    </span>
                                  </div>
                                )}
                              </div>

                              <div className="flex gap-2 mt-2.5">
                                {retrievalStatus?.status === 'claimed' && retrievalStatus.driverName && retrievalStatus.driverLat != null && (
                                  <button
                                    onClick={() => setShowDriverOnMap(!showDriverOnMap)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                                    style={{
                                      background: showDriverOnMap ? 'rgba(0,122,255,0.15)' : 'rgba(0,122,255,0.08)',
                                      color: '#007aff',
                                    }}
                                  >
                                    <Car className="w-4 h-4" />
                                    {showDriverOnMap ? 'Hide' : `Show ${retrievalStatus.driverName}`}
                                  </button>
                                )}
                                <button
                                  onClick={handlePilotPickedUp}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-green-500 text-white hover:bg-green-600"
                                >
                                  <CheckCircle className="w-4 h-4" /> Picked Up
                                </button>
                              </div>
                            </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {showAirspace && (
                    <div className="hidden sm:flex shrink-0">
                      <AltitudeSlider value={altitudeFt} onChange={setAltitudeFt} />
                    </div>
                  )}
                </div>


                {showAirspace && (
                  <div className="sm:hidden mb-4">
                    <div
                      className="rounded-2xl p-3 flex items-center gap-3"
                      style={{
                        background: 'rgba(255,255,255,0.95)',
                        border: '1px solid rgba(0,0,0,0.08)',
                        boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
                      }}
                    >
                      <span className="text-[10px] font-bold uppercase tracking-wider shrink-0" style={{ color: '#86868b' }}>ALT</span>
                      <input
                        type="range"
                        min={ALT_MIN}
                        max={ALT_MAX}
                        step={ALT_STEP}
                        value={altitudeFt}
                        onChange={(e) => setAltitudeFt(Number(e.target.value))}
                        className="flex-1 accent-[#007aff]"
                      />
                      <span
                        className="px-2 py-0.5 rounded-md text-white font-bold text-xs shrink-0"
                        style={{ background: '#007aff', minWidth: '52px', textAlign: 'center' }}
                      >
                        {altitudeFt === 0 ? 'GND' : `${altitudeFt.toLocaleString()}'`}
                      </span>
                    </div>
                  </div>
                )}

                {showAirspace && (
                  <div
                    className="rounded-2xl p-4 mb-4"
                    style={{
                      background: 'rgba(255,255,255,0.97)',
                      border: '1px solid rgba(0,0,0,0.08)',
                      boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
                    }}
                  >
                    <h3 className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#86868b' }}>
                      Airspace Legend
                    </h3>
                    <div className="flex flex-wrap gap-x-2 gap-y-1.5">
                      {[
                        { label: 'CTR / CTA', color: '#0064c8', types: ['CTR', 'CTA', 'TMA'] },
                        { label: 'Restricted', color: '#dc3232', types: ['RESTRICTED'] },
                        { label: 'Danger', color: '#dc7800', types: ['DANGER'] },
                        { label: 'Prohibited', color: '#c80000', types: ['PROHIBITED'] },
                        { label: 'TMZ / CTAF', color: '#00a050', types: ['TMZ', 'RMZ', 'MBZ'] },
                        { label: 'TIA', color: '#6464c8', types: ['TIA'] },
                        { label: 'Other', color: '#808080', types: ['OTHER', 'ALERT', 'WARNING', 'GLIDING_SECTOR', 'WAVE_WINDOW', 'FIR', 'OCA', 'PROTECTED', 'TIZ'] },
                      ].map((item) => {
                        const isDisabled = item.types.every((t) => disabledTypes.has(t));
                        return (
                          <button
                            key={item.label}
                            onClick={() => {
                              setDisabledTypes((prev) => {
                                const next = new Set(prev);
                                if (isDisabled) {
                                  item.types.forEach((t) => next.delete(t));
                                } else {
                                  item.types.forEach((t) => next.add(t));
                                }
                                return next;
                              });
                            }}
                            aria-pressed={!isDisabled}
                            className="inline-flex items-center gap-1.5 text-xs rounded-full px-2 py-0.5 transition-all"
                            style={{
                              color: isDisabled ? '#bbb' : '#555',
                              background: isDisabled ? 'rgba(0,0,0,0.03)' : item.color + '14',
                              border: `1px solid ${isDisabled ? 'rgba(0,0,0,0.06)' : item.color + '40'}`,
                              opacity: isDisabled ? 0.6 : 1,
                              textDecoration: isDisabled ? 'line-through' : 'none',
                            }}
                          >
                            <span
                              className="w-2.5 h-2.5 rounded-sm border"
                              style={{
                                background: isDisabled ? 'transparent' : item.color + '33',
                                borderColor: isDisabled ? '#ccc' : item.color,
                              }}
                            />
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] mt-2" style={{ color: '#aeaeb2' }}>
                      Data: Siteguide OpenAir / OpenAIP. For reference only — always check NOTAMs and official charts.
                    </p>
                  </div>
                )}

                {showZones && (
                  <div
                    className="rounded-2xl p-4 mb-4"
                    style={{
                      background: 'rgba(255,255,255,0.97)',
                      border: '1px solid rgba(0,0,0,0.08)',
                      boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
                    }}
                  >
                    <h3 className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#86868b' }}>
                      Zone Legend
                    </h3>
                    <div className="flex flex-wrap gap-x-2 gap-y-1.5">
                      {[
                        { label: 'Landing Zones', color: '#22c55e', type: 'LZ' },
                        { label: 'No Landing', color: '#ef4444', type: 'NoLZ' },
                        { label: 'Emergency LZ', color: '#f97316', type: 'EmgyLZ' },
                        { label: 'No-Fly', color: '#dc2626', type: 'NoFly' },
                        { label: 'Powerlines', color: '#eab308', type: 'Powerline' },
                        { label: 'Hazards', color: '#f59e0b', type: 'Haz' },
                        { label: 'No Launch', color: '#a855f7', type: 'NoLaunch' },
                        { label: 'Features', color: '#6366f1', type: 'Feature' },
                      ].map((item) => {
                        const isDisabled = disabledZoneTypes.has(item.type);
                        return (
                          <button
                            key={item.type}
                            onClick={() => {
                              setDisabledZoneTypes((prev) => {
                                const next = new Set(prev);
                                if (isDisabled) {
                                  next.delete(item.type);
                                } else {
                                  next.add(item.type);
                                }
                                return next;
                              });
                            }}
                            aria-pressed={!isDisabled}
                            className="inline-flex items-center gap-1.5 text-xs rounded-full px-2 py-0.5 transition-all"
                            style={{
                              color: isDisabled ? '#bbb' : '#555',
                              background: isDisabled ? 'rgba(0,0,0,0.03)' : item.color + '14',
                              border: `1px solid ${isDisabled ? 'rgba(0,0,0,0.06)' : item.color + '40'}`,
                              opacity: isDisabled ? 0.6 : 1,
                              textDecoration: isDisabled ? 'line-through' : 'none',
                            }}
                          >
                            <span
                              className="w-2.5 h-2.5 rounded-sm border"
                              style={{
                                background: isDisabled ? 'transparent' : item.color + '33',
                                borderColor: isDisabled ? '#ccc' : item.color,
                              }}
                            />
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] mt-2" style={{ color: '#aeaeb2' }}>
                      Data: Siteguide.org.au. For reference only — always verify conditions on site.
                    </p>
                  </div>
                )}

                <div
                  className="rounded-2xl p-5"
                  style={{
                    background: 'rgba(255,255,255,0.97)',
                    border: '1px solid rgba(0,0,0,0.08)',
                    boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
                  }}
                >
                  <h2
                    className="text-xl font-bold mb-3"
                    style={{ color: '#1d1d1f', fontFamily: 'var(--tmpl-font-heading)' }}
                  >
                    {selectedSite.name}
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-[#007aff]" />
                      <div>
                        <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: '#86868b' }}>Type</p>
                        <p className="text-sm font-medium" style={{ color: '#1d1d1f' }}>{selectedSite.type || 'N/A'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Compass className="w-4 h-4 text-[#007aff]" />
                      <div>
                        <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: '#86868b' }}>Wind Dir</p>
                        <p className="text-sm font-medium" style={{ color: '#1d1d1f' }}>{selectedSite.windDir || 'N/A'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-[#007aff]" />
                      <div>
                        <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: '#86868b' }}>Lat</p>
                        <p className="text-sm font-medium" style={{ color: '#1d1d1f' }}>{selectedSite.lat.toFixed(4)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-[#007aff]" />
                      <div>
                        <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: '#86868b' }}>Lon</p>
                        <p className="text-sm font-medium" style={{ color: '#1d1d1f' }}>{selectedSite.lon.toFixed(4)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
                    <div className="flex flex-wrap gap-2">
                      {ringLegend.map((r) => (
                        <span key={r.label} className="inline-flex items-center gap-1.5 text-xs" style={{ color: '#86868b' }}>
                          <span className="w-3 h-0.5 rounded-full" style={{ background: r.color }} />
                          {r.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {selectorOpen && (
        <div className="fixed inset-0 z-[9999] lg:hidden" style={{ isolation: 'isolate' }}>
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setSelectorOpen(false)}
          />
          <div
            className="absolute bottom-0 left-0 right-0 rounded-t-2xl flex flex-col"
            style={{
              maxHeight: '85vh',
              background: 'rgba(255,255,255,0.98)',
              boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
            }}
          >
            <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
              <h3 className="text-sm font-semibold" style={{ color: '#1d1d1f' }}>Select XC Site</h3>
              <button onClick={() => setSelectorOpen(false)} className="p-1 rounded-full hover:bg-black/5">
                <X className="w-5 h-5" style={{ color: '#86868b' }} />
              </button>
            </div>
            <div className="p-2 pb-8 overflow-y-auto">
              {sortedSites.map((site) => (
                <button
                  key={site.id}
                  onClick={() => {
                    setSelectedSite(site);
                    setSelectorOpen(false);
                  }}
                  className="w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all"
                  style={{
                    background: selectedSite?.id === site.id ? 'rgba(0,122,255,0.1)' : 'transparent',
                    color: selectedSite?.id === site.id ? '#007aff' : '#1d1d1f',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 shrink-0" style={{ color: selectedSite?.id === site.id ? '#007aff' : '#86868b' }} />
                    <span>{site.name}</span>
                    {userLocation && (
                      <span className="ml-auto text-[10px] shrink-0 tabular-nums" style={{ color: '#86868b' }}>
                        {Math.round(haversineKm(userLocation.lat, userLocation.lon, site.lat, site.lon))} km
                      </span>
                    )}
                  </div>
                  {site.type && (
                    <span className="text-xs ml-6 mt-0.5 block" style={{ color: '#86868b' }}>
                      {site.type}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {showPilotSettings && (
        <PilotProfileSettings
          onClose={() => setShowPilotSettings(false)}
          portalContainer={isFullscreen && !document.fullscreenElement ? mapContainerRef.current : undefined}
        />
      )}
      {showPilotLogin && (
        <PilotLoginModal
          onClose={() => setShowPilotLogin(false)}
          onSuccess={() => setShowPilotLogin(false)}
          portalContainer={isFullscreen && !document.fullscreenElement ? mapContainerRef.current : undefined}
        />
      )}
    </div>
  );
}
