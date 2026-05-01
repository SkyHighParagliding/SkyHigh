import React from "react";

const LONG_TEXT_THRESHOLD = 10;
const WRAP_TEXT_THRESHOLD = 25;

interface InfoCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subValue?: string;
  href?: string;
  iconBgClass?: string;
  valueClass?: string;
}

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function InfoCard({ icon, label, value, subValue, href, iconBgClass = "bg-sky/10", valueClass = "font-bold text-navy text-sm" }: InfoCardProps) {
  const text = String(value ?? "");
  const sub = subValue ? String(subValue) : undefined;
  const isLong = text.length >= LONG_TEXT_THRESHOLD || (sub && sub.length >= LONG_TEXT_THRESHOLD);
  const isWrapping = text.length >= WRAP_TEXT_THRESHOLD || (sub && sub.length >= WRAP_TEXT_THRESHOLD);
  const safeHref = href && isSafeUrl(href) ? href : undefined;

  if (isWrapping) {
    const inner = (
      <>
        <div className="flex items-center gap-2 mb-1.5">
          <div className={`${iconBgClass} p-2 rounded-xl shrink-0`}>
            {icon}
          </div>
          <p className="text-[10px] text-foreground-faint uppercase font-bold tracking-widest">{label}</p>
        </div>
        <p className={valueClass}>{text}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </>
    );

    const cls = "col-span-2 bg-card p-4 rounded-2xl border border-sky/10 shadow-sm";
    if (safeHref) {
      return <a href={safeHref} target="_blank" rel="noopener noreferrer" className={`${cls} hover:bg-background transition-colors block`}>{inner}</a>;
    }
    return <div className={cls}>{inner}</div>;
  }

  if (isLong) {
    const inner = (
      <>
        <div className={`${iconBgClass} p-2 rounded-xl shrink-0`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-foreground-faint uppercase font-bold tracking-widest mb-0.5">{label}</p>
          <p className={valueClass}>{text}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </>
    );

    if (safeHref) {
      return (
        <a href={safeHref} target="_blank" rel="noopener noreferrer" className="col-span-2 bg-card p-4 rounded-2xl border border-sky/10 shadow-sm flex items-start gap-3 hover:bg-background transition-colors group">
          {inner}
        </a>
      );
    }
    return (
      <div className="col-span-2 bg-card p-4 rounded-2xl border border-sky/10 shadow-sm flex items-start gap-3">
        {inner}
      </div>
    );
  }

  const inner = (
    <>
      <div className={`${iconBgClass} p-2 rounded-xl mb-2`}>
        {icon}
      </div>
      <p className="text-[10px] text-foreground-faint uppercase font-bold tracking-widest mb-1">{label}</p>
      <p className={valueClass}>{text}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </>
  );

  if (safeHref) {
    return (
      <a href={safeHref} target="_blank" rel="noopener noreferrer" className="bg-card p-4 rounded-2xl border border-sky/10 shadow-sm flex flex-col items-center text-center hover:bg-background transition-colors group">
        {inner}
      </a>
    );
  }
  return (
    <div className="bg-card p-4 rounded-2xl border border-sky/10 shadow-sm flex flex-col items-center text-center">
      {inner}
    </div>
  );
}
