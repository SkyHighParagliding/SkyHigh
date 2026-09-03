import { memo } from 'react';

interface Bucket {
  label: string;
  maxGust: number | null;
  avgWind: number | null;
  avgDir: string | null;
}

export const WeatherHistoryMatrix = memo(function WeatherHistoryMatrix({ buckets }: { buckets: Bucket[] }) {
  const val = (v: number | null, unit = 'kt') =>
    v != null ? `${v}${unit}` : <span className="text-muted-foreground/50">—</span>;

  return (
    <div className="mt-3 w-full overflow-x-auto">
      <table className="w-full text-center border-collapse text-[10px] sm:text-[11px]">
        <thead>
          <tr>
            <td className="text-left text-[8px] sm:text-[9px] font-bold text-foreground-faint uppercase tracking-widest pr-2 pb-1 whitespace-nowrap" />
            {buckets.map(b => (
              <th key={b.label} className="font-bold text-foreground-faint uppercase tracking-wide pb-1 px-1 whitespace-nowrap">
                {b.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-navy/10">
            <td className="text-left text-[8px] sm:text-[9px] font-bold text-foreground-faint uppercase tracking-widest pr-2 py-1.5 whitespace-nowrap">Max Gust</td>
            {buckets.map(b => (
              <td key={b.label} className="font-black text-navy py-1.5 px-1">
                {val(b.maxGust)}
              </td>
            ))}
          </tr>
          <tr className="border-t border-navy/10">
            <td className="text-left text-[8px] sm:text-[9px] font-bold text-foreground-faint uppercase tracking-widest pr-2 py-1.5 whitespace-nowrap">Avg Wind</td>
            {buckets.map(b => (
              <td key={b.label} className="font-black text-navy py-1.5 px-1">
                {val(b.avgWind)}
              </td>
            ))}
          </tr>
          <tr className="border-t border-navy/10">
            <td className="text-left text-[8px] sm:text-[9px] font-bold text-foreground-faint uppercase tracking-widest pr-2 py-1.5 whitespace-nowrap">Avg Dir</td>
            {buckets.map(b => (
              <td key={b.label} className="font-black text-sky py-1.5 px-1">
                {b.avgDir ?? <span className="text-muted-foreground/50">—</span>}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
});
