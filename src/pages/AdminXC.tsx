import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronDown, ChevronUp, Map, Wind, Trophy, Plus, Pencil, Trash2, X, Search, ExternalLink, Eye, Save, Check, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdminForm } from "@/hooks/useAdminForm";
import { UnsavedChangesModal } from "@/components/UnsavedChangesModal";
import { useCompetitions, useXCSites, useAdminCompetitions, useCompetitionMutation } from "@/hooks/api";
import { api } from "@/lib/apiClient";

interface Competition {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  location: string;
  pilotRating: string;
  rulesSummary: string;
  registrationUrl: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

const emptyCompForm = {
  name: "",
  description: "",
  startDate: "",
  endDate: "",
  location: "",
  pilotRating: "",
  rulesSummary: "",
  registrationUrl: "",
  status: "upcoming",
};

export function AdminXC() {
  const { token } = useAuth();
  const { settings, updateSettings, loading: settingsLoading } = useSettings();
  const { isDirty, markDirty, blocker, saving, justSaved, saveError, save } = useAdminForm({ successMessage: "XC settings saved" });
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["maps"]));

  const { data: competitions = [] } = useCompetitions();
  const { data: xcSites = [] } = useXCSites();
  const compMutation = useCompetitionMutation();
  const [compSearch, setCompSearch] = useState("");
  const [compEditingId, setCompEditingId] = useState<string | null>(null);
  const [showCompForm, setShowCompForm] = useState(false);
  const [compForm, setCompForm] = useState(emptyCompForm);
  const [compFormError, setCompFormError] = useState("");
  const [compSaving, setCompSaving] = useState(false);
  const [compDeleteTarget, setCompDeleteTarget] = useState<Competition | null>(null);
  const [compDeleteError, setCompDeleteError] = useState("");
  const [compPreviewId, setCompPreviewId] = useState<string | null>(null);

  const [localMapsEnabled, setLocalMapsEnabled] = useState(false);
  const [localMapsTitle, setLocalMapsTitle] = useState("");
  const [localMapsDescription, setLocalMapsDescription] = useState("");
  const [localAirspaceEnabled, setLocalAirspaceEnabled] = useState(false);
  const [localCompetitionsEnabled, setLocalCompetitionsEnabled] = useState(false);
  const [localMapAirspaceButton, setLocalMapAirspaceButton] = useState(true);
  const [localMapWindButton, setLocalMapWindButton] = useState(true);

  const [wfParticleCount, setWfParticleCount] = useState("1200");
  const [wfTrailLength, setWfTrailLength] = useState("12");
  const [wfMaxInfluenceKm, setWfMaxInfluenceKm] = useState("120");
  const [wfFadeStartKm, setWfFadeStartKm] = useState("80");
  const [wfIdwPower, setWfIdwPower] = useState("2");
  const [wfSpeedScale, setWfSpeedScale] = useState("0.4");
  const [wfLineWidth, setWfLineWidth] = useState("1.5");
  const [wfOpacity, setWfOpacity] = useState("0.7");
  const [wfMaxParticleSpeed, setWfMaxParticleSpeed] = useState("4");
  const [wfParticleMaxAge, setWfParticleMaxAge] = useState("180");

  const DEFAULT_RING_DISTANCES = [10, 20, 50, 100];
  const parseRings = (s: string | undefined): number[] => {
    if (!s) return DEFAULT_RING_DISTANCES;
    try {
      const p = JSON.parse(s);
      if (Array.isArray(p) && p.length > 0) return p.filter((n: any) => typeof n === 'number' && n > 0 && n <= 500).slice(0, 20);
    } catch {}
    return DEFAULT_RING_DISTANCES;
  };
  const [ringDistances, setRingDistances] = useState<number[]>(() => parseRings(settings.xcDistanceRings));
  const [newRingValue, setNewRingValue] = useState("");

  useEffect(() => {
    setLocalMapsEnabled(!!settings.xcMapsEnabled);
    setLocalMapsTitle(settings.xcMapsTitle || "");
    setLocalMapsDescription(settings.xcMapsDescription || "");
    setLocalAirspaceEnabled(!!settings.xcAirspaceEnabled);
    setLocalCompetitionsEnabled(!!settings.xcCompetitionsEnabled);
    setLocalMapAirspaceButton(settings.xcMapAirspaceButtonEnabled !== false);
    setLocalMapWindButton(settings.xcMapWindButtonEnabled !== false);
    setRingDistances(parseRings(settings.xcDistanceRings));
    setWfParticleCount(settings.wfParticleCount || "1200");
    setWfTrailLength(settings.wfTrailLength || "12");
    setWfMaxInfluenceKm(settings.wfMaxInfluenceKm || "120");
    setWfFadeStartKm(settings.wfFadeStartKm || "80");
    setWfIdwPower(settings.wfIdwPower || "2");
    setWfSpeedScale(settings.wfSpeedScale || "0.4");
    setWfLineWidth(settings.wfLineWidth || "1.5");
    setWfOpacity(settings.wfOpacity || "0.7");
    setWfMaxParticleSpeed(settings.wfMaxParticleSpeed || "4");
    setWfParticleMaxAge(settings.wfParticleMaxAge || "180");
  }, [settings.xcMapsEnabled, settings.xcMapsTitle, settings.xcMapsDescription, settings.xcAirspaceEnabled, settings.xcCompetitionsEnabled, settings.xcMapAirspaceButtonEnabled, settings.xcMapWindButtonEnabled, settings.xcDistanceRings,
      settings.wfParticleCount, settings.wfTrailLength, settings.wfMaxInfluenceKm, settings.wfFadeStartKm,
      settings.wfIdwPower, settings.wfSpeedScale, settings.wfLineWidth, settings.wfOpacity,
      settings.wfMaxParticleSpeed, settings.wfParticleMaxAge]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const saveAll = useCallback(() => save(async () => {
    const sorted = [...ringDistances].sort((a, b) => a - b);
    await updateSettings({
      xcMapsEnabled: localMapsEnabled,
      xcMapsTitle: localMapsTitle,
      xcMapsDescription: localMapsDescription,
      xcAirspaceEnabled: localAirspaceEnabled,
      xcCompetitionsEnabled: localCompetitionsEnabled,
      xcMapAirspaceButtonEnabled: localMapAirspaceButton,
      xcMapWindButtonEnabled: localMapWindButton,
      xcDistanceRings: JSON.stringify(sorted),
      wfParticleCount,
      wfTrailLength,
      wfMaxInfluenceKm,
      wfFadeStartKm,
      wfIdwPower,
      wfSpeedScale,
      wfLineWidth,
      wfOpacity,
      wfMaxParticleSpeed,
      wfParticleMaxAge,
    });
  }), [localMapsEnabled, localMapsTitle, localMapsDescription, localAirspaceEnabled, localCompetitionsEnabled, localMapAirspaceButton, localMapWindButton, ringDistances,
      wfParticleCount, wfTrailLength, wfMaxInfluenceKm, wfFadeStartKm, wfIdwPower,
      wfSpeedScale, wfLineWidth, wfOpacity, wfMaxParticleSpeed, wfParticleMaxAge,
      updateSettings, save]);

  const addRing = () => {
    const val = parseFloat(newRingValue);
    if (!val || val <= 0 || val > 500 || ringDistances.includes(val) || ringDistances.length >= 20) return;
    setRingDistances(prev => [...prev, val].sort((a, b) => a - b));
    setNewRingValue("");
    markDirty();
  };

  const removeRing = (km: number) => {
    const remaining = ringDistances.filter(d => d !== km);
    if (remaining.length === 0) return;
    setRingDistances(remaining);
    markDirty();
  };

  const resetRingsToDefault = () => {
    setRingDistances([...DEFAULT_RING_DISTANCES]);
    markDirty();
  };


  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredComps = competitions.filter(c => {
    if (!compSearch) return true;
    const term = compSearch.toLowerCase();
    return c.name.toLowerCase().includes(term) ||
      (c.location || "").toLowerCase().includes(term) ||
      (c.status || "").toLowerCase().includes(term);
  });

  const openAddComp = () => {
    setCompEditingId(null);
    setCompForm(emptyCompForm);
    setCompFormError("");
    setShowCompForm(true);
    setCompPreviewId(null);
    if (!expandedSections.has("competitions")) toggleSection("competitions");
  };

  const openEditComp = (c: Competition) => {
    setCompEditingId(c.id);
    setCompForm({
      name: c.name,
      description: c.description || "",
      startDate: c.startDate || "",
      endDate: c.endDate || "",
      location: c.location || "",
      pilotRating: c.pilotRating || "",
      rulesSummary: c.rulesSummary || "",
      registrationUrl: c.registrationUrl || "",
      status: c.status || "upcoming",
    });
    setCompFormError("");
    setShowCompForm(true);
    setCompPreviewId(null);
  };

  const handleCompSave = async () => {
    setCompFormError("");
    if (!compForm.name.trim()) {
      setCompFormError("Competition name is required");
      return;
    }
    setCompSaving(true);
    try {
      await compMutation.save.mutateAsync({ id: compEditingId ?? undefined, data: compForm });
      setShowCompForm(false);
      setCompEditingId(null);
    } catch (e: unknown) {
      setCompFormError(e instanceof Error ? e.message : "Failed to save competition");
    } finally {
      setCompSaving(false);
    }
  };

  const handleCompDelete = async () => {
    if (!compDeleteTarget) return;
    setCompDeleteError("");
    try {
      await compMutation.remove.mutateAsync(compDeleteTarget.id);
      setCompDeleteTarget(null);
    } catch (e: unknown) {
      setCompDeleteError(e instanceof Error ? e.message : "Failed to delete competition");
    }
  };

  const formatDate = (d: string) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      upcoming: "bg-blue-100 text-blue-800",
      active: "bg-green-100 text-green-800",
      completed: "bg-gray-100 text-gray-600",
    };
    return (
      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || colors.upcoming}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const renderCompForm = () => (
    <div className="px-5 pb-5 pt-4 bg-sky-50/50 border-t border-sky-200/40 space-y-4">
      {compFormError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{compFormError}</div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground-label mb-1">Competition Name *</label>
          <input
            type="text"
            value={compForm.name}
            onChange={e => setCompForm(prev => ({ ...prev, name: e.target.value }))}
            className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky bg-white"
            placeholder="e.g. Summer XC Series"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground-label mb-1">Location</label>
          <input
            type="text"
            value={compForm.location}
            onChange={e => setCompForm(prev => ({ ...prev, location: e.target.value }))}
            className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky bg-white"
            placeholder="e.g. Bright, Victoria"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground-label mb-1">Start Date</label>
          <input
            type="date"
            value={compForm.startDate}
            onChange={e => setCompForm(prev => ({ ...prev, startDate: e.target.value }))}
            className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky bg-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground-label mb-1">End Date</label>
          <input
            type="date"
            value={compForm.endDate}
            onChange={e => setCompForm(prev => ({ ...prev, endDate: e.target.value }))}
            className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky bg-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground-label mb-1">Status</label>
          <select
            value={compForm.status}
            onChange={e => setCompForm(prev => ({ ...prev, status: e.target.value }))}
            className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky bg-white"
          >
            <option value="upcoming">Upcoming</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground-label mb-1">Pilot Rating Requirement</label>
          <input
            type="text"
            value={compForm.pilotRating}
            onChange={e => setCompForm(prev => ({ ...prev, pilotRating: e.target.value }))}
            className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky bg-white"
            placeholder="e.g. PG3+ or All Levels"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground-label mb-1">Registration URL</label>
          <input
            type="url"
            value={compForm.registrationUrl}
            onChange={e => setCompForm(prev => ({ ...prev, registrationUrl: e.target.value }))}
            className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky bg-white"
            placeholder="https://example.com/register"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground-label mb-1">Description</label>
        <textarea
          value={compForm.description}
          onChange={e => setCompForm(prev => ({ ...prev, description: e.target.value }))}
          className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky font-mono text-sm bg-white"
          placeholder="Describe the competition..."
          rows={3}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground-label mb-1">Rules / Scoring Summary</label>
        <textarea
          value={compForm.rulesSummary}
          onChange={e => setCompForm(prev => ({ ...prev, rulesSummary: e.target.value }))}
          className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky font-mono text-sm bg-white"
          placeholder="e.g. GAP scoring, 3 valid tasks required..."
          rows={2}
        />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" onClick={() => { setShowCompForm(false); setCompEditingId(null); }}>Cancel</Button>
        <Button
          onClick={handleCompSave}
          disabled={compSaving}
          className="bg-sky hover:bg-sky-light text-white"
        >
          {compSaving ? "Saving..." : (compEditingId ? "Update Competition" : "Add Competition")}
        </Button>
      </div>
    </div>
  );

  const SaveButton = () => (
    <Button
      onClick={saveAll}
      disabled={!isDirty && !justSaved}
      className={`px-8 transition-all duration-300 ${justSaved ? "bg-emerald-500 hover:bg-emerald-600 scale-105" : "bg-navy hover:bg-navy-light"} text-white disabled:opacity-50`}
    >
      {justSaved ? <><Check className="w-4 h-4 mr-2" /> Saved!</> : <><Save className="w-4 h-4 mr-2" /> Save Changes</>}
    </Button>
  );

  return (
    <div className="bg-background min-h-screen py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link to="/admin" className="text-sky hover:underline text-sm flex items-center gap-1 mb-4">
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </Link>
          <h1 className="text-3xl font-extrabold text-navy flex items-center gap-2">
            <Map className="w-8 h-8" /> XC (Cross-Country)
          </h1>
          <p className="text-foreground-secondary mt-1">Manage cross-country maps, airspace resources, and competitions from one place.</p>
        </div>

        {saveError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {saveError}
          </div>
        )}

        <div className="flex justify-end mb-6">
          <SaveButton />
        </div>

        <div className="space-y-4">

          <Card className="border-l-4 border-l-sky">
            <button type="button" onClick={() => toggleSection("maps")} className="w-full text-left">
              <CardHeader className="flex flex-row items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <Map className="w-5 h-5 text-sky" />
                  <div>
                    <CardTitle className="text-navy text-lg">XC Maps</CardTitle>
                    <p className="text-sm text-muted-foreground mt-0.5">Distance rings and bearing lines for cross-country planning.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${localMapsEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {localMapsEnabled ? "Visible" : "Hidden"}
                  </span>
                  {expandedSections.has("maps") ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                </div>
              </CardHeader>
            </button>
            {expandedSections.has("maps") && (
              <CardContent className="pt-0 pb-5 space-y-4">
                <div className="border-t border-border pt-4">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-5 h-5 text-sky focus:ring-sky border-border rounded cursor-pointer"
                      checked={localMapsEnabled}
                      onChange={(e) => { setLocalMapsEnabled(e.target.checked); markDirty(); }}
                      disabled={settingsLoading}
                    />
                    <span className="ml-2 text-sm font-medium text-foreground-label">
                      Show XC Maps in navigation
                    </span>
                  </label>
                  <p className="mt-1 ml-7 text-xs text-muted-foreground">
                    When enabled, XC Maps appears in the XC dropdown menu and at /xc/maps.
                  </p>
                </div>

                <div className="border-t border-border pt-4">
                  <h4 className="text-sm font-medium text-navy mb-2">Page Content</h4>
                  <p className="text-xs text-muted-foreground mb-3">
                    Customise the heading and description shown at the top of the XC Maps page.
                  </p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-foreground-label mb-1">Title</label>
                      <input
                        type="text"
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:ring-2 focus:ring-sky focus:border-sky"
                        value={localMapsTitle}
                        onChange={(e) => { setLocalMapsTitle(e.target.value); markDirty(); }}
                        placeholder="XC Maps"
                        disabled={settingsLoading}
                      />
                      <p className="text-xs text-muted-foreground mt-1">Leave blank to use the default "XC Maps".</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground-label mb-1">Description</label>
                      <textarea
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:ring-2 focus:ring-sky focus:border-sky min-h-[100px]"
                        value={localMapsDescription}
                        onChange={(e) => { setLocalMapsDescription(e.target.value); markDirty(); }}
                        placeholder="XC distance rings, Bearing Lines, Switchable Airspace Overlay..."
                        disabled={settingsLoading}
                        rows={4}
                      />
                      <p className="text-xs text-muted-foreground mt-1">Supports line breaks. Leave blank to use the default description.</p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-border pt-4">
                  <h4 className="text-sm font-medium text-navy mb-3">Map Overlay Buttons</h4>
                  <p className="text-xs text-muted-foreground mb-3">
                    Control which overlay toggle buttons appear on the XC Maps map view.
                  </p>
                  <div className="space-y-3">
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-5 h-5 text-sky focus:ring-sky border-border rounded cursor-pointer"
                        checked={localMapAirspaceButton}
                        onChange={(e) => { setLocalMapAirspaceButton(e.target.checked); markDirty(); }}
                        disabled={settingsLoading}
                      />
                      <span className="ml-2 text-sm font-medium text-foreground-label">
                        Show Airspace button on map
                      </span>
                    </label>
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-5 h-5 text-sky focus:ring-sky border-border rounded cursor-pointer"
                        checked={localMapWindButton}
                        onChange={(e) => { setLocalMapWindButton(e.target.checked); markDirty(); }}
                        disabled={settingsLoading}
                      />
                      <span className="ml-2 text-sm font-medium text-foreground-label">
                        Show Live Wind button on map
                      </span>
                    </label>
                  </div>
                </div>

                <div className="border-t border-border pt-4">
                  <h4 className="text-sm font-medium text-navy mb-2">Distance Rings</h4>
                  <p className="text-xs text-muted-foreground mb-3">
                    Configure which distance rings appear on XC Maps. Up to 20 rings, each between 1–500 km.
                  </p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {(Array.isArray(ringDistances) ? [...ringDistances] : []).sort((a, b) => a - b).map(km => (
                      <span
                        key={km}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-sky-50 text-sky-700 rounded-full text-sm font-medium"
                      >
                        {km} km
                        <button
                          type="button"
                          onClick={() => removeRing(km)}
                          disabled={ringDistances.length <= 1}
                          className="ml-0.5 text-sky-400 hover:text-red-500 transition-colors disabled:opacity-50"
                          title={ringDistances.length <= 1 ? 'At least one ring is required' : `Remove ${km} km ring`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                    {ringDistances.length === 0 && (
                      <span className="text-xs text-muted-foreground italic">No rings configured</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="500"
                      step="any"
                      value={newRingValue}
                      onChange={e => setNewRingValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRing(); } }}
                      placeholder="e.g. 5"
                      className="w-24 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm focus:ring-2 focus:ring-sky focus:border-sky outline-none"
                      disabled={ringDistances.length >= 20}
                    />
                    <span className="text-xs text-muted-foreground">km</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addRing}
                      disabled={ringDistances.length >= 20 || !newRingValue}
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      Add Ring
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={resetRingsToDefault}
                      className="ml-auto text-xs"
                    >
                      Reset to Defaults
                    </Button>
                  </div>
                </div>

                <div className="border-t border-border pt-4">
                  <h4 className="text-sm font-medium text-navy mb-2">XC-Enabled Sites ({(Array.isArray(xcSites) ? xcSites : []).length})</h4>
                  {xcSites.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {(Array.isArray(xcSites) ? xcSites : []).map(s => (
                        <Link
                          key={s.id}
                          to={`/admin/sites/${s.id}`}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-sky-50 text-sky-700 rounded-full text-xs font-medium hover:bg-sky-100 transition-colors"
                        >
                          {s.name}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No sites flagged as XC sites yet. Enable "XC Site" on individual site edit pages.</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    To add or remove XC sites, edit individual sites and toggle the "XC Site" checkbox.
                  </p>
                </div>
              </CardContent>
            )}
          </Card>

          <Card className="border-l-4 border-l-emerald-500">
            <button type="button" onClick={() => toggleSection("windfield")} className="w-full text-left">
              <CardHeader className="flex flex-row items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <Wind className="w-5 h-5 text-emerald-500" />
                  <div>
                    <CardTitle className="text-navy text-lg">Wind Field Overlay</CardTitle>
                    <p className="text-sm text-muted-foreground mt-0.5">Tune the animated wind streamlines shown on XC Maps.</p>
                  </div>
                </div>
                {expandedSections.has("windfield") ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
              </CardHeader>
            </button>
            {expandedSections.has("windfield") && (
              <CardContent className="pt-0 pb-5 space-y-5">
                <div className="border-t border-border pt-4">
                  <h4 className="text-sm font-medium text-navy mb-3">Particle Density &amp; Appearance</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-foreground-label mb-1">Particle Count</label>
                      <input type="number" min="100" max="5000" step="100" value={wfParticleCount}
                        onChange={e => { setWfParticleCount(e.target.value); markDirty(); }}
                        className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky bg-white text-sm" />
                      <p className="text-xs text-muted-foreground mt-1">Number of animated streamline particles. Higher = denser but uses more CPU. Default: 1200</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground-label mb-1">Trail Length</label>
                      <input type="number" min="2" max="50" step="1" value={wfTrailLength}
                        onChange={e => { setWfTrailLength(e.target.value); markDirty(); }}
                        className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky bg-white text-sm" />
                      <p className="text-xs text-muted-foreground mt-1">How many frames each particle's trail extends. Longer = more visible lines. Default: 12</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground-label mb-1">Line Width (px)</label>
                      <input type="number" min="0.5" max="5" step="0.5" value={wfLineWidth}
                        onChange={e => { setWfLineWidth(e.target.value); markDirty(); }}
                        className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky bg-white text-sm" />
                      <p className="text-xs text-muted-foreground mt-1">Stroke thickness of each streamline. Default: 1.5</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground-label mb-1">Opacity</label>
                      <input type="number" min="0.1" max="1" step="0.05" value={wfOpacity}
                        onChange={e => { setWfOpacity(e.target.value); markDirty(); }}
                        className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky bg-white text-sm" />
                      <p className="text-xs text-muted-foreground mt-1">Max opacity of streamlines at full confidence. Lower = more subtle. Default: 0.7</p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-border pt-4">
                  <h4 className="text-sm font-medium text-navy mb-3">Animation Speed</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-foreground-label mb-1">Speed Scale</label>
                      <input type="number" min="0.1" max="2" step="0.05" value={wfSpeedScale}
                        onChange={e => { setWfSpeedScale(e.target.value); markDirty(); }}
                        className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky bg-white text-sm" />
                      <p className="text-xs text-muted-foreground mt-1">Multiplier for how fast particles move relative to wind speed. Default: 0.4</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground-label mb-1">Max Speed (px/frame)</label>
                      <input type="number" min="1" max="15" step="0.5" value={wfMaxParticleSpeed}
                        onChange={e => { setWfMaxParticleSpeed(e.target.value); markDirty(); }}
                        className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky bg-white text-sm" />
                      <p className="text-xs text-muted-foreground mt-1">Cap on particle movement per frame to prevent streaking. Default: 4</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground-label mb-1">Particle Lifespan (frames)</label>
                      <input type="number" min="30" max="600" step="10" value={wfParticleMaxAge}
                        onChange={e => { setWfParticleMaxAge(e.target.value); markDirty(); }}
                        className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky bg-white text-sm" />
                      <p className="text-xs text-muted-foreground mt-1">How many frames before a particle respawns. Longer = steadier flow. Default: 180</p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-border pt-4">
                  <h4 className="text-sm font-medium text-navy mb-3">Interpolation Coverage</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-foreground-label mb-1">Max Influence (km)</label>
                      <input type="number" min="10" max="300" step="10" value={wfMaxInfluenceKm}
                        onChange={e => { setWfMaxInfluenceKm(e.target.value); markDirty(); }}
                        className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky bg-white text-sm" />
                      <p className="text-xs text-muted-foreground mt-1">Maximum distance a weather station can influence. Larger = wider coverage. Default: 120</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground-label mb-1">Fade Start (km)</label>
                      <input type="number" min="5" max="250" step="5" value={wfFadeStartKm}
                        onChange={e => { setWfFadeStartKm(e.target.value); markDirty(); }}
                        className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky bg-white text-sm" />
                      <p className="text-xs text-muted-foreground mt-1">Distance at which confidence begins fading. Must be less than Max Influence. Default: 80</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground-label mb-1">IDW Power</label>
                      <input type="number" min="0.5" max="5" step="0.5" value={wfIdwPower}
                        onChange={e => { setWfIdwPower(e.target.value); markDirty(); }}
                        className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky bg-white text-sm" />
                      <p className="text-xs text-muted-foreground mt-1">IDW exponent — higher values give nearby stations more weight. Default: 2</p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-border pt-3">
                  <button
                    type="button"
                    className="text-xs text-sky hover:underline"
                    onClick={() => {
                      setWfParticleCount("1200"); setWfTrailLength("12"); setWfMaxInfluenceKm("120");
                      setWfFadeStartKm("80"); setWfIdwPower("2"); setWfSpeedScale("0.4");
                      setWfLineWidth("1.5"); setWfOpacity("0.7"); setWfMaxParticleSpeed("4");
                      setWfParticleMaxAge("180"); markDirty();
                    }}
                  >
                    Reset all wind field settings to defaults
                  </button>
                </div>
              </CardContent>
            )}
          </Card>

          <Card className="border-l-4 border-l-cyan-500">
            <button type="button" onClick={() => toggleSection("airspace")} className="w-full text-left">
              <CardHeader className="flex flex-row items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <Wind className="w-5 h-5 text-cyan-500" />
                  <div>
                    <CardTitle className="text-navy text-lg">Airspace Resources</CardTitle>
                    <p className="text-sm text-muted-foreground mt-0.5">Airspace information, downloads, and reference links for XC pilots.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${localAirspaceEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {localAirspaceEnabled ? "Visible" : "Hidden"}
                  </span>
                  {expandedSections.has("airspace") ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                </div>
              </CardHeader>
            </button>
            {expandedSections.has("airspace") && (
              <CardContent className="pt-0 pb-5 space-y-4">
                <div className="border-t border-border pt-4">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-5 h-5 text-sky focus:ring-sky border-border rounded cursor-pointer"
                      checked={localAirspaceEnabled}
                      onChange={(e) => { setLocalAirspaceEnabled(e.target.checked); markDirty(); }}
                      disabled={settingsLoading}
                    />
                    <span className="ml-2 text-sm font-medium text-foreground-label">
                      Show Airspace page in navigation
                    </span>
                  </label>
                  <p className="mt-1 ml-7 text-xs text-muted-foreground">
                    When enabled, an Airspace link appears in the XC dropdown menu and at /xc/airspace.
                  </p>
                </div>

                <div className="border-t border-border pt-4">
                  <p className="text-sm text-foreground-secondary mb-2">
                    The Airspace page content is managed as a CMS page. You can edit its content, add file attachments, and customise the layout.
                  </p>
                  <Link
                    to="/admin/pages/airspace/edit"
                    className="inline-flex items-center gap-1 text-sm font-medium text-sky hover:text-navy transition-colors"
                  >
                    Edit Airspace Page Content →
                  </Link>
                </div>
              </CardContent>
            )}
          </Card>

          <Card className="border-l-4 border-l-indigo-500">
            <button type="button" onClick={() => toggleSection("competitions")} className="w-full text-left">
              <CardHeader className="flex flex-row items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <Trophy className="w-5 h-5 text-indigo-500" />
                  <div>
                    <CardTitle className="text-navy text-lg">Competitions</CardTitle>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Manage XC competitions and events. {(Array.isArray(competitions) ? competitions : []).length > 0 && `${(Array.isArray(competitions) ? competitions : []).length} competition${(Array.isArray(competitions) ? competitions : []).length === 1 ? '' : 's'} total.`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${localCompetitionsEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {localCompetitionsEnabled ? "Visible" : "Hidden"}
                  </span>
                  {expandedSections.has("competitions") ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                </div>
              </CardHeader>
            </button>
            {expandedSections.has("competitions") && (
              <CardContent className="pt-0 pb-5 space-y-4">
                <div className="border-t border-border pt-4">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-5 h-5 text-sky focus:ring-sky border-border rounded cursor-pointer"
                      checked={localCompetitionsEnabled}
                      onChange={(e) => { setLocalCompetitionsEnabled(e.target.checked); markDirty(); }}
                      disabled={settingsLoading}
                    />
                    <span className="ml-2 text-sm font-medium text-foreground-label">
                      Show Competitions in navigation
                    </span>
                  </label>
                  <p className="mt-1 ml-7 text-xs text-muted-foreground">
                    When enabled, competitions appear in the XC nav dropdown and at /xc/competitions.
                  </p>
                </div>

                <div className="border-t border-border pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="relative flex-1 max-w-sm">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-faint" />
                      <input
                        type="text"
                        placeholder="Search competitions..."
                        value={compSearch}
                        onChange={e => setCompSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-border rounded-md text-sm focus:ring-1 focus:ring-sky focus:border-sky"
                      />
                    </div>
                    <Button onClick={openAddComp} size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white ml-3">
                      <Plus className="w-4 h-4 mr-1" /> Add
                    </Button>
                  </div>

                  {showCompForm && !compEditingId && (
                    <div className="mb-4 bg-card rounded-xl border-2 border-indigo-400 shadow-md">
                      <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-200/60 flex items-center justify-between">
                        <h3 className="text-base font-bold text-navy">Add Competition</h3>
                        <button onClick={() => setShowCompForm(false)} className="p-1.5 hover:bg-indigo-100 rounded-lg">
                          <X className="w-4 h-4 text-foreground-faint" />
                        </button>
                      </div>
                      {renderCompForm()}
                    </div>
                  )}

                  <div className="space-y-3">
                    {(Array.isArray(filteredComps) ? filteredComps : []).map(c => (
                      <div key={c.id} className={`bg-card rounded-xl border ${showCompForm && compEditingId === c.id ? 'border-2 border-indigo-400 shadow-md' : 'border-border shadow-sm hover:shadow-md'} transition-shadow`}>
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="text-base font-bold text-navy truncate">{c.name}</h4>
                                {statusBadge(c.status)}
                              </div>
                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground-secondary">
                                {c.location && <span>{c.location}</span>}
                                <span>{formatDate(c.startDate)}{c.endDate ? ` — ${formatDate(c.endDate)}` : ""}</span>
                                {c.pilotRating && <span>Rating: {c.pilotRating}</span>}
                              </div>
                              {c.registrationUrl && !(showCompForm && compEditingId === c.id) && (
                                <a href={c.registrationUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-sky hover:text-navy font-medium mt-1">
                                  Registration <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          </div>

                          {!(showCompForm && compEditingId === c.id) && (
                            <>
                              <button
                                onClick={() => setCompPreviewId(compPreviewId === c.id ? null : c.id)}
                                className="mt-2 text-xs text-sky hover:text-navy font-medium inline-flex items-center gap-1"
                              >
                                <Eye className="w-3 h-3" />
                                {compPreviewId === c.id ? "Hide Details" : "Quick View"}
                                {compPreviewId === c.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </button>

                              {compPreviewId === c.id && (
                                <div className="mt-3 p-3 bg-indigo-50/50 border border-indigo-100 rounded-lg space-y-2 text-sm">
                                  {c.description && <div><span className="font-medium text-navy">Description:</span> <span className="text-foreground-secondary">{c.description}</span></div>}
                                  {c.rulesSummary && <div><span className="font-medium text-navy">Rules/Scoring:</span> <span className="text-foreground-secondary">{c.rulesSummary}</span></div>}
                                  {c.registrationUrl && (
                                    <div>
                                      <span className="font-medium text-navy">Registration:</span>{" "}
                                      <a href={c.registrationUrl} target="_blank" rel="noopener noreferrer" className="text-sky hover:text-navy underline">{c.registrationUrl}</a>
                                    </div>
                                  )}
                                </div>
                              )}

                              <div className="mt-2 flex gap-2 justify-end">
                                <Button variant="outline" size="sm" onClick={() => openEditComp(c)}>
                                  <Pencil className="w-3 h-3 mr-1" /> Edit
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => { setCompDeleteTarget(c); setCompDeleteError(""); }}
                                >
                                  <Trash2 className="w-3 h-3 mr-1" /> Delete
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                        {showCompForm && compEditingId === c.id && renderCompForm()}
                      </div>
                    ))}
                    {filteredComps.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        {compSearch ? "No competitions match your search." : (
                          <div>
                            <Trophy className="w-10 h-10 mx-auto mb-2 text-indigo-200" />
                            <p>No competitions yet. Click "Add" to create one.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        </div>

        <div className="flex justify-end mt-6">
          <SaveButton />
        </div>
      </div>

      <UnsavedChangesModal blocker={blocker} onSave={saveAll} />

      {compDeleteTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-navy mb-3">Delete Competition</h3>
            <p className="text-foreground-secondary mb-4">
              Are you sure you want to delete <strong>{compDeleteTarget.name}</strong>? This action cannot be undone.
            </p>
            {compDeleteError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">{compDeleteError}</div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCompDeleteTarget(null)}>Cancel</Button>
              <Button onClick={handleCompDelete} className="bg-red-600 hover:bg-red-700 text-white">Delete</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
