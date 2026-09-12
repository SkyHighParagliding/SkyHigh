import { X } from 'lucide-react';
import { createPortal } from 'react-dom';

export function ThermalHelpModal({ onClose }: { onClose: () => void }) {
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
          <h3 className="text-white font-bold text-sm tracking-wide">Reading the Thermal Map</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4 text-[11px] leading-relaxed">

          <section>
            <div className="text-amber-400 font-bold uppercase tracking-wide text-[10px] mb-1">Thermal Strength</div>
            <p className="text-white/70">The colour overlay shows how strong convective lift (thermals) is expected to be across Victoria at the selected time. Based on W* (convective velocity scale) derived from CAPE and boundary layer data.</p>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
              {[
                { label: 'None',     color: '#a0aec0', desc: 'No soarable lift' },
                { label: 'Weak',     color: '#d4a843', desc: '0.3–0.8 m/s · scratchy' },
                { label: 'Moderate', color: '#dc821e', desc: '0.8–1.5 m/s · soarable' },
                { label: 'Good',     color: '#d45a14', desc: '1.5–2.5 m/s · XC possible' },
                { label: 'Strong',   color: '#c03210', desc: '2.5–3.5 m/s · great XC' },
                { label: 'Extreme',  color: '#b41414', desc: '3.5+ m/s · caution' },
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
          </section>

          <section>
            <div className="text-amber-400 font-bold uppercase tracking-wide text-[10px] mb-1">CAPE — Convective Energy</div>
            <p className="text-white/70">Convective Available Potential Energy (Joules/kg). Shown when real W* data isn't available. Think of it as the "fuel tank" for thermals — the higher the value, the more energy available for convection. &gt;100 J/kg = useful thermals; &gt;500 J/kg = strong conditions.</p>
          </section>

          <section>
            <div className="text-amber-400 font-bold uppercase tracking-wide text-[10px] mb-1">Thermal Top (BLH)</div>
            <p className="text-white/70">Shown as <span className="text-white/90 font-mono">Top</span>. Boundary Layer Height — the maximum altitude thermals are expected to reach above ground level. This is your effective ceiling for the day. 1500–2500m AGL is typical for good XC days in the Victorian Alps. Below 800m and you're working hard to stay up.</p>
          </section>

          <section>
            <div className="text-amber-400 font-bold uppercase tracking-wide text-[10px] mb-1">Cloudbase (CCL)</div>
            <p className="text-white/70">Shown as <span className="text-white/90 font-mono">Base</span>. Convective Condensation Level — the height where thermals would form cumulus clouds. Calculated from the spread between air temperature and dew point (every 1°C of spread ≈ 125m of cloud base height).</p>
            <ul className="mt-1.5 space-y-1 text-white/60">
              <li><span className="text-white/80">High CCL (1200m+)</span> — blue thermals or high cumulus. Good soaring.</li>
              <li><span className="text-white/80">Mid CCL (600–1200m)</span> — cumulus develops. Watch for overdevelopment.</li>
              <li><span className="text-amber-400 font-medium">Low CCL (&lt;600m) ⚠</span> — clouds form near ground. Risk of fog, low stratus, or rapid overdevelopment. CCL = 0 near the coast often means marine layer — don't expect blue skies.</li>
            </ul>
          </section>

          <section className="border-t border-white/10 pt-3">
            <p className="text-white/40 text-[10px]">Data source: ECMWF IFS forecast via Open-Meteo. Updated daily at 5:26am Melbourne time. Grid resolution: 0.09° (~10km). This is a forecast tool — always make your own assessment before flying.</p>
          </section>
        </div>
      </div>
    </div>,
    document.body
  );
}
