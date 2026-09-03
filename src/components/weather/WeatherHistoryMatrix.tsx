import { memo } from 'react';
import { getWindStatus } from '@/lib/utils';

interface Bucket {
  label: string;
  maxGust: number | null;
  avgWind: number | null;
  avgDir: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  Good:        '#10b981',
  Light:       '#eab308',
  Cross:       '#f97316',
  'Blown Out': '#ef4444',
  'Not Flyable': '#ef4444',
};
const MUTED = '#9ca3af';

export const WeatherHistoryMatrix = memo(function WeatherHistoryMatrix({ buckets, site }: { buckets: Bucket[]; site: any }) {
  const dash = <span className="text-muted-foreground/50">—</span>;

  return (
    <div className="mt-3 w-full overflow-x-auto">
      <table className="w-full text-center border-collapse">
        <thead>
          <tr>
            <td className="text-left text-[10px] font-semibold text-foreground-faint uppercase tracking-widest pr-2 pb-1 whitespace-nowrap" />
            {buckets.map(b => (
              <th key={b.label} className="text-[10px] font-semibold text-foreground-faint uppercase tracking-widest pb-1 px-1 whitespace-nowrap">
                {b.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-navy/10">
            <td className="text-left text-[10px] font-semibold text-foreground-faint uppercase tracking-widest pr-2 py-1.5 whitespace-nowrap">Avg Wind</td>
            {buckets.map(b => {
              const status = b.avgWind != null && b.avgDir != null
                ? getWindStatus(b.avgWind, b.avgDir, site)
                : null;
              const color = status ? (STATUS_COLOR[status.speedStatus.label] ?? MUTED) : MUTED;
              return (
                <td key={b.label} className="text-[14px] font-bold py-1.5 px-1" style={{ color }}>
                  {b.avgWind != null ? `${b.avgWind}kt` : dash}
                </td>
              );
            })}
          </tr>
          <tr className="border-t border-navy/10">
            <td className="text-left text-[10px] font-semibold text-foreground-faint uppercase tracking-widest pr-2 py-1.5 whitespace-nowrap">Max Gust</td>
            {buckets.map(b => {
              const status = b.maxGust != null && b.avgDir != null
                ? getWindStatus(b.maxGust, b.avgDir, site)
                : null;
              const color = status ? (STATUS_COLOR[status.speedStatus.label] ?? MUTED) : MUTED;
              return (
                <td key={b.label} className="text-[14px] font-bold py-1.5 px-1" style={{ color }}>
                  {b.maxGust != null ? `${b.maxGust}kt` : dash}
                </td>
              );
            })}
          </tr>
          <tr className="border-t border-navy/10">
            <td className="text-left text-[10px] font-semibold text-foreground-faint uppercase tracking-widest pr-2 py-1.5 whitespace-nowrap">Avg Dir</td>
            {buckets.map(b => {
              const status = b.avgWind != null && b.avgDir != null
                ? getWindStatus(b.avgWind, b.avgDir, site)
                : null;
              const color = status ? (STATUS_COLOR[status.directionStatus.label] ?? MUTED) : MUTED;
              return (
                <td key={b.label} className="text-[14px] font-bold py-1.5 px-1" style={{ color }}>
                  {b.avgDir ?? dash}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
});
