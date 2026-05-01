import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Save, Satellite } from "lucide-react";
import { usePilotAuth } from "@/contexts/PilotAuthContext";
import { useSettings } from "@/contexts/SettingsContext";

interface PilotProfileSettingsProps {
  onClose: () => void;
  portalContainer?: HTMLElement | null;
}

export function PilotProfileSettings({ onClose, portalContainer }: PilotProfileSettingsProps) {
  const { pilot, updateProfile } = usePilotAuth();
  const { settings } = useSettings();
  const [garminMapshare, setGarminMapshare] = useState(pilot?.garminMapshare || "");
  const [spotFeedId, setSpotFeedId] = useState(pilot?.spotFeedId || "");
  const [zoleoImei, setZoleoImei] = useState(pilot?.zoleoImei || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (pilot) {
      setGarminMapshare(pilot.garminMapshare || "");
      setSpotFeedId(pilot.spotFeedId || "");
      setZoleoImei(pilot.zoleoImei || "");
    }
  }, [pilot]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await updateProfile({
        garminMapshare: garminMapshare.trim() || null,
        spotFeedId: spotFeedId.trim() || null,
        zoleoImei: zoleoImei.trim() || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (!pilot) return null;

  const portalTarget = portalContainer || document.fullscreenElement || document.body;

  return createPortal(
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white rounded-t-xl z-10">
          <h3 className="font-semibold text-lg">Pilot Settings</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-5">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-sm font-medium" style={{ color: '#1d1d1f' }}>{pilot.name}</div>
            <div className="text-xs text-gray-500">{pilot.email}</div>
          </div>

          {(settings.satTrackerGarminVisible || settings.satTrackerSpotVisible || settings.satTrackerZoleoVisible) && (
            <>
              <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#1d1d1f' }}>
                <Satellite className="w-4 h-4 text-indigo-600" />
                Satellite Trackers
              </div>
              <p className="text-xs text-gray-500 -mt-3">
                Configure your satellite tracker so the retrieval system can locate you
                when your phone loses signal. You can set up one or more devices.
              </p>
            </>
          )}

          {settings.satTrackerGarminVisible && (
            <div className="space-y-2 bg-orange-50 rounded-lg p-3 border border-orange-100">
              <label className="text-sm font-medium flex items-center gap-1.5" style={{ color: '#1d1d1f' }}>
                <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />
                Garmin inReach MapShare
              </label>
              <input
                type="text"
                placeholder="Your MapShare name (e.g. JohnSmith)"
                value={garminMapshare}
                onChange={(e) => setGarminMapshare(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
              <div className="text-xs text-gray-500">
                Log in to explore.garmin.com → My Info → Social → enable MapShare.
                Your feed name is shown in the Raw KML Data URL.
              </div>
            </div>
          )}

          {settings.satTrackerSpotVisible && (
            <div className="space-y-2 bg-blue-50 rounded-lg p-3 border border-blue-100">
              <label className="text-sm font-medium flex items-center gap-1.5" style={{ color: '#1d1d1f' }}>
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                SPOT Tracker
              </label>
              <input
                type="text"
                placeholder="Your XML Feed ID"
                value={spotFeedId}
                onChange={(e) => setSpotFeedId(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <div className="text-xs text-gray-500">
                Log in to findmespot.com → Settings → XML Feed → Create XML Feed.
                Copy the Feed ID from the feed details page.
              </div>
            </div>
          )}

          {settings.satTrackerZoleoVisible && (
            <div className="space-y-2 bg-green-50 rounded-lg p-3 border border-green-100">
              <label className="text-sm font-medium flex items-center gap-1.5" style={{ color: '#1d1d1f' }}>
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                ZOLEO
              </label>
              <input
                type="text"
                placeholder="Your ZOLEO IMEI or Device ID"
                value={zoleoImei}
                onChange={(e) => setZoleoImei(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
              />
              <div className="text-xs text-gray-500">
                Find your IMEI in the ZOLEO app under Settings → Device Info.
                Your club admin needs to configure the ZOLEO developer API key for
                satellite tracking to work.
              </div>
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>
          )}

          {saved && (
            <div className="text-sm text-green-700 bg-green-50 p-2 rounded">Settings saved</div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>
    </div>,
    portalTarget
  );
}
