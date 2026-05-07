import { useEffect, useState, useRef, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { createPortal } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Activity, Wind, RefreshCw, Eye, X, ArrowLeft, Map } from "lucide-react";
import { GridBoundsSelector } from "@/components/GridBoundsSelector";

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
      api.get<{ data: Array<{ id: string; name: string; lat: string; lon: string }> }>('/api/sites')
        .then((response) => {
          const site = response.data.find(s => s.lat && s.lon);
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
  const { settings, refreshSettings } = useSettings();
  const { token } = useAuth();
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeMessage, setScrapeMessage] = useState("");
  const [loadingType, setLoadingType] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [showGridSelector, setShowGridSelector] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startStatusPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    let ticks = 0;
    pollRef.current = setInterval(async () => {
      await refreshSettings();
      ticks++;
      if (ticks >= 12) {
        clearInterval(pollRef.current!);
        pollRef.current = null;
      }
    }, 5000);
  };

  const handleTrigger = async (endpoint: string, type: string) => {
    setLoadingType(type);
    setMessages(prev => ({ ...prev, [type]: "" }));
    try {
      const data = await api.post<{ success?: boolean; message?: string }>(endpoint, {}, token);
      const message = data.message || "Failed to download data";
      setMessages(prev => ({ ...prev, [type]: message }));

      if (data.success) {
        toast.success(`${type}: ${message}`);
        setTimeout(() => setMessages(prev => ({ ...prev, [type]: "" })), 5000);
        startStatusPolling();
      } else {
        toast.error(`${type}: ${message}`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Network error - check server connection";
      setMessages(prev => ({ ...prev, [type]: errorMsg }));
      toast.error(errorMsg);
    } finally {
      setLoadingType(null);
    }
  };

  const handleScrapeNow = async () => {
    await handleTrigger("/api/weather/scrape-now", "liveWeather");
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
                    Live Weather Data
                  </CardTitle>
                  <CardDescription>
                    Live weather observations fetched automatically every 15–30 minutes during daylight hours (7am–8pm Melbourne time).
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
                    disabled={loadingType !== null}
                    className="flex items-center gap-2"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingType === 'liveWeather' ? 'animate-spin' : ''}`} />
                    {loadingType === 'liveWeather' ? "Fetching..." : "Fetch Now"}
                  </Button>
                  {messages.liveWeather && (
                    <span className={`text-xs font-medium ${
                      messages.liveWeather.toLowerCase().includes('failed') || messages.liveWeather.toLowerCase().includes('error') ? 'text-red-500' :
                      messages.liveWeather.toLowerCase().includes('rate limited') || messages.liveWeather.toLowerCase().includes('partial') ? 'text-amber-500' :
                      'text-emerald-500'
                    }`}>
                      {messages.liveWeather}
                    </span>
                  )}
                </div>
              </div>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center text-navy">
                    <Wind className="w-5 h-5 mr-2 text-sky" />
                    Wind Grid Data
                  </CardTitle>
                  <CardDescription>
                    Wind grid data downloaded daily at 5:00am (Fine), 5:13am (Coarse), and 5:30am (Extended). Cached for entire day.
                  </CardDescription>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-4">
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTrigger("/api/weather/extended-forecast/fetch-now", "extended")}
                    disabled={loadingType !== null}
                    className="flex items-center gap-2 whitespace-nowrap"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingType === 'extended' ? 'animate-spin' : ''}`} />
                    {loadingType === 'extended' ? "Fetching..." : "Extended"}
                  </Button>
                  {messages.extended && (
                    <span className={`text-xs font-medium text-center ${
                      messages.extended.toLowerCase().includes('failed') || messages.extended.toLowerCase().includes('error') ? 'text-red-500' :
                      messages.extended.toLowerCase().includes('rate limited') || messages.extended.toLowerCase().includes('partial') ? 'text-amber-500' :
                      'text-emerald-500'
                    }`}>
                      {messages.extended}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTrigger("/api/weather/fine-grid/fetch-now", "fine")}
                    disabled={loadingType !== null}
                    className="flex items-center gap-2 whitespace-nowrap"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingType === 'fine' ? 'animate-spin' : ''}`} />
                    {loadingType === 'fine' ? "Fetching..." : "Fine Grid"}
                  </Button>
                  {messages.fine && (
                    <span className={`text-xs font-medium text-center ${
                      messages.fine.toLowerCase().includes('failed') || messages.fine.toLowerCase().includes('error') ? 'text-red-500' :
                      messages.fine.toLowerCase().includes('rate limited') || messages.fine.toLowerCase().includes('partial') ? 'text-amber-500' :
                      'text-emerald-500'
                    }`}>
                      {messages.fine}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTrigger("/api/weather/coarse-grid/fetch-now", "coarse")}
                    disabled={loadingType !== null}
                    className="flex items-center gap-2 whitespace-nowrap"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingType === 'coarse' ? 'animate-spin' : ''}`} />
                    {loadingType === 'coarse' ? "Fetching..." : "Coarse Grid"}
                  </Button>
                  {messages.coarse && (
                    <span className={`text-xs font-medium text-center ${
                      messages.coarse.toLowerCase().includes('failed') || messages.coarse.toLowerCase().includes('error') ? 'text-red-500' :
                      messages.coarse.toLowerCase().includes('rate limited') || messages.coarse.toLowerCase().includes('partial') ? 'text-amber-500' :
                      'text-emerald-500'
                    }`}>
                      {messages.coarse}
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-border space-y-1">
                {([
                  { label: "Fine grid", runKey: "fineGridLastRun", resultKey: "fineGridLastResult" },
                  { label: "Coarse grid", runKey: "coarseGridLastRun", resultKey: "coarseGridLastResult" },
                  { label: "Extended (7-day)", runKey: "extendedForecastLastRun", resultKey: "extendedForecastLastResult" },
                ] as const).map(({ label, runKey, resultKey }) => {
                  const lastRun = settings[runKey as keyof typeof settings] as string | undefined;
                  const lastResult = settings[resultKey as keyof typeof settings] as string | undefined;
                  const ok = lastResult === "ok";
                  return (
                    <div key={label} className="flex items-start gap-2 text-xs">
                      <span className="text-muted-foreground w-28 shrink-0">{label}</span>
                      {lastRun ? (
                        <span className={ok ? "text-emerald-600" : "text-red-500"}>
                          {ok ? "✓" : "✗"} {new Date(lastRun).toLocaleString("en-AU", { timeZone: "Australia/Melbourne", dateStyle: "short", timeStyle: "short" })}
                          {!ok && ` — ${lastResult}`}
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic">Never run</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 pt-3 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowGridSelector(true)}
                  className="flex items-center gap-2"
                >
                  <Map className="w-4 h-4" />
                  Configure Grid Areas
                </Button>
              </div>
            </CardHeader>
          </Card>

          <GridBoundsSelector
            isOpen={showGridSelector}
            onClose={() => setShowGridSelector(false)}
            onSaved={() => {
              setMessages(prev => ({ ...prev, fine: "", coarse: "" }));
            }}
          />

          <WindMapPreviewCard />
        </div>
      </div>
    </div>
  );
}
