import { X } from 'lucide-react';
import { createPortal } from 'react-dom';

/** Cumulus glyph — the exact three-dome-on-a-flat-base shape the map draws (traceCumulus). */
const CumulusGlyph = () => (
  <svg width="22" height="16" viewBox="0 0 16 11" aria-hidden="true">
    <path fill="white" d="M2.52 9 A2.48 2.48 0 0 1 7.48 9 L4.8 7.4 A3.2 3.2 0 0 1 11.2 7.4 L9 8.8 A2.2 2.2 0 0 1 13.4 8.8 L2.52 9 Z" />
  </svg>
);

/** Overcast swatch — the grey sheet the map lays over overcast cells. */
const OvercastGlyph = () => (
  <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden="true">
    <rect width="22" height="14" rx="2" fill="rgb(150,154,160)" />
  </svg>
);

/** OD triangles — apex-up; hollow = watch, filled = likely (white here for the dark panel). */
const TriangleGlyph = ({ filled }: { filled: boolean }) => (
  <svg width="11" height="11" viewBox="0 0 11 11" className="shrink-0" aria-hidden="true">
    <path d="M5.5 1 L10 10 L1 10 Z" fill={filled ? 'white' : 'none'} stroke="white" strokeWidth={filled ? 0 : 1.2} />
  </svg>
);

