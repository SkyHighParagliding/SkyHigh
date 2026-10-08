import { Suspense, lazy, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Maximize2 } from "lucide-react";
import { useSettings } from "@/contexts/SettingsContext";
import { useWebcamLatest, useWebcamSites } from "@/hooks/useWebcams";
import { ageText, formatClock } from "@/lib/webcamTime";
import { LegacyVentuskyWebcams, hasLegacyVentuskyWebcams } from "./LegacyVentuskyWebcams";

const WebcamViewer = lazy(() => import("@/components/webcams/WebcamViewer").then(m => ({ default: m.WebcamViewer })));

function fmtHour(minutes: number): string {
  const h = Math.round(minutes / 60) % 24;
  return `${h % 12 === 0 ? 12 : h % 12} ${h >= 12 ? "pm" : "am"}`;
}

/**
 * Per-site camera tiles on the weather card. Images come from our own archive
 * (see wiki/future/flowerdale-cameras-plan.md): the newest frame per camera,
 * refreshed every couple of minutes. Tapping a tile opens the timelapse viewer.
 * If the site has no archived feed (or the API is down) it falls back to the
 * legacy Ventusky tiles, which are to be deleted once the archive is proven.
 */
export function SiteWebcamPanel({ site }: { site: { id?: string } }) {
  const siteId = site?.id;
  const { settings } = useSettings();
  const sitesQ = useWebcamSites();
  const hasFeed = !!siteId && !!sitesQ.data?.some(s => s.siteId === siteId);
  const latestQ = useWebcamLatest(hasFeed ? siteId : undefined);
  const [viewerCam, setViewerCam] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!siteId) return null;
  const legacy = hasLegacyVentuskyWebcams(siteId) ? <LegacyVentuskyWebcams site={site} /> : null;
  if (sitesQ.isLoading) return null;
  if (!hasFeed) return legacy;
  if (latestQ.isLoading) return null;
  const latest = latestQ.data;
  if (!latest || latest.cameras.length === 0) return legacy;

  const tz = latest.timezone;
  const newest = latest.newestAt!;
  const statusText =
    latest.status === "live" ? `Updated ${formatClock(newest, tz)}. New images about every 6 minutes.`
    : latest.status === "overnight" ? `Last image ${ageText(newest, nowMs)}. Cameras run about ${fmtHour(latest.expectFromMin)} to ${fmtHour(latest.expectToMin)}.`
    : `Camera feed delayed. Last image ${ageText(newest, nowMs)}.`;

  return (
    <div className="w-full mt-3">
      <div className="rounded-xl p-3" style={{ background: "#f5f5f7" }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#86868b" }}>
            Cameras
          </span>
          {settings.camerasEnabled !== false && (
            <Link
              to={`/cameras?site=${encodeURIComponent(siteId)}`}
              className="text-[10px] font-medium hover:opacity-80"
              style={{ color: "#86868b" }}
            >
              All cameras and timelapse
            </Link>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {latest.cameras.map(cam => (
            <button
              key={cam.camera}
              type="button"
              onClick={() => setViewerCam(cam.camera)}
              className="group relative rounded-lg overflow-hidden aspect-[4/3]"
              style={{ background: "rgba(0,0,0,0.05)" }}
              aria-label={`Open ${cam.label} camera and timelapse`}
            >
              <img
                src={cam.thumb}
                alt={`${latest.label} ${cam.label} camera`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[10px] font-bold text-white" style={{ background: "rgba(0,0,0,0.55)" }}>
                {cam.label}
              </span>
              <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-[10px] font-semibold text-white" style={{ background: "rgba(0,0,0,0.55)" }}>
                {ageText(cam.capturedAt, nowMs)}
              </span>
              <span className="absolute bottom-1 right-1 p-1 rounded text-white opacity-80 group-hover:opacity-100 transition-opacity" style={{ background: "rgba(0,0,0,0.55)" }}>
                <Maximize2 className="w-3 h-3" />
              </span>
            </button>
          ))}
        </div>

        <p className="mt-2 text-[10px]" style={{ color: latest.status === "stale" ? "#b45309" : "#86868b" }}>
          {statusText} Tap an image for the timelapse.
        </p>
      </div>

      {viewerCam && (
        <Suspense fallback={null}>
          <WebcamViewer siteId={siteId} variant="modal" initialCamera={viewerCam} onClose={() => setViewerCam(null)} />
        </Suspense>
      )}
    </div>
  );
}
