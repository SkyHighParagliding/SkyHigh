import { Altitude } from './Altitude';
import type { AirspaceSector } from '@/lib/airspaceConflict';

const M_TO_FT = 3.280839895;

type End =
  | { kind: 'sfc' }
  | { kind: 'unl' }
  | { kind: 'alt'; datum: 'AGL' | 'AMSL'; ft: number };

function endOf(ft: number, ref: number): End {
  if (ft >= 99999) return { kind: 'unl' };
  if (ft <= 0 && ref === 0) return { kind: 'sfc' };
  return { kind: 'alt', datum: ref === 0 ? 'AGL' : 'AMSL', ft };
}

/**
 * Airspace vertical range for the "Airspace ON" stack, e.g. "SFC – 2500ft AMSL"
 * or "1500ft – 2500ft AMSL". Altitudes flip metric/imperial via <Altitude>
 * (airspace is native feet). Both ends normally share a datum, so it's stated
 * once; SFC/UNL ends carry none, and the rare genuinely-mixed sector falls back
 * to a per-end datum.
 */
export function AirspaceRange({ sector }: { sector: AirspaceSector }) {
  const lo = endOf(sector.lowerFt, sector.lowerRef);
  const hi = endOf(sector.upperFt, sector.upperRef);
  const loD = lo.kind === 'alt' ? lo.datum : null;
  const hiD = hi.kind === 'alt' ? hi.datum : null;
  const shared = loD && hiD ? (loD === hiD ? loD : null) : (loD || hiD || null);

  const renderEnd = (e: End, datum: 'AGL' | 'AMSL' | null) =>
    e.kind === 'sfc' ? 'SFC'
      : e.kind === 'unl' ? 'UNL'
      : <><Altitude metres={e.ft / M_TO_FT} step={1} />{datum ? ` ${datum}` : ''}</>;

  return shared
    ? <>{renderEnd(lo, null)} – {renderEnd(hi, null)} {shared}</>
    : <>{renderEnd(lo, loD)} – {renderEnd(hi, hiD)}</>;
}
