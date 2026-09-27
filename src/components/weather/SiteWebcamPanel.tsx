import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, X } from 'lucide-react';

/**
 * SiteWebcamPanel — per-site camera tiles with tap-to-fullscreen.
 *
 * Source: Ventusky's **`latest_medium.jpg`** (600×450), the always-current frame
 * Ventusky itself serves.
 *
 * Why not myairportcams directly: it geo-blocks Australian IPs (our audience)
 * with a placeholder — a non-AU/VPN IP gets the live frame. Ventusky re-hosts
 * on a neutral global CDN that loads from Melbourne.
 *
 * Why `latest_medium.jpg` and not the `/hour/YYYYMMDD_HH00.jpg` archive: the
 * hourly archive files are cached per CDN edge and lag badly/inconsistently
 * (one edge stuck ~11h behind), which made the tiles show stale frames. The
 * `latest_*` endpoints are served fresh across edges and always point at the
 * newest capture — matching what the Ventusky webcam page shows. The full-res
 * (1920×1440) frame is only in the laggy archive, so 600×450 is the best
 * reliably-current resolution available.
 *
 * When an unblocked/operator feed (option A) or the Windy Webcams API (option B)
 * is arranged, point `latestUrl` at the new source — everything else stays.
 */

interface Cam {
  label: string;         // 'North' | 'South'
  ventuskyShard: number; // Ventusky data shard (28 / 29)
  ventuskyId: string;    // Ventusky webcam id
  pageUrl: string;       // Ventusky webcam page (credit link)
}

interface WebcamConfig {
  credit: string;
  note: string;
  cams: Cam[];
}

const SITE_WEBCAMS: Record<string, WebcamConfig> = {
  'three-sisters-flowerdale': {
    credit: 'ventusky.com',
    note: 'Live camera via Ventusky — the capture time is stamped on each image. Tap to enlarge.',
    cams: [
      { label: 'North', ventuskyShard: 28, ventuskyId: '165011228', pageUrl: 'https://www.ventusky.com/webcam-165011228' },
      { label: 'South', ventuskyShard: 29, ventuskyId: '165011229', pageUrl: 'https://www.ventusky.com/webcam-165011229' },
    ],
  },
};

// The offline/not-ingested placeholder Ventusky returns is a 1024×768 PNG; a
// real latest_medium frame is 600 wide. Anything wider is the placeholder.
const PLACEHOLDER_MIN_WIDTH = 700;

/** Always-current medium frame. `bucket` (a coarse time bucket) forces the
 *  browser to refetch the newest capture periodically. */
function latestUrl(cam: Cam, bucket: number): string {
  return `https://webcams.ventusky.com/data/${cam.ventuskyShard}/${cam.ventuskyId}/latest_medium.jpg?t=${bucket}`;
}

function CamImg({
  cam, bucket, className, style, onOffline,
}: {
  cam: Cam;
  bucket: number;
  className?: string;
  style?: React.CSSProperties;
  onOffline?: (v: boolean) => void;
}) {
  return (
    <img
      src={latestUrl(cam, bucket)}
      alt={`Flowerdale ${cam.label} camera`}
      className={className}
      style={style}
      loading="lazy"
      onError={() => onOffline?.(true)}
      onLoad={(e) => onOffline?.(e.currentTarget.naturalWidth >= PLACEHOLDER_MIN_WIDTH || e.currentTarget.naturalWidth === 0)}
    />
  );
}

function FullscreenViewer({ cam, bucket, onClose }: { cam: Cam; bucket: number; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // Portal to <body> so `fixed inset-0` is viewport-relative, not trapped in the
  // weather card's transformed/overflow-clipped ancestor (the outlook panel).
  return createPortal(
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.97)' }}
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute p-2 rounded-full text-white"
        style={{
          top: 'max(1rem, env(safe-area-inset-top))',
          right: 'max(1rem, env(safe-area-inset-right))',
          background: 'rgba(255,255,255,0.15)',
        }}
        aria-label="Close"
      >
        <X className="w-6 h-6" />
      </button>
      <figure className="flex flex-col items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <CamImg
          cam={cam}
          bucket={bucket}
          className="object-contain rounded-lg"
          style={{ maxHeight: '85vh', maxWidth: '95vw', width: 'auto', height: 'auto' }}
        />
        <figcaption className="text-white/80 text-xs font-semibold uppercase tracking-widest">
          {cam.label} view
        </figcaption>
      </figure>
    </div>,
    document.body,
  );
}

function CamThumb({ cam, bucket, onOpen }: { cam: Cam; bucket: number; onOpen: () => void }) {
  const [offline, setOffline] = useState(false);

  return (
    <button
      onClick={onOpen}
      className="group relative rounded-lg overflow-hidden aspect-[4/3]"
      style={{ background: 'rgba(0,0,0,0.05)' }}
      aria-label={`Open ${cam.label} camera full screen`}
    >
      <CamImg cam={cam} bucket={bucket} className="w-full h-full object-cover" onOffline={setOffline} />
      {offline && (
        <span className="absolute inset-0 flex items-center justify-center text-center px-2 text-[11px] font-semibold" style={{ background: 'rgba(0,0,0,0.35)', color: '#fff' }}>
          Camera offline
        </span>
      )}
      <span
        className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[10px] font-bold text-white"
        style={{ background: 'rgba(0,0,0,0.55)' }}
      >
        {cam.label}
      </span>
      <span
        className="absolute bottom-1 right-1 p-1 rounded text-white opacity-80 group-hover:opacity-100 transition-opacity"
        style={{ background: 'rgba(0,0,0,0.55)' }}
      >
        <Maximize2 className="w-3 h-3" />
      </span>
    </button>
  );
}

/** Coarse ~5-minute bucket so <img> refetches the newest capture over time. */
function currentBucket(): number {
  return Math.floor(Date.now() / (5 * 60 * 1000));
}

export function SiteWebcamPanel({ site }: { site: { id?: string } }) {
  const config = site?.id ? SITE_WEBCAMS[site.id] : undefined;
  const [openCam, setOpenCam] = useState<Cam | null>(null);
  const [bucket, setBucket] = useState(currentBucket);

  useEffect(() => {
    if (!config) return;
    const t = setInterval(() => setBucket(currentBucket()), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [config]);

  if (!config) return null;

  return (
    <div className="w-full mt-3">
      <div className="rounded-xl p-3" style={{ background: '#f5f5f7' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#86868b' }}>
            Cameras
          </span>
          <a
            href={config.cams[0]?.pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-medium hover:opacity-80"
            style={{ color: '#86868b' }}
          >
            {config.credit}
          </a>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {config.cams.map(cam => (
            <CamThumb key={cam.label} cam={cam} bucket={bucket} onOpen={() => setOpenCam(cam)} />
          ))}
        </div>

        <p className="mt-2 text-[10px]" style={{ color: '#86868b' }}>{config.note}</p>
      </div>

      {openCam && <FullscreenViewer cam={openCam} bucket={bucket} onClose={() => setOpenCam(null)} />}
    </div>
  );
}
