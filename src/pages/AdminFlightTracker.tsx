import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Save, Check, Navigation, Gauge, Mountain, Map, Palette, Trash2, Activity, Server, Satellite } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdminForm } from "@/hooks/useAdminForm";
import { UnsavedChangesModal } from "@/components/UnsavedChangesModal";
import { getCachedTileCount, clearTileCache, estimateTileCount } from "@/lib/tileCache";
import { api } from "@/lib/apiClient";

export function AdminFlightTracker() {
  const { token } = useAuth();
  const { settings, updateSettings, loading: settingsLoading } = useSettings();
  const { isDirty, markDirty, blocker, saving, justSaved, saveError, save } = useAdminForm({ successMessage: "Flight tracker settings saved" });

  const [enabled, setEnabled] = useState(false);
  const [gpsInterval, setGpsInterval] = useState("3");
  const [autoStartSpeed, setAutoStartSpeed] = useState("15");
  const [autoStartAltitude, setAutoStartAltitude] = useState("20");
  const [autoStopSpeed, setAutoStopSpeed] = useState("3");
  const [autoStopDuration, setAutoStopDuration] = useState("30");
  const [autoStopVerticalSpeed, setAutoStopVerticalSpeed] = useState("0.5");
  const [preRecordBuffer, setPreRecordBuffer] = useState("15");
  const [crumbFlushInterval, setCrumbFlushInterval] = useState("3");
  const [crumbWindowSize, setCrumbWindowSize] = useState("200");
  const [guestCacheExpiry, setGuestCacheExpiry] = useState("48");
  const [splineTension, setSplineTension] = useState("0.5");
  const [trailColor, setTrailColor] = useState("#FF4444");
  const [trailWidth, setTrailWidth] = useState("3");
  const [offlineTileRadius, setOfflineTileRadius] = useState("50");
  const [offlineZoomMin, setOfflineZoomMin] = useState("8");
  const [offlineZoomMax, setOfflineZoomMax] = useState("13");
  const [offlineLayers, setOfflineLayers] = useState<string[]>(["streets"]);

  const [emaAlpha, setEmaAlpha] = useState("0.3");
  const [vspeedAlpha, setVspeedAlpha] = useState("0.2");
  const [baroCalibSamples, setBaroCalibSamples] = useState("5");
  const [baroMaxDivergence, setBaroMaxDivergence] = useState("120");
  const [baroFusionWeight, setBaroFusionWeight] = useState("0.7");

  const [activeTtl, setActiveTtl] = useState("60");
  const [landedTtl, setLandedTtl] = useState("480");
  const [phoneStaleThreshold, setPhoneStaleThreshold] = useState("90");
  const [satMaxFixAge, setSatMaxFixAge] = useState("15");

  const [garminVisible, setGarminVisible] = useState(true);
  const [spotVisible, setSpotVisible] = useState(true);
  const [zoleoVisible, setZoleoVisible] = useState(true);

  const [cachedTiles, setCachedTiles] = useState(0);
  const [pilotCount, setPilotCount] = useState(0);
  const [flightCount, setFlightCount] = useState(0);

  useEffect(() => {
    if (!settingsLoading) {
      setEnabled(!!settings.flightTrackerEnabled);
      setGpsInterval(settings.ftGpsInterval || "3");
      setAutoStartSpeed(settings.ftAutoStartSpeed || "15");
      setAutoStartAltitude(settings.ftAutoStartAltitude || "20");
      setAutoStopSpeed(settings.ftAutoStopSpeed || "3");
      setAutoStopDuration(settings.ftAutoStopDuration || "30");
      setAutoStopVerticalSpeed(settings.ftAutoStopVerticalSpeed || "0.5");
      setPreRecordBuffer(settings.ftPreRecordBuffer || "15");
      setCrumbFlushInterval(settings.ftCrumbFlushInterval || "3");
      setCrumbWindowSize(settings.ftCrumbWindowSize || "200");
      setGuestCacheExpiry(settings.ftGuestCacheExpiry || "48");
      setSplineTension(settings.ftSplineTension || "0.5");
      setTrailColor(settings.ftTrailColor || "#FF4444");
      setTrailWidth(settings.ftTrailWidth || "3");
      setOfflineTileRadius(settings.ftOfflineTileRadius || "50");
      setOfflineZoomMin(settings.ftOfflineZoomMin || "8");
      setOfflineZoomMax(settings.ftOfflineZoomMax || "13");
      setEmaAlpha(settings.ftEmaAlpha || "0.3");
      setVspeedAlpha(settings.ftVspeedAlpha || "0.2");
      setBaroCalibSamples(settings.ftBaroCalibSamples || "5");
      setBaroMaxDivergence(settings.ftBaroMaxDivergence || "120");
      setBaroFusionWeight(settings.ftBaroFusionWeight || "0.7");
      setActiveTtl(settings.ftActiveTtl || "60");
      setLandedTtl(settings.ftLandedTtl || "480");
      setPhoneStaleThreshold(settings.ftPhoneStaleThreshold || "90");
      setSatMaxFixAge(settings.ftSatMaxFixAge || "15");
      setGarminVisible(settings.satTrackerGarminVisible !== false);
      setSpotVisible(settings.satTrackerSpotVisible !== false);
      setZoleoVisible(settings.satTrackerZoleoVisible !== false);
      try {
        setOfflineLayers(JSON.parse(settings.ftOfflineLayers || '["streets"]'));
      } catch {
        setOfflineLayers(["streets"]);
      }
    }
  }, [settingsLoading, settings]);

  useEffect(() => {
    getCachedTileCount().then(setCachedTiles).catch(() => {});

    api.get<{ pilots?: number; flights?: number }>("/api/pilot-auth/stats", token)
      .then((d) => {
        setPilotCount(d.pilots || 0);
        setFlightCount(d.flights || 0);
      })
      .catch(() => {});
  }, [token]);

  const handleSave = () => save(async () => {
    await updateSettings({
      flightTrackerEnabled: enabled,
      ftGpsInterval: gpsInterval,
      ftAutoStartSpeed: autoStartSpeed,
      ftAutoStartAltitude: autoStartAltitude,
      ftAutoStopSpeed: autoStopSpeed,
      ftAutoStopDuration: autoStopDuration,
      ftAutoStopVerticalSpeed: autoStopVerticalSpeed,
      ftPreRecordBuffer: preRecordBuffer,
      ftCrumbFlushInterval: crumbFlushInterval,
      ftCrumbWindowSize: crumbWindowSize,
      ftGuestCacheExpiry: guestCacheExpiry,
      ftSplineTension: splineTension,
      ftTrailColor: trailColor,
      ftTrailWidth: trailWidth,
      ftOfflineTileRadius: offlineTileRadius,
      ftOfflineZoomMin: offlineZoomMin,
      ftOfflineZoomMax: offlineZoomMax,
      ftOfflineLayers: JSON.stringify(offlineLayers),
      ftEmaAlpha: emaAlpha,
      ftVspeedAlpha: vspeedAlpha,
      ftBaroCalibSamples: baroCalibSamples,
      ftBaroMaxDivergence: baroMaxDivergence,
      ftBaroFusionWeight: baroFusionWeight,
      ftActiveTtl: activeTtl,
      ftLandedTtl: landedTtl,
      ftPhoneStaleThreshold: phoneStaleThreshold,
      ftSatMaxFixAge: satMaxFixAge,
      satTrackerGarminVisible: garminVisible,
      satTrackerSpotVisible: spotVisible,
      satTrackerZoleoVisible: zoleoVisible,
    });
  });

  const toggleLayer = (layer: string) => {
    setOfflineLayers((prev) =>
      prev.includes(layer) ? prev.filter((l) => l !== layer) : [...prev, layer]
    );
    markDirty();
  };

  const tileEstimate = estimateTileCount(
    Number(offlineTileRadius) || 50,
    Number(offlineZoomMin) || 8,
    Number(offlineZoomMax) || 13,
    offlineLayers.length
  );

  const estimatedSizeMb = Math.round(tileEstimate * 15 / 1024);

  const field = (label: string, value: string, onChange: (v: string) => void, unit?: string, desc?: string, step?: string) => (
    <div className="space-y-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          step={step}
          onChange={(e) => { onChange(e.target.value); markDirty(); }}
          className="w-24 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
        />
        {unit && <span className="text-xs text-gray-400">{unit}</span>}
      </div>
      {desc && <p className="text-xs text-gray-400">{desc}</p>}
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <UnsavedChangesModal blocker={blocker} onSave={handleSave} />

      <div className="flex items-center gap-3 mb-6">
        <Link to="/admin" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Flight Tracker</h1>
          <p className="text-sm text-gray-500">Configure GPS breadcrumb tracking and offline maps</p>
        </div>
        <Button
          onClick={handleSave}
          disabled={!isDirty && !saveError}
          className={`${justSaved ? "bg-green-500 hover:bg-green-600" : ""}`}
        >
          {justSaved ? <><Check className="w-4 h-4 mr-1" /> Saved!</> : <><Save className="w-4 h-4 mr-1" /> Save Changes</>}
        </Button>
      </div>

      {saveError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg mb-4 text-sm">
          {saveError}
        </div>
      )}

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Navigation className="w-5 h-5 text-sky-500" />
              General
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Enable Flight Tracker</p>
                <p className="text-sm text-gray-500">Show flight tracking controls on the XC Maps page</p>
              </div>
              <button
                onClick={() => { setEnabled(!enabled); markDirty(); }}
                className={`relative w-12 h-6 rounded-full transition-colors ${enabled ? "bg-sky-500" : "bg-gray-300"}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    enabled ? "translate-x-6" : ""
                  }`}
                />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2 border-t">
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-sky-600">{pilotCount}</p>
                <p className="text-xs text-gray-500">Registered Pilots</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-sky-600">{flightCount}</p>
                <p className="text-xs text-gray-500">Recorded Flights</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="w-5 h-5 text-sky-500" />
              GPS Settings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {field("GPS Sample Interval", gpsInterval, setGpsInterval, "seconds", "How often to record a position")}
              {field("UI Update Interval", crumbFlushInterval, setCrumbFlushInterval, "seconds", "How often breadcrumbs flush to the map display (lower = smoother but heavier)")}
              {field("Breadcrumb Window", crumbWindowSize, setCrumbWindowSize, "points", "Recent breadcrumbs kept in memory for map updates (full trail drawn separately)")}
              {field("Pre-Record Buffer", preRecordBuffer, setPreRecordBuffer, "seconds", "Background recording before auto-start triggers")}
              {field("Guest Cache Expiry", guestCacheExpiry, setGuestCacheExpiry, "hours", "How long guest flight data persists in browser")}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mountain className="w-5 h-5 text-sky-500" />
              Auto-Start / Auto-Stop
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {field("Auto-Start Speed", autoStartSpeed, setAutoStartSpeed, "km/h", "Ground speed threshold to trigger auto-start")}
              {field("Auto-Start Altitude", autoStartAltitude, setAutoStartAltitude, "m change", "Altitude change to trigger auto-start")}
            </div>
            <div className="border-t pt-4">
              <p className="text-sm font-medium text-gray-600 mb-3">Landing Detection</p>
              <p className="text-xs text-gray-400 mb-3">
                Auto-stop triggers only when BOTH ground speed AND vertical speed are below their thresholds for the specified duration. This prevents false landings when thermalling (low ground speed but still climbing/sinking).
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {field("Ground Speed", autoStopSpeed, setAutoStopSpeed, "km/h", "Below this = horizontally stationary")}
                {field("Vertical Speed", autoStopVerticalSpeed, setAutoStopVerticalSpeed, "m/s", "Below this = vertically stationary", "0.1")}
                {field("Duration", autoStopDuration, setAutoStopDuration, "seconds", "Time both must be below threshold")}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-sky-500" />
              Signal Processing
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-gray-400">
              Advanced tuning for GPS smoothing and barometer fusion. Default values work well for most conditions.
            </p>
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-3">Speed Smoothing (EMA)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {field("Speed EMA Alpha", emaAlpha, setEmaAlpha, "0-1", "Higher = more responsive, lower = smoother", "0.05")}
                  {field("Vertical Speed EMA Alpha", vspeedAlpha, setVspeedAlpha, "0-1", "Smoothing factor for climb/sink rate", "0.05")}
                </div>
              </div>
              <div className="border-t pt-4">
                <p className="text-sm font-medium text-gray-600 mb-3">Barometer Fusion</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {field("Calibration Samples", baroCalibSamples, setBaroCalibSamples, "readings", "GPS fixes needed before baro activates")}
                  {field("Max Divergence", baroMaxDivergence, setBaroMaxDivergence, "meters", "Baro disabled if it diverges from GPS beyond this")}
                  {field("Baro Fusion Weight", baroFusionWeight, setBaroFusionWeight, "0-1", "Weight given to barometer vs GPS altitude", "0.05")}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="w-5 h-5 text-sky-500" />
              Server-Side Thresholds
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-gray-400">
              Controls how the server manages live pilot positions and satellite tracker polling.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {field("Active Pilot TTL", activeTtl, setActiveTtl, "seconds", "Remove flying pilot from live map if no update received")}
              {field("Landed Pilot TTL", landedTtl, setLandedTtl, "minutes", "Remove landed pilot from live map after this duration")}
              {field("Phone Stale Threshold", phoneStaleThreshold, setPhoneStaleThreshold, "seconds", "Fall back to satellite if phone hasn't reported in this long")}
              {field("Satellite Max Fix Age", satMaxFixAge, setSatMaxFixAge, "minutes", "Ignore satellite positions older than this")}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Satellite className="w-5 h-5 text-sky-500" />
              Satellite Tracker Visibility
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-gray-400">
              Control which satellite tracker options are visible to pilots in their settings dialog.
              Hidden trackers won't appear in the pilot profile — useful for hiding untested integrations.
            </p>
            <div className="space-y-3">
              {[
                { label: "Garmin inReach", value: garminVisible, setter: setGarminVisible, color: "bg-orange-500" },
                { label: "SPOT Tracker", value: spotVisible, setter: setSpotVisible, color: "bg-blue-500" },
                { label: "ZOLEO", value: zoleoVisible, setter: setZoleoVisible, color: "bg-green-500" },
              ].map(({ label, value, setter, color }) => (
                <label key={label} className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={(e) => { setter(e.target.checked); markDirty(); }}
                    className="w-4 h-4 rounded border-gray-300 text-sky-500 focus:ring-sky-400"
                  />
                  <span className={`w-2 h-2 rounded-full ${color}`} />
                  <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">{label}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${value ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {value ? 'Visible' : 'Hidden'}
                  </span>
                </label>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="w-5 h-5 text-sky-500" />
              Trail Appearance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Trail Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={trailColor}
                    onChange={(e) => { setTrailColor(e.target.value); markDirty(); }}
                    className="w-10 h-8 border rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={trailColor}
                    onChange={(e) => { setTrailColor(e.target.value); markDirty(); }}
                    className="w-24 border rounded-lg px-3 py-1.5 text-sm"
                  />
                </div>
              </div>
              {field("Trail Width", trailWidth, setTrailWidth, "px")}
              {field("Spline Tension", splineTension, setSplineTension, "0-1", "Smoothness of the trail curve")}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Map className="w-5 h-5 text-sky-500" />
              Offline Map Tiles
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-500">
              Automatically cache map tiles when the XC Maps page is opened, so the map works without cell service.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {field("Cache Radius", offlineTileRadius, setOfflineTileRadius, "km", "Area around site to cache")}
              {field("Min Zoom Level", offlineZoomMin, setOfflineZoomMin, "", "Lowest zoom to cache (8 = regional)")}
              {field("Max Zoom Level", offlineZoomMax, setOfflineZoomMax, "", "Highest zoom to cache (13 = street detail)")}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Layers to Cache</label>
              <div className="flex gap-2">
                {["streets", "topo", "satellite"].map((layer) => (
                  <button
                    key={layer}
                    onClick={() => toggleLayer(layer)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                      offlineLayers.includes(layer)
                        ? "bg-sky-100 border-sky-300 text-sky-700"
                        : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    {layer.charAt(0).toUpperCase() + layer.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Estimated tiles per site</span>
                <span className="font-medium">{tileEstimate.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Estimated download size</span>
                <span className="font-medium">~{estimatedSizeMb} MB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Currently cached</span>
                <span className="font-medium">{cachedTiles.toLocaleString()} tiles</span>
              </div>
            </div>

            <button
              onClick={async () => {
                await clearTileCache();
                setCachedTiles(0);
              }}
              className="flex items-center gap-2 text-sm text-red-500 hover:text-red-600"
            >
              <Trash2 className="w-4 h-4" /> Clear Tile Cache
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
