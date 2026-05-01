import { useEffect, useState, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { createPortal } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Activity, Wind, RefreshCw, Eye, X, ArrowLeft } from "lucide-react";

import { useSettings } from "@/contexts/SettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/apiClient";
import { toast } from "sonner";

const WindMap = lazy(() => import("@/components/WindMap"));

function WindMapPreviewCard() {
  const [showPreview, setShowPreview] = useState(false);
  const [previewSite, setPreviewSite] = useState<{ id: string; name: string; lat: number; lon: number } | null>(null);

  useEffect(() => {
    if (!previewSite) {
      api.get<Array<{ id: string; name: string; lat: string; lon: string }>>('/api/sites')
        .then((sites) => {
          const site = sites.find(s => s.lat && s.lon);
          if (site) setPreviewSite({ id: site.id, name: site.name, lat: parseFloat(site.lat), lon: parseFloat(site.lon) });
        })
        .catch(() => {});
    }
  }, [previewSite]);

  useEffect(() => {
    if (showPreview) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [showPreview]);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-navy">
            <Activity className="w-5 h-5 mr-2 text-sky" />
            Wind Map
          </CardTitle>
          <CardDescription>
            Three-layer animated wind map with base map, speed colour overlay, and particle streaks. Particle settings are tuned per zoom level (Z0/Z5/Z10) with smooth interpolation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {previewSite && (
            <Button variant="outline" onClick={() => setShowPreview(true)} className="flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Preview Wind Map
            </Button>
          )}
        </CardContent>
      </Card>

      {showPreview && previewSite && createPortal(
        <div className="fixed inset-0 z-[10001] bg-black flex flex-col" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-3 py-2 bg-black/90 border-b border-white/10 shrink-0">
            <p className="text-white/80 text-xs font-semibold truncate">
              Preview — {previewSite.name}
            </p>
            <button
              onClick={() => setShowPreview(false)}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white shrink-0 ml-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <Suspense fallback={<div className="w-full h-full flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky"></div></div>}>
              <WindMap siteId={previewSite.id} siteLat={previewSite.lat} siteLon={previewSite.lon} siteName={previewSite.name} fullscreen />
            </Suspense>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export function AdminWeather() {
  const { settings } = useSettings();
  const { token } = useAuth();
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeMessage, setScrapeMessage] = useState("");

  const handleScrapeNow = async () => {
    setIsScraping(true);
    setScrapeMessage("");
    try {
      const data = await api.post<{ success?: boolean }>("/api/weather/scrape-now", {}, token);
      if (data.success) {
        setScrapeMessage("Update successful!");
        toast.success("Weather data updated");
        setTimeout(() => setScrapeMessage(""), 3000);
      } else {
        setScrapeMessage("Update failed.");
      }
    } catch {
      setScrapeMessage("Error connecting to server.");
    } finally {
      setIsScraping(false);
    }
  };

  return (
    <div className="bg-background min-h-screen py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link to="/admin" className="inline-flex items-center text-sky hover:text-navy transition-colors mb-4">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Dashboard
          </Link>
          <h1 className="text-3xl font-extrabold text-navy mb-2">Weather Management</h1>
          <p className="text-muted-foreground">Manage weather data scraping and preview the wind map.</p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center text-navy">
                    <Wind className="w-5 h-5 mr-2 text-sky" />
                    Weather Data
                  </CardTitle>
                  <CardDescription>
                    Weather data is fetched automatically every 15–30 minutes during daylight hours (7am–8pm Melbourne time).
                    {settings.weatherScraperLastRun && (
                      <span className="block mt-1 text-emerald-600 font-medium">
                        Last Update: {new Date(settings.weatherScraperLastRun).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' })} (Melbourne Time)
                      </span>
                    )}
                  </CardDescription>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleScrapeNow}
                    disabled={isScraping}
                    className="flex items-center gap-2"
                  >
                    <RefreshCw className={`w-4 h-4 ${isScraping ? 'animate-spin' : ''}`} />
                    {isScraping ? "Fetching..." : "Fetch Now"}
                  </Button>
                  {scrapeMessage && (
                    <span className={`text-xs font-medium ${scrapeMessage.includes('failed') || scrapeMessage.includes('Error') ? 'text-red-500' : 'text-emerald-500'}`}>
                      {scrapeMessage}
                    </span>
                  )}
                </div>
              </div>
            </CardHeader>
          </Card>

          <WindMapPreviewCard />
        </div>
      </div>
    </div>
  );
}
