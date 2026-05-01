import { Map } from "lucide-react";

const annotations = [
  { label: "Hero Section", admin: "Hero Section", color: "#00a8e8", top: 0, height: 21 },
  { label: "Quick Action Cards", admin: "Quick Action Cards + Widgets", color: "#10b981", top: 21, height: 9 },
  { label: "Featured Site", admin: "Featured Site", color: "#1a2b3c", top: 30, height: 10 },
  { label: "Photo Slider", admin: "Social Media (Photos)", color: "#ec4899", top: 40, height: 13 },
  { label: "YouTube Carousel", admin: "Social Media (YouTube)", color: "#ec4899", top: 53, height: 8 },
  { label: "Current Conditions", admin: "Current Conditions", color: "#9ca3af", top: 61, height: 21 },
  { label: "Footer", admin: "—", color: "#64748b", top: 82, height: 18 },
];

export function HomePageMapContent() {
  return (
    <div className="flex gap-4 items-start">
      <div className="relative w-[220px] shrink-0 rounded-lg overflow-hidden border border-gray-200 shadow-inner">
        <img
          src="/images/homepage-layout.jpg"
          alt="Home page layout"
          className="w-full h-auto block"
          draggable={false}
        />
        {annotations.map((a, i) => (
          <div
            key={i}
            className="absolute left-0 right-0 flex items-center justify-center"
            style={{
              top: `${a.top}%`,
              height: `${a.height}%`,
              background: `${a.color}33`,
              borderTop: i === 0 ? "none" : `2px solid ${a.color}`,
              borderBottom: `2px solid ${a.color}`,
            }}
          >
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm"
              style={{
                background: a.color,
                color: "#fff",
                textShadow: "0 1px 2px rgba(0,0,0,0.3)",
              }}
            >
              {a.label}
            </span>
          </div>
        ))}
      </div>
      <div className="flex-1 min-w-0 space-y-3 pt-1">
        <p className="text-xs font-semibold text-navy mb-2">Admin Card Mapping</p>
        {annotations.filter(a => a.admin !== "—").map((a, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="inline-block w-3 h-3 rounded-sm shrink-0"
              style={{ background: a.color }}
            />
            <span className="text-[11px]">
              <strong style={{ color: a.color }}>{a.label}</strong>
              <span className="text-muted-foreground"> → {a.admin}</span>
            </span>
          </div>
        ))}
        <div className="border-t border-border/50 pt-2 mt-2 space-y-1">
          <p className="text-[11px] text-muted-foreground">
            <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: "#f59e0b" }}></span>
            <strong style={{ color: "#f59e0b" }}>Widgets</strong> supply data used by Quick Action Cards.
          </p>
          <p className="text-[11px] text-muted-foreground">
            <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: "#ec4899" }}></span>
            <strong style={{ color: "#ec4899" }}>Social Media</strong> controls Photo Slider, YouTube &amp; Instagram.
          </p>
          <p className="text-[11px] text-muted-foreground">Cards below are ordered to match this layout.</p>
        </div>
      </div>
    </div>
  );
}

export function HomePageMapIcon() {
  return <Map className="w-5 h-5 text-indigo-500" />;
}
