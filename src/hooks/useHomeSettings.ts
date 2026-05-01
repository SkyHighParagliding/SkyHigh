import { useState, useEffect, useRef, useMemo } from 'react';
import { useSettings } from '@/contexts/SettingsContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminForm } from '@/hooks/useAdminForm';
import { api } from '@/lib/apiClient';

const ALLOWED_YT_HOSTS = new Set(["youtu.be", "youtube.com", "www.youtube.com", "m.youtube.com"]);

export function extractYoutubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!ALLOWED_YT_HOSTS.has(u.hostname)) return null;
    if (u.hostname === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
    const v = u.searchParams.get("v");
    if (v) return v;
    const segments = u.pathname.split("/");
    for (const key of ["shorts", "embed", "v"]) {
      const idx = segments.indexOf(key);
      if (idx !== -1 && segments[idx + 1]) return segments[idx + 1];
    }
  } catch {}
  return null;
}

export function useHomeSettings() {
  const { settings, updateSettings, loading } = useSettings();
  const { token } = useAuth();
  const [sites, setSites] = useState<Array<Record<string, unknown>>>([]);
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
    homeWeatherCardCount: 6,
  });

  const [customCards, setCustomCards] = useState<Array<{id: string; title: string; description: string; link: string; linkText: string; color: string}>>([]);
  const [schools, setSchools] = useState<Array<{name: string; url: string}>>([]);
  const [newSchoolName, setNewSchoolName] = useState("");
  const [newSchoolUrl, setNewSchoolUrl] = useState("");
  const [sponsors, setSponsors] = useState<Array<{name: string; logo: string; url: string; markdown: string}>>([]);
  const [telegramGroups, setTelegramGroups] = useState<Array<{name: string; url: string}>>([]);
  const [newTelegramName, setNewTelegramName] = useState("");
  const [newTelegramUrl, setNewTelegramUrl] = useState("");
  const [youtubeVideos, setYoutubeVideos] = useState<Array<{url: string}>>([]);
  const [newYoutubeUrl, setNewYoutubeUrl] = useState("");
  const [youtubeUrlError, setYoutubeUrlError] = useState("");
  const [instagramEmbeds, setInstagramEmbeds] = useState<Array<{embedCode: string; addedAt: string}>>([]);
  const [newInstaEmbed, setNewInstaEmbed] = useState("");
  const [instaEmbedError, setInstaEmbedError] = useState("");
  const [ytChannelUrl, setYtChannelUrl] = useState("https://www.youtube.com/@iandayble");
  const [ytScraping, setYtScraping] = useState(false);
  const [ytScrapeResult, setYtScrapeResult] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [customWidgetTags, setCustomWidgetTags] = useState<{ name: string; source: "telegram" | "schools"; items: string[] }[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [newTagSource, setNewTagSource] = useState<"telegram" | "schools">("telegram");
  const [newTagSelection, setNewTagSelection] = useState<string[]>([]);
  const [editingTagIdx, setEditingTagIdx] = useState<number | null>(null);
  const [editTagSelection, setEditTagSelection] = useState<string[]>([]);
  const saveMessageRef = useRef<HTMLDivElement>(null);
  const { isDirty, markDirty, markClean, blocker, justSaved, save: adminSave } = useAdminForm({ successMessage: "Home page settings saved!" });

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    api.get<Array<Record<string, unknown>>>('/api/sites')
      .then(setSites)
      .catch(() => {});

    if (settings) {
      setFormData({
        homeHeroTitle: settings.homeHeroTitle || "",
        homeHeroSubtitle: settings.homeHeroSubtitle || "",
        homeHeroImages: (() => {
          try {
            const saved: string[] = settings.homeHeroImages ? JSON.parse(settings.homeHeroImages) : [];
            const library: { wide: string }[] = settings.imageLibrary ? JSON.parse(settings.imageLibrary) : [];
            const libraryWideSet = new Set(library.map(p => p.wide).filter(Boolean));
            if (libraryWideSet.size === 0) return saved;
            return saved.filter(url => libraryWideSet.has(url));
          } catch (e) {
            return [];
          }
        })(),
        homeHeroImageMode: (settings.homeHeroImageMode as "static" | "random") || "random",
        homeHeroStaticImageIndex: parseInt(settings.homeHeroStaticImageIndex || "0"),
        alertBannerEnabled: settings.alertBannerEnabled || false,
        alertBannerText: settings.alertBannerText || "",
        homeCta1Text: settings.homeCta1Text || "",
        homeCta1Link: settings.homeCta1Link || "",
        homeCta2Text: settings.homeCta2Text || "",
        homeCta2Link: settings.homeCta2Link || "",
        featuredSiteId: settings.featuredSiteId || "",
        homeBox1Desc: settings.homeBox1Desc || "",
        homeBox2Desc: settings.homeBox2Desc || "",
        homeBox3Desc: settings.homeBox3Desc || "",
        homeCardsSelection: (() => {
          try {
            return settings.homeCardsSelection ? JSON.parse(settings.homeCardsSelection) : ["sites", "safety", "community"];
          } catch (e) {
            return ["sites", "safety", "community"];
          }
        })(),
        homeCardsCycle: settings.homeCardsCycle || false,
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
        homeCardCommitteeTitle: String(settings.homeCardCommitteeTitle || ""),
        homeCardCommitteeLink: String(settings.homeCardCommitteeLink || ""),
        homeCardCommitteeLinkText: String(settings.homeCardCommitteeLinkText || ""),
        homeCardCommitteeDesc: settings.homeCardCommitteeDesc || "",
        homeWeatherCardCount: parseInt(settings.homeWeatherCardCount || "6"),
      });
      try {
        const parsed = settings.homeCustomCards ? JSON.parse(settings.homeCustomCards) : [];
        setCustomCards(parsed);
      } catch (e) {
        setCustomCards([]);
      }
      try {
        const parsedSchools = settings.homeSchools ? JSON.parse(settings.homeSchools) : [];
        setSchools(parsedSchools);
      } catch (e) {
        setSchools([]);
      }
      api.get<Array<Record<string, string>>>("/api/sponsors")
        .then(data => setSponsors(Array.isArray(data) ? data.map((s) => ({ name: s.name, logo: s.logo || "", url: s.url || "", markdown: s.markdown || "" })) : []))
        .catch(() => setSponsors([]));
      try {
        const parsedTelegram = settings.homeTelegramGroups ? JSON.parse(settings.homeTelegramGroups) : [];
        setTelegramGroups(parsedTelegram);
      } catch (e) {
        setTelegramGroups([]);
      }
      try {
        const parsedYt = settings.youtubeVideos ? JSON.parse(settings.youtubeVideos as string) : [];
        setYoutubeVideos(parsedYt);
      } catch (e) {
        setYoutubeVideos([]);
      }
      try {
        const parsedInsta = settings.instagramEmbeds ? JSON.parse(settings.instagramEmbeds as string) : [];
        setInstagramEmbeds(parsedInsta);
      } catch (e) {
        setInstagramEmbeds([]);
      }
      try {
        const parsedTags = settings.customWidgetTags ? JSON.parse(settings.customWidgetTags) : [];
        const migrated = parsedTags.map((t: { name: string; source: string; type?: string }) => ({
          name: t.name,
          source: t.source || "telegram",
          items: t.items || t.groupNames || [],
        }));
        setCustomWidgetTags(migrated);
      } catch (e) {
        setCustomWidgetTags([]);
      }
    }
  }, [settings]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    markDirty();
  };

  const saveSettings = async () => {
    await adminSave(async () => {
      await updateSettings({
        homeHeroTitle: formData.homeHeroTitle,
        homeHeroSubtitle: formData.homeHeroSubtitle,
        homeHeroImages: JSON.stringify(formData.homeHeroImages),
        homeHeroImageMode: formData.homeHeroImageMode,
        homeHeroStaticImageIndex: formData.homeHeroStaticImageIndex.toString(),
        alertBannerEnabled: formData.alertBannerEnabled,
        alertBannerText: formData.alertBannerText,
        homeCta1Text: formData.homeCta1Text,
        homeCta1Link: formData.homeCta1Link,
        homeCta2Text: formData.homeCta2Text,
        homeCta2Link: formData.homeCta2Link,
        featuredSiteId: formData.featuredSiteId,
        homeBox1Desc: formData.homeBox1Desc,
        homeBox2Desc: formData.homeBox2Desc,
        homeBox3Desc: formData.homeBox3Desc,
        homeCardsSelection: JSON.stringify(formData.homeCardsSelection),
        homeCardsCycle: formData.homeCardsCycle,
        homeCardsCyclePinned: formData.homeCardsCyclePinned,
        homeCardSitesTitle: formData.homeCardSitesTitle,
        homeCardSitesLink: formData.homeCardSitesLink,
        homeCardSitesLinkText: formData.homeCardSitesLinkText,
        homeCardSafetyTitle: formData.homeCardSafetyTitle,
        homeCardSafetyLink: formData.homeCardSafetyLink,
        homeCardSafetyLinkText: formData.homeCardSafetyLinkText,
        homeCardCommunityTitle: formData.homeCardCommunityTitle,
        homeCardCommunityLink: formData.homeCardCommunityLink,
        homeCardCommunityLinkText: formData.homeCardCommunityLinkText,
        homeCardEventsTitle: formData.homeCardEventsTitle,
        homeCardEventsLink: formData.homeCardEventsLink,
        homeCardEventsLinkText: formData.homeCardEventsLinkText,
        homeCardCommitteeTitle: formData.homeCardCommitteeTitle,
        homeCardCommitteeLink: formData.homeCardCommitteeLink,
        homeCardCommitteeLinkText: formData.homeCardCommitteeLinkText,
        homeCardCommitteeDesc: formData.homeCardCommitteeDesc,
        homeCustomCards: JSON.stringify(customCards),
        homeSchools: JSON.stringify(schools),
        homeTelegramGroups: JSON.stringify(telegramGroups),
        youtubeVideos: JSON.stringify(youtubeVideos),
        instagramEmbeds: JSON.stringify(instagramEmbeds),
        customWidgetTags: JSON.stringify(customWidgetTags),
        homeWeatherCardCount: formData.homeWeatherCardCount.toString(),
      });
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveSettings();
    } catch {
    }
  };

  const heroLibraryImages = useMemo(() => {
    try {
      const library: { wide: string; banner: string }[] = settings?.imageLibrary ? JSON.parse(settings.imageLibrary) : [];
      return library.map(p => p.wide).filter(Boolean);
    } catch { return []; }
  }, [settings?.imageLibrary]);

  const toggleHeroImage = (url: string) => {
    setFormData(prev => {
      const current = prev.homeHeroImages;
      const isSelected = current.includes(url);
      const updated = isSelected ? current.filter(u => u !== url) : [...current, url];
      let staticIdx = prev.homeHeroStaticImageIndex;
      if (staticIdx >= updated.length && updated.length > 0) staticIdx = updated.length - 1;
      if (updated.length === 0) staticIdx = 0;
      return { ...prev, homeHeroImages: updated, homeHeroStaticImageIndex: staticIdx };
    });
    markDirty();
  };

  const setStaticImage = (url: string) => {
    const heroIdx = formData.homeHeroImages.indexOf(url);
    setFormData(prev => ({ ...prev, homeHeroStaticImageIndex: heroIdx }));
    markDirty();
  };

  const toggleCardSelection = (cardId: string, checked: boolean) => {
    setFormData(prev => {
      const current = prev.homeCardsSelection;
      if (checked) {
        if (current.length >= 3) return prev;
        return { ...prev, homeCardsSelection: [...current, cardId] };
      }
      return { ...prev, homeCardsSelection: current.filter(id => id !== cardId) };
    });
  };

  const cardOptions = useMemo(() => [
    { id: 'sites', name: 'Flying Sites' },
    { id: 'safety', name: 'Safety & Rules' },
    { id: 'community', name: 'Community' },
    { id: 'committee', name: 'Your Committee' },
    { id: 'events', name: 'Upcoming Events' },
    ...(schools.length > 0 ? [{ id: 'schools', name: 'Paragliding Schools' }] : []),
    ...(sponsors.length > 0 ? [{ id: 'sponsors', name: 'Our Sponsors' }] : []),
    ...customCards.map(cc => ({ id: cc.id, name: cc.title || cc.id })),
  ], [schools.length, sponsors.length, customCards]);

  const updateCustomCard = (idx: number, field: string, value: string) => {
    setCustomCards(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
    markDirty();
  };

  const removeCustomCard = (idx: number) => {
    const cardId = customCards[idx]?.id;
    setCustomCards(prev => prev.filter((_, i) => i !== idx));
    if (cardId) {
      setFormData(prev => ({
        ...prev,
        homeCardsSelection: prev.homeCardsSelection.filter(id => id !== cardId),
      }));
    }
    markDirty();
  };

  const addCustomCard = () => {
    const id = `custom_${Date.now()}`;
    setCustomCards(prev => [...prev, { id, title: '', description: '', link: '', linkText: 'Learn More', color: 'sky' }]);
    markDirty();
  };

  const addSchool = () => {
    if (newSchoolName.trim() && newSchoolUrl.trim()) {
      setSchools(prev => [...prev, { name: newSchoolName.trim(), url: newSchoolUrl.trim() }]);
      setNewSchoolName("");
      setNewSchoolUrl("");
      markDirty();
    }
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
    if (newTelegramName.trim() && newTelegramUrl.trim()) {
      setTelegramGroups(prev => [...prev, { name: newTelegramName.trim(), url: newTelegramUrl.trim() }]);
      setNewTelegramName("");
      setNewTelegramUrl("");
      markDirty();
    }
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
    const url = newYoutubeUrl.trim();
    if (!url) return;
    const videoId = extractYoutubeVideoId(url);
    if (!videoId) {
      setYoutubeUrlError("Invalid YouTube URL. Use a youtu.be or youtube.com link.");
      return;
    }
    setYoutubeVideos(prev => [...prev, { url }]);
    setNewYoutubeUrl("");
    setYoutubeUrlError("");
    markDirty();
  };

  const moveYoutubeVideo = (idx: number, dir: 'up' | 'down') => {
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    setYoutubeVideos(prev => {
      if (swapIdx < 0 || swapIdx >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]];
      return arr;
    });
    markDirty();
  };

  const removeYoutubeVideo = (idx: number) => {
    setYoutubeVideos(prev => prev.filter((_, i) => i !== idx));
    markDirty();
  };

  const scrapeYoutubeChannel = async () => {
    setYtScraping(true);
    setYtScrapeResult("");
    try {
      const tkn = localStorage.getItem("adminToken");
      const data = await api.post<{ scraped: number; newAdded: number; total: number }>("/api/sites/youtube-scrape", { channelUrl: ytChannelUrl.trim() }, tkn);
      setYtScrapeResult(`Found ${data.scraped} videos, added ${data.newAdded} new (${data.total} total)`);
      const freshVideos = await api.get<Array<Record<string, unknown>>>("/api/sites/youtube-videos");
      if (Array.isArray(freshVideos)) {
        setYoutubeVideos(freshVideos as Array<{ url: string }>);
      }
    } catch (e: unknown) {
      setYtScrapeResult(`Error: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setYtScraping(false);
    }
  };

  const addInstagramEmbed = () => {
    const code = newInstaEmbed.trim();
    if (!code) return;
    const urlMatch = code.match(/https:\/\/www\.instagram\.com\/(?:p|reel|tv)\/[\w-]+\/?/);
    if (!urlMatch) {
      setInstaEmbedError("Could not find a valid Instagram post/reel URL. Copy the embed code from Instagram (click ··· → Embed → Copy embed code).");
      return;
    }
    setInstagramEmbeds(prev => [...prev, { embedCode: code, addedAt: new Date().toISOString() }]);
    setNewInstaEmbed("");
    setInstaEmbedError("");
    markDirty();
  };

  const moveInstagramEmbed = (idx: number, dir: 'up' | 'down') => {
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    setInstagramEmbeds(prev => {
      if (swapIdx < 0 || swapIdx >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]];
      return arr;
    });
    markDirty();
  };

  const removeInstagramEmbed = (idx: number) => {
    setInstagramEmbeds(prev => prev.filter((_, i) => i !== idx));
    markDirty();
  };

  const addCustomTag = () => {
    if (newTagName.trim() && newTagSelection.length > 0) {
      const tagName = newTagName.trim();
      if (tagName === 'schools' || tagName === 'telegram') return;
      if (customWidgetTags.some(t => t.name === tagName)) return;
      setCustomWidgetTags(prev => [...prev, { name: tagName, source: newTagSource, items: newTagSelection }]);
      setNewTagName("");
      setNewTagSelection([]);
      markDirty();
    }
  };

  const toggleEditTag = (idx: number) => {
    if (editingTagIdx === idx) {
      setEditingTagIdx(null);
      setEditTagSelection([]);
    } else {
      setEditingTagIdx(idx);
      setEditTagSelection([...customWidgetTags[idx].items]);
    }
  };

  const deleteCustomTag = (idx: number) => {
    setCustomWidgetTags(prev => prev.filter((_, i) => i !== idx));
    if (editingTagIdx === idx) {
      setEditingTagIdx(null);
      setEditTagSelection([]);
    }
    markDirty();
  };

  const saveEditTag = (idx: number) => {
    if (editTagSelection.length > 0) {
      setCustomWidgetTags(prev => prev.map((t, i) => i === idx ? { ...t, items: editTagSelection } : t));
      setEditingTagIdx(null);
      setEditTagSelection([]);
      markDirty();
    }
  };

  const setWeatherCardCount = (count: number) => {
    setFormData(prev => ({ ...prev, homeWeatherCardCount: Math.max(1, Math.min(20, count)) }));
    markDirty();
  };

  return {
    settings, loading, sites,
    formData, setFormData,
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
    saveMessageRef, isDirty, markDirty, blocker, justSaved,
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
