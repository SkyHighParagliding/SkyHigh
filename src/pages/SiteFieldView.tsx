import { useState, useEffect } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Wind, AlertTriangle, Compass, Info, CloudSun, ShieldAlert, ArrowRight, Phone, Bird, Map } from "lucide-react";
import { InfoCard } from "@/components/InfoCard";
import { useSettings } from "@/contexts/SettingsContext";
import { WeatherCard } from "@/components/WeatherCard";
import { prefetchWindGrids } from "@/lib/windGridCache";
import { haversineDistance } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import { recordSiteView } from "@/lib/recentSites";
import type { Site, WeatherData } from "@/types/api";

const isValid = (value: string | undefined | null) => {
  if (!value) return false;
  const trimmed = value.trim().toLowerCase();
  return trimmed !== '' && trimmed !== 'not specified' && trimmed !== 'n/a' && trimmed !== 'none' && trimmed !== 'unknown';
};

export function SiteFieldView() {
  const { id } = useParams();
  const { settings, activeLogos, loading: settingsLoading } = useSettings();
  const isGlass = settings.activeTemplate === 'wonderful-white';
  const [distance, setDistance] = useState<string | null>(null);

  const { data: site, isLoading: loading, error: siteError } = useQuery({
    queryKey: ['sites', id],
    queryFn: () => api.get<Site>(`/api/sites/${id}`),
    enabled: !!id,
  });

  const { data: weather } = useQuery({
    queryKey: ['weather', site?.id],
    queryFn: () => api.get<WeatherData>(`/api/weather/${site!.id}`).catch(() => ({ error: true } as WeatherData)),
    enabled: !!site?.id,
  });

  useEffect(() => {
    window.scrollTo(0, 0);
    if (id) recordSiteView(id);
  }, [id]);

  useEffect(() => {
    if (site?.lat && site?.lon && site?.useLiveWeather === 'true') {
      prefetchWindGrids([site.id]);
    }
  }, [site]);

  useEffect(() => {
    if (weather && !weather.error && weather.stationLat && weather.stationLon && site?.lat && site?.lon) {
      const dist = haversineDistance(site.lat, site.lon, weather.stationLat, weather.stationLon);
      setDistance(dist.toFixed(1));
    }
  }, [weather, site]);

  const error = siteError ? (siteError as Error).message : "";

  if (settingsLoading) return null;
  if (settings.qrCodeMode === "off" || !settings.qrCodeMode) {
    return <Navigate to={`/sites/${id}`} replace />;
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-sky border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <p className="text-sm text-muted-foreground">Loading site info...</p>
      </div>
    </div>
  );

  if (error || !site) return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center">
        <p className="text-red-500 mb-4">{error || "Site not found"}</p>
        <Link to="/sites" className="text-sky hover:underline text-sm">View all sites</Link>
      </div>
    </div>
  );

  const smallCards: React.ReactNode[] = [];

  if (isValid(site.windDir)) {
    smallCards.push(<InfoCard key="winddir" icon={<Compass className="w-5 h-5 text-sky" />} label="Ideal Dir" value={site.windDir} />);
  }

  if (isValid(site.windSpeed)) {
    smallCards.push(<InfoCard key="windspeed" icon={<Wind className="w-5 h-5 text-sky" />} label="Wind Range" value={site.windSpeed} />);
  }

  if (site.pgRating) {
    smallCards.push(<InfoCard key="pgrating" icon={<AlertTriangle className="w-5 h-5 text-sky" />} label="PG Rating" value={site.pgRating} />);
  }

  if (site.hgRating) {
    smallCards.push(<InfoCard key="hgrating" icon={<AlertTriangle className="w-5 h-5 text-sky" />} label="HG Rating" value={site.hgRating} />);
  }

  if (isValid(site.emergencyMarker)) {
    smallCards.push(<InfoCard key="emergency" icon={<AlertTriangle className="w-5 h-5 text-red-500" />} label="Emergency" value={site.emergencyMarker} iconBgClass="bg-red-50" valueClass="font-bold text-red-600 text-sm" />);
  }

  if (isValid(site.what3words)) {
    smallCards.push(<InfoCard key="w3w" icon={<MapPin className="w-5 h-5 text-sky" />} label="What3Words" value={site.what3words} href={`https://what3words.com/${site.what3words.replace('///', '')}`} />);
  }

  if (isValid(site.siteContact)) {
    smallCards.push(<InfoCard key="contact" icon={<Phone className="w-5 h-5 text-sky" />} label="Site Contact" value={site.siteContact} subValue={isValid(site.siteContactPhone) ? site.siteContactPhone : undefined} />);
  }

  if (site.hoodedPloversActive === "true") {
    const hasLink = isValid(site.hoodedPloversLink);
    smallCards.push(
      hasLink
        ? <InfoCard key="plovers" icon={<Bird className="w-5 h-5 text-orange" />} label="Hooded Plovers" value="Click Here" href={site.hoodedPloversLink} iconBgClass="bg-orange/10" />
        : <InfoCard key="plovers" icon={<Bird className="w-5 h-5 text-orange" />} label="Hooded Plovers" value="Check Signs" iconBgClass="bg-orange/10" valueClass="font-bold text-orange text-sm" />
    );
  }

  if (site.isXCSite === 'true' && settings.xcMapsEnabled) {
    smallCards.push(
      <Link key="xc" to="/xc/maps" className="bg-card p-4 rounded-2xl border border-sky/10 shadow-sm flex flex-col items-center text-center hover:bg-sky/5 transition-colors">
        <div className="bg-sky/10 p-2 rounded-xl mb-2">
          <Map className="w-5 h-5 text-sky" />
        </div>
        <p className="text-[10px] text-foreground-faint uppercase font-bold tracking-widest mb-1">XC</p>
        <p className="font-bold text-navy text-sm">XC Map</p>
      </Link>
    );
  }

  return (
    <div className="bg-background min-h-screen">
      <div className="bg-navy text-white px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold truncate">{site.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              {site.temporarilyClosed === 1 ? (
                <Badge className="bg-amber-500 text-white border-none text-xs">Temporarily Closed</Badge>
              ) : site.status === 'open' ? (
                <Badge className="bg-emerald-500 text-white border-none text-xs">Open</Badge>
              ) : (
                <Badge variant="destructive" className="border-none text-xs">Closed</Badge>
              )}
              <span className="text-white/60 text-xs">{site.type}</span>
            </div>
          </div>
          <img src={activeLogos.nav || "/logo-light.png"} alt={settings.clubName || "SkyHigh"} className="h-10 w-auto opacity-80 ml-3 shrink-0" />
        </div>
      </div>

      <div className="max-w-lg mx-auto px-3 py-4 space-y-3">
        {smallCards.length > 0 && (
          <div className="grid grid-cols-2 gap-2 grid-flow-dense">
            {smallCards}
          </div>
        )}

        {weather && !weather.error && (
          <div className="space-y-2">
            <div className="flex items-center px-1">
              <CloudSun className="w-4 h-4 text-sky mr-1.5" />
              <h2 className="text-sm font-bold text-navy">Current Weather</h2>
            </div>
            <div className="scale-[0.92] origin-top">
              <WeatherCard weather={weather} site={site} distance={distance ? Number(distance) : undefined} variant={isGlass ? 'apple' : 'classic'} />
            </div>
          </div>
        )}

        {site.hazards && site.hazards.length > 0 && (
          <Card className="border-t-3 border-t-orange shadow-sm">
            <CardHeader className="bg-orange/5 py-3 px-4">
              <CardTitle className="flex items-center text-orange-dark text-sm">
                <AlertTriangle className="w-4 h-4 mr-1.5" /> Known Hazards
              </CardTitle>
            </CardHeader>
            <CardContent className="py-3 px-4">
              <ul className="space-y-1.5">
                {site.hazards.map((hazard: string, index: number) => (
                  <li key={index} className="flex items-start gap-1.5">
                    <span className="text-orange shrink-0 text-xs mt-0.5">•</span>
                    <span className="text-xs text-foreground-label leading-relaxed">{hazard}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {site.rules && site.rules.length > 0 && (
          <Card className="shadow-sm">
            <CardHeader className="bg-navy/5 py-3 px-4">
              <CardTitle className="flex items-center text-navy text-sm">
                <ShieldAlert className="w-4 h-4 mr-1.5" /> Site Rules
              </CardTitle>
            </CardHeader>
            <CardContent className="py-3 px-4">
              <ul className="space-y-1.5">
                {site.rules.map((rule: string, index: number) => (
                  <li key={index} className="flex items-start gap-1.5">
                    <span className="text-navy shrink-0 font-bold text-xs">{index + 1}.</span>
                    <span className="text-xs text-foreground-label leading-relaxed">{rule}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <Link
          to={`/sites/${id}`}
          className="flex items-center justify-center gap-2 bg-sky hover:bg-sky-dark text-white font-medium py-3 rounded-xl transition-colors text-sm"
        >
          View Full Site Details <ArrowRight className="w-4 h-4" />
        </Link>

        <p className="text-center text-[10px] text-foreground-faint pb-4">
          {settings.clubName || 'SkyHigh'}
        </p>
      </div>
    </div>
  );
}
