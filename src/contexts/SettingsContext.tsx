import React, { createContext, useContext, useState, useEffect } from "react";

interface Settings {
  onlineCheckInEnabled: boolean;
  homeHeroTitle?: string;
  homeHeroSubtitle?: string;
  homeHeroImages?: string;
  homeHeroImageMode?: string;
  homeHeroStaticImageIndex?: string;
  alertBannerEnabled?: boolean;
  alertBannerText?: string;
  homeCta1Text?: string;
  homeCta1Link?: string;
  homeCta2Text?: string;
  homeCta2Link?: string;
  featuredSiteId?: string;
  featuredSiteEnabled: boolean;
  photoSliderEnabled: boolean;
  photoSliderReverse: boolean;
  photoSliderAutoScroll: boolean;
  youtubeCarouselEnabled: boolean;
  youtubeCarouselReverse: boolean;
  youtubeCarouselAutoScroll: boolean;
  weatherScraperMinInterval?: string;
  weatherScraperMaxInterval?: string;
  weatherScraperStartHour?: string;
  weatherScraperEndHour?: string;
  homeBox1Desc?: string;
  homeBox2Desc?: string;
  homeBox3Desc?: string;
  weatherScraperLastRun?: string;
  fineGridLastRun?: string;
  fineGridLastResult?: string;
  coarseGridLastRun?: string;
  coarseGridLastResult?: string;
  extendedForecastLastRun?: string;
  extendedForecastLastResult?: string;
  homeCardsSelection?: string;
  homeCardsCycle?: boolean;
  homeCardsCyclePinned?: string;
  homeCardSitesTitle?: string;
  homeCardSitesLink?: string;
  homeCardSitesLinkText?: string;
  homeCardSafetyTitle?: string;
  homeCardSafetyLink?: string;
  homeCardSafetyLinkText?: string;
  homeCardCommunityTitle?: string;
  homeCardCommunityLink?: string;
  homeCardCommunityLinkText?: string;
  homeCardEventsTitle?: string;
  homeCardEventsLink?: string;
  homeCardEventsLinkText?: string;
  homeCustomCards?: string;
  socialFacebook?: string;
  socialInstagram?: string;
  socialYoutube?: string;
  socialTiktok?: string;
  socialTwitter?: string;
  socialLinkedin?: string;
  socialStrava?: string;
  socialWebsite?: string;
  homeSchools?: string;
  homeTelegramGroups?: string;
  homeSponsors?: string;
  youtubeVideos?: string;
  instagramEmbeds?: string;
  publicSearchCommitteeLink?: string;
  publicSearchPrompt?: string;
  publicSearchCtaMessage?: string;
  publicSearchCtaFrequency?: string;
  qrCodeMode?: string;
  imageLibrary?: string;
  clubName?: string;
  clubTagline?: string;
  clubPrimaryColor?: string;
  clubLogoOriginal?: string;
  clubLogoNav?: string;
  clubLogoFooter?: string;
  clubLogoFavicon?: string;
  clubLogoSplash?: string;
  clubLogoDarkOriginal?: string;
  clubLogoDarkNav?: string;
  clubLogoDarkFooter?: string;
  clubLogoDarkFavicon?: string;
  clubLogoDarkSplash?: string;
  pwaIcon192?: string;
  pwaIcon512?: string;
  activeTemplate?: string;
  joinPageEnabled?: boolean;
  joinTidyhqUrl?: string;
  joinTiers?: string;
  joinFaqs?: string;
  joinHeroTitle?: string;
  joinHeroSubtitle?: string;
  groundHandlingEnabled: boolean;
  xcMapsEnabled?: boolean;
  xcMapsTitle?: string;
  xcMapsDescription?: string;
  xcDistanceRings?: string;
  businessDirectoryEnabled?: boolean;
  xcAirspaceEnabled: boolean;
  xcCompetitionsEnabled: boolean;
  flightTrackerEnabled: boolean;
  ftGpsInterval?: string;
  ftAutoStartSpeed?: string;
  ftAutoStartAltitude?: string;
  ftAutoStopSpeed?: string;
  ftAutoStopDuration?: string;
  ftAutoStopVerticalSpeed?: string;
  ftPreRecordBuffer?: string;
  ftCrumbFlushInterval?: string;
  ftCrumbWindowSize?: string;
  ftGuestCacheExpiry?: string;
  ftSplineTension?: string;
  ftTrailColor?: string;
  ftTrailWidth?: string;
  ftOfflineTileRadius?: string;
  ftOfflineZoomMin?: string;
  ftOfflineZoomMax?: string;
  ftOfflineLayers?: string;
  ftEmaAlpha?: string;
  ftVspeedAlpha?: string;
  ftBaroCalibSamples?: string;
  ftBaroMaxDivergence?: string;
  ftBaroFusionWeight?: string;
  ftActiveTtl?: string;
  ftLandedTtl?: string;
  ftPhoneStaleThreshold?: string;
  ftSatMaxFixAge?: string;
  satTrackerGarminVisible: boolean;
  satTrackerSpotVisible: boolean;
  satTrackerZoleoVisible: boolean;
  wfParticleCount?: string;
  wfTrailLength?: string;
  wfMaxInfluenceKm?: string;
  wfFadeStartKm?: string;
  wfIdwPower?: string;
  wfSpeedScale?: string;
  wfLineWidth?: string;
  wfOpacity?: string;
  wfMaxParticleSpeed?: string;
  wfParticleMaxAge?: string;
  [key: string]: string | boolean | undefined;
}