export function ThermalHelpModal({ onClose, variant = 'map' }: { onClose: () => void; variant?: 'map' | 'wind' | 'chart' | 'skewt' }) {
  const title =
    variant === 'skewt' ? 'Reading the SkewT'
    : variant === 'chart' ? 'Reading the Meteogram'
    : variant === 'wind' ? 'Reading the Wind Map'
    : 'Reading the Thermal Map';

  return createPortal(
    <div
      className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#1a1f2e] border border-white/10 rounded-2xl w-full max-w-sm max-h-[82vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/10">
          <h3 className="text-white font-bold text-sm tracking-wide">{title}</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4 text-[11px] leading-relaxed">

          {/* ── WIND MAP ─────────────────────────────────────────────────── */}
          {variant === 'wind' && (
            <>
              <section>
                <div className="text-sky-400 font-bold uppercase tracking-wide text-[10px] mb-1">What it shows</div>
                <p className="text-white/70">Forecast surface wind across the state at the selected time. <span className="text-white/90">Colour is wind speed</span>; the drifting streaks trace <span className="text-white/90">wind flow</span> — they move the way the air is moving.</p>
                <div className="mt-2 h-2.5 w-full rounded-full" style={{ background: 'linear-gradient(to right, rgb(58,40,130), rgb(30,140,200), rgb(40,180,100), rgb(220,200,30), rgb(230,140,20), rgb(210,60,30), rgb(180,30,60))' }} />
                <div className="flex justify-between mt-1 text-[10px] font-mono text-white/50"><span>0</span><span>5</span><span>10</span><span>15</span><span>20+ kt</span></div>
              </section>

              <section>
                <div className="text-sky-400 font-bold uppercase tracking-wide text-[10px] mb-1">Tap a point</div>
                <p className="text-white/70">Tap anywhere for the exact <span className="text-white/90">wind speed and direction</span> (the compass bearing the wind blows <em>from</em>) and the <span className="text-white/90">ground elevation</span> at that spot. Tap the ground/altitude figure to switch m/ft.</p>
              </section>

              <section>
                <div className="text-sky-400 font-bold uppercase tracking-wide text-[10px] mb-1">Site markers</div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-white/75">
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white/50 shrink-0" /><span>Club site</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-sky-500 border border-white/50 shrink-0" /><span>Other site</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 border border-white/50 shrink-0" /><span>Restricted</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 border border-white/50 shrink-0" /><span>Closed</span></div>
                </div>
                <p className="text-white/50 mt-1.5">Use the bottom timeline to scrub the day (or the 7-day forecast) — press play to animate.</p>
              </section>
            </>
          )}

          {/* ── METEOGRAM (CHART) ────────────────────────────────────────── */}
          {variant === 'chart' && (
            <section>
              <div className="text-amber-400 font-bold uppercase tracking-wide text-[10px] mb-1">What the chart shows</div>
              <p className="text-white/70">One site through the day: time runs left→right (10am–8pm), altitude bottom→top.</p>
              <ul className="mt-1.5 space-y-1 text-white/70">
                <li><span className="font-medium"><span style={{ color: '#22c55e' }}>■</span> <span style={{ color: '#f59e0b' }}>■</span> <span style={{ color: '#cbd5e1' }}>■</span> Flying-window bar</span> (top) — flyability each hour: green = on, amber = marginal, grey = off.</li>
                <li><span className="text-white/90 font-medium">Dark dashed line (BL Top)</span> — how high thermals reach each hour.</li>
                <li><span style={{ color: '#38bdf8' }} className="font-medium">Sky-blue dashed line (Cu Base)</span> — cloud base, shown only where cumulus form below BL Top. When present it is your <em>effective</em> ceiling.</li>
                <li><span style={{ color: '#0071e3' }} className="font-medium">Blue dashed line</span> — launch height; the gap above it is your working altitude.</li>
                <li><span className="text-white/90 font-medium">Coloured band</span> — thermal strength that hour (same colours as the map).</li>
                <li><span className="text-white/90 font-medium">Sky row</span> — ☁ cumulus · ▨ overcast · 🌧 rain · · clear.</li>
                <li><span className="text-white/90 font-medium">Wind row</span> — surface wind each hour: knots over the direction it blows <em>from</em>.</li>
              </ul>
              <p className="text-white/50 mt-1.5">Drag across the chart for a readout at any hour. Tap an altitude to switch m/ft.</p>
            </section>
          )}

          {/* ── SKEWT ────────────────────────────────────────────────────── */}
          {variant === 'skewt' && (
            <>
              <section>
                <div className="text-amber-400 font-bold uppercase tracking-wide text-[10px] mb-1">The three lines</div>
                <p className="text-white/70">A vertical slice of the air above the point you tapped, at the scrubber's time. Height runs up the side (capped near a paraglider's ceiling). Three lines run diagonally:</p>
                <ul className="mt-1.5 space-y-1 text-white/70">
                  <li><span style={{ color: '#e03131' }} className="font-medium">Red — air temperature</span> at each height.</li>
                  <li><span style={{ color: '#2f9e44' }} className="font-medium">Green — dewpoint</span> (moisture). The gap between red and green is how dry the air is: wide = dry, touching = saturated (cloud).</li>
                  <li><span style={{ color: '#f08c00' }} className="font-medium">Orange dashed — the parcel</span>: a bubble of air rising from the ground. This <em>is</em> the thermal.</li>
                </ul>
              </section>

              <section>
                <div className="text-amber-400 font-bold uppercase tracking-wide text-[10px] mb-1">The rule that matters</div>
                <p className="text-white/70">The thermal keeps rising while the <span style={{ color: '#f08c00' }}>orange parcel</span> is <span className="text-white/90">warmer than (right of)</span> the <span style={{ color: '#e03131' }}>red</span> line. Where orange crosses back to the left of red, it stops — that's the <span className="text-white/90">thermal top</span>. If the parcel first touches <span style={{ color: '#2f9e44' }}>green</span>, a cumulus forms and that height is <span style={{ color: '#1971c2' }} className="font-medium">cloudbase</span>; if it tops out before then, it's a <span className="text-amber-400 font-medium">blue day</span>.</p>
              </section>

              <section>
                <div className="text-amber-400 font-bold uppercase tracking-wide text-[10px] mb-1">Drag the orange dot</div>
                <p className="text-white/70">The <span style={{ color: '#f08c00' }} className="font-medium">orange dot at the surface</span> is the trigger temperature — the ground warmth that sets thermals off. It starts at the forecast. <span className="text-white/90">Drag it warmer</span> to ask "if the ground heats to X°, how high will the day go?" — thermal top and cloudbase update live.</p>
              </section>

              <section>
                <div className="text-amber-400 font-bold uppercase tracking-wide text-[10px] mb-1">The data box</div>
                <ul className="mt-0.5 space-y-1 text-white/70">
                  <li><span className="text-white/90 font-medium">Thermal top</span> — the ceiling of the lift (AGL &amp; AMSL).</li>
                  <li><span className="text-white/90 font-medium">Cloudbase</span> (or <span className="text-amber-400">Blue — no cloud</span>) — where cumulus form.</li>
                  <li><span className="text-white/90 font-medium">Wind at top / cloudbase</span> — drift, and whether it's XC-able.</li>
                  <li><span className="text-white/90 font-medium">CAPE</span> — storm/overdevelopment caution (high = watch out).</li>
                </ul>
                <p className="text-white/50 mt-1.5">Drag anywhere on the plot for a level readout. The marks up the right edge are winds aloft — the stem points into wind, the number is knots. Tap any altitude to switch m/ft.</p>
              </section>

              <section className="border-t border-white/10 pt-3">
                <p className="text-white/40 text-[10px]">Sounding derived from ECMWF pressure levels via Open-Meteo, with parcel/LCL from validated thermodynamics. A forecast tool — always make your own assessment before flying.</p>
              </section>
            </>
          )}

          {/* ── THERMAL MAP ──────────────────────────────────────────────── */}
          {variant === 'map' && (<>
          <section>
            <div className="text-amber-400 font-bold uppercase tracking-wide text-[10px] mb-1">Thermal strength</div>
            <p className="text-white/70">The colour overlay is how strong thermals are expected to be at the selected time, based on W* (how fast air rises inside a thermal, in m/s).</p>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
              {[
                { label: 'None',     color: '#a0aec0', desc: 'no soarable lift' },
                { label: 'Weak',     color: '#fae48c', desc: '0.3–0.8 · scratchy' },
                { label: 'Moderate', color: '#fabd4b', desc: '0.8–1.5 · soarable' },
                { label: 'Good',     color: '#e85f1e', desc: '1.5–2.5 · XC possible' },
                { label: 'Strong',   color: '#b21e20', desc: '2.5–3.5 · great XC' },
                { label: 'Extreme',  color: '#780a3c', desc: '3.5+ · caution' },
              ].map(s => (
                <div key={s.label} className="flex items-start gap-1.5">
                  <span className="w-2 h-2 rounded-full mt-0.5 shrink-0" style={{ background: s.color }} />
                  <span><span className="text-white/80 font-medium">{s.label}</span> <span className="text-white/50">{s.desc}</span></span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="text-amber-400 font-bold uppercase tracking-wide text-[10px] mb-1">Reading the sky</div>
            <ul className="mt-0.5 space-y-1.5 text-white/70">
              <li className="flex items-center gap-2">
                <span className="w-[22px] flex justify-center shrink-0"><CumulusGlyph /></span>
                <span><span className="text-white/90 font-medium">Cumulus</span> — density = coverage; size &amp; brightness = cloud depth.</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-[22px] flex justify-center shrink-0"><OvercastGlyph /></span>
                <span><span className="text-white/90 font-medium">Overcast</span> — a grey sheet shading the ground; thermals suppressed.</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-[22px] flex justify-center shrink-0"><span className="inline-block w-3.5 h-2.5 rounded-sm" style={{ background: 'rgb(56,118,209)' }} /></span>
                <span><span className="text-white/90 font-medium">Rain</span> — blue wash; deeper = heavier.</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-[22px] flex justify-center shrink-0" />
                <span><span className="text-white/90 font-medium">Plain (no marks)</span> — a blue day: thermals, but no cloud to mark them.</span>
              </li>
            </ul>
            <div className="mt-2 flex items-start gap-2 text-white/70">
              <span className="w-[22px] flex justify-center gap-0.5 shrink-0 pt-0.5"><TriangleGlyph filled={false} /><TriangleGlyph filled /></span>
              <span><span className="text-white/90 font-medium">Overdevelopment</span> — hollow triangle = watch, filled = likely. Judged from CAPE and stability aloft, so it can appear on a plain blue day or under grey — the absence of cumulus never means the air is calm.</span>
            </div>
          </section>

          <section>
            <div className="text-amber-400 font-bold uppercase tracking-wide text-[10px] mb-1">Tap a point — the numbers</div>
            <ul className="mt-0.5 space-y-1 text-white/70">
              <li><span className="text-white/90 font-mono">BL Top</span> — boundary-layer height: your effective ceiling. 1500–2500m AGL is a good Alpine day; below ~800m is hard work.</li>
              <li><span className="text-white/90 font-mono">Cu Base</span> — height cumulus form. When it sits below BL Top, it is your real ceiling.</li>
              <li><span className="text-white/90 font-medium">W*</span> — expected climb rate; roughly the average you'll get well-centred.</li>
              <li><span className="text-white/90 font-medium">CAPE</span> — storm-risk energy, not lift. &gt;500 J/kg: watch for overdevelopment.</li>
              <li><span className="text-white/90 font-medium">Ground</span> — terrain elevation (AMSL); tap it to switch m/ft.</li>
            </ul>
          </section>
          </>)}

          <section className="border-t border-white/10 pt-3 space-y-1.5">
            {variant === 'map' && (
              <p className="text-white/40 text-[10px]">Data source: ECMWF forecast via Open-Meteo, updated daily. Grid ~0.09° (~10km). A forecast tool — always make your own assessment before flying.</p>
            )}
            {(variant === 'map' || variant === 'wind') && (
              <p className="text-white/40 text-[10px]">
                Ground elevation: <span className="text-white/55">Mapzen/AWS Terrain Tiles</span>. Australian data from the
                {' '}<span className="text-white/55">DEM derived from LiDAR 5 Metre Grid</span> — © Commonwealth of Australia
                {' '}(Geoscience Australia) 2017, used under{' '}
                <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer" className="underline hover:text-white/70">CC BY 4.0</a>.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body
  );
}
