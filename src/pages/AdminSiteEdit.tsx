import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Save, Check, QrCode, Printer, RefreshCw, RotateCcw, Loader2, Archive, Eye, X, Sparkles, ImagePlus, MapPin, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { UnsavedChangesModal } from "@/components/UnsavedChangesModal";
import { QRCodeSVG } from "qrcode.react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { AISiteGeneratorModal } from "@/components/AISiteGeneratorModal";
import { WindCompass } from "@/components/WindCompass";
import { ClosureDatePicker } from "@/components/ui/ClosureDatePicker";
import { useSiteForm } from "@/hooks/useSiteForm";

// Fix for default marker icon in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom icon for weather stations
const weatherStationIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Custom icon for selected weather station
const selectedStationIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

function MapUpdater({ lat, lon }: { lat: number, lon: number }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lon) {
      map.setView([lat, lon], 12);
    }
  }, [lat, lon, map]);
  return null;
}

export function AdminSiteEdit() {
  const form = useSiteForm();
  const {
    token, settings, id, navigate, isNew, siteList,
    prevSiteId, nextSiteId, saveMessage, setSaveMessage,
    refreshMessage, setRefreshMessage,
    isDirty, markDirty, markClean, blocker, justSaved,
    essentialImages, setEssentialImages,
    showUnassignedText, setShowUnassignedText,
    formData, setFormData, baseUrl, qrCodeType, setQrCodeType,
    tideStations, nearbyStations, loadingStations,
    searchRadius, setSearchRadius,
    externalSites, selectedState, setSelectedState,
    allDbSites, uniqueStates, filteredSites,
    isAIModalOpen, setIsAIModalOpen,
    showBannerPicker, setShowBannerPicker,
    aiInitialUrl, aiPrompt, setAiPrompt,
    showSitePromptEditor, setShowSitePromptEditor,
    isRefreshing, liveSiteguideVersion,
    archives, selectedRestoreVersion, setSelectedRestoreVersion,
    isRestoring, restoreMessage, setRestoreMessage,
    siteDiffData, setSiteDiffData,
    siteDiffLoading,
    showSiteDiffModal, setShowSiteDiffModal,
    handleChange, handleSubmit, handleAIStart,
    handleRefreshSites, handleSavePrompt,
    applyScrapedData, handleRestoreSite, handleViewSiteDiff,
    checkInUrl, fieldViewUrl, xcMapsUrl,
    handlePrintFieldQR, handlePrintXCMapsQR, handlePrintQR,
    setBaseUrl, saveSite, siteIndex,
    navigateToSite, formatHeights,
    closureDates, setClosureDates,
    closurePillsMax, setClosurePillsMax,
  } = form;

  return (
    <div className="bg-background min-h-screen py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex gap-4 mb-6">
          <Link to="/admin/sites" className="inline-flex items-center text-sky hover:text-sky-light font-medium">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Manage Sites
          </Link>
          <span className="text-foreground-ghost">|</span>
          <Link to="/admin" className="inline-flex items-center text-muted-foreground hover:text-navy font-medium">
            Admin Dashboard
          </Link>
        </div>
        
        <h1 className="text-3xl font-extrabold text-navy mb-8">
          {isNew ? "Add New Site" : `Edit Site: ${formData.name}`}
        </h1>

        <form onSubmit={handleSubmit}>
          <div className="space-y-6">
            <div className="flex justify-end">
              <Button
                type="submit"
                className={`px-8 transition-all duration-300 ${justSaved ? "bg-emerald-500 hover:bg-emerald-600 scale-105" : "bg-navy hover:bg-navy-light"} text-white`}
              >
                {justSaved ? <><Check className="w-4 h-4 mr-2" /> Saved!</> : <><Save className="w-4 h-4 mr-2" /> Save Site</>}
              </Button>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-foreground-label">Siteguide URL</label>
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                      <select
                        className="min-w-0 flex-1 p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky bg-card"
                        value={selectedState}
                        onChange={(e) => {
                          setSelectedState(e.target.value);
                          setFormData(prev => ({ ...prev, siteguideUrl: "" }));
                        }}
                      >
                        <option value="">-- State/territory --</option>
                        {uniqueStates.map(state => (
                          <option key={state} value={state}>{state}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                      <select
                        className="min-w-0 sm:max-w-[280px] flex-1 p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky bg-card truncate"
                        onChange={(e) => {
                          const url = e.target.value;
                          if (!url) return;
                          const dbSite = allDbSites.find(s => s.siteguideUrl === url);
                          if (dbSite && dbSite.id !== id) {
                            navigate(`/admin/sites/${dbSite.id}/edit`);
                          } else {
                            setFormData(prev => ({ ...prev, siteguideUrl: url }));
                          }
                        }}
                        value={filteredSites.some(s => s.url === formData.siteguideUrl) ? formData.siteguideUrl : ""}
                      >
                        <option value="">{selectedState ? `-- ${filteredSites.length} sites in ${selectedState} --` : '-- Select a state first --'}</option>
                        {(() => {
                          const regions = [...new Set(filteredSites.map(s => s.region).filter(Boolean))].sort() as string[];
                          if (regions.length <= 1) {
                            return filteredSites.map((site, i) => (
                              <option key={i} value={site.url}>{site.name}</option>
                            ));
                          }
                          return regions.map(region => (
                            <optgroup key={region} label={region}>
                              {filteredSites.filter(s => s.region === region).map((site, i) => (
                                <option key={`${region}-${i}`} value={site.url}>{site.name}</option>
                              ))}
                            </optgroup>
                          ));
                        })()}
                      </select>
                      <Button 
                        type="button" 
                        onClick={handleAIStart}
                        disabled={!formData.siteguideUrl}
                        className={`shrink-0 flex items-center justify-center gap-2 px-4 whitespace-nowrap ${formData.siteguideUrl ? 'bg-sky hover:bg-sky-light text-white' : 'bg-gray-200 text-foreground-faint cursor-not-allowed'}`}
                      >
                        <Sparkles className="w-4 h-4" />
                        Scrape Site Guide
                      </Button>
                      <button
                        type="button"
                        onClick={() => setShowSitePromptEditor(!showSitePromptEditor)}
                        className="text-xs text-sky hover:underline shrink-0"
                      >
                        {showSitePromptEditor ? "Hide Prompt" : "Edit Prompt"}
                      </button>
                      {!isNew && siteList.length > 1 && (
                        <div className="flex items-center gap-1 shrink-0 ml-auto">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!prevSiteId}
                            onClick={() => navigateToSite(prevSiteId)}
                            className="px-2"
                            title="Previous site (auto-saves changes)"
                          >
                            <ChevronLeft className="w-4 h-4" />
                            Prev
                          </Button>
                          <span className="text-xs text-foreground-faint tabular-nums">{siteIndex + 1}/{siteList.length}</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!nextSiteId}
                            onClick={() => navigateToSite(nextSiteId)}
                            className="px-2"
                            title="Next site (auto-saves changes)"
                          >
                            Next
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center">
                      <div className="flex items-center gap-1">
                        <button 
                          type="button"
                          onClick={handleRefreshSites}
                          disabled={isRefreshing}
                          className={`p-1 transition-colors text-xs flex items-center gap-1 ${isRefreshing ? 'text-emerald-500 cursor-not-allowed' : 'text-foreground-faint hover:text-sky'}`}
                          title="Refresh Site List from Siteguide.org.au"
                        >
                          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                          <span>Refresh site list</span>
                        </button>
                        {refreshMessage && (
                          <div className={`p-2 rounded text-xs ${refreshMessage.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                            {refreshMessage.text}
                          </div>
                        )}
                      </div>
                    </div>
                    {!isNew && formData.siteguideUrl && (
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Siteguide Version:</span>
                          <span className="text-xs font-medium text-navy bg-muted px-2 py-0.5 rounded">{formData.siteguideVersion || (liveSiteguideVersion ? liveSiteguideVersion : "—")}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Last Scraped:</span>
                          <span className="text-xs font-medium text-navy bg-muted px-2 py-0.5 rounded">
                            {formData.siteguideScrapedAt
                              ? new Date(formData.siteguideScrapedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) + ", " + new Date(formData.siteguideScrapedAt).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true })
                              : "Not yet scraped"}
                          </span>
                        </div>
                        {liveSiteguideVersion && formData.siteguideVersion && liveSiteguideVersion !== formData.siteguideVersion && (
                          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                            New version available: {liveSiteguideVersion}
                          </div>
                        )}
                      </div>
                    )}
                    {!isNew && archives.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs text-foreground-faint">
                          <Archive className="w-3 h-3" />
                          Restore this site from archive
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                          <select
                            className="min-w-0 flex-1 p-1.5 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky bg-card text-xs"
                            value={selectedRestoreVersion}
                            onChange={(e) => {
                              setSelectedRestoreVersion(e.target.value);
                              setRestoreMessage(null);
                            }}
                          >
                            <option value="">-- Select archive version --</option>
                            {archives.map(a => (
                              <option key={a.id} value={a.siteguideVersion}>
                                Version {a.siteguideVersion} — {a.siteCount} sites — {new Date(a.archivedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                              </option>
                            ))}
                          </select>
                          <Button
                            type="button"
                            size="sm"
                            onClick={handleViewSiteDiff}
                            disabled={!selectedRestoreVersion || siteDiffLoading}
                            className={`shrink-0 text-xs ${selectedRestoreVersion && !siteDiffLoading ? 'bg-sky hover:bg-sky/80 text-white' : 'bg-muted text-foreground-faint cursor-not-allowed'}`}
                          >
                            {siteDiffLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
                            Compare
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={handleRestoreSite}
                            disabled={!selectedRestoreVersion || isRestoring}
                            className={`shrink-0 text-xs ${selectedRestoreVersion && !isRestoring ? 'bg-navy hover:bg-navy/80 text-white' : 'bg-muted text-foreground-faint cursor-not-allowed'}`}
                          >
                            {isRestoring ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RotateCcw className="w-3 h-3 mr-1" />}
                            Restore
                          </Button>
                        </div>
                        {restoreMessage && (
                          <div className={`p-2 rounded text-xs ${restoreMessage.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                            {restoreMessage.text}
                          </div>
                        )}
                      </div>
                    )}
                    {showSitePromptEditor && (
                      <div className="space-y-2">
                        <textarea
                          value={aiPrompt}
                          onChange={(e) => setAiPrompt(e.target.value)}
                          rows={6}
                          className="w-full p-3 border border-border rounded-lg text-sm font-mono focus:ring-1 focus:ring-sky focus:border-sky"
                        />
                        <div className="flex justify-end">
                          <Button type="button" size="sm" onClick={handleSavePrompt} className="bg-sky text-white text-xs">
                            Save as default
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground-label">Site Name</label>
                    <input 
                      type="text" 
                      name="name" 
                      value={formData.name} 
                      onChange={handleChange}
                      required
                      className="w-full p-2 border rounded-md focus:ring-sky focus:border-sky"
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
                    <div className="flex flex-col gap-1 sm:pb-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="isSkyHighSite"
                          checked={formData.isSkyHighSite === "true"}
                          onChange={(e) => {
                            setFormData(prev => ({ ...prev, isSkyHighSite: e.target.checked ? "true" : "false" }));
                            markDirty();
                          }}
                          className="w-4 h-4 rounded border-border text-sky focus:ring-sky cursor-pointer"
                        />
                        <label htmlFor="isSkyHighSite" className="text-sm font-medium text-foreground-label cursor-pointer select-none whitespace-nowrap">
                          Club Site
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="skipBulkImport"
                          checked={formData.skipBulkImport === "true"}
                          onChange={(e) => {
                            setFormData(prev => ({ ...prev, skipBulkImport: e.target.checked ? "true" : "false" }));
                            markDirty();
                          }}
                          className="w-4 h-4 rounded border-border text-sky focus:ring-sky cursor-pointer"
                        />
                        <label htmlFor="skipBulkImport" className="text-sm font-medium text-foreground-label cursor-pointer select-none whitespace-nowrap">
                          Skip Import
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="isXCSite"
                          checked={formData.isXCSite === "true"}
                          onChange={(e) => {
                            setFormData(prev => ({ ...prev, isXCSite: e.target.checked ? "true" : "false" }));
                            markDirty();
                          }}
                          className="w-4 h-4 rounded border-border text-sky focus:ring-sky cursor-pointer"
                        />
                        <label htmlFor="isXCSite" className="text-sm font-medium text-foreground-label cursor-pointer select-none whitespace-nowrap">
                          XC Site
                        </label>
                      </div>
                    </div>
                    <div className="space-y-2 sm:ml-auto sm:w-45">
                      <label className="text-sm font-medium text-foreground-label">Type</label>
                      <select 
                        name="type" 
                        value={formData.type} 
                        onChange={handleChange}
                        className="w-full p-2 border rounded-md focus:ring-sky focus:border-sky"
                      >
                        <option value="Coastal">Coastal</option>
                        <option value="Inland">Inland</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-sm font-medium text-foreground-label">Closure Dates</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="permanentlyClosed"
                        checked={formData.status === 'closed'}
                        onChange={(e) => {
                          setFormData(prev => ({ ...prev, status: e.target.checked ? 'closed' : 'open' }));
                          markDirty();
                        }}
                        className="w-4 h-4 rounded border-border cursor-pointer accent-red-500"
                      />
                      <label htmlFor="permanentlyClosed" className="text-sm font-medium text-foreground-label cursor-pointer select-none">
                        Permanently Closed
                      </label>
                    </div>
                    <ClosureDatePicker
                      selectedDates={closureDates}
                      onChange={(dates) => { setClosureDates(dates); markDirty(); }}
                      disabled={formData.status === 'closed'}
                    />
                    <div className="flex items-center gap-3 pt-1">
                      <label className="text-sm text-foreground-secondary whitespace-nowrap">Max date pills on site page</label>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={closurePillsMax}
                        onChange={(e) => {
                          const v = Math.min(10, Math.max(1, parseInt(e.target.value) || 7));
                          setClosurePillsMax(v);
                          markDirty();
                        }}
                        disabled={formData.status === 'closed'}
                        className="w-16 px-2 py-1 text-sm border border-border rounded bg-background text-foreground disabled:opacity-40"
                      />
                      <span className="text-xs text-foreground-secondary">(1–10)</span>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
                    <div className="flex items-center gap-2 sm:pb-1">
                      <input
                        type="checkbox"
                        id="overrideHideClosed"
                        checked={formData.overrideHideClosed === "true"}
                        onChange={(e) => {
                          setFormData(prev => ({ ...prev, overrideHideClosed: e.target.checked ? "true" : "false" }));
                          markDirty();
                        }}
                        className="w-4 h-4 rounded border-border text-sky focus:ring-sky cursor-pointer"
                      />
                      <label htmlFor="overrideHideClosed" className="text-sm font-medium text-foreground-label cursor-pointer select-none whitespace-nowrap">
                        Override Hide Closed Sites
                      </label>
                    </div>
                    <div className="space-y-2 sm:ml-auto sm:w-45">
                      <label className="text-sm font-medium text-foreground-label">Hazard Level</label>
                      <select 
                        name="hazardLevel" 
                        value={formData.hazardLevel} 
                        onChange={handleChange}
                        className="w-full p-2 border rounded-md focus:ring-sky focus:border-sky"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground-label">PG Rating</label>
                    <input 
                      type="text" 
                      name="pgRating" 
                      value={formData.pgRating} 
                      onChange={handleChange}
                      placeholder="e.g. PG4 | PG3 req PG5"
                      className="w-full p-2 border rounded-md focus:ring-sky focus:border-sky"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground-label">HG Rating</label>
                    <input 
                      type="text" 
                      name="hgRating" 
                      value={formData.hgRating} 
                      onChange={handleChange}
                      placeholder="e.g. HG Int | HG Sup req HG Int"
                      className="w-full p-2 border rounded-md focus:ring-sky focus:border-sky"
                    />
                  </div>

                  <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground-label">Site Maps</label>
                      <input
                        type="text"
                        readOnly
                        value={essentialImages.length > 0 ? `${essentialImages.length} map image(s) scraped` : 'No maps'}
                        className="w-full p-2 border rounded-md text-foreground-faint cursor-default"
                        tabIndex={-1}
                      />
                    </div>
                    {formData.type === "Coastal" && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground-label">Tide Station</label>
                        <select
                          name="tideStationId"
                          value={formData.tideStationId}
                          onChange={handleChange}
                          className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
                        >
                          <option value="">Auto-detect nearest station</option>
                          {tideStations.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  {formData.unassignedText && (
                    <div className="md:col-span-2">
                      <button
                        type="button"
                        onClick={() => setShowUnassignedText(!showUnassignedText)}
                        className="text-xs text-sky hover:text-sky/80 inline-flex items-center gap-1"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                        {showUnassignedText ? "Hide" : "Show"} Unassigned Text
                      </button>
                      {showUnassignedText && (
                        <div className="mt-2">
                          <textarea
                            name="unassignedText"
                            value={formData.unassignedText}
                            onChange={handleChange}
                            rows={6}
                            className="w-full p-2 text-xs border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky font-mono bg-card text-foreground"
                          />
                          <p className="text-xs text-foreground-faint mt-1">Text from the site guide that wasn't mapped to any field. You can edit or copy from here.</p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground-label">Site Contact Name</label>
                    <input 
                      type="text" 
                      name="siteContact" 
                      value={formData.siteContact} 
                      onChange={handleChange}
                      placeholder="e.g. John Doe"
                      className="w-full p-2 border rounded-md focus:ring-sky focus:border-sky"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground-label">Site Contact Phone</label>
                    <input 
                      type="text" 
                      name="siteContactPhone" 
                      value={formData.siteContactPhone} 
                      onChange={handleChange}
                      placeholder="e.g. 0400 000 000"
                      className="w-full p-2 border rounded-md focus:ring-sky focus:border-sky"
                    />
                  </div>
                  <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground-label">Launch (AMSL)</label>
                      <input 
                        type="text" 
                        name="launchHeight" 
                        value={formData.launchHeight} 
                        onChange={handleChange}
                        placeholder="e.g. 640 or 640m"
                        className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground-label">Landing (AMSL)</label>
                      <input 
                        type="text" 
                        name="launchHeightHigh" 
                        value={formData.launchHeightHigh} 
                        onChange={handleChange}
                        placeholder="e.g. 320 or 320m"
                        className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground-label">Launch 2 (AMSL)</label>
                      <input 
                        type="text" 
                        name="launchHeight2" 
                        value={formData.launchHeight2} 
                        onChange={handleChange}
                        placeholder="e.g. 580 or 580m"
                        className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground-label">Landing 2 (AMSL)</label>
                      <input 
                        type="text" 
                        name="landingHeight2" 
                        value={formData.landingHeight2} 
                        onChange={handleChange}
                        placeholder="e.g. 280 or 280m"
                        className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
                      />
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    {(formData.launchHeight || formData.launchHeightHigh || formData.launchHeight2 || formData.landingHeight2) && (
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={formatHeights} className="px-3 py-2 text-xs bg-sky/10 text-sky rounded-md hover:bg-sky/20 transition-colors">
                          Format Heights
                        </button>
                        <span className="text-xs text-foreground-faint">Converts any value to "Xm / Y'" format — metres to nearest 1m, feet to nearest 10'</span>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground-label">Hooded Plovers</label>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={formData.hoodedPloversActive === "true"}
                          onChange={(e) => { handleChange({ target: { name: "hoodedPloversActive", value: e.target.checked ? "true" : "false" } } as any); }}
                          className="w-4 h-4 text-sky focus:ring-sky border-border rounded cursor-pointer"
                        />
                        <span className="text-sm text-foreground-secondary">Active</span>
                      </label>
                      <input 
                        type="text" 
                        name="hoodedPloversLink" 
                        value={formData.hoodedPloversLink} 
                        onChange={handleChange}
                        placeholder="Link (optional)"
                        className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
                      />
                    </div>
                    <p className="text-xs text-foreground-faint">Tick to show card. With link: "Click Here". Without link: "Check Signs".</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground-label">Emergency Marker</label>
                    <input 
                      type="text" 
                      name="emergencyMarker" 
                      value={formData.emergencyMarker} 
                      onChange={handleChange}
                      placeholder="e.g. ESTA-123"
                      className="w-full p-2 border rounded-md focus:ring-sky focus:border-sky"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground-label">Navigate To Link</label>
                    <input 
                      type="text" 
                      name="navigateTo" 
                      value={formData.navigateTo} 
                      onChange={handleChange}
                      placeholder="Google Maps Link"
                      className="w-full p-2 border rounded-md focus:ring-sky focus:border-sky"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground-label">What3Words</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        name="what3words" 
                        value={formData.what3words} 
                        onChange={handleChange}
                        placeholder="e.g. ///word.word.word"
                        className="flex-1 p-2 border rounded-md focus:ring-sky focus:border-sky"
                      />
                      {formData.lat && formData.lon && (
                        <Button
                          type="button"
                          onClick={() => {
                            const coords = `${formData.lat},${formData.lon}`;
                            navigator.clipboard.writeText(coords).then(() => {
                              window.open(`https://what3words.com/`, '_blank');
                            }).catch(() => {
                              window.open(`https://what3words.com/`, '_blank');
                            });
                          }}
                          className="bg-sky hover:bg-sky-light text-white flex items-center gap-2 px-4 whitespace-nowrap shrink-0"
                        >
                          Look up
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-foreground-faint">Copies coordinates to clipboard and opens what3words.</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground-label">Paste Coordinates from Google Maps</label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        placeholder="e.g. -37.229874, 143.194699"
                        className="flex-1 min-w-0 p-2 border rounded-md focus:ring-sky focus:border-sky bg-sky/5"
                        onPaste={(e) => {
                          let text = e.clipboardData.getData('text');
                          text = text.replace(/[\u2212\u2013\u2014]/g, '-');
                          const parts = text.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
                          if (parts.length >= 2) {
                            const lat = parseFloat(parts[0]);
                            const lon = parseFloat(parts[1]);
                            if (!isNaN(lat) && !isNaN(lon)) {
                              e.preventDefault();
                              setFormData(prev => ({ ...prev, lat: String(lat), lon: String(lon) }));
                              markDirty();
                            }
                          }
                        }}
                        onChange={() => {}}
                      />
                      <Button
                        type="button"
                        onClick={() => {
                          const url = formData.lat && formData.lon && !isNaN(parseFloat(formData.lat)) && !isNaN(parseFloat(formData.lon))
                            ? `https://www.google.com/maps/@${formData.lat},${formData.lon},15z`
                            : formData.name
                              ? `https://www.google.com/maps/search/${encodeURIComponent(formData.name + " Australia")}`
                              : `https://www.google.com/maps/@-37.8136,144.9631,8z`;
                          window.open(url, '_blank');
                        }}
                        className="bg-sky hover:bg-sky-light text-white flex items-center gap-2 px-4 whitespace-nowrap shrink-0"
                      >
                        <MapPin className="w-4 h-4" />
                        Google Maps
                      </Button>
                    </div>
                    <p className="text-[10px] text-foreground-faint">Opens Google Maps — right-click to copy coordinates, then paste above.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground-label">Latitude</label>
                      <input 
                        type="text"
                        name="lat" 
                        value={formData.lat} 
                        onChange={handleChange}
                        placeholder="e.g. -38.324"
                        className="w-full p-2 border rounded-md focus:ring-sky focus:border-sky"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground-label">Longitude</label>
                      <input 
                        type="text"
                        name="lon" 
                        value={formData.lon} 
                        onChange={handleChange}
                        placeholder="e.g. 144.717"
                        className="w-full p-2 border rounded-md focus:ring-sky focus:border-sky"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-foreground-label">Site Banner Image</label>
                    <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                      <input 
                        type="text" 
                        name="image" 
                        value={formData.image} 
                        onChange={handleChange}
                        placeholder="Paste URL or select from library"
                        className="min-w-0 flex-1 p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
                      />
                      <Button
                        type="button"
                        onClick={() => setShowBannerPicker(true)}
                        className="bg-sky hover:bg-sky-light text-white flex items-center gap-2 px-4 whitespace-nowrap shrink-0"
                      >
                        <ImagePlus className="w-4 h-4" />
                        Select from Library
                      </Button>
                    </div>
                    <p className="text-[10px] text-foreground-faint">Select a banner image from the <a href="/admin/images" target="_blank" className="text-sky hover:underline">Image Library</a>, or paste a direct URL.</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground-label">Live Weather Enabled</label>
                    <select 
                      name="useLiveWeather" 
                      value={formData.useLiveWeather} 
                      onChange={handleChange}
                      className="w-full p-2 border rounded-md focus:ring-sky focus:border-sky"
                    >
                      <option value="true">Enabled (Use Live if available)</option>
                      <option value="false">Disabled (Always use Forecast)</option>
                    </select>
                    <p className="text-[10px] text-foreground-faint">If disabled, this site will only show forecast data even if a live station is nearby.</p>
                  </div>
                  
                  {formData.useLiveWeather === "true" && (
                    <>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground-label">Search Radius (km)</label>
                        <select 
                          value={searchRadius} 
                          onChange={(e) => setSearchRadius(e.target.value)}
                          className="w-full p-2 border rounded-md focus:ring-sky focus:border-sky"
                        >
                          <option value="5">5 km</option>
                          <option value="10">10 km</option>
                          <option value="15">15 km</option>
                          <option value="20">20 km</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground-label flex justify-between">
                          Live Weather Station
                          {loadingStations && <span className="text-sky text-xs">Loading...</span>}
                        </label>
                        <select 
                          name="liveStationId" 
                          value={formData.liveStationId} 
                          onChange={handleChange}
                          className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
                          disabled={loadingStations || nearbyStations.length === 0}
                        >
                          <option value="">Select a station...</option>
                          {nearbyStations.map(station => (
                            <option key={station.id} value={station.id}>
                              {station.name} ({station.id}) - {station.distanceKm.toFixed(1)}km away
                            </option>
                          ))}
                          {formData.liveStationId && !nearbyStations.find(s => s.id === formData.liveStationId) && (
                            <option value={formData.liveStationId}>
                              Current: {formData.liveStationId} (saved — not found in search)
                            </option>
                          )}
                        </select>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="e.g. IFLINDER3 or freeflightwx-mystic"
                            className="flex-1 p-2 text-sm border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const val = (e.target as HTMLInputElement).value.trim();
                                if (val) {
                                  setFormData(prev => ({ ...prev, liveStationId: val }));
                                  (e.target as HTMLInputElement).value = "";
                                }
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="px-3 py-2 text-xs font-medium bg-sky text-white rounded-md hover:bg-sky-light transition-colors"
                            onClick={(e) => {
                              const input = (e.target as HTMLElement).previousElementSibling as HTMLInputElement;
                              const val = input?.value?.trim();
                              if (val) {
                                setFormData(prev => ({ ...prev, liveStationId: val }));
                                input.value = "";
                              }
                            }}
                          >
                            Set
                          </button>
                        </div>
                        <p className="text-[10px] text-foreground-faint">Select from dropdown, or type a station ID: Weather Underground (e.g. IFLINDER3), Live-Wind (e.g. livewind-94864), or FreeFlightWx (e.g. freeflightwx-mystic — use the station name from the freeflightwx.com URL).</p>
                        {nearbyStations.length === 0 && !loadingStations && formData.lat && formData.lon && (
                          <p className="text-[10px] text-red-500">No nearby stations found for these coordinates.</p>
                        )}
                        {(!formData.lat || !formData.lon) && (
                          <p className="text-[10px] text-orange-500">Enter latitude and longitude to find nearby stations.</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground-label flex justify-between">
                          Alternate Weather Station
                          <span className="text-xs text-foreground-faint font-normal">Optional</span>
                        </label>
                        <select 
                          name="liveStationIdAlt" 
                          value={formData.liveStationIdAlt} 
                          onChange={handleChange}
                          className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
                          disabled={loadingStations || nearbyStations.length === 0}
                        >
                          <option value="">None (single station)</option>
                          {nearbyStations.filter(s => s.id !== formData.liveStationId).map(station => (
                            <option key={station.id} value={station.id}>
                              {station.name} ({station.id}) - {station.distanceKm.toFixed(1)}km away
                            </option>
                          ))}
                          {formData.liveStationIdAlt && !nearbyStations.find(s => s.id === formData.liveStationIdAlt) && (
                            <option value={formData.liveStationIdAlt}>
                              Current: {formData.liveStationIdAlt} (saved — not found in search)
                            </option>
                          )}
                        </select>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="e.g. IFLINDER3 or livewind-94868"
                            className="flex-1 p-2 text-sm border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const val = (e.target as HTMLInputElement).value.trim();
                                if (val) {
                                  setFormData(prev => ({ ...prev, liveStationIdAlt: val }));
                                  (e.target as HTMLInputElement).value = "";
                                }
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="px-3 py-2 text-xs font-medium bg-sky text-white rounded-md hover:bg-sky-light transition-colors"
                            onClick={(e) => {
                              const input = (e.target as HTMLElement).previousElementSibling as HTMLInputElement;
                              const val = input?.value?.trim();
                              if (val) {
                                setFormData(prev => ({ ...prev, liveStationIdAlt: val }));
                                input.value = "";
                              }
                            }}
                          >
                            Set
                          </button>
                        </div>
                        <p className="text-[10px] text-foreground-faint">Second nearby station shown as a switchable option on the weather card. Pilots can toggle between stations to compare readings.</p>
                      </div>
                    </>
                  )}
                </div>

                {formData.lat && formData.lon && (
                  <div className="mt-6">
                    <label className="text-sm font-medium text-foreground-label block mb-2">Location & Nearby Weather Stations</label>
                    <div className="h-[300px] w-full rounded-xl overflow-hidden border border-border-subtle">
                      <MapContainer 
                        center={[parseFloat(formData.lat), parseFloat(formData.lon)]} 
                        zoom={12} 
                        style={{ height: '100%', width: '100%' }}
                        scrollWheelZoom={false}
                      >
                        <TileLayer
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        />
                        <MapUpdater lat={parseFloat(formData.lat)} lon={parseFloat(formData.lon)} />
                        
                        {/* Site Marker */}
                        <Marker position={[parseFloat(formData.lat), parseFloat(formData.lon)]}>
                          <Popup>
                            <div className="font-semibold">{formData.name || 'New Site'}</div>
                            <div className="text-xs text-muted-foreground">Flying Site</div>
                          </Popup>
                        </Marker>

                        {/* Weather Station Markers */}
                        {formData.useLiveWeather === "true" && nearbyStations.map(station => (
                          <Marker 
                            key={station.id} 
                            position={[station.lat, station.lon]}
                            icon={station.id === formData.liveStationId || station.id === formData.liveStationIdAlt ? selectedStationIcon : weatherStationIcon}
                          >
                            <Popup>
                              <div className="font-semibold">{station.name}</div>
                              <div className="text-xs text-muted-foreground">ID: {station.id}</div>
                              <div className="text-xs text-muted-foreground">Distance: {station.distanceKm.toFixed(1)} km</div>
                              {station.id === formData.liveStationId && (
                                <div className="text-xs font-bold text-emerald-600 mt-1">Primary Station</div>
                              )}
                              {station.id === formData.liveStationIdAlt && (
                                <div className="text-xs font-bold text-sky mt-1">Alternate Station</div>
                              )}
                            </Popup>
                          </Marker>
                        ))}
                      </MapContainer>
                    </div>
                    <p className="text-[10px] text-foreground-faint mt-2">
                      Blue pin: Flying Site. Orange pins: Nearby weather stations. Green pin: Selected weather station.
                    </p>
                  </div>
                )}

              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Flight Conditions</CardTitle>
                <CardDescription>
                  Enter the flight conditions. The weather tool will automatically derive ideal ranges from these text fields.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground-label">Wind Direction (Text)</label>
                      <input 
                        type="text" 
                        name="windDir" 
                        value={formData.windDir} 
                        onChange={handleChange}
                        placeholder="e.g. SE-ESE or S,SW"
                        className="w-full p-2 border rounded-md focus:ring-sky focus:border-sky"
                      />
                      <p className="text-[10px] text-foreground-faint">Use "-" for range (E-S = all between), "," for individual (E,S = only those two). No spaces. Auto-corrected on save.</p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground-label">Wind Speed (Text)</label>
                      <input 
                        type="text" 
                        name="windSpeed" 
                        value={formData.windSpeed} 
                        onChange={handleChange}
                        placeholder="e.g. 10 - 18 knots"
                        className="w-full p-2 border rounded-md focus:ring-sky focus:border-sky"
                      />
                      <p className="text-[10px] text-foreground-faint">Format: "10-18". Numbers only, no units. Auto-corrected on save.</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3">
                    <div className="md:col-span-2 flex items-center justify-center gap-4">
                      <div className="flex flex-col gap-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.crossLeft === "true"}
                            onChange={(e) => {
                              setFormData(prev => ({ ...prev, crossLeft: e.target.checked ? "true" : "false" }));
                              markDirty();
                            }}
                            className="w-4 h-4 rounded text-orange focus:ring-orange"
                          />
                          <span className="text-xs font-medium text-foreground-secondary">Left Cross</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.crossRight === "true"}
                            onChange={(e) => {
                              setFormData(prev => ({ ...prev, crossRight: e.target.checked ? "true" : "false" }));
                              markDirty();
                            }}
                            className="w-4 h-4 rounded text-orange focus:ring-orange"
                          />
                          <span className="text-xs font-medium text-foreground-secondary">Right Cross</span>
                        </label>
                      </div>
                      <WindCompass
                        value={formData.windDir}
                        onChange={(val) => {
                          setFormData(prev => ({ ...prev, windDir: val }));
                          markDirty();
                        }}
                        crossLeft={formData.crossLeft === "true"}
                        crossRight={formData.crossRight === "true"}
                      />
                    </div>
                  </div>
                </div>

              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Site Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground-label">Description</label>
                  <textarea 
                    name="description" 
                    value={formData.description} 
                    onChange={handleChange}
                    rows={3}
                    className="w-full p-2 border rounded-md focus:ring-sky focus:border-sky"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground-label">Launch Area</label>
                    <textarea 
                      name="launch" 
                      value={formData.launch} 
                      onChange={handleChange}
                      rows={3}
                      className="w-full p-2 border rounded-md focus:ring-sky focus:border-sky"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground-label">Landing Zones</label>
                    <textarea 
                      name="landing" 
                      value={formData.landing} 
                      onChange={handleChange}
                      rows={3}
                      className="w-full p-2 border rounded-md focus:ring-sky focus:border-sky"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground-label">Hazards (One per line)</label>
                    <textarea 
                      name="hazards" 
                      value={formData.hazards} 
                      onChange={handleChange}
                      rows={4}
                      className="w-full p-2 border rounded-md focus:ring-sky focus:border-sky"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground-label">Rules (One per line)</label>
                    <textarea 
                      name="rules" 
                      value={formData.rules} 
                      onChange={handleChange}
                      rows={4}
                      className="w-full p-2 border rounded-md focus:ring-sky focus:border-sky"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {saveMessage && (
              <div className={`p-3 rounded-lg text-sm ${saveMessage.type === "success" ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
                {saveMessage.text}
              </div>
            )}

            <div className="flex justify-end gap-4">
              <Button type="button" variant="outline" asChild>
                <Link to="/admin/sites">Cancel</Link>
              </Button>
              <Button
                type="submit"
                className={`transition-all duration-300 ${justSaved ? "bg-emerald-500 hover:bg-emerald-600 scale-105" : "bg-navy hover:bg-navy-light"} text-white`}
              >
                {justSaved ? <><Check className="w-4 h-4 mr-2" /> Saved!</> : <><Save className="w-4 h-4 mr-2" /> Save Site</>}
              </Button>
            </div>
          </div>
        </form>

        {!isNew && (
          <div className="mt-12">
            <h2 className="text-2xl font-bold text-navy mb-4">QR Code</h2>
            <Card className="border-t-4 border-t-sky">
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <CardTitle className="flex items-center text-navy">
                    <QrCode className="w-6 h-6 mr-2" />
                    Printable QR Code
                  </CardTitle>
                  <select
                    value={qrCodeType}
                    onChange={(e) => setQrCodeType(e.target.value as "info" | "checkin" | "xcmaps")}
                    className="p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky text-sm"
                  >
                    <option value="info">Site Info (Field View)</option>
                    <option value="checkin">Site Check-in</option>
                    {formData.isXCSite === "true" && (
                      <option value="xcmaps">XC Maps</option>
                    )}
                  </select>
                </div>
                <CardDescription>
                  {qrCodeType === "info" ? (
                    <>
                      Generate a QR code linking to the compact field-view page for this site — designed for phone screens.
                      {settings.qrCodeMode && settings.qrCodeMode !== "off" && (
                        <>
                          <br/>
                          <span className="text-sky font-medium">
                            Mode: {settings.qrCodeMode === "informative" ? "Informative" : settings.qrCodeMode}
                          </span>
                        </>
                      )}
                    </>
                  ) : qrCodeType === "checkin" ? (
                    <>
                      Generate a QR code that links directly to the check-in page for this site.
                      <br/>
                      <span className="text-orange-600 font-medium">
                        Ensure the Base URL is correct for your production environment before printing.
                      </span>
                    </>
                  ) : (
                    <>
                      Generate a QR code that opens the XC Maps page with this site pre-selected.
                      <br/>
                      <span className="text-orange-600 font-medium">
                        Ensure the Base URL is correct for your production environment before printing.
                      </span>
                    </>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col md:flex-row gap-8 items-start">
                  <div className="flex-1 space-y-4 w-full">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground-label">Base URL</label>
                      <input 
                        type="text" 
                        value={baseUrl} 
                        onChange={(e) => setBaseUrl(e.target.value)}
                        className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
                        placeholder="https://yourdomain.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground-label">{qrCodeType === "info" ? "Field View URL" : qrCodeType === "checkin" ? "Check-in URL" : "XC Maps URL"}</label>
                      <input 
                        type="text" 
                        value={qrCodeType === "info" ? fieldViewUrl : qrCodeType === "checkin" ? checkInUrl : xcMapsUrl} 
                        readOnly
                        className="w-full p-2 border border-border rounded-md bg-background text-muted-foreground"
                      />
                    </div>
                    <div className="flex gap-3 mt-4">
                      <Button onClick={qrCodeType === "info" ? handlePrintFieldQR : qrCodeType === "checkin" ? handlePrintQR : handlePrintXCMapsQR} variant="outline">
                        <Printer className="w-4 h-4 mr-2" /> Print QR Sign
                      </Button>
                      {qrCodeType === "info" && (
                        <Link to={`/sites/${id}/field`} target="_blank">
                          <Button variant="outline">
                            <ArrowLeft className="w-4 h-4 mr-2 rotate-180" /> Preview Field View
                          </Button>
                        </Link>
                      )}
                      {qrCodeType === "xcmaps" && (
                        <Link to={`/xc/maps?site=${id}`} target="_blank">
                          <Button variant="outline">
                            <ArrowLeft className="w-4 h-4 mr-2 rotate-180" /> Preview XC Maps
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                  <div className="bg-card p-4 rounded-xl shadow-sm border flex flex-col items-center justify-center">
                    <QRCodeSVG 
                      id={qrCodeType === "info" ? "field-qr-svg" : qrCodeType === "checkin" ? "qr-svg" : "xcmaps-qr-svg"}
                      value={qrCodeType === "info" ? fieldViewUrl : qrCodeType === "checkin" ? checkInUrl : xcMapsUrl} 
                      size={200}
                      level="H"
                      includeMargin={true}
                    />
                    <p className="text-xs text-muted-foreground mt-2 text-center">
                      {qrCodeType === "info" ? "Scan for site info at" : qrCodeType === "checkin" ? "Scan to check-in at" : "Scan for XC Map at"}<br/>{formData.name}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
        <AISiteGeneratorModal 
          isOpen={isAIModalOpen} 
          onClose={() => setIsAIModalOpen(false)} 
          onSave={applyScrapedData} 
          initialUrl={aiInitialUrl}
        />
        {showBannerPicker && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10001] flex items-center justify-center p-4">
            <div className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between p-6 border-b border-border-faint">
                <div>
                  <h2 className="text-lg font-bold text-navy">Select Banner Image</h2>
                  <p className="text-sm text-muted-foreground">Choose from the image library. <a href="/admin/images" target="_blank" className="text-sky hover:underline">Upload new images</a></p>
                </div>
                <button onClick={() => setShowBannerPicker(false)} className="p-2 hover:bg-muted rounded-lg">
                  <X className="w-5 h-5 text-foreground-faint" />
                </button>
              </div>
              <div className="p-6">
                {(() => {
                  let bannerImages: string[] = [];
                  try {
                    const lib: { wide: string; banner: string }[] = JSON.parse(settings?.imageLibrary || "[]");
                    bannerImages = lib.map(p => p.banner).filter(Boolean);
                  } catch {}
                  if (bannerImages.length === 0) {
                    return (
                      <div className="text-center py-8">
                        <p className="text-sm text-foreground-faint mb-3">No banner images in the library yet.</p>
                        <a href="/admin/images" target="_blank" className="text-sky hover:underline text-sm">Go to Image Library to upload</a>
                      </div>
                    );
                  }
                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {bannerImages.map((url, idx) => (
                        <div
                          key={idx}
                          onClick={() => {
                            setFormData(prev => ({ ...prev, image: url }));
                            setShowBannerPicker(false);
                            markDirty();
                          }}
                          className={`relative border-2 rounded-lg overflow-hidden bg-muted aspect-[16/5] cursor-pointer transition-all hover:ring-2 hover:ring-sky/50 ${formData.image === url ? "border-sky ring-2 ring-sky/30" : "border-border-subtle"}`}
                        >
                          <img src={url} alt={`Banner ${idx + 1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
                          {formData.image === url && (
                            <div className="absolute top-1 left-1 bg-sky text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">Current</div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </div>
      <UnsavedChangesModal blocker={blocker} onSave={saveSite} />

      {showSiteDiffModal && siteDiffData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-5 border-b bg-sky/5 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-bold text-navy">
                Compare: Archive {siteDiffData.version} vs Current
              </h3>
              <button onClick={() => setShowSiteDiffModal(false)} className="p-1 hover:bg-muted rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {siteDiffData.diffs.length === 0 ? (
                <div className="text-center py-8 text-foreground-faint">
                  <p>No differences found. This site is identical to the archived version.</p>
                </div>
              ) : siteDiffData.diffs[0]?.status === "removed" ? (
                <div className="text-center py-8 text-red-600">
                  <p>This site does not exist in the current database. It was removed since this archive.</p>
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-2 font-medium text-foreground-faint w-1/5">Field</th>
                      <th className="text-left p-2 font-medium text-red-600 w-2/5">Archived</th>
                      <th className="text-left p-2 font-medium text-emerald-600 w-2/5">Current</th>
                    </tr>
                  </thead>
                  <tbody>
                    {siteDiffData.diffs[0]?.fields?.map((f: any) => (
                      <tr key={f.field} className="border-b border-border last:border-0">
                        <td className="p-2 font-mono text-foreground-secondary align-top">{f.field}</td>
                        <td className="p-2 bg-red-50/50 align-top break-all">
                          <span className="text-red-700">{f.archived === null || f.archived === "" ? <em className="text-foreground-faint">empty</em> : String(f.archived).substring(0, 500)}{String(f.archived || "").length > 500 ? "..." : ""}</span>
                        </td>
                        <td className="p-2 bg-emerald-50/50 align-top break-all">
                          <span className="text-emerald-700">{f.current === null || f.current === "" ? <em className="text-foreground-faint">empty</em> : String(f.current).substring(0, 500)}{String(f.current || "").length > 500 ? "..." : ""}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="p-4 border-t bg-background flex justify-end shrink-0">
              <Button type="button" variant="outline" onClick={() => setShowSiteDiffModal(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