function resolveLightLogos(s: Settings): LogoSet {
  return {
    nav: s.clubLogoNav || "",
    footer: s.clubLogoFooter || "",
    favicon: s.clubLogoFavicon || "",
    splash: s.clubLogoSplash || "",
  };
}

function resolveDarkLogos(s: Settings): LogoSet {
  return {
    nav: s.clubLogoDarkNav || s.clubLogoNav || "",
    footer: s.clubLogoDarkFooter || s.clubLogoFooter || "",
    favicon: s.clubLogoDarkFavicon || s.clubLogoFavicon || "",
    splash: s.clubLogoDarkSplash || s.clubLogoSplash || "",
  };
}

function resolveActiveLogos(s: Settings): LogoSet {
  const template = s.activeTemplate || "classic";
  const mode = (s as any)[`logoMode_${template}`] || "light";
  if (mode === "dark" && s.clubLogoDarkOriginal) {
    return resolveDarkLogos(s);
  }
  return resolveLightLogos(s);
}

type LogoSet = { nav: string; footer: string; favicon: string; splash: string };

interface SettingsContextType {
  settings: Settings;
  updateSettings: (newSettings: Record<string, string | boolean>) => Promise<void>;
  refreshSettings: () => Promise<void>;
  loading: boolean;
  activeLogos: LogoSet;
  lightLogos: LogoSet;
  darkLogos: LogoSet;
}

const emptyLogos: LogoSet = { nav: "", footer: "", favicon: "", splash: "" };

const defaultSettings: Settings = {
  onlineCheckInEnabled: true,
  featuredSiteEnabled: true,
  photoSliderEnabled: false,
  photoSliderReverse: false,
  photoSliderAutoScroll: true,
  youtubeCarouselEnabled: false,
  youtubeCarouselReverse: false,
  youtubeCarouselAutoScroll: true,
  alertBannerEnabled: false,
  homeCardsCycle: false,
  joinPageEnabled: false,
  groundHandlingEnabled: false,
  xcMapsEnabled: false,
  xcAirspaceEnabled: false,
  xcCompetitionsEnabled: false,
  flightTrackerEnabled: false,
  satTrackerGarminVisible: true,
  satTrackerSpotVisible: true,
  satTrackerZoleoVisible: true,
};

