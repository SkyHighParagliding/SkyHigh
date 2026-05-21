import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, ShieldAlert, Users, Users2, CloudSun, Calendar, Star, GraduationCap, Handshake } from "lucide-react";
import { useSettings } from "@/contexts/SettingsContext";
import { WeatherCard } from "@/components/WeatherCard";
import { PublicSearchBox } from "@/components/PublicSearchBox";
import { PhotoSlider } from "@/components/PhotoSlider";
import { YouTubeCarousel } from "@/components/YouTubeCarousel";
import { MarkdownWithWidgets } from "@/components/ContentWidgets";
import { useUpcomingEvents, useSponsors, useSite, useHomeSites, useClosureBanners } from "@/hooks/api";

export function Home() {
  const { settings } = useSettings();
  const isGlass = settings.activeTemplate === 'wonderful-white';
  const [heroImages, setHeroImages] = useState<string[]>([]);
  const [heroLayerA, setHeroLayerA] = useState("");
  const [heroLayerB, setHeroLayerB] = useState("");
  const [activeLayer, setActiveLayer] = useState<'A' | 'B'>('A');
  const [heroZoomKeyA, setHeroZoomKeyA] = useState(0);
  const [heroZoomKeyB, setHeroZoomKeyB] = useState(0);
  const heroTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heroCurrentIndexRef = useRef(0);
  const { data: featuredSite = null } = useSite(settings?.featuredSiteId || undefined);
  const { sites, weatherData, distances } = useHomeSites();
  const { data: events = [] } = useUpcomingEvents();
  const { data: sponsorsList = [] } = useSponsors();
  const { data: closureBanners = [] } = useClosureBanners();

  useEffect(() => {

    if (settings && settings.homeHeroImages) {
      try {
        const images = JSON.parse(settings.homeHeroImages);
        if (images.length > 0) {
          let startIndex = 0;
          if (settings.homeHeroImageMode === 'random') {
            startIndex = Math.floor(Math.random() * images.length);
          } else {
            const index = parseInt(settings.homeHeroStaticImageIndex || "0");
            startIndex = index < images.length ? index : 0;
          }
          setHeroImages(images);
          setHeroLayerA(images[startIndex]);
          heroCurrentIndexRef.current = startIndex;
          setActiveLayer('A');
        } else {
          setHeroImages([]);
          setHeroLayerA("");
          setHeroLayerB("");
        }
      } catch (e) {
        console.error("Failed to parse homeHeroImages", e);
        setHeroImages([]);
        setHeroLayerA("");
        setHeroLayerB("");
      }
    } else {
      setHeroImages([]);
      setHeroLayerA("");
      setHeroLayerB("");
    }

  }, [settings]);

  useEffect(() => {
    if (heroImages.length === 0) return;

    if (heroImages.length > 1) {
      heroImages.forEach(src => {
        const img = new Image();
        img.src = src;
      });
    }
  }, [heroImages]);

  useEffect(() => {
    if (heroImages.length === 0) return;

    const ZOOM_DURATION = 8000;

    const pickNext = () => {
      let next: number;
      do {
        next = Math.floor(Math.random() * heroImages.length);
      } while (next === heroCurrentIndexRef.current);
      return next;
    };

    if (heroImages.length > 1) {
      const nextIdx = pickNext();
      setActiveLayer(prev => {
        if (prev === 'A') {
          setHeroLayerB(heroImages[nextIdx]);
        } else {
          setHeroLayerA(heroImages[nextIdx]);
        }
        return prev;
      });
    }

    heroTimerRef.current = setInterval(() => {
      if (heroImages.length > 1) {
        const next = pickNext();
        heroCurrentIndexRef.current = next;

        setActiveLayer(prev => {
          const newActive = prev === 'A' ? 'B' : 'A';
          if (newActive === 'A') {
            setHeroZoomKeyA(k => k + 1);
          } else {
            setHeroZoomKeyB(k => k + 1);
          }
          setTimeout(() => {
            const preloadIdx = pickNext();
            if (newActive === 'A') {
              setHeroLayerB(heroImages[preloadIdx]);
            } else {
              setHeroLayerA(heroImages[preloadIdx]);
            }
          }, 2000);
          return newActive;
        });
      } else {
        setHeroZoomKeyA(k => k + 1);
      }
    }, ZOOM_DURATION);

    return () => {
      if (heroTimerRef.current) clearInterval(heroTimerRef.current);
    };
  }, [heroImages]);

  const colorMap: Record<string, { text: string; bg: string }> = {
    sky: { text: 'text-sky', bg: 'bg-sky/10' },
    orange: { text: 'text-orange', bg: 'bg-orange/10' },
    navy: { text: 'text-navy', bg: 'bg-navy/10' },
    emerald: { text: 'text-emerald-600', bg: 'bg-emerald-600/10' },
    purple: { text: 'text-purple-600', bg: 'bg-purple-600/10' },
    pink: { text: 'text-pink-600', bg: 'bg-pink-600/10' },
    red: { text: 'text-red-600', bg: 'bg-red-600/10' },
    indigo: { text: 'text-indigo-600', bg: 'bg-indigo-600/10' },
  };

  const allCards: Record<string, any> = {
    sites: {
      id: 'sites',
      icon: <MapPin className="h-8 w-8 text-sky" />,
      iconBg: 'bg-sky/10',
      title: settings.homeCardSitesTitle || 'Flying Sites',
      desc: settings.homeBox1Desc || "Detailed information on all our coastal and inland flying sites, including weather requirements and hazards.",
      link: settings.homeCardSitesLink || '/sites',
      linkText: settings.homeCardSitesLinkText || 'View Sites',
      linkColor: 'text-sky'
    },
    safety: {
      id: 'safety',
      icon: <ShieldAlert className="h-8 w-8 text-orange" />,
      iconBg: 'bg-orange/10',
      title: settings.homeCardSafetyTitle || 'Safety & Rules',
      desc: (
        <>
          {settings.onlineCheckInEnabled && <span className="font-semibold text-orange block mb-1">Mandatory online check-in for all pilots.</span>}
          {settings.homeBox2Desc || "Please see our Safety Guidelines. Review site rules, acknowledge hazards, and fly safely."}
        </>
      ),
      link: settings.homeCardSafetyLink || '/safety',
      linkText: settings.homeCardSafetyLinkText || 'Safety Guidelines',
      linkColor: 'text-orange'
    },
    community: {
      id: 'community',
      icon: <Users className="h-8 w-8 text-navy" />,
      iconBg: 'bg-navy/10',
      title: settings.homeCardCommunityTitle || 'Community',
      desc: settings.homeBox3Desc || "We regularly meet on the first Wednesday of each month. We fly whenever its on! Connect with local pilots and find mentors.",
      link: settings.homeCardCommunityLink || '/page/about',
      linkText: settings.homeCardCommunityLinkText || 'About Us',
      linkColor: 'text-navy',
      isCommunityCard: false
    },
    events: {
      id: 'events',
      icon: <Calendar className="h-8 w-8 text-emerald-600" />,
      iconBg: 'bg-emerald-600/10',
      title: settings.homeCardEventsTitle || 'Upcoming Events',
      desc: "Check out our upcoming events and fly-ins. Join the community and get involved!",
      link: events.length > 0 && events[0].public_url ? events[0].public_url : (settings.homeCardEventsLink || '/events'),
      linkText: settings.homeCardEventsLinkText || 'View Event',
      linkColor: 'text-emerald-600',
      isExternal: events.length > 0 && !!events[0].public_url
    },
    committee: {
      id: 'committee',
      icon: <Users2 className="h-8 w-8 text-purple-600" />,
      iconBg: 'bg-purple-600/10',
      title: settings.homeCardCommitteeTitle || 'Your Committee',
      desc: settings.homeCardCommitteeDesc || '{{committee}}',
      link: settings.homeCardCommitteeLink || '/page/about#committee-members',
      linkText: settings.homeCardCommitteeLinkText || 'Meet the Team',
      linkColor: 'text-purple-600',
      isCommitteeCard: true
    }
  };

  let telegramGroupsList: { name: string; url: string }[] = [];
  try {
    telegramGroupsList = settings.homeTelegramGroups ? JSON.parse(settings.homeTelegramGroups) : [];
  } catch (e) {}

  if (telegramGroupsList.length > 0) {
    allCards.community = {
      ...allCards.community,
      desc: (
        <div className="flex flex-col gap-2 items-center mt-1">
          {telegramGroupsList.map((group, i) => (
            <a
              key={i}
              href={group.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-block px-3 py-1.5 bg-navy/5 text-navy rounded-full text-xs font-semibold hover:bg-navy/10 transition-colors border border-navy/20"
            >
              {group.name}
            </a>
          ))}
        </div>
      ),
      isCommunityCard: true
    };
  }

  let schoolsList: { name: string; url: string }[] = [];
  try {
    schoolsList = settings.homeSchools ? JSON.parse(settings.homeSchools) : [];
  } catch (e) {}
  const shuffledSchools = [...schoolsList].sort(() => 0.5 - Math.random());

  if (shuffledSchools.length > 0) {
    allCards.schools = {
      id: 'schools',
      icon: <GraduationCap className="h-8 w-8 text-purple-600" />,
      iconBg: 'bg-purple-600/10',
      title: 'Paragliding Schools',
      desc: (
        <div className="flex flex-col gap-2 items-center mt-1">
          {shuffledSchools.map((school, i) => (
            <a
              key={i}
              href={school.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-block px-3 py-1.5 bg-purple-50 text-purple-700 rounded-full text-xs font-semibold hover:bg-purple-100 hover:text-purple-800 transition-colors border border-purple-200"
            >
              {school.name}
            </a>
          ))}
        </div>
      ),
      link: '#',
      linkText: 'Schools to consider',
      linkColor: 'text-purple-600',
      isSchoolsCard: true
    };
  }

  if (sponsorsList.length > 0) {
    allCards.sponsors = {
      id: 'sponsors',
      icon: <Handshake className="h-8 w-8 text-amber-600" />,
      iconBg: 'bg-amber-600/10',
      title: 'Our Sponsors',
      desc: (
        <div className="flex flex-col gap-2 items-center mt-1">
          {sponsorsList.map((sponsor, i) => (
            <span
              key={i}
              className="inline-block px-3 py-1.5 bg-amber-50 text-amber-700 rounded-full text-xs font-semibold border border-amber-200"
            >
              {sponsor.name}
            </span>
          ))}
        </div>
      ),
      link: '/sponsors',
      linkText: 'View Sponsors',
      linkColor: 'text-amber-600'
    };
  }

  let customCards: any[] = [];
  try {
    customCards = settings.homeCustomCards ? JSON.parse(settings.homeCustomCards) : [];
  } catch (e) {}
  customCards.forEach((cc: any) => {
    const colors = colorMap[cc.color] || colorMap.sky;
    allCards[cc.id] = {
      id: cc.id,
      icon: <Star className={`h-8 w-8 ${colors.text}`} />,
      iconBg: colors.bg,
      title: cc.title || 'Custom Card',
      desc: cc.description || '',
      link: cc.link || '/',
      linkText: cc.linkText || 'Learn More',
      linkColor: colors.text
    };
  });

  const hasEvents = events.length > 0;
  const cardSelectionRef = useRef<string[] | null>(null);
  const prevHasEventsRef = useRef<boolean | null>(null);
  const settingsLoaded = !!(settings && (settings.homeCardsCycle !== undefined || settings.homeCardsSelection !== undefined));
  if (settingsLoaded && (cardSelectionRef.current === null || prevHasEventsRef.current !== hasEvents)) {
    prevHasEventsRef.current = hasEvents;
    if (settings.homeCardsCycle) {
      const pinned = settings.homeCardsCyclePinned || "";
      const fixed: string[] = [];
      if (pinned && allCards[pinned]) fixed.push(pinned);
      if (hasEvents && !fixed.includes('events')) fixed.push('events');
      const remaining = Object.keys(allCards).filter(k => !fixed.includes(k) && (k !== 'events' || hasEvents));
      const shuffled = [...remaining].sort(() => 0.5 - Math.random());
      const needed = 3 - fixed.length;
      cardSelectionRef.current = [...fixed, ...shuffled.slice(0, needed)];
    } else {
      let selection = ["sites", "safety", "community"];
      if (settings.homeCardsSelection) {
        try {
          selection = JSON.parse(settings.homeCardsSelection);
        } catch (e) {}
      }
      if (!hasEvents) {
        selection = selection.filter(k => k !== 'events');
        const allKeys = Object.keys(allCards).filter(k => k !== 'events');
        for (const fb of allKeys) {
          if (selection.length >= 3) break;
          if (!selection.includes(fb)) selection.push(fb);
        }
      }
      cardSelectionRef.current = selection;
    }
  }
  let selectedKeys = cardSelectionRef.current ? [...cardSelectionRef.current] : ["sites", "safety", "community"];
  if (hasEvents && !selectedKeys.includes('events')) {
    selectedKeys = ['events', ...selectedKeys.slice(0, 2)];
  }
  selectedKeys = selectedKeys.filter(k => allCards[k]);
  if (selectedKeys.length < 3) {
    const allKeys = Object.keys(allCards).filter(k => !selectedKeys.includes(k) && (k !== 'events' || hasEvents));
    for (const k of allKeys) {
      if (selectedKeys.length >= 3) break;
      selectedKeys.push(k);
    }
  }
  const displayedCards = selectedKeys.map(k => allCards[k]).filter(Boolean);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Alert Banner */}
      {settings.alertBannerEnabled && (
        <div className="bg-orange text-white py-3 px-4 text-center font-bold text-sm sm:text-base shadow-md relative z-40">
          <div className="max-w-7xl mx-auto flex items-center justify-center gap-2">
            <ShieldAlert className="w-5 h-5" />
            <span>{settings.alertBannerText || "Important update available."}</span>
          </div>
        </div>
      )}

      {/* Site Closure Banners */}
      {closureBanners.map(b => {
        const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
        const label = b.firstDate === b.lastDate ? fmt(b.firstDate) : `${fmt(b.firstDate)} – ${fmt(b.lastDate)}`;
        return (
          <div key={b.siteId} className="bg-blue-600 text-white py-3 px-4 text-center font-bold text-sm sm:text-base shadow-md relative z-40">
            <div className="max-w-7xl mx-auto flex items-center justify-center gap-2">
              <ShieldAlert className="w-5 h-5" />
              <span>{b.siteName} — Closed {label}</span>
            </div>
          </div>
        );
      })}

      {/* Hero Section */}
      <section data-hero className={`relative flex flex-col ${isGlass ? 'min-h-[100vh] -mt-[56px] sm:-mt-[76px]' : 'h-[80vh]'}`}>
        {/* Background Image with Overlay */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          {heroLayerA && (
            <img
              key={`hero-a-${heroZoomKeyA}`}
              src={heroLayerA}
              alt="Paragliding background"
              className="absolute inset-0 w-full h-full object-cover hero-zoom-animation"
              style={{
                opacity: activeLayer === 'A' ? 1 : 0,
                transition: 'opacity 1s ease-in-out',
                zIndex: activeLayer === 'A' ? 1 : 0,
              }}
              referrerPolicy="no-referrer"
            />
          )}
          {heroLayerB && (
            <img
              key={`hero-b-${heroZoomKeyB}`}
              src={heroLayerB}
              alt="Paragliding background"
              className="absolute inset-0 w-full h-full object-cover hero-zoom-animation"
              style={{
                opacity: activeLayer === 'B' ? 1 : 0,
                transition: 'opacity 1s ease-in-out',
                zIndex: activeLayer === 'B' ? 1 : 0,
              }}
              referrerPolicy="no-referrer"
            />
          )}
          <div className="absolute inset-0 bg-navy/60 mix-blend-multiply" style={{ zIndex: 2 }} />
        </div>

        {/* Hero Content */}
        <div className={`relative z-10 text-center px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto flex-1 flex flex-col justify-center ${isGlass ? 'min-h-screen min-h-[100dvh] pt-[80px] sm:pt-[76px] pb-0 sm:pb-6 md:pb-8 lg:pb-0' : ''}`}>
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold text-white tracking-tight mb-6 drop-shadow-lg leading-tight">
            {(settings.homeHeroTitle || "Welcome to the SkyHigh Paragliding Club!").replace(/\{\{clubName\}\}/g, settings.clubName || 'SkyHigh')}
          </h1>
          <p className="mt-4 text-xl sm:text-2xl text-gray-200 max-w-2xl mx-auto font-light mb-10 whitespace-pre-line">
            {(settings.homeHeroSubtitle || "Based in Melbourne, we are one of Australia's largest and most active free flight clubs.").replace(/\{\{clubName\}\}/g, settings.clubName || 'SkyHigh')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to={settings.homeCta1Link || "/page/new-pilots"}>
              <Button size="lg" variant="orange" className="w-full sm:w-auto text-lg px-8 py-6 rounded-full shadow-lg hover:shadow-xl transition-all">
                {settings.homeCta1Text || "New Pilots"}
              </Button>
            </Link>
            <Link to={settings.homeCta2Link || "/sites"}>
              <Button size="lg" variant="outline" className="w-full sm:w-auto text-lg px-8 py-6 rounded-full bg-white/10 text-white border-white/20 hover:bg-white/20 backdrop-blur-sm">
                {settings.homeCta2Text || "Explore Sites"}
              </Button>
            </Link>
          </div>
          <PublicSearchBox />
        </div>

        {/* Glass cards inside hero (Wonderful White) */}
        {isGlass && (
          <div className="relative z-10 px-4 sm:px-6 lg:px-8 pb-12 -mt-[75px] sm:-mt-[80px] lg:-mt-[85px] xl:-mt-[90px]">
            <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-5">
              {displayedCards.map((card) => {
                const isStaticCard = card.isSchoolsCard || card.isCommunityCard;
                const CardWrapper = card.isExternal ? 'a' : isStaticCard ? 'div' : Link;
                const wrapperProps = card.isExternal
                  ? { href: card.link, target: "_blank", rel: "noopener noreferrer" }
                  : isStaticCard ? {} : { to: card.link };

                return (
                  <CardWrapper key={card.id} {...wrapperProps as any} className="group block">
                    <div
                      className="h-full min-h-[220px] p-5 transition-all duration-300 group-hover:-translate-y-1"
                      style={{
                        background: 'rgba(255,255,255,0.12)',
                        backdropFilter: 'blur(20px) saturate(180%)',
                        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                        borderRadius: '1rem',
                        border: '1px solid rgba(255,255,255,0.18)',
                        boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
                      }}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)' }}>
                          {React.cloneElement(card.icon as React.ReactElement, { className: 'h-5 w-5 text-white' })}
                        </div>
                      </div>
                      <h3 className="text-[15px] font-semibold text-white mb-1.5">{card.title}</h3>
                      <div className="text-[13px] text-white/70 leading-relaxed [&_a]:text-white/80 [&_a]:bg-white/10 [&_a]:border-white/20 [&_a]:hover:bg-white/20">
                        {card.id === 'events' && events.length > 0 ? (
                          <div className="flex flex-col gap-1.5">
                            {events[0].image_url && (
                              <div className="w-full mb-1 rounded-lg overflow-hidden">
                                <img src={events[0].image_url} alt={events[0].name} className="w-full h-auto object-contain" referrerPolicy="no-referrer" loading="lazy" />
                              </div>
                            )}
                            <p className="font-medium text-white/90">{events[0].name || "Upcoming Event"}</p>
                            {(events[0].start_at_iso || events[0].start_at) && (
                              <p className="text-white/60">{new Date(events[0].start_at_iso || events[0].start_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                            )}
                          </div>
                        ) : card.isCommitteeCard && typeof card.desc === 'string' ? (
                          <MarkdownWithWidgets content={card.desc} className="text-[13px]" compact />
                        ) : card.desc}
                      </div>
                    </div>
                  </CardWrapper>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Quick Actions / Value Prop (Classic only) */}
      {!isGlass && (
      <section className="py-16" style={{ background: 'var(--tmpl-section-bg, var(--color-sand))' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 -mt-24 relative z-20">
            {displayedCards.map((card) => {
              if (card.isSchoolsCard || card.isCommunityCard) {
                return (
                  <div key={card.id} className="block">
                    <Card className="h-full border flex flex-col" style={{
                      background: 'var(--tmpl-card-bg)',
                      borderRadius: 'var(--tmpl-card-radius)',
                      boxShadow: 'var(--tmpl-card-shadow)',
                      borderColor: 'var(--tmpl-card-border)',
                    }}>
                      <CardHeader className="text-center pb-2">
                        <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4 ${card.iconBg}`}>
                          {card.icon}
                        </div>
                        <CardTitle className="text-xl">{card.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="text-center text-foreground-secondary flex-grow flex flex-col">
                        <div className="min-h-[4.5rem] flex-grow">
                          {card.isCommitteeCard && typeof card.desc === 'string' ? (
                            <MarkdownWithWidgets content={card.desc} className="text-sm" compact />
                          ) : card.desc}
                        </div>
                        {card.link && card.linkText && (
                          <Link to={card.link} className={`inline-block mt-4 font-semibold ${card.linkColor} text-xs hover:underline`}>
                            {card.linkText}
                          </Link>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                );
              }

              const CardWrapper = card.isExternal ? 'a' : Link;
              const wrapperProps = card.isExternal 
                ? { href: card.link, target: "_blank", rel: "noopener noreferrer", className: "block group" }
                : { to: card.link, className: "block group" };

              return (
                <CardWrapper key={card.id} {...wrapperProps as any}>
                  <Card className="h-full border group-hover:-translate-y-1 transition-transform duration-300 flex flex-col" style={{
                      background: 'var(--tmpl-card-bg)',
                      borderRadius: 'var(--tmpl-card-radius)',
                      boxShadow: 'var(--tmpl-card-shadow)',
                      borderColor: 'var(--tmpl-card-border)',
                    }}>
                    <CardHeader className="text-center pb-2">
                      <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4 ${card.iconBg}`}>
                        {card.icon}
                      </div>
                      <CardTitle className="text-xl group-hover:text-sky transition-colors">{card.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-center text-foreground-secondary flex-grow flex flex-col">
                      <div className="min-h-[4.5rem] flex-grow">
                        {card.id === 'events' && events.length > 0 ? (
                          <div className="text-left mt-2 flex flex-col h-full">
                            {events[0].image_url && (
                              <div className="w-full mb-2 rounded overflow-hidden">
                                <img src={events[0].image_url} alt={events[0].name} className="w-full h-auto object-contain" referrerPolicy="no-referrer" loading="lazy" />
                              </div>
                            )}
                            <p className="font-semibold text-foreground line-clamp-1">{events[0].name || "Upcoming Event"}</p>
                            {(events[0].start_at_iso || events[0].start_at) && <p className="text-sm text-muted-foreground">{new Date(events[0].start_at_iso || events[0].start_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
                          </div>
                        ) : card.desc}
                      </div>
                      <div className={`inline-block mt-4 font-semibold group-hover:underline ${card.linkColor}`}>
                        {card.linkText} &rarr;
                      </div>
                    </CardContent>
                  </Card>
                </CardWrapper>
              );
            })}
          </div>
        </div>
      </section>
      )}

      {/* Featured Site Section */}
      {settings.featuredSiteEnabled && featuredSite && (
        isGlass ? (
        <section className="py-24 overflow-hidden" style={{ background: 'var(--tmpl-body-bg, #f5f5f7)' }}>
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col lg:flex-row items-center gap-16">
              <div className="lg:w-1/2 space-y-5">
                <div className="inline-block px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest" style={{ background: 'var(--tmpl-accent)', color: '#fff' }}>
                  Featured Site
                </div>
                <h2 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--tmpl-heading-color)' }}>{featuredSite.name}</h2>
                <p className="text-[15px] leading-relaxed line-clamp-4" style={{ color: '#86868b' }}>
                  {featuredSite.description}
                </p>
                <div className="flex flex-wrap gap-3 pt-2">
                  <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[13px] font-medium border" style={{ borderColor: 'rgba(0,0,0,0.1)', color: 'var(--tmpl-heading-color)' }}>
                    <CloudSun className="w-4 h-4" style={{ color: 'var(--tmpl-accent)' }} />
                    <span>{featuredSite.windDir}</span>
                  </div>
                  <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[13px] font-medium border" style={{ borderColor: 'rgba(0,0,0,0.1)', color: 'var(--tmpl-heading-color)' }}>
                    <ShieldAlert className="w-4 h-4" style={{ color: 'var(--tmpl-accent)' }} />
                    <span>{featuredSite.pgRating || featuredSite.hgRating || "See site guide"}</span>
                  </div>
                </div>
                <Link to={`/sites/${featuredSite.id}`} className="inline-flex items-center gap-1 pt-2 text-[15px] font-medium hover:underline" style={{ color: 'var(--tmpl-accent)' }}>
                  View Site Guide <span className="text-lg">→</span>
                </Link>
              </div>
              <div className="lg:w-1/2 relative">
                <div className="aspect-video rounded-3xl overflow-hidden bg-gradient-to-br from-slate-300 to-slate-400" style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.12)' }}>
                  {featuredSite.image && featuredSite.image.trim() ? (
                    <img
                      src={featuredSite.image}
                      alt={featuredSite.name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-500 font-medium">
                      No image
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
        ) : (
        <section className="py-20 bg-navy text-white overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col lg:flex-row items-center gap-12">
              <div className="lg:w-1/2 space-y-6">
                <div className="inline-block px-3 py-1 bg-sky text-white text-xs font-bold rounded uppercase tracking-widest">
                  Featured Site
                </div>
                <h2 className="text-4xl font-bold tracking-tight text-orange">{featuredSite.name}</h2>
                <p className="text-gray-300 text-lg leading-relaxed line-clamp-4">
                  {featuredSite.description}
                </p>
                <div className="flex flex-wrap gap-4 pt-4">
                  <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-lg">
                    <CloudSun className="w-5 h-5 text-sky" />
                    <span className="text-sm font-medium">{featuredSite.windDir}</span>
                  </div>
                  <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-lg">
                    <ShieldAlert className="w-5 h-5 text-orange" />
                    <span className="text-sm font-medium">{featuredSite.pgRating || featuredSite.hgRating || "See site guide"}</span>
                  </div>
                </div>
                <Link to={`/sites/${featuredSite.id}`} className="inline-block pt-4">
                  <Button variant="orange" size="lg">
                    View Site Guide
                  </Button>
                </Link>
              </div>
              <div className="lg:w-1/2 relative">
                <div className="aspect-video rounded-2xl overflow-hidden shadow-2xl border-4 border-white/10 bg-gradient-to-br from-slate-300 to-slate-400">
                  {featuredSite.image && featuredSite.image.trim() ? (
                    <img
                      src={featuredSite.image}
                      alt={featuredSite.name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-500 font-medium">
                      No image
                    </div>
                  )}
                </div>
                <div className="absolute -bottom-6 -right-6 bg-sky p-6 rounded-2xl shadow-xl hidden md:block">
                  <p className="text-xs font-bold uppercase tracking-widest mb-1 opacity-80">Site Type</p>
                  <p className="text-xl font-bold">{featuredSite.type}</p>
                </div>
              </div>
            </div>
          </div>
        </section>
        )
      )}

      {settings.photoSliderEnabled && (
        <section className="overflow-hidden" style={{ background: isGlass ? 'var(--tmpl-body-bg, #f5f5f7)' : '#1e293b', paddingTop: 25 }}>
          <PhotoSlider reverse={settings.photoSliderReverse} autoScroll={settings.photoSliderAutoScroll} />
        </section>
      )}

      {settings.youtubeCarouselEnabled && (
        <section className="overflow-hidden" style={{ background: isGlass ? 'var(--tmpl-body-bg, #f5f5f7)' : '#1e293b', paddingTop: 25 }}>
          <YouTubeCarousel reverse={settings.youtubeCarouselReverse} autoScroll={settings.youtubeCarouselAutoScroll} />
        </section>
      )}

      {/* Live Weather / Conditions Preview */}
      <section className={isGlass ? "py-24" : "py-20 bg-sand"} style={isGlass ? { background: 'var(--tmpl-body-bg, #f5f5f7)' } : undefined}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className={isGlass ? "text-3xl font-bold mb-3" : "text-3xl font-bold text-navy mb-4"} style={isGlass ? { color: 'var(--tmpl-heading-color, #1d1d1f)' } : undefined}>Current Conditions</h2>
            <p className={isGlass ? "max-w-2xl mx-auto text-[15px]" : "text-foreground-secondary max-w-2xl mx-auto"} style={isGlass ? { color: '#86868b' } : undefined}>
              {isGlass ? 'Live weather at popular flying sites.' : 'A quick glance at our most popular sites.'}<br />
              <span className="text-orange font-semibold">{isGlass ? 'Always check conditions yourself before flying.' : 'Always perform your own weather check before flying.'}</span>
            </p>

            {/* Weather Legend */}
            <div className={isGlass
              ? "mt-6 mb-8 flex flex-wrap justify-center gap-x-6 gap-y-3 text-[12px]"
              : "mt-8 mb-10 flex flex-wrap justify-center gap-x-8 gap-y-4 text-[11px] text-muted-foreground bg-card p-4 rounded-2xl border border-border-subtle shadow-sm w-full"
            } style={isGlass ? { color: '#86868b' } : undefined}>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span className="font-medium">Good</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500"></span>
                <span className="font-medium">Light</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-orange"></span>
                <span className="font-medium">Cross</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                <span className="font-medium">Blown Out</span>
              </div>
              {!isGlass && (
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-sky-500/50 shadow-sm"></span>
                  <span className="font-medium">Ideal Wind Dir</span>
                </div>
              )}
            </div>
          </div>

          <div className={isGlass ? "grid grid-cols-1 md:grid-cols-2 gap-8" : "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8"}>
            {sites.slice(0, parseInt(String(settings?.homeWeatherCardCount ?? "6")) || 6).map(site => (
              <Link key={site.id} to={`/sites/${site.id}`} className="block transition-transform hover:-translate-y-1">
                <WeatherCard 
                  weather={weatherData[site.id]} 
                  site={site} 
                  distance={distances[site.id]}
                  variant={isGlass ? 'apple' : 'classic'}
                />
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
