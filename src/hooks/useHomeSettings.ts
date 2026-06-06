import { useState, useEffect, useRef, useMemo } from 'react';
import { useSettings } from '@/contexts/SettingsContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminForm } from '@/hooks/useAdminForm';
import { api } from '@/lib/apiClient';
import type { Site } from '@/types/api';
import { extractVideoId } from '@/lib/youtube';

export function useHomeSettings() {
  const { settings, updateSettings, loading } = useSettings();
  const { token } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [formData, setFormData] = useState({
    homeHeroTitle: "",
    homeHeroSubtitle: "",
    homeHeroImages: [] as string[],
    homeHeroImageMode: "random" as "static" | "random",
    homeHeroStaticImageIndex: 0,
    alertBannerEnabled: false,
    alertBannerText: "",
    homeCta1Text: "",
    homeCta1Link: "",
    homeCta2Text: "",
    homeCta2Link: "",
    featuredSiteId: "",
    homeBox1Desc: "",
    homeBox2Desc: "",
    homeBox3Desc: "",
    homeCardsSelection: ["sites", "safety", "community"] as string[],
    homeCardsCycle: false,
    homeCardsCyclePinned: "",
    homeCardSitesTitle: "",
    homeCardSitesLink: "",
    homeCardSitesLinkText: "",
    homeCardSafetyTitle: "",
    homeCardSafetyLink: "",
    homeCardSafetyLinkText: "",
    homeCardCommunityTitle: "",
    homeCardCommunityLink: "",
    homeCardCommunityLinkText: "",
    homeCardEventsTitle: "",
    homeCardEventsLink: "",
    homeCardEventsLinkText: "",
    homeCardCommitteeTitle: "",
    homeCardCommitteeLink: "",
    homeCardCommitteeLinkText: "",
    homeCardCommitteeDesc: "",
    socialFacebook: "",
    socialInstagram: "",
    socialYoutube: "",
    socialTiktok: "",
    socialTwitter: "",
    socialLinkedin: "",
    socialStrava: "",
    socialWebsite: "",
    publicSearchCommitteeLink: "",
    publicSearchPrompt: "",
    publicSearchDisclaimer: "",
    publicSearchEligibilityRules: "",
    publicSearchCtaMessage: "",
    publicSearchCtaFrequency: "2",
    qrCodeMode: "off" as "off" | "online" | "static",
    clubName: "SkyHigh",
    clubTagline: "",
    clubPrimaryColor: "",
    groundHandlingEnabled: false,
    xcMapsEnabled: false,
    xcMapsTitle: "",
    xcMapsDescription: "",
    xcDistanceRings: "[10, 20, 50, 100]",
    businessDirectoryEnabled: false,
    bulkUploadLimit: "20",
    xcAirspaceEnabled: false,
    xcCompetitionsEnabled: false,
    flightTrackerEnabled: false,
    homeWeatherCardCount: "6",
  });

  const [customCards, setCustomCards] = useState<any[]>([]);
  const [schools, setSchools] = useState<any[]>([]);
  const [sponsors, setSponsors] = useState<any[]>([]);
  const [telegramGroups, setTelegramGroups] = useState<any[]>([]);
  const [youtubeVideos, setYoutubeVideos] = useState<any[]>([]);
  const [instagramEmbeds, setInstagramEmbeds] = useState<any[]>([]);
  const [customWidgetTags, setCustomWidgetTags] = useState<any[]>([]);

  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["alert"]));
  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const [newSchoolName, setNewSchoolName] = useState("");
  const [newSchoolUrl, setNewSchoolUrl] = useState("");
  const [newTelegramName, setNewTelegramName] = useState("");
  const [newTelegramUrl, setNewTelegramUrl] = useState("");
  const [newYoutubeUrl, setNewYoutubeUrl] = useState("");
  const [youtubeUrlError, setYoutubeUrlError] = useState("");
  const [newInstaEmbed, setNewInstaEmbed] = useState("");
  const [instaEmbedError, setInstaEmbedError] = useState("");

  const [ytChannelUrl, setYtChannelUrl] = useState("");
  const [ytScraping, setYtScraping] = useState(false);
  const [ytScrapeResult, setYtScrapeResult] = useState<{ count: number } | null>(null);

  const [newTagName, setNewTagName] = useState("");
  const [newTagSource, setNewTagSource] = useState<"telegram" | "school" | "sponsor">("telegram");
  const [newTagSelection, setNewTagSelection] = useState<string[]>([]);
  const [editingTagIdx, setEditingTagIdx] = useState<number | null>(null);
  const [editTagSelection, setEditTagSelection] = useState<string[]>([]);

  const saveMessageRef = useRef<HTMLDivElement>(null);
  const { isDirty, markDirty, blocker, saving, justSaved, saveError, save } = useAdminForm({ successMessage: "Home page settings saved" });

  useEffect(() => {
    api.get<{ data: Site[] }>("/api/sites")
      .then(res => setSites(res.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!loading) {
      setFormData({
        homeHeroTitle: settings.homeHeroTitle || "",
        homeHeroSubtitle: settings.homeHeroSubtitle || "",
        homeHeroImages: Array.isArray(settings.homeHeroImages) ? settings.homeHeroImages : (typeof settings.homeHeroImages === 'string' ? JSON.parse(settings.homeHeroImages || "[]") : []),
        homeHeroImageMode: (settings.homeHeroImageMode as "static" | "random") || "random",
        homeHeroStaticImageIndex: parseInt(settings.homeHeroStaticImageIndex || "0"),
        alertBannerEnabled: !!settings.alertBannerEnabled,
        alertBannerText: settings.alertBannerText || "",
        homeCta1Text: settings.homeCta1Text || "",
        homeCta1Link: settings.homeCta1Link || "",
        homeCta2Text: settings.homeCta2Text || "",
        homeCta2Link: settings.homeCta2Link || "",
        featuredSiteId: settings.featuredSiteId || "",
        homeBox1Desc: settings.homeBox1Desc || "",
        homeBox2Desc: settings.homeBox2Desc || "",
        homeBox3Desc: settings.homeBox3Desc || "",
        homeCardsSelection: Array.isArray(settings.homeCardsSelection) ? settings.homeCardsSelection : (typeof settings.homeCardsSelection === 'string' ? JSON.parse(settings.homeCardsSelection || '["sites", "safety", "community"]') : ["sites", "safety", "community"]),
        homeCardsCycle: !!settings.homeCardsCycle,
        homeCardsCyclePinned: settings.homeCardsCyclePinned || "",
        homeCardSitesTitle: settings.homeCardSitesTitle || "",
        homeCardSitesLink: settings.homeCardSitesLink || "",
        homeCardSitesLinkText: settings.homeCardSitesLinkText || "",
        homeCardSafetyTitle: settings.homeCardSafetyTitle || "",
        homeCardSafetyLink: settings.homeCardSafetyLink || "",
        homeCardSafetyLinkText: settings.homeCardSafetyLinkText || "",
        homeCardCommunityTitle: settings.homeCardCommunityTitle || "",
        homeCardCommunityLink: settings.homeCardCommunityLink || "",
        homeCardCommunityLinkText: settings.homeCardCommunityLinkText || "",
        homeCardEventsTitle: settings.homeCardEventsTitle || "",
        homeCardEventsLink: settings.homeCardEventsLink || "",
        homeCardEventsLinkText: settings.homeCardEventsLinkText || "",
        homeCardCommitteeTitle: settings.homeCardCommitteeTitle || "",
        homeCardCommitteeLink: settings.homeCardCommitteeLink || "",
        homeCardCommitteeLinkText: settings.homeCardCommitteeLinkText || "",
        homeCardCommitteeDesc: settings.homeCardCommitteeDesc || "",
        socialFacebook: settings.socialFacebook || "",
        socialInstagram: settings.socialInstagram || "",
        socialYoutube: settings.socialYoutube || "",
        socialTiktok: settings.socialTiktok || "",
        socialTwitter: settings.socialTwitter || "",
        socialLinkedin: settings.socialLinkedin || "",
        socialStrava: settings.socialStrava || "",
        socialWebsite: settings.socialWebsite || "",
        publicSearchCommitteeLink: settings.publicSearchCommitteeLink || "",
        publicSearchPrompt: settings.publicSearchPrompt || "",
        publicSearchDisclaimer: settings.publicSearchDisclaimer || "",
        publicSearchEligibilityRules: settings.publicSearchEligibilityRules || "",
        publicSearchCtaMessage: settings.publicSearchCtaMessage || "",
        publicSearchCtaFrequency: settings.publicSearchCtaFrequency || "2",
        qrCodeMode: (settings.qrCodeMode as "off" | "online" | "static") || "off",
        clubName: settings.clubName || "SkyHigh",
        clubTagline: settings.clubTagline || "",
        clubPrimaryColor: settings.clubPrimaryColor || "",
        groundHandlingEnabled: !!settings.groundHandlingEnabled,
        xcMapsEnabled: !!settings.xcMapsEnabled,
        xcMapsTitle: settings.xcMapsTitle || "",
        xcMapsDescription: settings.xcMapsDescription || "",
        xcDistanceRings: settings.xcDistanceRings || "[10, 20, 50, 100]",
        businessDirectoryEnabled: !!settings.businessDirectoryEnabled,
        bulkUploadLimit: settings.bulkUploadLimit || "20",
        xcAirspaceEnabled: !!settings.xcAirspaceEnabled,
        xcCompetitionsEnabled: !!settings.xcCompetitionsEnabled,
        flightTrackerEnabled: !!settings.flightTrackerEnabled,
        homeWeatherCardCount: settings.homeWeatherCardCount || "6",
      });

      try { setCustomCards(JSON.parse(settings.homeCustomCards || "[]")); } catch { setCustomCards([]); }
      try { setSchools(JSON.parse(settings.homeSchools || "[]")); } catch { setSchools([]); }
      try { setSponsors(JSON.parse(settings.homeSponsors || "[]")); } catch { setSponsors([]); }
      try { setTelegramGroups(JSON.parse(settings.homeTelegramGroups || "[]")); } catch { setTelegramGroups([]); }
      try { setYoutubeVideos(JSON.parse(settings.youtubeVideos || "[]")); } catch { setYoutubeVideos([]); }
      try { setInstagramEmbeds(JSON.parse(settings.instagramEmbeds || "[]")); } catch { setInstagramEmbeds([]); }
      
      try {
        const parsedTags = settings.customWidgetTags ? JSON.parse(settings.customWidgetTags) : [];
        const migrated = parsedTags.map((t: any) => ({
          name: t.name,
          source: t.source || "telegram",
          items: t.items || t.groupNames || [],
        }));
        setCustomWidgetTags(migrated);
      } catch (e) {
        setCustomWidgetTags([]);
      }
    }
  }, [loading, settings]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setFormData(prev => ({ ...prev, [name]: val }));
    markDirty();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveSettings();
  };

  const saveSettings = () => save(async () => {
    const payload: Record<string, string | boolean> = {};
    for (const [key, value] of Object.entries(formData)) {
      payload[key] = (key === 'homeHeroImages' || key === 'homeCardsSelection') ? JSON.stringify(value) : String(value);
      if (value === true || value === false) payload[key] = value;
    }

    await updateSettings({
      ...payload,
      homeCustomCards: JSON.stringify(customCards),
      homeSchools: JSON.stringify(schools),
      homeSponsors: JSON.stringify(sponsors),
      homeTelegramGroups: JSON.stringify(telegramGroups),
      youtubeVideos: JSON.stringify(youtubeVideos),
      instagramEmbeds: JSON.stringify(instagramEmbeds),
      customWidgetTags: JSON.stringify(customWidgetTags),
    });
  });

  const heroLibraryImages = [
    "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&q=80&w=2000",
    "https://images.unsplash.com/photo-1521464302461-73b11da3b392?auto=format&fit=crop&q=80&w=2000",
    "https://images.unsplash.com/photo-1551009175-8a68da93d5f9?auto=format&fit=crop&q=80&w=2000",
    "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&q=80&w=2000",
    "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&q=80&w=2000",
  ];

  const toggleHeroImage = (url: string) => {
    setFormData(prev => {
      const next = prev.homeHeroImages.includes(url)
        ? prev.homeHeroImages.filter(u => u !== url)
        : [...prev.homeHeroImages, url];
      return { ...prev, homeHeroImages: next };
    });
    markDirty();
  };

  const setStaticImage = (idx: number) => {
    setFormData(prev => ({ ...prev, homeHeroStaticImageIndex: idx }));
    markDirty();
  };

  const toggleCardSelection = (id: string) => {
    setFormData(prev => {
      const next = prev.homeCardsSelection.includes(id)
        ? prev.homeCardsSelection.filter(x => x !== id)
        : [...prev.homeCardsSelection, id];
      return { ...prev, homeCardsSelection: next };
    });
    markDirty();
  };

  const cardOptions = [
    { id: "sites", label: "Flying Sites" },
    { id: "safety", label: "Safety & Rules" },
    { id: "community", label: "Community" },
    { id: "events", label: "Events" },
    { id: "weather", label: "Weather" },
    { id: "committee", label: "Committee" },
  ];

  const updateCustomCard = (idx: number, field: string, value: string) => {
    setCustomCards(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
    markDirty();
  };

  const removeCustomCard = (idx: number) => {
    setCustomCards(prev => prev.filter((_, i) => i !== idx));
    markDirty();
  };

  const addCustomCard = () => {
    setCustomCards(prev => [...prev, { title: "New Card", icon: "Star", link: "", linkText: "Learn More", desc: "Description here" }]);
    markDirty();
  };

  const addSchool = () => {
    if (!newSchoolName.trim() || !newSchoolUrl.trim()) return;
    setSchools(prev => [...prev, { name: newSchoolName.trim(), url: newSchoolUrl.trim() }]);
    setNewSchoolName("");
    setNewSchoolUrl("");
    markDirty();
  };

  const updateSchool = (idx: number, field: string, value: string) => {
    setSchools(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
    markDirty();
  };

  const removeSchool = (idx: number) => {
    setSchools(prev => prev.filter((_, i) => i !== idx));
    markDirty();
  };

  const addTelegramGroup = () => {
    if (!newTelegramName.trim() || !newTelegramUrl.trim()) return;
    setTelegramGroups(prev => [...prev, { name: newTelegramName.trim(), url: newTelegramUrl.trim() }]);
    setNewTelegramName("");
    setNewTelegramUrl("");
    markDirty();
  };

  const updateTelegramGroup = (idx: number, field: string, value: string) => {
    setTelegramGroups(prev => prev.map((g, i) => i === idx ? { ...g, [field]: value } : g));
    markDirty();
  };

  const removeTelegramGroup = (idx: number) => {
    setTelegramGroups(prev => prev.filter((_, i) => i !== idx));
    markDirty();
  };

  const addYoutubeVideo = () => {
    const vid = extractVideoId(newYoutubeUrl);
    if (!vid) {
      setYoutubeUrlError("Invalid YouTube URL");
      return;
    }
    if (youtubeVideos.some(v => v.id === vid)) {
      setYoutubeUrlError("Video already added");
      return;
    }
    setYoutubeVideos(prev => [{ id: vid, url: newYoutubeUrl }, ...prev]);
    setNewYoutubeUrl("");
    setYoutubeUrlError("");
    markDirty();
  };

  const moveYoutubeVideo = (idx: number, dir: 'up' | 'down') => {
    const nextIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (nextIdx < 0 || nextIdx >= youtubeVideos.length) return;
    const next = [...youtubeVideos];
    [next[idx], next[nextIdx]] = [next[nextIdx], next[idx]];
    setYoutubeVideos(next);
    markDirty();
  };

  const removeYoutubeVideo = (idx: number) => {
    setYoutubeVideos(prev => prev.filter((_, i) => i !== idx));
    markDirty();
  };

  const scrapeYoutubeChannel = async () => {
    if (!ytChannelUrl.trim() || !token) return;
    setYtScraping(true);
    setYtScrapeResult(null);
    try {
      const res = await api.post<{ count: number }>("/api/youtube/scrape", { url: ytChannelUrl }, token);
      setYtScrapeResult(res);
      // Refresh local list
      const settingsRes = await fetch("/api/settings", { cache: "no-store" });
      const settingsData = await settingsRes.json();
      try { setYoutubeVideos(JSON.parse(settingsData.youtubeVideos || "[]")); } catch {}
    } catch {
      setYtScrapeResult({ count: 0 });
    } finally {
      setYtScraping(false);
    }
  };

  const addInstagramEmbed = () => {
    if (!newInstaEmbed.trim()) return;
    if (instagramEmbeds.includes(newInstaEmbed)) {
      setInstaEmbedError("Embed already added");
      return;
    }
    setInstagramEmbeds(prev => [newInstaEmbed, ...prev]);
    setNewInstaEmbed("");
    setInstaEmbedError("");
    markDirty();
  };

  const moveInstagramEmbed = (idx: number, dir: 'up' | 'down') => {
    const nextIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (nextIdx < 0 || nextIdx >= instagramEmbeds.length) return;
    const next = [...instagramEmbeds];
    [next[idx], next[nextIdx]] = [next[nextIdx], next[idx]];
    setInstagramEmbeds(next);
    markDirty();
  };

  const removeInstagramEmbed = (idx: number) => {
    setInstagramEmbeds(prev => prev.filter((_, i) => i !== idx));
    markDirty();
  };

  const addCustomTag = () => {
    if (!newTagName.trim() || newTagSelection.length === 0) return;
    setCustomWidgetTags(prev => [...prev, {
      name: newTagName.trim(),
      source: newTagSource,
      items: newTagSelection
    }]);
    setNewTagName("");
    setNewTagSelection([]);
    markDirty();
  };

  const toggleEditTag = (idx: number) => {
    if (editingTagIdx === idx) {
      setEditingTagIdx(null);
    } else {
      setEditingTagIdx(idx);
      setEditTagSelection(customWidgetTags[idx].items);
    }
  };

  const deleteCustomTag = (idx: number) => {
    setCustomWidgetTags(prev => prev.filter((_, i) => i !== idx));
    markDirty();
  };

  const saveEditTag = (idx: number) => {
    setCustomWidgetTags(prev => prev.map((t, i) => i === idx ? { ...t, items: editTagSelection } : t));
    setEditingTagIdx(null);
    markDirty();
  };

  const setWeatherCardCount = (count: string) => {
    setFormData(prev => ({ ...prev, homeWeatherCardCount: count }));
    markDirty();
  };

  return {
    settings, loading, sites, formData, setFormData,
    customCards, schools, sponsors,
    telegramGroups, youtubeVideos, instagramEmbeds,
    newSchoolName, setNewSchoolName, newSchoolUrl, setNewSchoolUrl,
    newTelegramName, setNewTelegramName, newTelegramUrl, setNewTelegramUrl,
    newYoutubeUrl, setNewYoutubeUrl, youtubeUrlError, setYoutubeUrlError,
    newInstaEmbed, setNewInstaEmbed, instaEmbedError, setInstaEmbedError,
    ytChannelUrl, setYtChannelUrl, ytScraping, ytScrapeResult,
    expandedSections, toggleSection,
    customWidgetTags, newTagName, setNewTagName,
    newTagSource, setNewTagSource, newTagSelection, setNewTagSelection,
    editingTagIdx, editTagSelection, setEditTagSelection,
    saveMessageRef, markDirty, blocker, justSaved,
    handleChange, handleSubmit, saveSettings,
    heroLibraryImages, toggleHeroImage, setStaticImage,
    toggleCardSelection, cardOptions,
    updateCustomCard, removeCustomCard, addCustomCard,
    addSchool, updateSchool, removeSchool,
    addTelegramGroup, updateTelegramGroup, removeTelegramGroup,
    addYoutubeVideo, moveYoutubeVideo, removeYoutubeVideo, scrapeYoutubeChannel,
    addInstagramEmbed, moveInstagramEmbed, removeInstagramEmbed,
    addCustomTag, toggleEditTag, deleteCustomTag, saveEditTag,
    setWeatherCardCount,
  };
}
