import { toggleUnits, formatAltitude } from '@/lib/units';
import { useUnits } from '@/hooks/useUnits';

interface AltitudeProps {
  metres: number | null | undefined;
  step?: number;
  className?: string;
}

/**
 * Renders a formatted altitude value that toggles the global unit preference on click.
 *
 * The click handler calls e.stopPropagation() because altitude spans frequently appear
 * inside interactive containers (map-layer cards, list rows, modal headers) that have
 * their own onClick. Without stopPropagation, tapping the altitude would also fire the
 * parent's handler — e.g. opening a detail panel instead of just switching units.
 */
export function Altitude({ metres, step = 1, className }: AltitudeProps) {
  // Subscribe to unit changes so this component re-renders when the preference changes.
  const { units } = useUnits();

  if (metres == null || !Number.isFinite(metres)) {
    return <span className={className}>—</span>;
  }

  const formatted = formatAltitude(metres, step);
  const ariaLabel = `${units === 'metric' ? `${Math.round(metres)} metres` : `${Math.round(metres * 3.280839895)} feet`}, tap to switch units`;

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    toggleUnits();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      toggleUnits();
    }
  }

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`cursor-pointer select-none${className ? ` ${className}` : ''}`}
    >
      {formatted}
    </span>
  );
}
