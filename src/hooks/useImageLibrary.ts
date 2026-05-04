import { useState, useEffect, useRef, useCallback } from "react";
import { useSettings } from "@/contexts/SettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminForm } from "@/hooks/useAdminForm";
import { convertToDirectImageUrl } from "@/lib/urlHelpers";
import { api } from "@/lib/apiClient";
import type { SliderData } from "@/components/AIImageEnhancerModal";

export interface ImagePair {
  wide: string;
  banner: string;
  category?: "coastal" | "inland" | "";
  name?: string;
  sliderLg?: string;
  sliderSm?: string;
  sliderPortrait?: string;
  sliderEnabled?: boolean;
  sliderLgEnabled?: boolean;
  sliderSmEnabled?: boolean;
  sliderPortraitEnabled?: boolean;
}

export interface ScreenshotEntry {
  id: string;
  name: string;
  category: string;
  imagePath: string;
  width: number;
  height: number;
  dateAdded: string;
}

export interface Submission {
  id: string;
  originalFilename: string;
  storedFilename: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  status: string;
  moderationFlag: string | null;
  moderationNote: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  submitterIp: string | null;
  photographerCredit: string | null;
}

export interface BannedIp {
  id: number;
  ip: string;
  reason: string | null;
  bannedAt: string;
}

export const SCREENSHOT_CATEGORIES = ["Home Page", "Admin Manual", "Procedure Manual", "Site Guides", "Uncategorised"];

