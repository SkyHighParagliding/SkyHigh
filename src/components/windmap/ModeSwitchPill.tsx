import type { LucideIcon } from 'lucide-react';
import { ArrowLeftRight } from 'lucide-react';

export interface ModeOption<T extends string> {
  value: T;
  /** Shown on the pill when this option is the ALTERNATIVE (the one you'll switch to). */
  label: string;
  icon?: LucideIcon;
  /** Tailwind text-colour class for the label + icon when this is the target, e.g. 'text-sky-400'. */
  colorClass?: string;
}

interface ModeSwitchPillProps<T extends string> {
  options: [ModeOption<T>, ModeOption<T>];
  value: T;
  onChange: (next: T) => void;
  className?: string;
}

/**
 * A single-segment "switch" pill. Instead of showing both states side by side, it
 * shows only the ALTERNATIVE mode's name (the one you'll switch TO) — e.g. while on
 * the Wind map it reads "Thermal". Tapping activates that alternative and the pill
 * flips to show the other option. Saves screen real estate over a two-segment toggle
 * while keeping one consistent idiom across the site.
 */
export function ModeSwitchPill<T extends string>({ options, value, onChange, className }: ModeSwitchPillProps<T>) {
  const other = options.find(o => o.value !== value) ?? options[0];
  const Icon = other.icon;
  return (
    <button
      type="button"
      onClick={() => onChange(other.value)}
      title={`Switch to ${other.label}`}
      aria-label={`Switch to ${other.label}`}
      className={`flex items-center gap-1 bg-black/60 backdrop-blur-md rounded-full border border-white/10 px-2.5 py-1 text-[9px] font-bold tracking-wide transition-colors hover:bg-black/80 ${other.colorClass ?? 'text-white/85'} ${className ?? ''}`}
    >
      <ArrowLeftRight aria-hidden="true" className="w-2.5 h-2.5 opacity-50" />
      {Icon && <Icon aria-hidden="true" className="w-2.5 h-2.5" />}
      {other.label}
    </button>
  );
}