const SettingsContext = createContext<SettingsContextType>({
  settings: defaultSettings,
  updateSettings: async () => {},
  refreshSettings: async () => {},
  loading: true,
  activeLogos: emptyLogos,
  lightLogos: emptyLogos,
  darkLogos: emptyLogos,
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        const cleanString = (val: any) => val === "undefined" ? "" : val;
        setSettings({
          onlineCheckInEnabled: data.onlineCheckInEnabled === "true",
          homeHeroTitle: cleanString(data.homeHeroTitle),
          homeHeroSubtitle: cleanString(data.homeHeroSubtitle),
          homeHeroImages: data.homeHeroImages,
          homeHeroImageMode: data.homeHeroImageMode,
          homeHeroStaticImageIndex: data.homeHeroStaticImageIndex,
          alertBannerEnabled: data.alertBannerEnabled === "true",
          alertBannerText: cleanString(data.alertBannerText),
          homeCta1Text: cleanString(data.homeCta1Text),
          homeCta1Link: cleanString(data.homeCta1Link),
          homeCta2Text: cleanString(data.homeCta2Text),
          homeCta2Link: cleanString(data.homeCta2Link),
          featuredSiteId: data.featuredSiteId,
          featuredSiteEnabled: data.featuredSiteEnabled === "true",
          photoSliderEnabled: data.photoSliderEnabled === "true",
          photoSliderReverse: data.photoSliderReverse === "true",
          photoSliderAutoScroll: data.photoSliderAutoScroll !== "false",
          youtubeCarouselEnabled: data.youtubeCarouselEnabled === "true",
          youtubeCarouselReverse: data.youtubeCarouselReverse === "true",
          youtubeCarouselAutoScroll: data.youtubeCarouselAutoScroll !== "false",
          weatherScraperMinInterval: data.weatherScraperMinInterval,
          weatherScraperMaxInterval: data.weatherScraperMaxInterval,
          weatherScraperStartHour: data.weatherScraperStartHour,
          weatherScraperEndHour: data.weatherScraperEndHour,
          homeBox1Desc: cleanString(data.homeBox1Desc),
          homeBox2Desc: cleanString(data.homeBox2Desc),
          homeBox3Desc: cleanString(data.homeBox3Desc),
          weatherScraperLastRun: data.weatherScraperLastRun,
          fineGridLastRun: data.fineGridLastRun,
          fineGridLastResult: data.fineGridLastResult,
          coarseGridLastRun: data.coarseGridLastRun,
          coarseGridLastResult: data.coarseGridLastResult,
          extendedForecastLastRun: data.extendedForecastLastRun,
          extendedForecastLastResult: data.extendedForecastLastResult,
          homeCardsSelection: cleanString(data.homeCardsSelection),
          homeCardsCycle: data.homeCardsCycle === "true",
          homeCardsCyclePinned: cleanString(data.homeCardsCyclePinned),
          homeCardSitesTitle: cleanString(data.homeCardSitesTitle),
          homeCardSitesLink: cleanString(data.homeCardSitesLink),
          homeCardSitesLinkText: cleanString(data.homeCardSitesLinkText),
          homeCardSafetyTitle: cleanString(data.homeCardSafetyTitle),
          homeCardSafetyLink: cleanString(data.homeCardSafetyLink),
          homeCardSafetyLinkText: cleanString(data.homeCardSafetyLinkText),
          homeCardCommunityTitle: cleanString(data.homeCardCommunityTitle),
          homeCardCommunityLink: cleanString(data.homeCardCommunityLink),
          homeCardCommunityLinkText: cleanString(data.homeCardCommunityLinkText),
          homeCardEventsTitle: cleanString(data.homeCardEventsTitle),
          homeCardEventsLink: cleanString(data.homeCardEventsLink),
          homeCardEventsLinkText: cleanString(data.homeCardEventsLinkText),
          homeCustomCards: data.homeCustomCards || "",
          socialFacebook: cleanString(data.socialFacebook),
          socialInstagram: cleanString(data.socialInstagram),
          socialYoutube: cleanString(data.socialYoutube),
          socialTiktok: cleanString(data.socialTiktok),
          socialTwitter: cleanString(data.socialTwitter),
          socialLinkedin: cleanString(data.socialLinkedin),
          socialStrava: cleanString(data.socialStrava),
          socialWebsite: cleanString(data.socialWebsite),
          homeSchools: data.homeSchools || "",
          homeTelegramGroups: data.homeTelegramGroups || "",
          homeSponsors: data.homeSponsors || "",
          youtubeVideos: data.youtubeVideos || "",
          instagramEmbeds: data.instagramEmbeds || "",
          publicSearchCommitteeLink: cleanString(data.publicSearchCommitteeLink),
          publicSearchPrompt: data.publicSearchPrompt || "",
          publicSearchCtaMessage: data.publicSearchCtaMessage || "",
          publicSearchCtaFrequency: data.publicSearchCtaFrequency || "2",
          qrCodeMode: data.qrCodeMode || "off",
          imageLibrary: data.imageLibrary || "",
          screenshotLibrary: data.screenshotLibrary || "",
          clubName: cleanString(data.clubName) || "SkyHigh",
          clubTagline: cleanString(data.clubTagline) || "",
          clubPrimaryColor: cleanString(data.clubPrimaryColor) || "",
          clubLogoOriginal: cleanString(data.clubLogoOriginal) || "",
          clubLogoNav: cleanString(data.clubLogoNav) || "",
          clubLogoFooter: cleanString(data.clubLogoFooter) || "",
          clubLogoFavicon: cleanString(data.clubLogoFavicon) || "",
          clubLogoSplash: cleanString(data.clubLogoSplash) || "",
          clubLogoDarkOriginal: cleanString(data.clubLogoDarkOriginal) || "",
          clubLogoDarkNav: cleanString(data.clubLogoDarkNav) || "",
          clubLogoDarkFooter: cleanString(data.clubLogoDarkFooter) || "",
          clubLogoDarkFavicon: cleanString(data.clubLogoDarkFavicon) || "",
          clubLogoDarkSplash: cleanString(data.clubLogoDarkSplash) || "",
          pwaIcon192: cleanString(data.pwaIcon192) || "",
          pwaIcon512: cleanString(data.pwaIcon512) || "",
          activeTemplate: data.activeTemplate || "classic",
          groundHandlingEnabled: data.groundHandlingEnabled === "true",
          xcMapsEnabled: data.xcMapsEnabled === "true",
          xcMapsTitle: data.xcMapsTitle || "",
          xcMapsDescription: data.xcMapsDescription || "",
          xcDistanceRings: data.xcDistanceRings || "",
          businessDirectoryEnabled: data.businessDirectoryEnabled === "true",
          xcAirspaceEnabled: data.xcAirspaceEnabled === "true",
          xcCompetitionsEnabled: data.xcCompetitionsEnabled === "true",
          flightTrackerEnabled: data.flightTrackerEnabled === "true",
          satTrackerGarminVisible: data.satTrackerGarminVisible !== "false",
          satTrackerSpotVisible: data.satTrackerSpotVisible !== "false",
          satTrackerZoleoVisible: data.satTrackerZoleoVisible !== "false",
          ftGpsInterval: data.ftGpsInterval || "3",
          ftAutoStartSpeed: data.ftAutoStartSpeed || "15",
          ftAutoStartAltitude: data.ftAutoStartAltitude || "20",
          ftAutoStopSpeed: data.ftAutoStopSpeed || "3",
          ftAutoStopDuration: data.ftAutoStopDuration || "30",
          ftPreRecordBuffer: data.ftPreRecordBuffer || "15",
          ftCrumbFlushInterval: data.ftCrumbFlushInterval || "3",
          ftCrumbWindowSize: data.ftCrumbWindowSize || "200",
          ftGuestCacheExpiry: data.ftGuestCacheExpiry || "48",
          ftSplineTension: data.ftSplineTension || "0.5",
          ftTrailColor: data.ftTrailColor || "#FF4444",
          ftTrailWidth: data.ftTrailWidth || "3",
          ftOfflineTileRadius: data.ftOfflineTileRadius || "50",
          ftOfflineZoomMin: data.ftOfflineZoomMin || "8",
          ftOfflineZoomMax: data.ftOfflineZoomMax || "13",
          ftOfflineLayers: data.ftOfflineLayers || '["streets"]',
          homeWeatherCardCount: data.homeWeatherCardCount || "6",
          joinPageEnabled: data.joinPageEnabled === "true",
          joinTidyhqUrl: cleanString(data.joinTidyhqUrl) || "",
          joinTiers: data.joinTiers || "",
          joinFaqs: data.joinFaqs || "",
          joinHeroTitle: cleanString(data.joinHeroTitle) || "",
          joinHeroSubtitle: cleanString(data.joinHeroSubtitle) || "",
          wfParticleCount: data.wfParticleCount || "1200",
          wfTrailLength: data.wfTrailLength || "12",
          wfMaxInfluenceKm: data.wfMaxInfluenceKm || "120",
          wfFadeStartKm: data.wfFadeStartKm || "80",
          wfIdwPower: data.wfIdwPower || "2",
          wfSpeedScale: data.wfSpeedScale || "0.4",
          wfLineWidth: data.wfLineWidth || "1.5",
          wfOpacity: data.wfOpacity || "0.7",
          wfMaxParticleSpeed: data.wfMaxParticleSpeed || "4",
          wfParticleMaxAge: data.wfParticleMaxAge || "180",
          windMapDefaultLat: data.windMapDefaultLat,
          windMapDefaultLon: data.windMapDefaultLon,
          windMapDefaultZoom: data.windMapDefaultZoom,
          ...Object.fromEntries(Object.entries(data).filter(([k]) => k.startsWith("logoMode_")).map(([k, v]) => [k, v || "light"])),
        });
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch settings:", err);
        setLoading(false);
      });
  }, []);

  const refreshSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      const cleanString = (val: any) => val === "undefined" ? "" : val;
      setSettings({
        onlineCheckInEnabled: data.onlineCheckInEnabled === "true",
        homeHeroTitle: cleanString(data.homeHeroTitle),
        homeHeroSubtitle: cleanString(data.homeHeroSubtitle),
        homeHeroImages: data.homeHeroImages,
        homeHeroImageMode: data.homeHeroImageMode,
        homeHeroStaticImageIndex: data.homeHeroStaticImageIndex,
        alertBannerEnabled: data.alertBannerEnabled === "true",
        alertBannerText: cleanString(data.alertBannerText),
        homeCta1Text: cleanString(data.homeCta1Text),
        homeCta1Link: cleanString(data.homeCta1Link),
        homeCta2Text: cleanString(data.homeCta2Text),
        homeCta2Link: cleanString(data.homeCta2Link),
        featuredSiteId: data.featuredSiteId,
        featuredSiteEnabled: data.featuredSiteEnabled === "true",
        photoSliderEnabled: data.photoSliderEnabled === "true",
        photoSliderReverse: data.photoSliderReverse === "true",
        photoSliderAutoScroll: data.photoSliderAutoScroll !== "false",
        youtubeCarouselEnabled: data.youtubeCarouselEnabled === "true",
        youtubeCarouselReverse: data.youtubeCarouselReverse === "true",
        youtubeCarouselAutoScroll: data.youtubeCarouselAutoScroll !== "false",
        weatherScraperMinInterval: data.weatherScraperMinInterval,
        weatherScraperMaxInterval: data.weatherScraperMaxInterval,
        weatherScraperStartHour: data.weatherScraperStartHour,
        weatherScraperEndHour: data.weatherScraperEndHour,
        homeBox1Desc: cleanString(data.homeBox1Desc),
        homeBox2Desc: cleanString(data.homeBox2Desc),
        homeBox3Desc: cleanString(data.homeBox3Desc),
        weatherScraperLastRun: data.weatherScraperLastRun,
        fineGridLastRun: data.fineGridLastRun,
        fineGridLastResult: data.fineGridLastResult,
        coarseGridLastRun: data.coarseGridLastRun,
        coarseGridLastResult: data.coarseGridLastResult,
        extendedForecastLastRun: data.extendedForecastLastRun,
        extendedForecastLastResult: data.extendedForecastLastResult,
        homeCardsSelection: cleanString(data.homeCardsSelection),
        homeCardsCycle: data.homeCardsCycle === "true",
        homeCardsCyclePinned: cleanString(data.homeCardsCyclePinned),
        homeCardSitesTitle: cleanString(data.homeCardSitesTitle),
        homeCardSitesLink: cleanString(data.homeCardSitesLink),
        homeCardSitesLinkText: cleanString(data.homeCardSitesLinkText),
        homeCardSafetyTitle: cleanString(data.homeCardSafetyTitle),
        homeCardSafetyLink: cleanString(data.homeCardSafetyLink),
        homeCardSafetyLinkText: cleanString(data.homeCardSafetyLinkText),
        homeCardCommunityTitle: cleanString(data.homeCardCommunityTitle),
        homeCardCommunityLink: cleanString(data.homeCardCommunityLink),
        homeCardCommunityLinkText: cleanString(data.homeCardCommunityLinkText),
        homeCardEventsTitle: cleanString(data.homeCardEventsTitle),
        homeCardEventsLink: cleanString(data.homeCardEventsLink),
        homeCardEventsLinkText: cleanString(data.homeCardEventsLinkText),
        homeCustomCards: data.homeCustomCards || "",
        socialFacebook: cleanString(data.socialFacebook),
        socialInstagram: cleanString(data.socialInstagram),
        socialYoutube: cleanString(data.socialYoutube),
        socialTiktok: cleanString(data.socialTiktok),
        socialTwitter: cleanString(data.socialTwitter),
        socialLinkedin: cleanString(data.socialLinkedin),
        socialStrava: cleanString(data.socialStrava),
        socialWebsite: cleanString(data.socialWebsite),
        homeSchools: data.homeSchools || "",
        homeTelegramGroups: data.homeTelegramGroups || "",
        homeSponsors: data.homeSponsors || "",
        youtubeVideos: data.youtubeVideos || "",
        instagramEmbeds: data.instagramEmbeds || "",
        publicSearchCommitteeLink: cleanString(data.publicSearchCommitteeLink),
        publicSearchPrompt: data.publicSearchPrompt || "",
        publicSearchCtaMessage: data.publicSearchCtaMessage || "",
        publicSearchCtaFrequency: data.publicSearchCtaFrequency || "2",
        qrCodeMode: data.qrCodeMode || "off",
        imageLibrary: data.imageLibrary || "",
        screenshotLibrary: data.screenshotLibrary || "",
        clubName: cleanString(data.clubName) || "SkyHigh",
        clubTagline: cleanString(data.clubTagline) || "",
        clubPrimaryColor: cleanString(data.clubPrimaryColor) || "",
        clubLogoOriginal: cleanString(data.clubLogoOriginal) || "",
        clubLogoNav: cleanString(data.clubLogoNav) || "",
        clubLogoFooter: cleanString(data.clubLogoFooter) || "",
        clubLogoFavicon: cleanString(data.clubLogoFavicon) || "",
        clubLogoSplash: cleanString(data.clubLogoSplash) || "",
        clubLogoDarkOriginal: cleanString(data.clubLogoDarkOriginal) || "",
        clubLogoDarkNav: cleanString(data.clubLogoDarkNav) || "",
        clubLogoDarkFooter: cleanString(data.clubLogoDarkFooter) || "",
        clubLogoDarkFavicon: cleanString(data.clubLogoDarkFavicon) || "",
        clubLogoDarkSplash: cleanString(data.clubLogoDarkSplash) || "",
        pwaIcon192: cleanString(data.pwaIcon192) || "",
        pwaIcon512: cleanString(data.pwaIcon512) || "",
        activeTemplate: data.activeTemplate || "classic",
        groundHandlingEnabled: data.groundHandlingEnabled === "true",
        xcMapsEnabled: data.xcMapsEnabled === "true",
        xcMapsTitle: data.xcMapsTitle || "",
        xcMapsDescription: data.xcMapsDescription || "",
        xcDistanceRings: data.xcDistanceRings || "",
        businessDirectoryEnabled: data.businessDirectoryEnabled === "true",
        xcAirspaceEnabled: data.xcAirspaceEnabled === "true",
        xcCompetitionsEnabled: data.xcCompetitionsEnabled === "true",
        flightTrackerEnabled: data.flightTrackerEnabled === "true",
        satTrackerGarminVisible: data.satTrackerGarminVisible !== "false",
        satTrackerSpotVisible: data.satTrackerSpotVisible !== "false",
        satTrackerZoleoVisible: data.satTrackerZoleoVisible !== "false",
        ftGpsInterval: data.ftGpsInterval || "3",
        ftAutoStartSpeed: data.ftAutoStartSpeed || "15",
        ftAutoStartAltitude: data.ftAutoStartAltitude || "20",
        ftAutoStopSpeed: data.ftAutoStopSpeed || "3",
        ftAutoStopDuration: data.ftAutoStopDuration || "30",
        ftPreRecordBuffer: data.ftPreRecordBuffer || "15",
        ftCrumbFlushInterval: data.ftCrumbFlushInterval || "3",
        ftCrumbWindowSize: data.ftCrumbWindowSize || "200",
        ftGuestCacheExpiry: data.ftGuestCacheExpiry || "30",
        ftSplineTension: data.ftSplineTension || "0.5",
        ftTrailColor: data.ftTrailColor || "#ff4444",
        ftTrailWidth: data.ftTrailWidth || "3",
        ftOfflineTileRadius: data.ftOfflineTileRadius || "10",
        ftOfflineZoomMin: data.ftOfflineZoomMin || "10",
        ftOfflineZoomMax: data.ftOfflineZoomMax || "15",
        ftOfflineLayers: data.ftOfflineLayers || "osm,topo",
        homeWeatherCardCount: data.homeWeatherCardCount || "6",
        joinPageEnabled: data.joinPageEnabled === "true",
        joinTidyhqUrl: cleanString(data.joinTidyhqUrl) || "",
        joinTiers: data.joinTiers || "",
        joinFaqs: data.joinFaqs || "",
        joinHeroTitle: cleanString(data.joinHeroTitle) || "",
        joinHeroSubtitle: cleanString(data.joinHeroSubtitle) || "",
        wfParticleCount: data.wfParticleCount || "1200",
        wfTrailLength: data.wfTrailLength || "12",
        wfMaxInfluenceKm: data.wfMaxInfluenceKm || "120",
        wfFadeStartKm: data.wfFadeStartKm || "80",
        wfIdwPower: data.wfIdwPower || "2",
        wfSpeedScale: data.wfSpeedScale || "0.4",
        wfLineWidth: data.wfLineWidth || "1.5",
        wfOpacity: data.wfOpacity || "0.7",
        wfMaxParticleSpeed: data.wfMaxParticleSpeed || "4",
        wfParticleMaxAge: data.wfParticleMaxAge || "180",
        windMapDefaultLat: data.windMapDefaultLat,
        windMapDefaultLon: data.windMapDefaultLon,
        windMapDefaultZoom: data.windMapDefaultZoom,
        ...Object.fromEntries(Object.entries(data).filter(([k]) => k.startsWith("logoMode_")).map(([k, v]) => [k, v || "light"])),
      });
    } catch (err) {
      console.error("Failed to refresh settings:", err);
    }
  };

  const updateSettings = async (newSettings: Record<string, string | boolean>) => {
    const updated = { ...settings, ...newSettings } as Settings;
    setSettings(updated);
    
    const payload: Record<string, string> = {};
    for (const [key, value] of Object.entries(newSettings)) {
      payload[key] = value == null ? "" : String(value);
    }

    const token = localStorage.getItem("adminToken");
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown error");
      throw new Error(`Failed to save settings (${res.status}): ${errText}`);
    }
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, refreshSettings, loading, activeLogos: resolveActiveLogos(settings), lightLogos: resolveLightLogos(settings), darkLogos: resolveDarkLogos(settings) }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
