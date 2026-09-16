import { X } from 'lucide-react';
import { createPortal } from 'react-dom';

export function ThermalHelpModal({ onClose, variant = 'map' }: { onClose: () => void; variant?: 'map' | 'chart' | 'skewt' }) {
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
          <h3 className="text-white font-bold text-sm tracking-wide">{variant === 'skewt' ? 'Reading the SkewT' : variant === 'chart' ? 'Reading the Meteogram' : 'Reading the Thermal Map'}</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4 text-[11px] leading-relaxed">

          {variant === 'chart' && (
            <section>
              <div className="text-amber-400 font-bold uppercase tracking-wide text-[10px] mb-1">What the chart shows</div>
              <p className="text-white/70">The meteogram is this <span className="text-white/90">one site</span> through the day: time runs left→right (10am–8pm), altitude runs bottom→top.</p>
              <ul className="mt-1.5 space-y-1 text-white/70">
                <li><span className="font-medium"><span style={{ color: '#22c55e' }}>■</span> <span style={{ color: '#f59e0b' }}>■</span> <span style={{ color: '#cbd5e1' }}>■</span> Flying-window bar</span> (top) — at-a-glance flyability each hour: green = on, amber = marginal (storm risk, overcast, or low ceiling), grey = off (no lift, rain, or ground-hugging).</li>
                <li><span className="text-white/90 font-medium">Dashed black line (BL Top)</span> — how high thermals reach each hour.</li>
                <li><span style={{ color: '#38bdf8' }} className="font-medium">Sky-blue line (Cu Base)</span> — cloud base, shown only when cumulus form (below BL Top). When present it is your <em>effective</em> ceiling — you top out at cloudbase, not BL Top.</li>
                <li><span className="text-white/90 font-medium">Blue dashed line</span> — launch height, so the gap above it is your working altitude.</li>
                <li><span className="text-white/90 font-medium">Coloured band</span> — thermal strength that hour (same colours as the map, see below).</li>
                <li><span className="text-white/90 font-medium">Sky row</span> — ☁ cumulus · ▨ overcast · 🌧 rain · · clear.</li>
                <li><span className="text-white/90 font-medium">Wind row</span> — surface wind each hour: speed in knots over the compass direction it blows <em>from</em> (e.g. 14 / NNW).</li>
              </ul>
              <p className="text-white/50 mt-1.5">Tap and drag across the chart for a readout at any hour. Tap the <span className="text-white/70">m/ft</span> label to switch units.</p>
            </section>
          )}

          {variant === 'skewt' && (
            <>
              <section>
                <div className="text-amber-400 font-bold uppercase tracking-wide text-[10px] mb-1">What the SkewT shows</div>
                <p className="text-white/70">A vertical slice of the atmosphere <span className="text-white/90">above the point you tapped</span>, at the scrubber's time. Height runs up the side (capped near a paraglider's ~10,000&nbsp;ft ceiling — the useless high air is trimmed off). Three lines run diagonally:</p>
                <ul className="mt-1.5 space-y-1 text-white/70">
                  <li><span style={{ color: '#e03131' }} className="font-medium">Red — air temperature</span> at each height.</li>
                  <li><span style={{ color: '#2f9e44' }} className="font-medium">Green — dewpoint</span> (moisture). The <span className="text-white/90">gap between red and green is how dry the air is</span>: wide = dry (blue thermals), touching = saturated (cloud).</li>
                  <li><span style={{ color: '#f08c00' }} className="font-medium">Orange dashed — the parcel</span>: a bubble of air released from the ground and allowed to rise. This <em>is</em> the thermal.</li>
                </ul>
              </section>

              <section>
                <div className="text-amber-400 font-bold uppercase tracking-wide text-[10px] mb-1">The one rule that matters</div>
                <p className="text-white/70">A thermal keeps rising while the <span style={{ color: '#f08c00' }}>orange parcel</span> is <span className="text-white/90">warmer than (to the right of)</span> the <span style={{ color: '#e03131' }}>red</span> line. Where orange crosses back to the left of red, the thermal stops — that's your <span className="text-white/90">thermal top</span>.</p>
                <ul className="mt-1.5 space-y-1 text-white/70">
                  <li>If the parcel reaches saturation (touches <span style={{ color: '#2f9e44' }}>green</span>) <em>before</em> it stops → a cumulus forms; that height is <span style={{ color: '#1971c2' }} className="font-medium">cloudbase</span>.</li>
                  <li>If it tops out before saturating → a <span className="text-amber-400 font-medium">"Blue" day</span>: thermals, but no marker cloud.</li>
                </ul>
              </section>

              <section>
                <div className="text-amber-400 font-bold uppercase tracking-wide text-[10px] mb-1">Drag the orange dot — trigger temperature</div>
                <p className="text-white/70">The <span style={{ color: '#f08c00' }} className="font-medium">orange dot at the surface</span> is the ground temperature that sets off thermals. It starts at the forecast temp. <span className="text-white/90">Drag it right (warmer)</span> to ask <em>"if the ground heats to X°, how high will the day go?"</em> — the thermal top and cloudbase update live. This is the most useful move: it shows how the day builds as it warms, and whether a hot afternoon pushes the top toward your airspace.</p>
              </section>

              <section>
                <div className="text-amber-400 font-bold uppercase tracking-wide text-[10px] mb-1">Drag the plot — level cursor</div>
                <p className="text-white/70">Drag anywhere on the chart to slide a cursor line. The data box then reads that exact height: temperature, dewpoint, and <span className="text-white/90">wind speed &amp; direction</span> there.</p>
              </section>

              <section>
                <div className="text-amber-400 font-bold uppercase tracking-wide text-[10px] mb-1">The data box — the answers</div>
                <ul className="mt-0.5 space-y-1 text-white/70">
                  <li><span className="text-white/90 font-medium">Thermal top</span> — the ceiling of the lift (AGL &amp; AMSL): your working height.</li>
                  <li><span className="text-white/90 font-medium">Cloudbase</span> (or <span className="text-amber-400">"Blue — no cloud"</span>) — where cumulus form.</li>
                  <li><span className="text-white/90 font-medium">Wind at top / at cloudbase</span> — drift and whether it's XC-able or a boating day.</li>
                  <li><span className="text-white/90 font-medium">CAPE</span> — overdevelopment/storm caution (high = watch out).</li>
                  <li><span className="text-white/90 font-medium">Trigger temp</span> — what you're assuming; compare your dragged value to the forecast.</li>
                </ul>
                <p className="text-white/50 mt-1.5">The marks up the right edge are winds aloft — the stem points into wind, the number is knots. Tap any altitude to switch m/ft.</p>
              </section>

              <section>
                <div className="text-amber-400 font-bold uppercase tracking-wide text-[10px] mb-1">A quick workflow</div>
                <p className="text-white/70">Read the forecast thermal top and cloudbase for launch (or anywhere on your route). Drag the trigger a few degrees warmer to see the day's <em>potential</em> and whether the top nears your ceiling. Glance up the wind marks for drift. Then go make your own call.</p>
              </section>

              <section className="border-t border-white/10 pt-3">
                <p className="text-white/40 text-[10px]">Sounding source: ECMWF IFS (0.25°) pressure levels via Open-Meteo, fetched for the point on demand. The parcel/LCL are computed from validated thermodynamics (Bolton 1980). This is a forecast tool — always make your own assessment before flying.</p>
              </section>
            </>
          )}

          {variant !== 'skewt' && (<>
          <section>
            <div className="text-amber-400 font-bold uppercase tracking-wide text-[10px] mb-1">Thermal Strength</div>
            <p className="text-white/70">The colour overlay shows how strong convective lift (thermals) is expected to be across Victoria at the selected time. Based on W* (convective velocity scale), the same quantity RASP and SkySight colour their thermal maps by.</p>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
              {/* Swatch colours sampled from the midpoint of each W* band by
                  interpolating the STOPS table in thermalRenderer.ts.
                    None:     no colour is painted below 0.3 → neutral grey
                    Weak:     W*≈0.55 between stops 0.30→0.80 (t=0.5)  → #fae48c
                    Moderate: W*≈1.15 between stops 0.80→1.20 (t=0.875)→ #fabd4b
                    Good:     W*=2.00 exact stop                        → #e85f1e
                    Strong:   W*≈2.80 between stops 2.40→3.00 (t=0.667)→ #b21e20
                    Extreme:  W*=4.00 exact stop                        → #780a3c */}
              {[
                { label: 'None',     color: '#a0aec0', desc: 'No soarable lift' },
                { label: 'Weak',     color: '#fae48c', desc: '0.3–0.8 m/s · scratchy' },
                { label: 'Moderate', color: '#fabd4b', desc: '0.8–1.5 m/s · soarable' },
                { label: 'Good',     color: '#e85f1e', desc: '1.5–2.5 m/s · XC possible' },
                { label: 'Strong',   color: '#b21e20', desc: '2.5–3.5 m/s · great XC' },
                { label: 'Extreme',  color: '#780a3c', desc: '3.5+ m/s · caution' },
              ].map(s => (
                <div key={s.label} className="flex items-start gap-1.5">
                  <span className="w-2 h-2 rounded-full mt-0.5 shrink-0" style={{ background: s.color }} />
                  <span><span className="text-white/80 font-medium">{s.label}</span> <span className="text-white/50">{s.desc}</span></span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="text-amber-400 font-bold uppercase tracking-wide text-[10px] mb-1">W* — Convective Velocity</div>
            <p className="text-white/70">How fast air rises inside a thermal (metres per second). A good rule of thumb: W* ≈ average climb rate you can expect in a well-centred thermal. 1.5 m/s is a comfortable XC day; 3 m/s is fast and bumpy.</p>
            <p className="text-white/70 mt-1.5">Worked out from how much sunlight reaches the ground, how wet the ground is, and how deep the boundary layer gets. Cloud cuts the sunlight, so overcast days come out weak automatically — and wet ground after rain thermals poorly even in full sun, because the sun's energy goes into evaporating water instead of heating air.</p>
          </section>

          <section>
            <div className="text-amber-400 font-bold uppercase tracking-wide text-[10px] mb-1">CAPE — Convective Energy</div>
            <p className="text-white/70">Convective Available Potential Energy (Joules/kg). This is a storm-risk measure, not a thermal-strength one — it sits at 0 on many excellent soaring days and climbs high on days that are unflyable. Useful as a caution flag: &gt;500 J/kg means watch for overdevelopment.</p>
          </section>

          <section>
            <div className="text-amber-400 font-bold uppercase tracking-wide text-[10px] mb-1">BL Top (BLH)</div>
            <p className="text-white/70">Shown as <span className="text-white/90 font-mono">BL Top</span>. Boundary Layer Height — the maximum altitude thermals are expected to reach above ground level. This is your effective ceiling for the day. 1500–2500m AGL is typical for good XC days in the Victorian Alps. Below 800m and you're working hard to stay up.</p>
          </section>

          <section>
            <div className="text-amber-400 font-bold uppercase tracking-wide text-[10px] mb-1">Cu Base (CCL)</div>
            <p className="text-white/70">Shown as <span className="text-white/90 font-mono">Cu Base</span>. Convective Condensation Level — the height where thermals would form cumulus clouds. Calculated from the spread between air temperature and dew point (every 1°C of spread ≈ 125m of cloud base height).</p>
            <ul className="mt-1.5 space-y-1 text-white/60">
              <li><span className="text-white/80">High CCL (1200m+)</span> — blue thermals or high cumulus. Good soaring.</li>
              <li><span className="text-white/80">Mid CCL (600–1200m)</span> — cumulus develops. Watch for overdevelopment.</li>
              <li><span className="text-amber-400 font-medium">Low CCL (&lt;600m) ⚠</span> — clouds form near ground. Risk of fog, low stratus, or rapid overdevelopment. CCL = 0 near the coast often means marine layer — don't expect blue skies.</li>
            </ul>
          </section>

          <section>
            <div className="text-amber-400 font-bold uppercase tracking-wide text-[10px] mb-1">What the marks mean</div>
            <p className="text-white/70">The map uses three states:</p>
            <ul className="mt-1.5 space-y-1.5 text-white/70">
              <li><span className="text-white/90 font-medium">Plain (no marks)</span> — a genuine blue day. Thermals exist but top out below condensation, leaving clear sky. No cumulus will form.</li>
              <li><span className="text-white/90 font-medium">White cloud marks</span> — cumulus. Marks appear where Cu Base (CCL) sits below BL Top (BLH), meaning thermals are reaching their condensation level. Density shows how much of the sky they cover. Size and brightness show how deep the cloud layer is (BLH − CCL): bigger and brighter means a deeper, more energetic cloud layer.</li>
              <li><span className="text-white/90 font-medium">Grey diagonal hatching</span> — stratiform overcast. A sheet of cloud, not thermic in origin, is shading the ground. Thermals are suppressed. No usable cumulus marks are shown underneath it, because there are none to find.</li>
            </ul>
            <p className="text-white/50 mt-1.5">A small warning triangle marks overdevelopment risk — hollow (▲) for watch, solid (▲) for likely. The risk is judged from CAPE together with how unstable the air is higher up (Lifted Index or CIN), not from cloud thickness alone. Critically, the triangle can appear on a plain blue day with no cumulus at all — and it also fires under a grey sheet. A loaded atmosphere hidden under solid overcast is the same trap as an uncapped blue day, arguably worse, because the grey gives you nothing visible to read. Either way, the absence of cu does not mean the atmosphere is calm.</p>
          </section>
          </>)}

          <section className="border-t border-white/10 pt-3 space-y-1.5">
            <p className="text-white/40 text-[10px]">Data source: ECMWF IFS forecast via Open-Meteo. Updated daily at 5:26am Melbourne time. Grid resolution: 0.09° (~10km). This is a forecast tool — always make your own assessment before flying.</p>
            {/* CC BY 4.0 requires the Geoscience Australia notice wherever the DEM
                is used. The Ground readout on the wind and thermal maps is derived
                from these tiles, so the credit belongs on this help panel. */}
            <p className="text-white/40 text-[10px]">
              Ground elevation: <span className="text-white/55">Mapzen/AWS Terrain Tiles</span>. Australian data from the
              {' '}<span className="text-white/55">DEM derived from LiDAR 5 Metre Grid</span> — © Commonwealth of Australia
              {' '}(Geoscience Australia) 2017, used under{' '}
              <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer" className="underline hover:text-white/70">CC BY 4.0</a>.
              Elsewhere: USGS 3DEP/SRTM/GMTED2010 and NOAA ETOPO1 (public domain).
            </p>
          </section>
        </div>
      </div>
    </div>,
    document.body
  );
}
