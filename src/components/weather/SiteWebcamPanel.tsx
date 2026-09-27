import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, X } from 'lucide-react';

/**
 * SiteWebcamPanel — per-site camera thumbnails with tap-to-fullscreen.
 *
 * STOPGAP (option C): images are hot-linked from Ventusky's webcam CDN.
 *
 * Why Ventusky and not myairportcams directly: the myairportcams feed
 * (the actual camera operator) geo-blocks Australian IPs — i.e. exactly our
 * audience — serving them a placeholder. Ventusky re-hosts the same frames on
 * a neutral global CDN that loads fine from Melbourne, at 1920x1440. The trade
 * is cadence: Ventusky only publishes ~hourly (with up to ~1h lag), whereas the
 * operator's own page updates every ~10 min.
 *
 * When a direct/unblocked feed from the operator (option A) or the Windy
 * Webcams API (option B) is arranged, point `cams` at the new URLs — the
 * candidate/placeholder-skip logic below stays the same.
 */

interface Cam {
  label: string;         // 'North' | 'South'
  ventuskyShard: number; // Ventusky data shard (28 / 29)
  ventuskyId: string;    // Ventusky webcam id
  pageUrl: string;       // Ventusky webcam page (for the credit link)
}

interface WebcamConfig {
  credit: string;
  note: string;
  cams: Cam[];
}

const SITE_WEBCAMS: Record<string, WebcamConfig> = {
  'three-sisters-flowerdale': {
    credit: 'ventusky.com',
    note: 'Camera images via Ventusky, refreshed roughly hourly. Tap for the full-size view.',
    cams: [
      { label: 'North', ventuskyShard: 28, ventuskyId: '165011228', pageUrl: 'https://www.ventusky.com/webcam-165011228' },
      { label: 'South', ventuskyShard: 29, ventuskyId: '165011229', pageUrl: 'https://www.ventusky.com/webcam-165011229' },
    ],
  },
};

/** YYYYMMDD_HH00 for `offsetHours` ago, in Melbourne local time. */
function melbourneHourStamp(offsetHours: number): string {
  const d = new Date(Date.now() - offsetHours * 3_600_000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const g = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return `${g('year')}${g('month')}${g('day')}_${g('hour')}00`;
}

function ventuskyUrl(cam: Cam, offsetHours: number, bust: number): string {
  return `https://webcams.ventusky.com/data/${cam.ventuskyShard}/${cam.ventuskyId}/hour/${melbourneHourStamp(offsetHours)}.jpg?b=${bust}`;
}

/**
 * Renders the most recent real frame for a camera.
 *
 * Ventusky returns a 1024x768 PNG placeholder (~6 KB) for hours it hasn't
 * ingested yet (top of the current hour, overnight, or a stale CDN edge), with
 * an HTTP 200 — so `onError` alone won't catch it. Real frames are always
 * 1920x1440, so we treat anything narrower as a placeholder: walk back through
 * recent hours, skipping placeholders, and land on the latest genuine capture.
 */
const REAL_FRAME_MIN_WIDTH = 1600; // real = 1920 wide; placeholder = 1024
function VentuskyCamImg({
  cam, bust, className, style, onUnavailable,
}: {
  cam: Cam;
  bust: number;
  className?: string;
  style?: React.CSSProperties;
  onUnavailable?: (v: boolean) => void;
}) {
  const candidates = useMemo(
    () => Array.from({ length: 12 }, (_, o) => ventuskyUrl(cam, o, bust)),
    [cam, bust],
  );
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); onUnavailable?.(false); }, [candidates, onUnavailable]);

  const advance = () => setIdx(i => {
    const next = i + 1;
    if (next >= candidates.length) { onUnavailable?.(true); return i; }
    return next;
  });

  return (
    <img
      src={candidates[idx]}
      alt={`Flowerdale ${cam.label} camera`}
      className={className}
      style={style}
      loading="lazy"
      onError={advance}
      onLoad={(e) => { if (e.currentTarget.naturalWidth > 0 && e.currentTarget.naturalWidth < REAL_FRAME_MIN_WIDTH) advance(); }}
    />
  );
}

function FullscreenViewer({ cam, bust, onClose }: { cam: Cam; bust: number; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    // Lock background scroll while the overlay is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // Portal to <body> so `fixed inset-0` is relative to the viewport, not a
  // transformed/overflow-clipped ancestor (the sliding outlook panel) — that
  // ancestor was trapping the overlay inside the card and clipping the image.
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
      <figure
        className="flex flex-col items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <VentuskyCamImg
          cam={cam}
          bust={bust}
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

function CamThumb({ cam, bust, onOpen }: { cam: Cam; bust: number; onOpen: () => void }) {
  const [unavailable, setUnavailable] = useState(false);

  return (
    <button
      onClick={onOpen}
      className="group relative rounded-lg overflow-hidden aspect-[4/3]"
      style={{ background: 'rgba(0,0,0,0.05)' }}
      aria-label={`Open ${cam.label} camera full screen`}
    >
      <VentuskyCamImg
        cam={cam}
        bust={bust}
        className="w-full h-full object-cover"
        onUnavailable={setUnavailable}
      />
      {unavailable && (
        <span className="absolute inset-0 flex items-center justify-center text-center px-2 text-[10px] font-medium" style={{ color: '#86868b' }}>
          Camera image unavailable
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

export function SiteWebcamPanel({ site }: { site: { id?: string } }) {
  const config = site?.id ? SITE_WEBCAMS[site.id] : undefined;
  const [openCam, setOpenCam] = useState<Cam | null>(null);
  const [bust, setBust] = useState(0);

  // Re-derive the current hour + bust the cache every 10 min (Ventusky's cadence).
  useEffect(() => {
    if (!config) return;
    const t = setInterval(() => setBust(b => b + 1), 10 * 60 * 1000);
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
            <CamThumb key={cam.label} cam={cam} bust={bust} onOpen={() => setOpenCam(cam)} />
          ))}
        </div>

        <p className="mt-2 text-[10px]" style={{ color: '#86868b' }}>{config.note}</p>
      </div>

      {openCam && <FullscreenViewer cam={openCam} bust={bust} onClose={() => setOpenCam(null)} />}
    </div>
  );
}