export function useImageLibrary() {
  const { settings, updateSettings, loading } = useSettings();
  const { token } = useAuth();
  const [images, setImages] = useState<ImagePair[]>([]);
  const [savedImages, setSavedImages] = useState<ImagePair[]>([]);
  const [isEnhancerOpen, setIsEnhancerOpen] = useState(false);
  const [newImageUrl, setNewImageUrl] = useState("");
  const [processingUrl, setProcessingUrl] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const { isDirty: hasUnsavedChanges, markDirty, markClean, blocker, justSaved, save: adminSave } = useAdminForm({ successMessage: "Images saved" });
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const [localizing, setLocalizing] = useState(false);
  const localizedRef = useRef(false);
  const [siteName, setSiteName] = useState("");
  const [urlSiteName, setUrlSiteName] = useState(() => {
    try {
      return localStorage.getItem("urlSiteName") || "";
    } catch {
      return "";
    }
  });
  const [urlPhotographerCredit, setUrlPhotographerCredit] = useState(() => {
    try {
      return localStorage.getItem("urlPhotographerCredit") || "";
    } catch {
      return "";
    }
  });
  const [urlWatermarkSize, setUrlWatermarkSize] = useState(10);
  const [urlWatermarkPosition, setUrlWatermarkPosition] = useState("bottom-right");
  const [generatingSliders, setGeneratingSliders] = useState(false);

  // Persist URL site name and photographer credit to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("urlSiteName", urlSiteName);
    } catch {
      // Silently fail if localStorage is not available
    }
  }, [urlSiteName]);

  useEffect(() => {
    try {
      localStorage.setItem("urlPhotographerCredit", urlPhotographerCredit);
    } catch {
      // Silently fail if localStorage is not available
    }
  }, [urlPhotographerCredit]);

  const [screenshots, setScreenshots] = useState<ScreenshotEntry[]>([]);
  const [savedScreenshots, setSavedScreenshots] = useState<ScreenshotEntry[]>([]);
  const [uploadBranch, setUploadBranch] = useState<"" | "hero" | "screenshot" | "community">("");
  const [heroPreloadedImage, setHeroPreloadedImage] = useState<{ base64: string; mimeType: string; name: string } | null>(null);
  const heroFileInputRef = useRef<HTMLInputElement>(null);
  const [ssName, setSsName] = useState("");
  const [ssCategory, setSsCategory] = useState("Uncategorised");
  const [ssPhotographerCredit, setSsPhotographerCredit] = useState("");
  const [ssWatermarkSize, setSsWatermarkSize] = useState(10);
  const [ssWatermarkPosition, setSsWatermarkPosition] = useState("bottom-right");
  const [showSsCrop, setShowSsCrop] = useState(false);
  const [ssCropTop, setSsCropTop] = useState(0);
  const [ssCropBottom, setSsCropBottom] = useState(0);
  const [ssCropLeft, setSsCropLeft] = useState(0);
  const [initialHeroImage, setInitialHeroImage] = useState<string | undefined>(undefined);
  const [ssCropRight, setSsCropRight] = useState(0);
  const [ssZoom, setSsZoom] = useState(1);
  const [ssPanX, setSsPanX] = useState(0);
  const [ssPanY, setSsPanY] = useState(0);
  const [ssDragging, setSsDragging] = useState(false);
  const [ssDragStart, setSsDragStart] = useState({ x: 0, y: 0 });
  const [ssProcessing, setSsProcessing] = useState(false);
  const [pendingSsImage, setPendingSsImage] = useState<{ base64: string; mimeType: string; naturalWidth: number; naturalHeight: number } | null>(null);
  const [showExistingPicker, setShowExistingPicker] = useState(false);
  const [showHeroPicker, setShowHeroPicker] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState<string | null>(null);
  const [ssViewMode, setSsViewMode] = useState<"grid" | "list">("grid");
  const [ssFilterCategory, setSsFilterCategory] = useState("All");
  const [ssSearch, setSsSearch] = useState("");
  const [copiedTag, setCopiedTag] = useState<string | null>(null);
  const ssFileInputRef = useRef<HTMLInputElement>(null);

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [submissionPreview, setSubmissionPreview] = useState<string | null>(null);
  const [submissionImageUrls, setSubmissionImageUrls] = useState<Record<string, string>>({});
  const [processingSubmission, setProcessingSubmission] = useState<string | null>(null);
  const [submissionForEnhancer, setSubmissionForEnhancer] = useState<{ base64: string; mimeType: string; name: string; submissionId: string; photographerCredit?: string } | null>(null);
  const [bannedIps, setBannedIps] = useState<BannedIp[]>([]);
  const [showBannedIps, setShowBannedIps] = useState(false);
  const [newBanIp, setNewBanIp] = useState("");
  const [newBanReason, setNewBanReason] = useState("");
  const [submissionNotifyEnabled, setSubmissionNotifyEnabled] = useState(true);
  const [submissionNotifyHour, setSubmissionNotifyHour] = useState(19);
  const [submissionRateLimit, setSubmissionRateLimit] = useState(5);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [submissionFilter, setSubmissionFilter] = useState<"pending" | "quarantined" | "all">("pending");
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const fetchSubmissions = useCallback(async () => {
    if (!token) return;
    setLoadingSubmissions(true);
    try {
      const url = submissionFilter === "all" ? "/api/submissions/all" : `/api/submissions?status=${submissionFilter}`;
      const data = await api.get<Record<string, unknown>>(url, token);
      const subs = Array.isArray(data) ? data : [];
      setSubmissions(subs);
      const urls: Record<string, string> = {};
      await Promise.all(subs.map(async (sub: Submission) => {
        try {
          const imgRes = await fetch(`/api/submissions/${sub.id}/image`, { headers: { Authorization: `Bearer ${token}` } });
          if (imgRes.ok) {
            const blob = await imgRes.blob();
            urls[sub.id] = URL.createObjectURL(blob);
          }
        } catch {}
      }));
      setSubmissionImageUrls(prev => {
        Object.values(prev).forEach(u => URL.revokeObjectURL(u));
        return urls;
      });
    } catch {}
    setLoadingSubmissions(false);
  }, [token, submissionFilter]);

  useEffect(() => { fetchSubmissions(); }, [fetchSubmissions]);

  useEffect(() => {
    if (!token) return;
    api.get<Record<string, any>>("/api/settings", token)
      .then(data => {
        if (data.submissionNotifyEnabled !== undefined) setSubmissionNotifyEnabled(data.submissionNotifyEnabled !== "false");
        if (data.submissionNotifyHour !== undefined) setSubmissionNotifyHour(parseInt(data.submissionNotifyHour, 10) || 19);
        if (data.submissionRateLimit !== undefined) setSubmissionRateLimit(parseInt(data.submissionRateLimit, 10) || 5);
        setSettingsLoaded(true);
      })
      .catch(() => setSettingsLoaded(true));
  }, [token]);

  const saveSubmissionSettings = async (overrides?: Record<string, string>) => {
    if (!token) return;
    const payload = {
      submissionNotifyEnabled: String(submissionNotifyEnabled),
      submissionNotifyHour: String(submissionNotifyHour),
      submissionRateLimit: String(submissionRateLimit),
      ...overrides,
    };
    try {
      await api.put("/api/settings", payload, token);
      setSaveMessage({ type: "success", text: "Submission settings saved" });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch {
      setSaveMessage({ type: "error", text: "Failed to save settings" });
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  const handleDeleteSubmission = async (id: string) => {
    if (!token) return;
    try {
      await api.delete(`/api/submissions/${id}`, token);
      setSubmissions(prev => prev.filter(s => s.id !== id));
    } catch (e: unknown) {
      setSaveMessage({ type: "error", text: (e instanceof Error ? e.message : "") || "Failed to delete submission" });
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  const handleProcessSubmission = async (id: string) => {
    if (!token) return;
    setProcessingSubmission(id);
    try {
      const data = await api.post<Record<string, any>>(`/api/submissions/${id}/process`, {}, token);
      setSubmissionForEnhancer({
        base64: data.imageData,
        mimeType: data.mimeType,
        name: data.originalFilename,
        submissionId: id,
        photographerCredit: data.photographerCredit || "",
      });
      setIsEnhancerOpen(true);
    } catch (e: unknown) {
      setSaveMessage({ type: "error", text: (e instanceof Error ? e.message : "") || "Failed to load submission" });
      setTimeout(() => setSaveMessage(null), 5000);
    }
    setProcessingSubmission(null);
  };

  const fetchBannedIps = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.get<any[]>("/api/submissions/banned-ips", token);
      setBannedIps(data);
    } catch {}
  }, [token]);

  useEffect(() => { if (showBannedIps) fetchBannedIps(); }, [showBannedIps, fetchBannedIps]);

  const handleAddBannedIp = async () => {
    if (!token || !newBanIp.trim()) return;
    try {
      await api.post("/api/submissions/banned-ips", { ip: newBanIp.trim(), reason: newBanReason.trim() || undefined }, token);
      setNewBanIp("");
      setNewBanReason("");
      fetchBannedIps();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to ban IP";
      setSaveMessage({ type: "error", text: msg });
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  const handleRemoveBannedIp = async (id: number) => {
    if (!token) return;
    try {
      await api.delete(`/api/submissions/banned-ips/${id}`, token);
      fetchBannedIps();
    } catch {}
  };

  const handleBanSubmissionIp = async (id: string) => {
    if (!token) return;
    try {
      const result = await api.post<{ bannedIp?: string }>(`/api/submissions/${id}/ban-ip`, {}, token);
      setSubmissions(prev => prev.filter(s => s.id !== id));
      setSaveMessage({ type: "success", text: `IP ${result.bannedIp || 'unknown'} banned and submission rejected` });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to ban IP";
      setSaveMessage({ type: "error", text: msg });
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  const handleSubmissionEnhancerAccept = async (wideImage: string, bannerImage?: string, name?: string, sliderData?: SliderData) => {
    if (!submissionForEnhancer || !token) return;
    const submissionId = submissionForEnhancer.submissionId;
    try {
      const newEntry: ImagePair = {
        wide: wideImage,
        banner: bannerImage || "",
        name: name || submissionForEnhancer.name.replace(/\.[^/.]+$/, ""),
        sliderEnabled: true,
        sliderLgEnabled: true,
        sliderSmEnabled: true,
        sliderPortraitEnabled: true,
        sliderLg: sliderData?.sliderLg || undefined,
        sliderSm: sliderData?.sliderSm || undefined,
        sliderPortrait: sliderData?.sliderPortrait || undefined,
      };
      const updated = [...images, newEntry];
      await updateSettings({ imageLibrary: JSON.stringify(updated) });
      await api.post(`/api/submissions/${submissionId}/approve`, {}, token);
      setImages(updated);
      setSavedImages(updated);
      setSubmissions(prev => prev.filter(s => s.id !== submissionId));
      setSaveMessage({ type: "success", text: "Submission processed and added to library" });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (e: unknown) {
      setSaveMessage({ type: "error", text: (e instanceof Error ? e.message : "") || "Failed to process submission" });
      setTimeout(() => setSaveMessage(null), 5000);
    }
    setSubmissionForEnhancer(null);
  };

  useEffect(() => {
    if (!settings || !token) return;
    const load = async () => {
      try {
        let pairs: ImagePair[] = settings.imageLibrary ? JSON.parse(settings.imageLibrary) : [];
        if (pairs.length === 0 && settings.homeHeroImages) {
          const legacyWide: string[] = JSON.parse(settings.homeHeroImages);
          if (legacyWide.length > 0) {
            pairs = legacyWide.map(w => ({ wide: w, banner: "" }));
          }
        }
        // Skip localization for local paths and absolute URLs (including R2)
        // Only localize relative URLs that don't start with / or http(s)://
        setImages(pairs);
        setSavedImages(pairs);
        setImages(pairs);
        setSavedImages(pairs);
      } catch {
        setImages([]);
        setSavedImages([]);
      }
    };
    load();
  }, [settings, token]);

  useEffect(() => {
    if (!settings) return;
    try {
      const ss: ScreenshotEntry[] = settings.screenshotLibrary ? JSON.parse(settings.screenshotLibrary) : [];
      setScreenshots(ss);
      setSavedScreenshots(ss);
    } catch {
      setScreenshots([]);
      setSavedScreenshots([]);
    }
  }, [settings]);

  const markChanged = (updated: ImagePair[]) => {
    setImages(updated);
    markDirty();
  };

  const handlePickExisting = async (entry: ScreenshotEntry) => {
    setLoadingExisting(entry.id);
    try {
      const resp = await fetch(entry.imagePath);
      if (!resp.ok) throw new Error("Failed to fetch image");
      const blob = await resp.blob();
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        const base64 = dataUrl.split(",")[1];
        const img = new window.Image();
        img.onload = () => {
          setPendingSsImage({ base64, mimeType: blob.type || "image/jpeg", naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
          if (!ssName) setSsName(entry.name);
          setSsCropTop(0); setSsCropBottom(0); setSsCropLeft(0); setSsCropRight(0); setSsZoom(1); setSsPanX(0); setSsPanY(0);
          setShowExistingPicker(false);
          setLoadingExisting(null);
        };
        img.onerror = () => { setLoadingExisting(null); };
        img.src = dataUrl;
      };
      reader.readAsDataURL(blob);
    } catch { setLoadingExisting(null); }
  };

  const handleSsFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const base64 = dataUrl.split(",")[1];
      const img = new window.Image();
      img.onload = () => {
        setPendingSsImage({ base64, mimeType: file.type || "image/jpeg", naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
        setSsCropTop(0); setSsCropBottom(0); setSsCropLeft(0); setSsCropRight(0); setSsZoom(1); setSsPanX(0); setSsPanY(0);
        if (!ssName) setSsName(file.name.replace(/\.[^/.]+$/, ""));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleHeroFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const base64 = dataUrl.split(",")[1];
      setHeroPreloadedImage({ base64, mimeType: file.type || "image/jpeg", name: file.name });
      if (!siteName) setSiteName(file.name.replace(/\.[^/.]+$/, ""));
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handlePickExistingHero = (pair: ImagePair) => {
    setInitialHeroImage(pair.wide);
    setSiteName(pair.name || "");
    setIsEnhancerOpen(true);
    setShowHeroPicker(false);
  };

  const handleSaveScreenshot = async (crop: boolean) => {
    if (!pendingSsImage || !ssName.trim() || !token) return;
    setSsProcessing(true);
    try {
      const cropRegion = crop ? { x: ssCropLeft / 100, y: ssCropTop / 100, w: (100 - ssCropLeft - ssCropRight) / 100, h: (100 - ssCropTop - ssCropBottom) / 100 } : undefined;
      const credit = ssPhotographerCredit.trim();
      const data = await api.post<Record<string, any>>("/api/ai/save-screenshot", { image: pendingSsImage.base64, mimeType: pendingSsImage.mimeType, name: ssName.trim(), cropRegion, photographerCredit: credit || undefined, watermarkSize: credit ? ssWatermarkSize : undefined, watermarkPosition: credit ? ssWatermarkPosition : undefined }, token);
      const newEntry: ScreenshotEntry = {
        id: `ss-${Date.now().toString(36)}`,
        name: ssName.trim(),
        category: ssCategory,
        imagePath: data.imagePath,
        width: data.width,
        height: data.height,
        dateAdded: new Date().toISOString().split("T")[0],
      };
      const updated = [...screenshots, newEntry];
      await updateSettings({ screenshotLibrary: JSON.stringify(updated) });
      setScreenshots(updated);
      setSavedScreenshots(updated);
      setPendingSsImage(null);
      setSsName("");
      setSsCategory("Uncategorised");
      setSsPhotographerCredit("");
      setShowSsCrop(false);
      setSsCropTop(0); setSsCropBottom(0); setSsCropLeft(0); setSsCropRight(0); setSsZoom(1); setSsPanX(0); setSsPanY(0);
      setUploadBranch("");
      setSaveMessage({ type: "success", text: "Screenshot saved to library" });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (e: unknown) {
      setSaveMessage({ type: "error", text: (e instanceof Error ? e.message : "") || "Failed to save screenshot" });
      setTimeout(() => setSaveMessage(null), 5000);
    }
    setSsProcessing(false);
  };

  const handleDeleteScreenshot = async (id: string) => {
    const updated = screenshots.filter(s => s.id !== id);
    try {
      await updateSettings({ screenshotLibrary: JSON.stringify(updated) });
      setScreenshots(updated);
      setSavedScreenshots(updated);
      setSaveMessage({ type: "success", text: "Screenshot removed" });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch {
      setSaveMessage({ type: "error", text: "Failed to remove screenshot" });
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  const handleCopyTag = (tag: string) => {
    navigator.clipboard.writeText(tag).catch(() => {});
    setCopiedTag(tag);
    setTimeout(() => setCopiedTag(null), 2000);
  };

  const filteredScreenshots = screenshots.filter(s => {
    if (ssFilterCategory !== "All" && s.category !== ssFilterCategory) return false;
    if (ssSearch && !s.name.toLowerCase().includes(ssSearch.toLowerCase())) return false;
    return true;
  });

  const handleSave = useCallback(async () => {
    await adminSave(async () => {
      await updateSettings({ imageLibrary: JSON.stringify(images) });
      setSavedImages([...images]);
    });
  }, [images, updateSettings, adminSave]);

  const handleEnhancedAccept = async (wideImage: string, bannerImage?: string, name?: string, sliderData?: SliderData) => {
    const imgName = name || siteName;
    const existingIndex = images.findIndex(p => p.wide === wideImage);
    let localWide = wideImage;
    let slider: SliderData = sliderData || {};
    let localBanner = bannerImage || "";
    if (!wideImage.startsWith("/uploads/")) {
      setProcessingUrl(true);
      try {
        const data = await api.post<{ wideImage: string }>("/api/ai/process-image-url", { url: wideImage, name: imgName }, token);
        localWide = data.wideImage;
      } catch (e: unknown) {
        setSaveMessage({ type: "error", text: (e instanceof Error ? e.message : "") || "Failed to process image" });
        setProcessingUrl(false);
        return;
      }
      setProcessingUrl(false);
    }
    const newEntry = {
      wide: localWide,
      banner: localBanner,
      name: imgName,
      ...slider,
      sliderEnabled: true,
      sliderLgEnabled: true,
      sliderSmEnabled: true,
      sliderPortraitEnabled: true,
    };
    if (existingIndex >= 0) {
      const updated = [...images];
      updated[existingIndex] = { ...updated[existingIndex], ...newEntry };
      markChanged(updated);
    } else {
      const updated = [...images, newEntry];
      markChanged(updated);
    }
    setSiteName("");
  };

  const handleBulkUploadAccept = (results: { filename: string; url: string; size: string }[]) => {
    const newEntries = results.map(result => ({
      wide: result.url,
      banner: "",
      name: result.filename.replace(/\.[^/.]+$/, ""),
      sliderEnabled: false,
      sliderLgEnabled: false,
      sliderSmEnabled: false,
      sliderPortraitEnabled: false,
    }));
    const updated = [...images, ...newEntries];
    markChanged(updated);
  };

  const handleAddUrl = async () => {
    if (!newImageUrl.trim() || !urlSiteName.trim()) return;
    setProcessingUrl(true);
    try {
      const directUrl = convertToDirectImageUrl(newImageUrl.trim());
      const imgRes = await fetch(directUrl);
      if (!imgRes.ok) throw new Error("Failed to fetch image");
      const blob = await imgRes.blob();
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = (ev) => resolve((ev.target?.result as string).split(",")[1]);
        reader.onerror = () => reject(new Error("Failed to read"));
      });
      reader.readAsDataURL(blob);
      const base64Data = await base64Promise;
      const credit = urlPhotographerCredit.trim();
      const data = await api.post<{ wideImage: string }>("/api/ai/process-image", { image: base64Data, mimeType: blob.type || "image/jpeg", name: urlSiteName.trim(), photographerCredit: credit, watermarkSize: credit ? urlWatermarkSize : undefined, watermarkPosition: credit ? urlWatermarkPosition : undefined }, token);
      if (credit && data.wideImage) {
        try {
          await api.post("/api/ai/watermark-existing", { imagePath: data.wideImage, photographerCredit: credit, watermarkSize: urlWatermarkSize, watermarkPosition: urlWatermarkPosition }, token);
        } catch {}
      }
      const updated = [...images, { wide: data.wideImage, banner: "", name: urlSiteName.trim(), sliderEnabled: true, sliderLgEnabled: true, sliderSmEnabled: true, sliderPortraitEnabled: true }];
      markChanged(updated);
      setNewImageUrl("");
      setUrlSiteName("");
    } catch (e: unknown) {
      setSaveMessage({ type: "error", text: (e instanceof Error ? e.message : "") || "Failed to process URL" });
    }
    setProcessingUrl(false);
  };

  const handleRemoveWide = (index: number) => {
    const updated = [...images];
    updated[index] = { ...updated[index], wide: "" };
    if (!updated[index].wide && !updated[index].banner) updated.splice(index, 1);
    markChanged(updated);
  };

  const handleRemoveBanner = (index: number) => {
    const updated = [...images];
    updated[index] = { ...updated[index], banner: "" };
    if (!updated[index].wide && !updated[index].banner) updated.splice(index, 1);
    markChanged(updated);
  };

  const handleSetCategory = (index: number, cat: "coastal" | "inland") => {
    const updated = [...images];
    updated[index] = { ...updated[index], category: updated[index].category === cat ? "" : cat };
    markChanged(updated);
  };

  const wideImages = images.map((pair, i) => ({ pair, originalIndex: i })).filter(item => item.pair.wide);
  const bannerImages = images.map((pair, i) => ({ pair, originalIndex: i })).filter(item => item.pair.banner);
  const sliderImages = images.map((pair, i) => ({ pair, originalIndex: i })).filter(item => item.pair.sliderLg || item.pair.sliderSm || item.pair.sliderPortrait);

  const handleToggleSlider = (index: number, variant: "sliderLg" | "sliderSm" | "sliderPortrait") => {
    const updated = [...images];
    const enabledKey = variant === "sliderLg" ? "sliderLgEnabled" : variant === "sliderSm" ? "sliderSmEnabled" : "sliderPortraitEnabled";
    const currentEnabled = updated[index][enabledKey] !== false;
    updated[index] = { ...updated[index], [enabledKey]: !currentEnabled };
    markChanged(updated);
  };

  const handleDeleteSliderImage = (index: number, variant: "sliderLg" | "sliderSm" | "sliderPortrait") => {
    const updated = [...images];
    updated[index] = { ...updated[index], [variant]: undefined };
    markChanged(updated);
  };

  const handleGenerateAllSliders = async () => {
    const needsGeneration = images.filter(p => p.wide && (!p.sliderLg || !p.sliderSm || !p.sliderPortrait));
    if (needsGeneration.length === 0) return;
    setGeneratingSliders(true);
    const updated = [...images];
    let count = 0;
    for (let i = 0; i < updated.length; i++) {
      const p = updated[i];
      if (!p.wide || (p.sliderLg && p.sliderSm && p.sliderPortrait)) continue;
      try {
        const data = await api.post<Record<string, any>>("/api/ai/generate-slider-images", { imagePath: p.wide, name: p.name || "" }, token);
        updated[i] = { ...updated[i], sliderLg: data.sliderLg, sliderSm: data.sliderSm, sliderPortrait: data.sliderPortrait, sliderEnabled: true, sliderLgEnabled: true, sliderSmEnabled: true, sliderPortraitEnabled: true };
        count++;
      } catch {}
    }
    if (count > 0) {
      markChanged(updated);
      setSaveMessage({ type: "success", text: `Generated slider images for ${count} photos` });
      setTimeout(() => setSaveMessage(null), 3000);
    }
    setGeneratingSliders(false);
  };

  return {
    settings, loading, token, images, setImages, savedImages, isEnhancerOpen, setIsEnhancerOpen,
    newImageUrl, setNewImageUrl, processingUrl, saveMessage, setSaveMessage,
    hasUnsavedChanges, markDirty, markClean, blocker, justSaved,
    expandedSections, toggleSection, localizing, siteName, setSiteName,
    urlSiteName, setUrlSiteName, urlPhotographerCredit, setUrlPhotographerCredit, urlWatermarkSize, setUrlWatermarkSize, urlWatermarkPosition, setUrlWatermarkPosition, generatingSliders,
    screenshots, savedScreenshots, uploadBranch, setUploadBranch,
    heroPreloadedImage, setHeroPreloadedImage, heroFileInputRef,
    ssName, setSsName, ssCategory, setSsCategory, ssPhotographerCredit, setSsPhotographerCredit, ssWatermarkSize, setSsWatermarkSize, ssWatermarkPosition, setSsWatermarkPosition,
    showSsCrop, setShowSsCrop,
    ssCropTop, setSsCropTop, ssCropBottom, setSsCropBottom,
    ssCropLeft, setSsCropLeft, ssCropRight, setSsCropRight,
    ssZoom, setSsZoom, ssPanX, setSsPanX, ssPanY, setSsPanY,
    ssDragging, setSsDragging, ssDragStart, setSsDragStart,
    ssProcessing, pendingSsImage, setPendingSsImage,
    showExistingPicker, setShowExistingPicker, showHeroPicker, setShowHeroPicker, loadingExisting,
    ssViewMode, setSsViewMode, ssFilterCategory, setSsFilterCategory,
    ssSearch, setSsSearch, copiedTag, ssFileInputRef,
    submissions, loadingSubmissions, submissionPreview, setSubmissionPreview,
    submissionImageUrls, processingSubmission, submissionForEnhancer, setSubmissionForEnhancer,
    bannedIps, showBannedIps, setShowBannedIps,
    newBanIp, setNewBanIp, newBanReason, setNewBanReason,
    submissionNotifyEnabled, setSubmissionNotifyEnabled,
    submissionNotifyHour, setSubmissionNotifyHour,
    submissionRateLimit, setSubmissionRateLimit,
    settingsLoaded, submissionFilter, setSubmissionFilter,
    lightboxSrc, setLightboxSrc,
    updateSettings, markChanged,
    handlePickExisting, handlePickExistingHero, handleSsFileSelect, handleHeroFileSelect,
    handleSaveScreenshot, handleDeleteScreenshot, handleCopyTag,
    filteredScreenshots, handleSave, handleEnhancedAccept, handleBulkUploadAccept,
    handleAddUrl, handleRemoveWide, handleRemoveBanner, handleSetCategory,
    wideImages, bannerImages, sliderImages,
    handleToggleSlider, handleDeleteSliderImage, handleGenerateAllSliders,
    fetchSubmissions, saveSubmissionSettings,
    handleDeleteSubmission, handleProcessSubmission,
    handleAddBannedIp, handleRemoveBannedIp, handleBanSubmissionIp,
    handleSubmissionEnhancerAccept,
    initialHeroImage, setInitialHeroImage,
  };
}
