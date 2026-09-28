import { cn } from '@/lib/utils';

/**
 * Segmented PG / Full altitude-scale switch, shared by the Chart, SkewT and RASP
 * modals so a pilot can flip the scale on the display they're looking at (not
 * only from the tapped-point box). State still lives in the parent useChartScale
 * hook — this is a controlled control that reports flips back via onToggle.
 */
export function ScaleToggle({
  fullScale, onToggle, className,
}: {
  fullScale: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className={cn(
        'flex items-center gap-0.5 rounded-full border border-black/10 bg-black/[0.03] p-0.5 text-[11px] font-medium text-ink hover:bg-black/[0.06]',
        className,
      )}
      title="Altitude scale: PG working band vs full profile"
    >
      <span className={cn('px-1.5 py-0.5 rounded-full', !fullScale ? 'bg-sky-500 text-white' : 'text-muted-foreground')}>PG</span>
      <span className={cn('px-1.5 py-0.5 rounded-full', fullScale ? 'bg-sky-500 text-white' : 'text-muted-foreground')}>Full</span>
    </button>
  );
}
