import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAdminForm } from "@/hooks/useAdminForm";
import { api } from "@/lib/apiClient";
import { toast } from "sonner";
import { convertToDirectImageUrl } from "@/lib/urlHelpers";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";

/** Safely coerce an unknown value to string, returning fallback on null/undefined. */
/** Safely coerce an unknown value to string, returning fallback on null/undefined. */
function safeStr(val: unknown, fallback = ""): string {
  if (val == null) return fallback;
  return String(val);
}

/** Escape HTML special characters in a string to prevent XSS. */
function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

/** Safely coerce an unknown value to string[], returning [] if not an array. */
function safeStrArr(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(v => safeStr(v));
  return [];
}

interface ExternalSite {
  name: string;
  url: string;
  state?: string;
  stateAbbr?: string;
  region?: string;
}

interface SiteDiffField {
  field: string;
  archived: string | null;
  current: string | null;
}

interface SiteDiffData {
  version: string;
  diffs: Array<{ status?: string; fields?: SiteDiffField[] }>;
}

export function useSiteForm() {
  const { token } = useAuth();
  const { settings } = useSettings();
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === "new";
  const [siteList, setSiteList] = useState<string[]>([]);
  const siteIndex = siteList.indexOf(id || "");
  const prevSiteId = siteIndex > 0 ? siteList[siteIndex - 1] : null;
  const nextSiteId = siteIndex >= 0 && siteIndex < siteList.length - 1 ? siteList[siteIndex + 1] : null;

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("adminSiteList");
      if (stored) setSiteList(JSON.parse(stored));
    } catch {}
  }, []);

  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const { isDirty, markDirty, markClean, blocker, justSaved, save: adminSave } = useAdminForm({ successMessage: "Site saved successfully!" });
  const formDataRef = useRef<Record<string, unknown> | null>(null);
  const [essentialImages, setEssentialImages] = useState<string[]>([]);
  const [closureDates, setClosureDates] = useState<string[]>([]);
  const closureDatesRef = useRef<string[]>([]);
  closureDatesRef.current = closureDates;
  const [closurePillsMax, setClosurePillsMax] = useState<number>(7);
  const closurePillsMaxRef = useRef<number>(7);
  closurePillsMaxRef.current = closurePillsMax;
  const [showUnassignedText, setShowUnassignedText] = useState(false);

  const [formData, setFormData] = useState({
    name: "", type: "Coastal", pgRating: "", hgRating: "",
    windDir: "", windSpeed: "", status: "open", hazardLevel: "low",
    lat: "", lon: "", useLiveWeather: "false",
    liveStationId: "", liveStationIdAlt: "",
    description: "", launch: "", landing: "",
    hazards: "", rules: "", image: "",
    siteguideUrl: "", siteContact: "", siteContactPhone: "",
    navigateTo: "", launchHeight: "", launchHeightHigh: "", launchHeight2: "", landingHeight2: "",
    hoodedPloversLink: "", hoodedPloversActive: "false",
    emergencyMarker: "", what3words: "",
    isSkyHighSite: "false", crossLeft: "true", crossRight: "true",
    overrideHideClosed: "false", unassignedText: "",
    siteguideVersion: "", siteguideScrapedAt: "",
    isTidal: "false", tideStationId: "",
    skipBulkImport: "false", isXCSite: "false",
  });

  const [baseUrl, setBaseUrl] = useState(window.location.origin);
  const [qrCodeType, setQrCodeType] = useState<"info" | "checkin" | "xcmaps">("info");

  useEffect(() => {
    if (qrCodeType === "xcmaps" && formData.isXCSite !== "true") setQrCodeType("info");
  }, [formData.isXCSite, qrCodeType]);

  useEffect(() => {
    if (!isNew) {
      api.get<Record<string, unknown>>(`/api/sites/${id}`)
        .then(data => {
          setFormData({
            name: safeStr(data.name),
            type: safeStr(data.type).toLowerCase().includes("inland") ? "Inland" : "Coastal",
            pgRating: safeStr(data.pgRating),
            hgRating: safeStr(data.hgRating),
            windDir: safeStr(data.windDir),
            windSpeed: safeStr(data.windSpeed),
            status: safeStr(data.status) || "open",
            hazardLevel: safeStr(data.hazardLevel) || "low",
            lat: data.lat !== null && data.lat !== undefined ? String(data.lat) : "",
            lon: data.lon !== null && data.lon !== undefined ? String(data.lon) : "",
            useLiveWeather: safeStr(data.useLiveWeather) || "false",
            liveStationId: safeStr(data.liveStationId),
            liveStationIdAlt: safeStr(data.liveStationIdAlt),
            description: safeStr(data.description),
            launch: safeStr(data.launch),
            landing: safeStr(data.landing),
            hazards: safeStrArr(data.hazards).join('\n'),
            rules: safeStrArr(data.rules).join('\n'),
            image: safeStr(data.image),
            siteguideUrl: safeStr(data.siteguideUrl),
            siteContact: safeStr(data.siteContact),
            siteContactPhone: safeStr(data.siteContactPhone),
            navigateTo: safeStr(data.navigateTo),
            launchHeight: safeStr(data.launchHeight),
            launchHeightHigh: safeStr(data.launchHeightHigh),
            launchHeight2: safeStr(data.launchHeight2),
            landingHeight2: safeStr(data.landingHeight2),
            hoodedPloversLink: safeStr(data.hoodedPloversLink),
            hoodedPloversActive: safeStr(data.hoodedPloversActive) || "false",
            emergencyMarker: safeStr(data.emergencyMarker),
            what3words: safeStr(data.what3words),
            isSkyHighSite: safeStr(data.isSkyHighSite) || "false",
            crossLeft: safeStr(data.crossLeft) || "false",
            crossRight: safeStr(data.crossRight) || "false",
            overrideHideClosed: safeStr(data.overrideHideClosed) || "false",
            unassignedText: safeStr(data.unassignedText),
            siteguideVersion: safeStr(data.siteguideVersion),
            siteguideScrapedAt: safeStr(data.siteguideScrapedAt),
            isTidal: safeStr(data.isTidal) || "false",
            tideStationId: safeStr(data.tideStationId),
            skipBulkImport: safeStr(data.skipBulkImport) || "false",
            isXCSite: safeStr(data.isXCSite) || "false",
          });
          setEssentialImages(safeStrArr(data.essentialInfoImages));
          setClosurePillsMax(typeof data.closurePillsMax === 'number' ? data.closurePillsMax : 7);
        });
      api.get<string[]>(`/api/sites/${id}/closure-dates`)
        .then(dates => setClosureDates(dates))
        .catch(() => {});
    }
  }, [id, isNew]);

  const [tideStations, setTideStations] = useState<{id: string, name: string}[]>([]);
  useEffect(() => {
    api.get<Array<{ id: string; name: string }>>("/api/sites/tide-stations")
      .then(stations => setTideStations(stations.map(s => ({ id: s.id, name: s.name }))))
      .catch(() => {});
  }, []);

  const [nearbyStations, setNearbyStations] = useState<{id: string, name: string, distanceKm: number, lat: number, lon: number, source: string}[]>([]);
  const [loadingStations, setLoadingStations] = useState(false);
  const [searchRadius, setSearchRadius] = useState("10");

  useEffect(() => {
    if (formData.useLiveWeather === "true" && formData.lat && formData.lon) {
      setLoadingStations(true);
      const currentStationId = formData.liveStationId;
      api.get<Array<{id: string, name: string, distanceKm: number, lat: number, lon: number, source: string}>>(`/api/weather/stations/nearby?lat=${formData.lat}&lon=${formData.lon}&radius=${searchRadius}${currentStationId ? `&currentStationId=${encodeURIComponent(currentStationId)}` : ''}`)
        .then(data => {
          setNearbyStations(data);
          if (data.length > 0 && !currentStationId) {
            setFormData(prev => ({ ...prev, liveStationId: data[0].id }));
          }
        })
        .catch(err => console.error("Failed to fetch nearby stations", err))
        .finally(() => setLoadingStations(false));
    } else {
      setNearbyStations([]);
    }
  }, [formData.useLiveWeather, formData.lat, formData.lon, searchRadius, formData.liveStationId]);

  const [externalSites, setExternalSites] = useState<ExternalSite[]>([]);
  const [selectedState, setSelectedState] = useState("");
  const [allDbSites, setAllDbSites] = useState<{id: string, siteguideUrl: string}[]>([]);

  useEffect(() => {
    api.get<{ data: Array<Record<string, string>> }>('/api/sites')
      .then((response) => setAllDbSites(response.data.map(s => ({ id: s.id, siteguideUrl: s.siteguideUrl || "" }))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    api.get<ExternalSite[]>('/api/external-sites')
      .then(data => {
        setExternalSites(data);
        if (!isNew && formData.siteguideUrl && !selectedState) {
          const match = data.find(s => s.url === formData.siteguideUrl);
          if (match?.stateAbbr) setSelectedState(match.stateAbbr);
        }
      })
      .catch(err => console.error("Failed to fetch external sites", err));
  }, [formData.siteguideUrl]);

  const uniqueStates = [...new Set(externalSites.map(s => s.stateAbbr).filter(Boolean))].sort() as string[];
  const filteredSites = selectedState ? externalSites.filter(s => s.stateAbbr === selectedState) : externalSites;

  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [showBannerPicker, setShowBannerPicker] = useState(false);
  const [aiInitialUrl, setAiInitialUrl] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [showSitePromptEditor, setShowSitePromptEditor] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [liveSiteguideVersion, setLiveSiteguideVersion] = useState<string | null>(null);
  interface ArchiveEntry { id: number; siteguideVersion: string; archivedAt: string; siteCount: number; }
  const [archives, setArchives] = useState<ArchiveEntry[]>([]);
  const [selectedRestoreVersion, setSelectedRestoreVersion] = useState("");
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [siteDiffData, setSiteDiffData] = useState<SiteDiffData | null>(null);
  const [siteDiffLoading, setSiteDiffLoading] = useState(false);
  const [showSiteDiffModal, setShowSiteDiffModal] = useState(false);

  useEffect(() => {
    if (!isNew && formData.siteguideUrl) {
      const tk = localStorage.getItem("adminToken");
      api.get<{ version?: string }>("/api/sites/siteguide-version", tk)
        .then(d => { if (d.version) setLiveSiteguideVersion(d.version); })
        .catch(() => {});
    }
  }, [isNew, formData.siteguideUrl]);

  useEffect(() => {
    if (!isNew && token) {
      api.get<ArchiveEntry[]>("/api/sites/archives", token)
        .then(setArchives)
        .catch(() => {});
    }
  }, [isNew, token]);

  const handleRestoreSite = async () => {
    if (!selectedRestoreVersion || !id || isRestoring) return;
    setIsRestoring(true);
    setRestoreMessage(null);
    try {
      const data = await api.post<{ version: string }>(`/api/sites/archives/${encodeURIComponent(selectedRestoreVersion)}/restore/${id}`, {}, token);
      setRestoreMessage({ type: "success", text: `Site restored from archive version ${data.version}. Reloading...` });
      setTimeout(() => window.location.reload(), 1500);
    } catch (e: unknown) {
      setRestoreMessage({ type: "error", text: (e instanceof Error ? e.message : "Unknown error") });
    } finally {
      setIsRestoring(false);
    }
  };

  const handleViewSiteDiff = async () => {
    if (!selectedRestoreVersion || !id) return;
    setSiteDiffLoading(true);
    setSiteDiffData(null);
    try {
      const data = await api.get<SiteDiffData>(`/api/sites/archives/${encodeURIComponent(selectedRestoreVersion)}/diff?siteId=${id}`, token);
      setSiteDiffData(data);
      setShowSiteDiffModal(true);
    } catch (e: unknown) {
      setRestoreMessage({ type: "error", text: (e instanceof Error ? e.message : "Unknown error") });
    } finally {
      setSiteDiffLoading(false);
    }
  };

  useEffect(() => {
    api.get<{ prompt: string }>("/api/ai/prompt")
      .then(data => setAiPrompt(data.prompt))
      .catch(err => console.error("Failed to fetch AI prompt", err));
  }, []);

  const handleAIStart = () => {
    setAiInitialUrl(formData.siteguideUrl);
    setIsAIModalOpen(true);
  };

  const handleRefreshSites = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      const data = await api.post<{ success?: boolean; count?: number; error?: string }>("/api/sites/scrape-urls", {}, token);
      if (data.success) {
        setRefreshMessage({ type: "success", text: `Successfully refreshed site list. Found ${data.count} sites.` });
        api.get<ExternalSite[]>('/api/external-sites')
          .then(extData => setExternalSites(extData))
          .catch(() => {});
      } else {
        setRefreshMessage({ type: "error", text: `Failed to refresh sites: ${data.error}` });
      }
    } catch (e: unknown) {
      setRefreshMessage({ type: "error", text: `Error refreshing sites: ${e instanceof Error ? e.message : "Unknown error"}` });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSavePrompt = async () => {
    try {
      await api.put("/api/ai/prompt", { prompt: aiPrompt }, token);
      toast.success("AI prompt saved");
    } catch {
      setSaveMessage({ type: "error", text: "Failed to save prompt" });
    }
  };

  const applyScrapedData = (newData: Record<string, unknown>) => {
    const essentialImgs = safeStrArr(newData._essentialImages);
    const essentialTxt = safeStr(newData._essentialText);
    const unassigned = safeStr(newData._unassignedText);
    setFormData(prev => ({
      ...prev,
      name: safeStr(newData.name, prev.name),
      type: safeStr(newData.type, prev.type),
      pgRating: safeStr(newData.pgRating, prev.pgRating),
      hgRating: safeStr(newData.hgRating, prev.hgRating),
      windDir: safeStr(newData.windDir, prev.windDir),
      windSpeed: safeStr(newData.windSpeed, prev.windSpeed),
      status: safeStr(newData.status, prev.status),
      hazardLevel: safeStr(newData.hazardLevel, prev.hazardLevel),
      lat: safeStr(newData.lat, prev.lat),
      lon: safeStr(newData.lon, prev.lon),
      useLiveWeather: safeStr(newData.useLiveWeather, prev.useLiveWeather),
      liveStationId: safeStr(newData.liveStationId, prev.liveStationId),
      liveStationIdAlt: safeStr(newData.liveStationIdAlt, prev.liveStationIdAlt),
      description: safeStr(newData.description, prev.description),
      launch: safeStr(newData.launch, prev.launch),
      landing: safeStr(newData.landing, prev.landing),
      hazards: safeStrArr(newData.hazards).join('\n') || safeStr(newData.hazards, prev.hazards),
      rules: safeStrArr(newData.rules).join('\n') || safeStr(newData.rules, prev.rules),
      image: safeStr(newData.image, prev.image),
      siteguideUrl: safeStr(newData.siteguideUrl, prev.siteguideUrl),
      siteContact: safeStr(newData.siteContact, prev.siteContact),
      siteContactPhone: safeStr(newData.siteContactPhone, prev.siteContactPhone),
      navigateTo: safeStr(newData.navigateTo, prev.navigateTo),
      launchHeight: safeStr(newData.launchHeight, prev.launchHeight),
      launchHeightHigh: safeStr(newData.launchHeightHigh, prev.launchHeightHigh),
      launchHeight2: safeStr(newData.launchHeight2, prev.launchHeight2),
      landingHeight2: safeStr(newData.landingHeight2, prev.landingHeight2),
      hoodedPloversLink: safeStr(newData.hoodedPloversLink, prev.hoodedPloversLink),
      hoodedPloversActive: safeStr(newData.hoodedPloversActive, prev.hoodedPloversActive),
      emergencyMarker: safeStr(newData.emergencyMarker, prev.emergencyMarker),
      what3words: safeStr(newData.what3words, prev.what3words),
      isSkyHighSite: safeStr(newData.isSkyHighSite, prev.isSkyHighSite),
      crossLeft: safeStr(newData.crossLeft, prev.crossLeft),
      crossRight: safeStr(newData.crossRight, prev.crossRight),
      overrideHideClosed: safeStr(newData.overrideHideClosed, prev.overrideHideClosed),
      unassignedText: unassigned || prev.unassignedText,
      siteguideVersion: safeStr(newData.siteguideVersion, prev.siteguideVersion),
      siteguideScrapedAt: safeStr(newData.siteguideScrapedAt, prev.siteguideScrapedAt),
      isTidal: safeStr(newData.isTidal, prev.isTidal),
      tideStationId: safeStr(newData.tideStationId, prev.tideStationId),
      skipBulkImport: safeStr(newData.skipBulkImport, prev.skipBulkImport),
      isXCSite: safeStr(newData.isXCSite, prev.isXCSite),
    }));
    setEssentialImages(essentialImgs);
    if (id && !isNew) {
      api.put(`/api/sites/${id}/essential-info`, { images: essentialImgs, text: essentialTxt }, token).catch(() => {});
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    let finalValue = value;
    if (name === "image" && value.trim()) finalValue = convertToDirectImageUrl(value);
    setFormData(prev => ({ ...prev, [name]: finalValue }));
    markDirty();
  };

  formDataRef.current = formData;

  const saveSite = useCallback(async () => {
    await adminSave(async () => {
      const currentFormData = formDataRef.current;
      const currentClosureDates = closureDatesRef.current;
      const isCoastal = currentFormData.type === "Coastal";
      const siteId = isNew ? (currentFormData.name as string).toLowerCase().replace(/[^a-z0-9]+/g, '-') : id;
      const payload = {
        ...currentFormData,
        id: siteId,
        hazards: safeStr(currentFormData.hazards).split('\n').filter(h => h.trim()),
        rules: safeStr(currentFormData.rules).split('\n').filter(r => r.trim()),
        lat: currentFormData.lat ? parseFloat(currentFormData.lat as string) : null,
        lon: currentFormData.lon ? parseFloat(currentFormData.lon as string) : null,
        isTidal: isCoastal ? "true" : "false",
        tideStationId: isCoastal ? currentFormData.tideStationId : "",
        closurePillsMax: closurePillsMaxRef.current,
      };
      if (isNew) await api.post('/api/sites', payload, token);
      else await api.put(`/api/sites/${id}`, payload, token);
      await api.put(`/api/sites/${siteId}/closure-dates`, { dates: currentClosureDates }, token);
      api.post("/api/weather/scrape-now", {}, token).catch(err => console.error("Failed to trigger weather update", err));
    });
  }, [formData, isNew, id, adminSave, token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveSite();
      setTimeout(() => navigate("/admin/sites"), 1200);
    } catch (e) {
      setSaveMessage({ type: "error", text: "Error saving site" });
    }
  };

  const checkInUrl = `${baseUrl}/check-in?site=${id}`;
  const fieldViewUrl = `${baseUrl}/sites/${id}/field`;
  const xcMapsUrl = `${baseUrl}/xc/maps?site=${id}`;

  const handlePrintFieldQR = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`<html><head><title>Field QR - ${escapeHtml(formData.name)}</title><style>body{font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0}.container{text-align:center;border:2px solid #000;padding:40px;border-radius:20px}h1{margin-bottom:10px;font-size:32px}p{margin-bottom:30px;font-size:18px;color:#555}.qr{margin-bottom:20px}.url{font-family:monospace;font-size:14px;color:#888}</style></head><body><div class="container"><h1>${escapeHtml(formData.name)}</h1><p>Scan for Site Information</p><div class="qr" id="qr-container"></div><p class="url">${fieldViewUrl}</p></div><script>const svg=window.opener.document.getElementById('field-qr-svg').outerHTML;document.getElementById('qr-container').innerHTML=svg;setTimeout(()=>window.print(),500)</script></body></html>`);
      printWindow.document.close();
    }
  };

  const handlePrintXCMapsQR = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`<html><head><title>XC Maps QR - ${escapeHtml(formData.name)}</title><style>body{font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0}.container{text-align:center;border:2px solid #000;padding:40px;border-radius:20px}h1{margin-bottom:10px;font-size:32px}p{margin-bottom:30px;font-size:18px;color:#555}.qr{margin-bottom:20px}.url{font-family:monospace;font-size:14px;color:#888}</style></head><body><div class="container"><h1>${escapeHtml(formData.name)}</h1><p>Scan for XC Map</p><div class="qr" id="qr-container"></div><p class="url">${xcMapsUrl}</p></div><script>const svg=window.opener.document.getElementById('xcmaps-qr-svg').outerHTML;document.getElementById('qr-container').innerHTML=svg;setTimeout(()=>window.print(),500)</script></body></html>`);
      printWindow.document.close();
    }
  };

  const handlePrintQR = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`<html><head><title>Print QR Code - ${escapeHtml(formData.name)}</title><style>body{font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0}.container{text-align:center;border:2px solid #000;padding:40px;border-radius:20px}h1{margin-bottom:10px;font-size:32px}p{margin-bottom:30px;font-size:18px;color:#555}.qr{margin-bottom:20px}.url{font-family:monospace;font-size:14px;color:#888}</style></head><body><div class="container"><h1>${escapeHtml(formData.name)}</h1><p>Scan to Check-in</p><div class="qr" id="qr-container"></div><p class="url">${checkInUrl}</p></div><script>const svg=window.opener.document.getElementById('qr-svg').outerHTML;document.getElementById('qr-container').innerHTML=svg;setTimeout(()=>window.print(),500)</script></body></html>`);
      printWindow.document.close();
    }
  };

  const navigateToSite = async (targetSiteId: string | null) => {
    if (!targetSiteId) return;
    if (isDirty) {
      try {
        await saveSite();
      } catch {
        setSaveMessage({ type: "error", text: "Failed to save — fix errors before navigating." });
        return;
      }
    }
    navigate(`/admin/sites/${targetSiteId}/edit`);
  };

  const formatHeights = () => {
    const fields = ['launchHeight', 'launchHeightHigh', 'launchHeight2', 'landingHeight2'] as const;

    const parseAndFormat = (val: string): string | null => {
      if (!val?.trim()) return null;
      const ftMatch = val.match(/(\d+(?:\.\d+)?)\s*(?:'|ft|feet)/i);
      const mMatch = val.match(/(\d+(?:\.\d+)?)\s*m?\b/i);
      if (ftMatch) {
        const ft = parseFloat(ftMatch[1]);
        const mRounded = Math.round(ft * 0.3048);
        const ftRounded = Math.round(ft / 10) * 10;
        return `${mRounded}m / ${ftRounded}'`;
      } else if (mMatch) {
        const m = parseFloat(mMatch[1]);
        const mRounded = Math.round(m);
        const ftRounded = Math.round((m * 3.28084) / 10) * 10;
        return `${mRounded}m / ${ftRounded}'`;
      }
      return null;
    };

    for (const field of fields) {
      const formatted = parseAndFormat(formData[field]);
      if (formatted !== null) {
        handleChange({ target: { name: field, value: formatted } } as unknown as React.ChangeEvent<HTMLInputElement>);
      }
    }
  };

  return {
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
  };
}
