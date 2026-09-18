import type { ReactNode } from "react";

/**
 * Shared on/off toggle for admin settings. A single clickable row (role="switch")
 * with an optional label + description. Replaces the assorted raw checkboxes so
 * every boolean setting looks and behaves the same. `onChange` gives a boolean;
 * callers map to "true"/"false" strings where the setting is stored that way.
 */
interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function Switch({ checked, onChange, label, description, disabled = false, className = "" }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex items-start gap-3 text-left ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${className}`}
    >
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors mt-0.5 ${checked ? "bg-accent" : "bg-gray-300"}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`}
        />
      </span>
      {(label || description) && (
        <span className="flex flex-col">
          {label && <span className="text-sm font-medium text-foreground-label">{label}</span>}
          {description && <span className="text-xs text-muted-foreground font-normal">{description}</span>}
        </span>
      )}
    </button>
  );
}
