import type { LucideIcon } from 'lucide-react';

export interface LayerOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
  /** Tailwind text-colour class for the label + icon when this layer is active. */
  colorClass?: string;
}

interface LayerSelectorProps<T extends string> {
  options: LayerOption<T>[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
}

/**
 * Segmented selector for the map's active data layer (Wind | Thermal | Radar) —
 * three mutually-exclusive peers, one shown at a time. All options are visible so
 * the full set is discoverable and any layer is one tap away. Matches the map pill
 * aesthetic (black glass, 9px bold); the active segment gets a subtle fill + its
 * accent colour, inactive ones read dim. Degrades gracefully to two segments when
 * a layer (e.g. thermal) is feature-flagged off.
 */
export function LayerSelector<T extends string>({ options, value, onChange, className }: LayerSelectorProps<T>) {
  return (
    <div className={`inline-flex items-center gap-0.5 bg-black/60 backdrop-blur-md rounded-full border border-white/10 p-0.5 ${className ?? ''}`}>
      {options.map(o => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            title={o.label}
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wide transition-colors ${active ? `bg-white/15 ${o.colorClass ?? 'text-white'}` : 'text-white/55 hover:text-white/85'}`}
          >
            {Icon && <Icon aria-hidden="true" className="w-2.5 h-2.5" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
