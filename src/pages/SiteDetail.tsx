import { useState, useEffect, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Wind, AlertTriangle, Info, Compass, ArrowLeft, CheckCircle2, ShieldAlert, CloudSun, Pencil, Map, X, ChevronLeft, ChevronRight, Shield, Lock, Unlock, Settings } from "lucide-react";
import { EmergencyMedicalCard } from "@/components/EmergencyMedicalCard";
import { InfoCard } from "@/components/InfoCard";
import { useSettings } from "@/contexts/SettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/apiClient";
import { getWeatherIcon, getWindStatus, haversineDistance } from "@/lib/utils";
import { formatDisplayTime } from "@/lib/dateUtils";
import { WeatherCard } from "@/components/WeatherCard";
import { prefetchWindGrids } from "@/lib/windGridCache";
import { getClosureStatus, formatClosureDateRange } from "@/utils/closureStatus";
import { recordSiteView } from "@/lib/recentSites";
import { useSite, useWeather } from "@/hooks/api";

const isValidField = (value: string | undefined | null) => {
  if (!value) return false;
  const trimmed = value.trim().toLowerCase();
  return trimmed !== '' && trimmed !== 'not specified' && trimmed !== 'n/a' && trimmed !== 'none' && trimmed !== 'unknown';
};

export function SiteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: site, isLoading: loading, error: siteError, refetch: refetchSite } = useSite(id);
  const { data: weatherRaw } = useWeather(site ? id : undefined);
  const weather = useMemo(() => {
    if (!weatherRaw) return null;
    if (weatherRaw.error) return { error: true };
    return weatherRaw;
  }, [weatherRaw]);
  const distance = useMemo(() => {
    if (!weather || weather.error || !weather.stationLat || !weather.stationLon || !site?.lat || !site?.lon) return null;
    return parseFloat(haversineDistance(site.lat, site.lon, weather.stationLat, weather.stationLon).toFixed(1));
  }, [weather, site]);
  const error = siteError ? (siteError as Error).message : "";
  const [essentialInfoOpen, setEssentialInfoOpen] = useState(false);
  const [essentialImgIndex, setEssentialImgIndex] = useState(0);
  const [closureLoading, setClosureLoading] = useState(false);
  const [emergencyModalOpen, setEmergencyModalOpen] = useState(false);
  const { settings } = useSettings();
  const isGlass = settings.activeTemplate === 'wonderful-white';
  const { user, token, isSoSession, soSiteId, setSoSession, logout } = useAuth();

  useEffect(() => {
    if (isSoSession && soSiteId && soSiteId !== id) {
      navigate(`/sites/${soSiteId}`, { replace: true });
    }
  }, [isSoSession, soSiteId, id, navigate]);

  const isSOView = isSoSession && soSiteId === id;
  const canManageClosure = isSOView && user?.isSafetyCommittee && user?.soAuthorised;
  const isDualRole = isSOView && user?.isAdmin && user?.isSafetyCommittee;

  const handleTemporaryClosure = async () => {
    if (!site || !token) return;
    setClosureLoading(true);
    try {
      const endpoint = site.temporarilyClosed
        ? `/api/sites/${site.id}/reopen`
        : `/api/sites/${site.id}/temporary-closure`;
      await api.post(endpoint, undefined, token);
      refetchSite();
    } catch (e) {
      console.error("Failed to update closure status:", e);
    } finally {
      setClosureLoading(false);
    }
  };

  const handleAdminDuties = async () => {
    try {
      await api.post("/api/auth/elevate-to-admin", undefined, token);
      setSoSession(null);
      navigate("/admin");
    } catch {
      console.error("Failed to elevate to admin");
    }
  };

  const handleSOLogout = () => {
    logout();
    navigate("/");
  };

  useEffect(() => {
    window.scrollTo(0, 0);
    if (id) recordSiteView(id);
  }, [id]);

  useEffect(() => {
    if (site?.lat && site?.lon && site?.useLiveWeather === 'true') {
      prefetchWindGrids([site.id]);
    }
  }, [site]);

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading site details...</div>;
  if (error || !site) return <div className="min-h-screen flex items-center justify-center text-red-500">{error || "Site not found"}</div>;

  return (
    <div className="bg-background min-h-screen pb-20">
      {isSOView && (
        <div className="bg-amber-500 text-white px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-2">
          <Shield className="w-4 h-4" />
          Safety Officer Mode — {site.name}
          <button onClick={handleSOLogout} className="ml-4 underline hover:no-underline text-xs">Log Out</button>
        </div>
      )}

      {/* Hero Header */}
      <div data-hero className="relative h-[40vh] min-h-[300px] w-full bg-gradient-to-br from-slate-300 to-slate-400">
        {site.image && site.image.trim() ? (
          <img
            src={site.image}
            alt={site.name}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-500 text-lg font-medium">
            No image available for {site.name}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-navy/90 via-navy/40 to-transparent" />

        {site.temporarilyClosed === 1 && (
          <div className="absolute top-0 left-0 w-full bg-amber-600/90 text-white text-center py-3 px-4 font-bold text-lg">
            {site.name} Temporarily Closed
          </div>
        )}

        {canManageClosure && (
          <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
            <Button
              onClick={handleTemporaryClosure}
              disabled={closureLoading}
              className={site.temporarilyClosed
                ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg"
                : "bg-red-600 hover:bg-red-700 text-white shadow-lg"
              }
              size="lg"
            >
              {site.temporarilyClosed ? (
                <><Unlock className="w-5 h-5 mr-2" /> {closureLoading ? "Reopening..." : "Press to Reopen"}</>
              ) : (
                <><Lock className="w-5 h-5 mr-2" /> {closureLoading ? "Closing..." : "Temporary Closure"}</>
              )}
            </Button>

            {isDualRole && (
              <Button
                onClick={handleAdminDuties}
                className="bg-navy hover:bg-navy-light text-white shadow-lg"
                size="lg"
              >
                <Settings className="w-5 h-5 mr-2" /> Admin Duties
              </Button>
            )}
          </div>
        )}
        
        <div className="absolute bottom-0 left-0 w-full">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
            {!isSOView && (
              <Link to="/sites" className="inline-flex items-center text-white/80 hover:text-white mb-4 transition-colors">
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to Sites
              </Link>
            )}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Badge variant="secondary" className="bg-sky text-white border-none">{site.type}</Badge>
                  {(() => {
                    const { isClosedToday, upcomingDates } = getClosureStatus(site);
                    const isPermanentlyClosed = site.status === 'closed';
                    const todayStr = new Date().toISOString().split('T')[0];
                    const futureDates = isPermanentlyClosed ? [] :
                      (site.upcomingClosureDates ?? [])
                        .filter(d => d > todayStr)
                        .slice(0, site.closurePillsMax ?? 7);
                    const formatPill = (d: string) =>
                      new Date(d + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

                    if (isPermanentlyClosed) {
                      return <Badge variant="destructive" className="border-none">Closed</Badge>;
                    }
                    if (site.status === 'restricted') {
                      return <Badge variant="outline" className="border-amber-500 text-amber-600 border bg-amber-100">Restricted</Badge>;
                    }
                    if (isClosedToday) {
                      return (
                        <>
                          <Badge variant="destructive" className="border-none">Closed</Badge>
                          {futureDates.map(d => (
                            <Badge key={d} variant="destructive" className="border-none">{formatPill(d)}</Badge>
                          ))}
                        </>
                      );
                    }
                    if (upcomingDates.length > 0) {
                      return (
                        <>
                          <Badge variant="default" className="bg-emerald-500 border-none">Open</Badge>
                          {futureDates.map(d => (
                            <Badge key={d} variant="destructive" className="border-none">{formatPill(d)}</Badge>
                          ))}
                        </>
                      );
                    }
                    if (site.temporarilyClosed === 1) {
                      return <Badge className="bg-amber-500 text-white border-none">Temporarily Closed</Badge>;
                    }
                    if (site.status === 'open') {
                      return <Badge variant="default" className="bg-emerald-500 border-none">Open</Badge>;
                    }
                    return <Badge variant="destructive" className="border-none">Closed</Badge>;
                  })()}
                  {user && !isSOView && (
                    <Link to={`/admin/sites/${site.id}/edit`}>
                      <Badge className="bg-orange hover:bg-orange-dark text-white border-none cursor-pointer">
                        <Pencil className="w-3 h-3 mr-1" /> Edit Site
                      </Badge>
                    </Link>
                  )}
                </div>
                <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">{site.name}</h1>
              </div>
              {settings.onlineCheckInEnabled && !isSOView && (
                <div className="flex gap-3">
                  <Link to={`/check-in?site=${site.id}`}>
                    <Button variant="orange" size="lg" className="shadow-lg">
                      <CheckCircle2 className="w-5 h-5 mr-2" /> Check-in to Fly
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Info Column */}
          <div className="lg:col-span-2 space-y-10">
            {/* Description */}
            <section className="bg-card p-8 rounded-3xl shadow-sm border border-sky/5">
              <h2 className="text-2xl font-bold text-navy mb-4 flex items-center">
                <Info className="w-6 h-6 mr-2 text-sky" /> Site Overview
              </h2>
              <div className="prose prose-gray max-w-none text-foreground-secondary leading-relaxed">
                <p>{site.description}</p>
              </div>
            </section>

            {/* Weather & Requirements Grid */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Weather Tool */}
              <div className="md:col-span-2 space-y-6">
                <div className="flex items-center justify-between px-2">
                  <h2 className="text-xl font-bold text-navy flex items-center">
                    <CloudSun className="w-5 h-5 mr-2 text-sky" /> Local Weather
                  </h2>
                </div>

                <div className="scale-95 origin-top space-y-6">
                  {/* Weather Legend */}
                  <div className="bg-card p-4 rounded-2xl border border-sky/10 shadow-sm flex flex-wrap justify-center gap-x-6 gap-y-2">
                    <div className="flex items-center gap-2 text-[10px] text-foreground-secondary">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shrink-0"></span>
                      <span className="font-medium">Good</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-foreground-secondary">
                      <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 shadow-sm shrink-0"></span>
                      <span className="font-medium">Light</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-foreground-secondary">
                      <span className="w-2.5 h-2.5 rounded-full bg-orange shadow-sm shrink-0"></span>
                      <span className="font-medium">Cross</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-foreground-secondary">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm shrink-0"></span>
                      <span className="font-medium">Blown Out / Not Flyable</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-foreground-secondary">
                      <span className="w-2.5 h-2.5 rounded-full bg-sky-500/50 shadow-sm shrink-0"></span>
                      <span className="font-medium">Ideal Wind Dir</span>
                    </div>
                  </div>

                  {weather ? (
                    <WeatherCard weather={weather} site={site} distance={distance} variant={isGlass ? 'apple' : 'classic'} />
                  ) : (
                    <div className="bg-card p-8 rounded-3xl shadow-sm border border-sky/5 text-center text-muted-foreground">
                      Weather data unavailable.
                    </div>
                  )}
                </div>
              </div>

              {/* Site Information */}
              <div className="space-y-6">
                <div className="flex items-center justify-between px-2">
                  <h2 className="text-xl font-bold text-navy flex items-center">
                    <Info className="w-5 h-5 mr-2 text-sky" /> Site Information
                  </h2>
                </div>
                <div className="grid grid-cols-2 gap-4 grid-flow-dense">
                    <InfoCard icon={<Compass className="w-5 h-5 text-sky" />} label="Ideal Dir" value={site.windDir} />
                    <InfoCard icon={<Wind className="w-5 h-5 text-sky" />} label="Wind Range" value={site.windSpeed} />
                    {site.pgRating && (
                      <InfoCard icon={<AlertTriangle className="w-5 h-5 text-sky" />} label="PG Rating" value={site.pgRating} />
                    )}
                    {site.hgRating && (
                      <InfoCard icon={<AlertTriangle className="w-5 h-5 text-sky" />} label="HG Rating" value={site.hgRating} />
                    )}
                    <InfoCard icon={<MapPin className="w-5 h-5 text-sky" />} label="Site Type" value={site.type} />
                    {isValidField(site.siteContact) && (
                      <InfoCard icon={<Info className="w-5 h-5 text-sky" />} label="Contact" value={site.siteContact} subValue={isValidField(site.siteContactPhone) ? site.siteContactPhone : undefined} />
                    )}
                    {isValidField(site.launchHeight) && (
                      <InfoCard icon={<ArrowLeft className="w-5 h-5 text-sky rotate-90" />} label="Launch (AMSL)" value={site.launchHeight} />
                    )}
                    {isValidField(site.launchHeightHigh) && (
                      <InfoCard icon={<ArrowLeft className="w-5 h-5 text-sky rotate-90" />} label="Landing (AMSL)" value={site.launchHeightHigh} />
                    )}
                    {isValidField(site.launchHeight2) && (
                      <InfoCard icon={<ArrowLeft className="w-5 h-5 text-sky rotate-90" />} label="Launch 2 (AMSL)" value={site.launchHeight2} />
                    )}
                    {isValidField(site.landingHeight2) && (
                      <InfoCard icon={<ArrowLeft className="w-5 h-5 text-sky rotate-90" />} label="Landing 2 (AMSL)" value={site.landingHeight2} />
                    )}
                    {isValidField(site.emergencyMarker) && (
                      <InfoCard icon={<AlertTriangle className="w-5 h-5 text-red-500" />} label="Emergency" value={site.emergencyMarker} iconBgClass="bg-red-50" valueClass="font-bold text-red-600 text-sm" />
                    )}
                    {site.lat != null && site.lon != null && (
                      <button
                        onClick={() => setEmergencyModalOpen(true)}
                        className="bg-card p-4 rounded-2xl border border-red-200 shadow-sm flex flex-col items-center text-center hover:bg-red-50 transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-red-400"
                      >
                        <div className="bg-red-50 p-2 rounded-xl mb-2">
                          <AlertTriangle className="w-5 h-5 text-red-500" />
                        </div>
                        <p className="text-[10px] text-red-400 uppercase font-bold tracking-widest mb-1">Emergency</p>
                        <p className="font-bold text-red-600 text-sm">Hospitals</p>
                      </button>
                    )}
                    {isValidField(site.what3words) && (
                      <InfoCard icon={<MapPin className="w-5 h-5 text-sky" />} label="What3Words" value={site.what3words} href={`https://what3words.com/${site.what3words.replace('///', '')}`} />
                    )}
                    {(site.lat && site.lon) && (
                      <InfoCard icon={<MapPin className="w-5 h-5 text-sky" />} label="Navigate" value="Directions" href={`https://www.google.com/maps?q=${site.lat},${site.lon}`} />
                    )}
                    {isValidField(site.siteguideUrl) && (
                      <InfoCard icon={<Info className="w-5 h-5 text-sky" />} label="Siteguide" value="View Info" href={site.siteguideUrl} />
                    )}
                    {(() => {
                      const ffwxId = [site.liveStationId, site.liveStationIdAlt].find((id: string) => id?.startsWith('freeflightwx-'));
                      if (!ffwxId) return null;
                      const raw = ffwxId.replace('freeflightwx-', '');
                      const subpathMap: Record<string, string> = {
                        'acthpa-springhill': 'acthpa/springhill',
                        'acthpa-lakegeorge': 'acthpa/lakegeorge',
                        'acthpa-lanyon': 'acthpa/lanyon',
                        'acthpa-corryong': 'acthpa/corryong',
                      };
                      const slug = subpathMap[raw] || raw;
                      const gaugeUrl = `https://www.freeflightwx.com/${slug}/gauge.php`;
                      return <InfoCard icon={<CloudSun className="w-5 h-5 text-sky" />} label="Weather" value="Weather Gauge" href={gaugeUrl} />;
                    })()}
                    {site.hoodedPloversActive === "true" && isValidField(site.hoodedPloversLink) && (
                      <InfoCard icon={<AlertTriangle className="w-5 h-5 text-orange" />} label="Hooded Plovers" value="Click Here" href={site.hoodedPloversLink} iconBgClass="bg-orange/10" />
                    )}
                    {site.hoodedPloversActive === "true" && !isValidField(site.hoodedPloversLink) && (
                      <InfoCard icon={<AlertTriangle className="w-5 h-5 text-orange" />} label="Hooded Plovers" value="Check Signs" iconBgClass="bg-orange/10" valueClass="font-bold text-orange text-sm" />
                    )}
                    {site.isXCSite === 'true' && settings.xcMapsEnabled && (
                      <Link to="/xc/maps" className="bg-card p-4 rounded-2xl border border-sky/10 shadow-sm flex flex-col items-center text-center hover:bg-sky/5 transition-colors">
                        <div className="bg-sky/10 p-2 rounded-xl mb-2">
                          <Map className="w-5 h-5 text-sky" />
                        </div>
                        <p className="text-[10px] text-foreground-faint uppercase font-bold tracking-widest mb-1">XC</p>
                        <p className="font-bold text-navy text-sm">XC Map</p>
                      </Link>
                    )}
                </div>
              </div>
            </section>


            {/* Launch & Landing */}
            <div className="grid sm:grid-cols-2 gap-6">
              <Card className="border-l-4 border-l-sky">
                <CardHeader>
                  <CardTitle className="text-lg">Launch Area</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-foreground-secondary text-sm leading-relaxed">{site.launch}</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-emerald-500">
                <CardHeader>
                  <CardTitle className="text-lg">Landing Zones</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-foreground-secondary text-sm leading-relaxed">{site.landing}</p>
                </CardContent>
              </Card>
            </div>

            {site.essentialInfoImages?.length > 0 && (
              <section className="bg-card p-8 rounded-3xl shadow-sm border border-sky/5">
                <h2 className="text-2xl font-bold text-navy mb-4 flex items-center">
                  <Map className="w-6 h-6 mr-2 text-sky" /> Essential Site Info
                </h2>
                <p className="text-sm text-muted-foreground mb-6">
                  Annotated site maps sourced from siteguide.org.au. Tap an image to view full size.
                </p>
                <div className="flex flex-col gap-4">
                  {site.essentialInfoImages.map((img: string, i: number) => (
                    <button
                      key={i}
                      onClick={() => { setEssentialImgIndex(i); setEssentialInfoOpen(true); }}
                      className="rounded-2xl overflow-hidden border border-border-subtle hover:border-sky transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky"
                    >
                      <img
                        src={img}
                        alt={`Site map ${i + 1}`}
                        className="w-full h-auto object-contain bg-background"
                      />
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-8">
            {/* Hazards */}
            <Card className="border-t-4 border-t-orange shadow-md">
              <CardHeader className="bg-orange/5 pb-4">
                <CardTitle className="flex items-center text-orange-dark">
                  <AlertTriangle className="w-5 h-5 mr-2" /> Known Hazards
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <ul className="space-y-3">
                  {(Array.isArray(site.hazards) ? site.hazards : []).map((hazard, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="text-orange shrink-0">•</span>
                      <span className="text-sm text-foreground-label leading-relaxed">{hazard}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Rules */}
            <Card className="shadow-md">
              <CardHeader className="bg-navy/5 pb-4">
                <CardTitle className="flex items-center text-navy">
                  <ShieldAlert className="w-5 h-5 mr-2 text-navy" /> Site Rules
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <ul className="space-y-3">
                  {(Array.isArray(site.rules) ? site.rules : []).map((rule, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="text-navy shrink-0 font-bold">{(index + 1).toString()}.</span>
                      <span className="text-sm text-foreground-label leading-relaxed">{rule}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-6 pt-4 border-t border-border-faint">
                  <p className="text-xs text-muted-foreground italic">
                    Failure to comply with site rules may result in suspension of flying privileges.
                  </p>
                </div>
              </CardContent>
            </Card>

          </div>

        </div>
      </div>

      {emergencyModalOpen && site.lat != null && site.lon != null && (
        <div
          className="fixed inset-0 z-[10001] bg-black/60 flex items-center justify-center p-4"
          onClick={() => setEmergencyModalOpen(false)}
        >
          <div
            className="relative max-w-lg w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setEmergencyModalOpen(false)}
              className="absolute top-3 right-3 z-10 bg-white/90 hover:bg-white text-red-500 hover:text-red-700 rounded-full p-1 shadow transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <EmergencyMedicalCard
              siteId={site.id}
              siteLat={site.lat}
              siteLon={site.lon}
              what3words={site.what3words}
            />
          </div>
        </div>
      )}

      {essentialInfoOpen && site.essentialInfoImages?.length > 0 && (
        <div
          className="fixed inset-0 z-[10001] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setEssentialInfoOpen(false)}
        >
          <div
            className="relative max-w-4xl w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setEssentialInfoOpen(false)}
              className="absolute -top-12 right-0 text-white/80 hover:text-white transition-colors"
            >
              <X className="w-8 h-8" />
            </button>

            <div className="relative flex items-center justify-center">
              {site.essentialInfoImages.length > 1 && (
                <button
                  onClick={() => setEssentialImgIndex((prev: number) => (prev - 1 + site.essentialInfoImages.length) % site.essentialInfoImages.length)}
                  className="absolute left-2 z-10 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-colors"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
              )}

              <img
                src={site.essentialInfoImages[essentialImgIndex]}
                alt={`Site map ${essentialImgIndex + 1}`}
                className="max-h-[80vh] w-auto max-w-full object-contain rounded-lg"
              />

              {site.essentialInfoImages.length > 1 && (
                <button
                  onClick={() => setEssentialImgIndex((prev: number) => (prev + 1) % site.essentialInfoImages.length)}
                  className="absolute right-2 z-10 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-colors"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              )}
            </div>

            {site.essentialInfoImages.length > 1 && (
              <div className="flex justify-center gap-2 mt-4">
                {site.essentialInfoImages.map((_: string, i: number) => (
                  <button
                    key={i}
                    onClick={() => setEssentialImgIndex(i)}
                    className={`w-2.5 h-2.5 rounded-full transition-colors ${i === essentialImgIndex ? 'bg-card' : 'bg-white/40 hover:bg-white/60'}`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
