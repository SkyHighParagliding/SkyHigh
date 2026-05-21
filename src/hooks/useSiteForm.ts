import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAdminForm } from "@/hooks/useAdminForm";
import { api } from "@/lib/apiClient";
import { toast } from "sonner";
import { convertToDirectImageUrl } from "@/lib/urlHelpers";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";

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
            name: (data.name as string) || "", type: ((data.type as string) || "").toLowerCase().includes("inland") ? "Inland" : "Coastal",
            pgRating: (data.pgRating as string) || "", hgRating: (data.hgRating as string) || "",
            windDir: (data.windDir as string) || "", windSpeed: (data.windSpeed as string) || "",
            status: (data.status as string) || "open", hazardLevel: (data.hazardLevel as string) || "low",
            lat: data.lat !== null && data.lat !== undefined ? String(data.lat) : "",
            lon: data.lon !== null && data.lon !== undefined ? String(data.lon) : "",
            useLiveWeather: (data.useLiveWeather as string) || "false",
            liveStationId: (data.liveStationId as string) || "", liveStationIdAlt: (data.liveStationIdAlt as string) || "",
            description: (data.description as string) || "", launch: (data.launch as string) || "", landing: (data.landing as string) || "",
            hazards: data.hazards ? (data.hazards as string[]).join('\n') : "",
            rules: data.rules ? (data.rules as string[]).join('\n') : "",
            image: (data.image as string) || "", siteguideUrl: (data.siteguideUrl as string) || "",
            siteContact: (data.siteContact as string) || "", siteContactPhone: (data.siteContactPhone as string) || "",
            navigateTo: (data.navigateTo as string) || "", launchHeight: (data.launchHeight as string) || "",
            launchHeightHigh: (data.launchHeightHigh as string) || "",
            launchHeight2: (data.launchHeight2 as string) || "", landingHeight2: (data.landingHeight2 as string) || "",
            hoodedPloversLink: (data.hoodedPloversLink as string) || "", hoodedPloversActive: (data.hoodedPloversActive as string) || "false",
            emergencyMarker: (data.emergencyMarker as string) || "", what3words: (data.what3words as string) || "",
            isSkyHighSite: (data.isSkyHighSite as string) || "false",
            crossLeft: (data.crossLeft as string) || "false", crossRight: (data.crossRight as string) || "false",
            overrideHideClosed: (data.overrideHideClosed as string) || "false",
            unassignedText: (data.unassignedText as string) || "",
            siteguideVersion: (data.siteguideVersion as string) || "", siteguideScrapedAt: (data.siteguideScrapedAt as string) || "",
            isTidal: (data.isTidal as string) || "false", tideStationId: (data.tideStationId as string) || "",
            skipBulkImport: (data.skipBulkImport as string) || "false",
            isXCSite: (data.isXCSite as string) || "false",
          });
          setEssentialImages((data.essentialInfoImages as string[]) || []);
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
      api.get<Array<{id: string, name: string, distanceKm: number, lat: number, lon: number, source: string}>>(`/api/weather/stations/nearby?lat=${formData.lat}&lon=${formData.lon}&radius=${searchRadius}${formData.liveStationId ? `&currentStationId=${encodeURIComponent(formData.liveStationId)}` : ''}`)
        .then(data => {
          setNearbyStations(data);
          if (data.length > 0 && !formData.liveStationId) {
            setFormData(prev => ({ ...prev, liveStationId: data[0].id }));
          }
        })
        .catch(err => console.error("Failed to fetch nearby stations", err))
        .finally(() => setLoadingStations(false));
    } else {
      setNearbyStations([]);
    }
  }, [formData.useLiveWeather, formData.lat, formData.lon, searchRadius]);

  const [externalSites, setExternalSites] = useState<{name: string, url: string, state?: string, stateAbbr?: string, region?: string}[]>([]);
  const [selectedState, setSelectedState] = useState("");
  const [allDbSites, setAllDbSites] = useState<{id: string, siteguideUrl: string}[]>([]);

  useEffect(() => {
    api.get<{ data: Array<Record<string, string>> }>('/api/sites')
      .then((response) => setAllDbSites(response.data.map(s => ({ id: s.id, siteguideUrl: s.siteguideUrl || "" }))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    api.get<Array<Record<string, string>>>('/api/external-sites')
      .then(data => {
        setExternalSites(data);
        if (!isNew && formData.siteguideUrl && !selectedState) {
          const match = data.find((s: Record<string, string>) => s.url === formData.siteguideUrl);
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
  const [archives, setArchives] = useState<{id: number, siteguideVersion: string, archivedAt: string, siteCount: number}[]>([]);
  const [selectedRestoreVersion, setSelectedRestoreVersion] = useState("");
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [siteDiffData, setSiteDiffData] = useState<Record<string, unknown> | null>(null);
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
      api.get<Array<Record<string, unknown>>>("/api/sites/archives", token)
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
      const data = await api.get<Record<string, unknown>>(`/api/sites/archives/${encodeURIComponent(selectedRestoreVersion)}/diff?siteId=${id}`, token);
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
        api.get<Array<Record<string, string>>>('/api/external-sites')
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
    const essentialImgs = newData._essentialImages || [];
    const essentialTxt = newData._essentialText || "";
    const unassigned = newData._unassignedText || "";
    const { _essentialImages, _essentialText, _unassignedText, ...formFields } = newData;
    setFormData(prev => ({
      ...prev,
      ...formFields,
      hazards: Array.isArray(formFields.hazards) ? formFields.hazards.join('\n') : (formFields.hazards || ""),
      rules: Array.isArray(formFields.rules) ? formFields.rules.join('\n') : (formFields.rules || ""),
      essentialInfoImages: JSON.stringify(essentialImgs),
      essentialInfoText: essentialTxt,
      unassignedText: unassigned
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
        hazards: currentFormData.hazards.split('\n').filter((h: string) => h.trim()),
        rules: currentFormData.rules.split('\n').filter((r: string) => r.trim()),
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
      printWindow.document.write(`<html><head><title>Field QR - ${formData.name}</title><style>body{font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0}.container{text-align:center;border:2px solid #000;padding:40px;border-radius:20px}h1{margin-bottom:10px;font-size:32px}p{margin-bottom:30px;font-size:18px;color:#555}.qr{margin-bottom:20px}.url{font-family:monospace;font-size:14px;color:#888}</style></head><body><div class="container"><h1>${formData.name}</h1><p>Scan for Site Information</p><div class="qr" id="qr-container"></div><p class="url">${fieldViewUrl}</p></div><script>const svg=window.opener.document.getElementById('field-qr-svg').outerHTML;document.getElementById('qr-container').innerHTML=svg;setTimeout(()=>window.print(),500)</script></body></html>`);
      printWindow.document.close();
    }
  };

  const handlePrintXCMapsQR = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`<html><head><title>XC Maps QR - ${formData.name}</title><style>body{font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0}.container{text-align:center;border:2px solid #000;padding:40px;border-radius:20px}h1{margin-bottom:10px;font-size:32px}p{margin-bottom:30px;font-size:18px;color:#555}.qr{margin-bottom:20px}.url{font-family:monospace;font-size:14px;color:#888}</style></head><body><div class="container"><h1>${formData.name}</h1><p>Scan for XC Map</p><div class="qr" id="qr-container"></div><p class="url">${xcMapsUrl}</p></div><script>const svg=window.opener.document.getElementById('xcmaps-qr-svg').outerHTML;document.getElementById('qr-container').innerHTML=svg;setTimeout(()=>window.print(),500)</script></body></html>`);
      printWindow.document.close();
    }
  };

  const handlePrintQR = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`<html><head><title>Print QR Code - ${formData.name}</title><style>body{font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0}.container{text-align:center;border:2px solid #000;padding:40px;border-radius:20px}h1{margin-bottom:10px;font-size:32px}p{margin-bottom:30px;font-size:18px;color:#555}.qr{margin-bottom:20px}.url{font-family:monospace;font-size:14px;color:#888}</style></head><body><div class="container"><h1>${formData.name}</h1><p>Scan to Check-in</p><div class="qr" id="qr-container"></div><p class="url">${checkInUrl}</p></div><script>const svg=window.opener.document.getElementById('qr-svg').outerHTML;document.getElementById('qr-container').innerHTML=svg;setTimeout(()=>window.print(),500)</script></body></html>`);
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
