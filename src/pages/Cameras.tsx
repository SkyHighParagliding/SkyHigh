import { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useSettings } from "@/contexts/SettingsContext";
import { useWebcamSites } from "@/hooks/useWebcams";
import { WebcamViewer } from "@/components/webcams/WebcamViewer";

export function Cameras() {
  const { settings, loading: settingsLoading } = useSettings();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const sitesQ = useWebcamSites();
  const sites = sitesQ.data ?? [];
  const requested = params.get("site");
  const site = sites.find(s => s.siteId === requested) ?? sites[0];

  useEffect(() => {
    if (!settingsLoading && settings.camerasEnabled === false) {
      navigate("/", { replace: true });
      return;
    }
    window.scrollTo(0, 0);
  }, [settings.camerasEnabled, settingsLoading, navigate]);

  return (
    <div style={{ background: "var(--body-bg)" }} className="min-h-screen py-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <h1 className="text-3xl font-bold text-ink mb-1">Cameras</h1>
        <p className="text-foreground-secondary mb-5">
          Recent images from the club's cameras. Scrub through the day, play it as a timelapse, or compare with an earlier time.
        </p>

        {sitesQ.isLoading && (
          <div className="flex items-center justify-center min-h-[300px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
          </div>
        )}

        {!sitesQ.isLoading && !site && (
          <div className="rounded-xl border border-border-subtle p-8 text-center text-foreground-secondary">
            No cameras are available right now.
          </div>
        )}

        {site && (
          <>
            {sites.length > 1 && (
              <div className="flex flex-wrap gap-2 mb-3" role="tablist" aria-label="Camera sites">
                {sites.map(s => (
                  <button
                    key={s.siteId}
                    type="button"
                    role="tab"
                    aria-selected={s.siteId === site.siteId}
                    onClick={() => setParams({ site: s.siteId })}
                    className={`px-3 py-1.5 rounded-full text-sm border ${s.siteId === site.siteId ? "bg-ink text-white border-ink" : "border-border-subtle text-ink hover:bg-black/5"}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
            <WebcamViewer key={site.siteId} siteId={site.siteId} variant="page" syncUrl allowCompare />
            {site.siteName && (
              <p className="mt-4 text-sm text-foreground-secondary">
                <Link to={`/sites/${encodeURIComponent(site.siteId)}`} className="underline hover:text-ink">
                  {site.siteName} site guide and forecast
                </Link>
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
