import type { Sale } from "../../../shared/sizzle/calc.ts";
import { BASE } from "./useTill";

/** Customers served on event day `n` — one completed (not voided) sale ≈ one customer. */
export function customersServed(sales: Sale[], n: number): number {
  return sales.filter((s) => s.day === n && !s.voided).length;
}

/** Draft forecasts as strings, keyed by day number, from the till's current figures. */
export function forecastDraft(customersPerDay: number[]): Record<string, string> {
  return Object.fromEntries(customersPerDay.map((c, i) => [String(i + 1), String(c)]));
}

/** Only the days that differ from the plan file are stored as overrides. */
export function forecastOverrides(draft: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {};
  BASE.config.customersPerDay.forEach((plan, i) => {
    const v = draft[String(i + 1)];
    if (v !== undefined && v !== "" && Number.isFinite(Number(v)) && Math.round(Number(v)) !== plan) out[String(i + 1)] = Math.max(0, Math.round(Number(v)));
  });
  return out;
}

/** One row per event day: label, plan / actual hints and the forecast box. */
export function ForecastRows({ days, draft, onChange, sales, only }: {
  days: { n: number; label: string }[];
  draft: Record<string, string>;
  onChange: (n: number, v: string) => void;
  sales: Sale[];
  only?: number[];
}) {
  return (
    <>
      {days.filter((d) => !only || only.includes(d.n)).map((d) => {
        const served = customersServed(sales, d.n);
        return (
          <label key={d.n} className="flex items-center gap-2 py-1 border-b text-lg">
            <span className="flex-1">
              Day {d.n} · {d.label}
              <span className="block text-sm text-stone-500">
                plan {BASE.config.customersPerDay[d.n - 1]}{served ? ` · served so far ${served}` : ""}
              </span>
            </span>
            <input inputMode="numeric" aria-label={`Customers expected Day ${d.n}`} value={draft[String(d.n)] ?? ""} onChange={(e) => onChange(d.n, e.target.value.replace(/\D/g, ""))} className="w-28 h-12 rounded-lg border-2 border-stone-300 px-2 text-xl text-right focus:border-amber-600 outline-none" />
          </label>
        );
      })}
    </>
  );
}
