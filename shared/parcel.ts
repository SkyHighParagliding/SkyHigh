/**
 * Thermodynamic parcel routines (shared by server + client).
 *
 * Validated in spike/probe-ecmwf-ascent.mts against GFS's own published
 * lifted_index over 160 matched samples: r = 0.9962, residual sd = 0.170 °C.
 * The formulations are copied EXACTLY from spike/parcel.mts — do not "improve"
 * them; the validation was performed on these specific equations.
 *
 * Source: Bolton (1980) "The Computation of Equivalent Potential Temperature",
 *   Monthly Weather Review 108, 1046-1053.
 *
 * Deliberately EXCLUDED (reasons follow — do not add back):
 *   • equilibrium level (EL) — spike showed sd ≈ 1010 m on ECMWF's sparse
 *     pressure levels; too noisy to be useful operationally.
 *   • our own CAPE — spike showed r = 0.49 vs GFS CAPE and a median of 0,
 *     both unacceptably poor; use the ECMWF native CAPE field instead.
 *
 * Pure functions only — no Node or DOM dependencies, so both the server grid
 * pipeline and the client SkewT can import it.
 */

// ── Physical constants ──────────────────────────────────────────────────────
const Rd  = 287.04;   // J kg⁻¹ K⁻¹  dry-air gas constant
const Rv  = 461.5;    // J kg⁻¹ K⁻¹  water-vapour gas constant  (used in eps)
const cpd = 1005.7;   // J kg⁻¹ K⁻¹  specific heat dry air at constant pressure
const Lv0 = 2.501e6;  // J kg⁻¹      latent heat of vaporisation at 0 °C
const eps = Rd / Rv;  // 0.622        ratio of molar masses (Rd/Rv)

/**
 * Saturation vapour pressure (Bolton 1980, eq. 10).
 * @param T_celsius  Temperature in °C
 * @returns es in hPa
 */
export function satVaporPressure(T_celsius: number): number {
  return 6.112 * Math.exp((17.67 * T_celsius) / (T_celsius + 243.5));
}

/**
 * Dewpoint from temperature and relative humidity.
 * Inverts Bolton (1980) eq. 10 applied to e = es(T) × rh/100.
 * @param T_celsius   Temperature in °C
 * @param rh_percent  Relative humidity 0–100
 * @returns Dewpoint in °C
 */
export function dewpointFromRH(T_celsius: number, rh_percent: number): number {
  const es = satVaporPressure(T_celsius);
  const e  = es * (rh_percent / 100);
  const a  = Math.log(e / 6.112);
  return (243.5 * a) / (17.67 - a);
}

/**
 * LCL temperature and pressure (Bolton 1980, eq. 21).
 * @param p0_hPa      Surface pressure (hPa)
 * @param T0_celsius  Surface temperature (°C)
 * @param Td0_celsius Surface dewpoint (°C)
 * @returns { pLcl: hPa, tLcl: °C }
 */
export function lclPressureTemp(
  p0_hPa: number,
  T0_celsius: number,
  Td0_celsius: number,
): { pLcl: number; tLcl: number } {
  const TK  = T0_celsius  + 273.15;
  const TdK = Td0_celsius + 273.15;

  // Bolton (1980) eq. 21 — LCL temperature in Kelvin
  const tLclK = 1 / (1 / (TdK - 56) + Math.log(TK / TdK) / 800) + 56;

  // LCL pressure via dry adiabat (Poisson)
  const pLcl = p0_hPa * Math.pow(tLclK / TK, cpd / Rd);

  return { pLcl, tLcl: tLclK - 273.15 };
}

/**
 * dT/dp along a saturated pseudoadiabat.
 * Returns K per hPa (positive — temperature falls as pressure falls / parcel rises).
 * @param p_hPa    Pressure (hPa)
 * @param T_kelvin Temperature (K)
 */
function moistLapseDTdp(p_hPa: number, T_kelvin: number): number {
  const es = satVaporPressure(T_kelvin - 273.15);
  const ws  = (eps * es) / (p_hPa - es);
  const num = 1 + (Lv0 * ws) / (Rd * T_kelvin);
  const den = 1 + (Lv0 * Lv0 * ws * eps) / (cpd * Rd * T_kelvin * T_kelvin);
  return (Rd * T_kelvin / (cpd * p_hPa)) * (num / den);
}

/**
 * Lift a parcel from (p0, T0, Td0) to targetP using RK4 along the
 * pseudoadiabat above the LCL. Below the LCL the dry adiabat is used.
 *
 * @param p0_hPa      Starting pressure (hPa)
 * @param T0_celsius  Starting temperature (°C)
 * @param Td0_celsius Starting dewpoint (°C)
 * @param targetP_hPa Target pressure (hPa); must be ≤ p0_hPa
 * @returns Parcel temperature at targetP in °C
 */
export function liftParcel(
  p0_hPa: number,
  T0_celsius: number,
  Td0_celsius: number,
  targetP_hPa: number,
): number {
  const { pLcl, tLcl } = lclPressureTemp(p0_hPa, T0_celsius, Td0_celsius);
  const TK0 = T0_celsius + 273.15;

  if (targetP_hPa >= pLcl) {
    // Target is at or below the LCL — dry adiabat only.
    return TK0 * Math.pow(targetP_hPa / p0_hPa, Rd / cpd) - 273.15;
  }

  // Dry adiabat from p0 to pLcl, then switch to moist pseudoadiabat.
  // Use Bolton's tLcl as the starting temperature for the moist leg (it should
  // agree with the dry-adiabat value to within rounding).
  let T = tLcl + 273.15; // K, at the LCL
  let p = pLcl;

  // RK4 integration upward (pressure decreasing, dp = step < 0).
  const step = -1.0; // hPa per integration step
  while (p + step > targetP_hPa) {
    const dp = step;
    const k1 = moistLapseDTdp(p,        T)        * dp;
    const k2 = moistLapseDTdp(p + dp/2, T + k1/2) * dp;
    const k3 = moistLapseDTdp(p + dp/2, T + k2/2) * dp;
    const k4 = moistLapseDTdp(p + dp,   T + k3)   * dp;
    T += (k1 + 2*k2 + 2*k3 + k4) / 6;
    p += dp;
  }
  // Final partial step to land exactly at targetP_hPa.
  if (Math.abs(p - targetP_hPa) > 1e-6) {
    const dp = targetP_hPa - p;
    const k1 = moistLapseDTdp(p,        T)        * dp;
    const k2 = moistLapseDTdp(p + dp/2, T + k1/2) * dp;
    const k3 = moistLapseDTdp(p + dp/2, T + k2/2) * dp;
    const k4 = moistLapseDTdp(p + dp,   T + k3)   * dp;
    T += (k1 + 2*k2 + 2*k3 + k4) / 6;
  }

  return T - 273.15;
}

/**
 * Dry-adiabatic parcel temperature at targetP from a surface parcel (Poisson).
 * Unconditionally dry — used to project the convective (dry) thermal top.
 */
export function dryLiftParcel(p0_hPa: number, T0_celsius: number, targetP_hPa: number): number {
  return (T0_celsius + 273.15) * Math.pow(targetP_hPa / p0_hPa, Rd / cpd) - 273.15;
}
