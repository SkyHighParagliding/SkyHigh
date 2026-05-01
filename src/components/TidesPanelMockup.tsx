import { useState, useRef, useCallback, useMemo } from "react";

const HOURS = ["2 PM", "3 PM", "4 PM", "5 PM", "6 PM", "7 PM", "8 PM"];
const CURRENT_HOUR_IDX = 1;

const FORECAST_DATA = [
  { time: "2 PM", dir: "S", speed: 10, dirColor: "#10b981", spdColor: "#10b981" },
  { time: "3 PM", dir: "S", speed: 9, dirColor: "#10b981", spdColor: "#10b981" },
  { time: "4 PM", dir: "S", speed: 8, dirColor: "#10b981", spdColor: "#10b981" },
  { time: "5 PM", dir: "SSW", speed: 7, dirColor: "#ff6b35", spdColor: "#eab308" },
  { time: "6 PM", dir: "S", speed: 6, dirColor: "#10b981", spdColor: "#eab308" },
  { time: "7 PM", dir: "SSE", speed: 6, dirColor: "#ef4444", spdColor: "#eab308" },
  { time: "8 PM", dir: "SE", speed: 6, dirColor: "#ef4444", spdColor: "#eab308" },
];

const OUTLOOK_DATA = [
  { day: "Today", speed: 10, dir: "SSE", dOk: true, sOk: true, icon: "sun" },
  { day: "SAT", speed: 5, dir: "SE", dOk: true, sOk: false, icon: "cloud-sun" },
  { day: "SUN", speed: 1, dir: "WNW", dOk: false, sOk: false, icon: "cloud-sun" },
  { day: "MON", speed: 5, dir: "N", dOk: false, sOk: false, icon: "cloud" },
  { day: "TUE", speed: 5, dir: "WNW", dOk: false, sOk: false, icon: "cloud" },
  { day: "WED", speed: 11, dir: "SSW", dOk: true, sOk: true, icon: "cloud-drizzle" },
  { day: "THU", speed: 10, dir: "S", dOk: true, sOk: false, icon: "cloud" },
];

function tideHeight(minutesFrom2pm: number): number {
  const t = minutesFrom2pm;
  const lowTime = 210;
  const highBefore = -60;
  const highAfter = 480;
  
  const period1 = lowTime - highBefore;
  const period2 = highAfter - lowTime;
  
  const highH = 1.32;
  const lowH = 0.18;
  
  if (t <= lowTime) {
    const progress = (t - highBefore) / period1;
    const cos = (1 + Math.cos(progress * Math.PI)) / 2;
    return lowH + (highH - lowH) * cos;
  } else {
    const progress = (t - lowTime) / period2;
    const cos = (1 - Math.cos(progress * Math.PI)) / 2;
    return lowH + (highH - lowH) * cos;
  }
}

function WeatherIcon({ type, size = 20 }: { type: string; size?: number }) {
  if (type === "sun") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#86868b" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
    );
  }
  if (type === "cloud-sun") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#86868b" strokeWidth="2" strokeLinecap="round">
        <path d="M12 2v2M4.93 4.93l1.41 1.41M20 12h2M17.66 17.66l1.41 1.41M2 12h2M6.34 17.66l-1.41 1.41M17.07 4.93l1.41-1.41" />
        <circle cx="12" cy="9" r="4" />
        <path d="M8 16a5 5 0 0 1 8.54-3.54A4 4 0 0 1 20 16H8z" fill="#86868b" fillOpacity="0.15" />
      </svg>
    );
  }
  if (type === "cloud-drizzle") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#86868b" strokeWidth="2" strokeLinecap="round">
        <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" />
        <line x1="8" y1="19" x2="8" y2="21" /><line x1="12" y1="17" x2="12" y2="19" /><line x1="16" y1="19" x2="16" y2="21" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#86868b" strokeWidth="2" strokeLinecap="round">
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  );
}

function WaveIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M2 12c2-3 4-3 6 0s4 3 6 0 4-3 6 0" />
      <path d="M2 17c2-3 4-3 6 0s4 3 6 0 4-3 6 0" />
    </svg>
  );
}

export default function TidesPanel() {
  const [showTides, setShowTides] = useState(true);
  const [markerMinutes, setMarkerMinutes] = useState(60);
  const svgRef = useRef<SVGSVGElement>(null);

  const svgWidth = 460;
  const svgHeight = 190;
  const padLeft = 28;
  const padRight = 10;
  const padTop = 22;
  const padBottom = 34;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const minH = 0;
  const maxH = 1.5;

  const minuteToX = useCallback((min: number) => {
    return padLeft + (min / 360) * plotW;
  }, [plotW]);

  const heightToY = useCallback((h: number) => {
    return padTop + plotH - ((h - minH) / (maxH - minH)) * plotH;
  }, [plotH]);

  const curvePath = useMemo(() => {
    const points: string[] = [];
    for (let m = 0; m <= 360; m += 2) {
      const x = minuteToX(m);
      const y = heightToY(tideHeight(m));
      points.push(`${m === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return points.join(" ");
  }, [minuteToX, heightToY]);

  const areaPath = useMemo(() => {
    const points: string[] = [];
    for (let m = 0; m <= 360; m += 2) {
      const x = minuteToX(m);
      const y = heightToY(tideHeight(m));
      points.push(`${m === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
    }
    points.push(`L${minuteToX(360).toFixed(1)},${heightToY(minH).toFixed(1)}`);
    points.push(`L${minuteToX(0).toFixed(1)},${heightToY(minH).toFixed(1)}`);
    points.push("Z");
    return points.join(" ");
  }, [minuteToX, heightToY]);

  const markerH = tideHeight(markerMinutes);
  const markerX = minuteToX(markerMinutes);
  const markerY = heightToY(markerH);

  const nextH = tideHeight(markerMinutes + 15);
  const isRising = nextH > markerH;
  const arrow = isRising ? "↑" : "↓";

  const lowMinutes = 210;
  const lowHeight = tideHeight(lowMinutes);
  const lowX = minuteToX(lowMinutes);
  const lowY = heightToY(lowHeight);

  const markerHourOffset = Math.floor(markerMinutes / 60);
  const markerMins = markerMinutes % 60;
  const markerHour = 14 + markerHourOffset;
  const markerTimeStr = `${markerHour > 12 ? markerHour - 12 : markerHour}:${markerMins.toString().padStart(2, "0")} PM`;

  const handleSvgClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const scale = svgWidth / rect.width;
    const scaledX = clickX * scale;
    const rawMinutes = ((scaledX - padLeft) / plotW) * 360;
    const snapped = Math.round(rawMinutes / 15) * 15;
    setMarkerMinutes(Math.max(0, Math.min(360, snapped)));
  }, [plotW]);

  const gridLines = [0, 0.5, 1.0, 1.5];

  return (
    <div style={{ maxWidth: 520, margin: "40px auto", padding: "0 16px" }}>
      <div style={{
        background: "#fff",
        borderRadius: 24,
        padding: "24px 20px",
        boxShadow: "0 2px 20px rgba(0,0,0,0.06)",
        border: "1px solid rgba(0,0,0,0.04)"
      }}>

        <div style={{ background: "#f5f5f7", borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#86868b" }}>
              ECMWF Forecast
            </span>
            <button style={{
              display: "flex", alignItems: "center", gap: 4,
              background: "#0071e3", color: "#fff", border: "none",
              borderRadius: 6, padding: "4px 8px", fontSize: 10, fontWeight: 600,
              cursor: "pointer"
            }}>
              <MapIcon />
              <span>Map</span>
            </button>
          </div>
          <div style={{ display: "flex", width: "100%" }}>
            {FORECAST_DATA.map((f, idx) => (
              <div key={idx} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span style={{
                  fontSize: 12, fontWeight: idx === CURRENT_HOUR_IDX ? 700 : 500,
                  color: idx === CURRENT_HOUR_IDX ? "#0071e3" : "#86868b",
                  marginBottom: 4
                }}>
                  {f.time}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: f.dirColor }}>{f.dir}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: f.spdColor }}>{f.speed}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 12, position: "relative" }}>
          <div style={{
            position: "relative",
            overflow: "hidden",
          }}>
            <div style={{
              opacity: showTides ? 0 : 1,
              transform: showTides ? "translateY(-8px)" : "translateY(0)",
              transition: "all 0.3s ease",
              pointerEvents: showTides ? "none" : "auto",
              position: showTides ? "absolute" : "relative",
              width: "100%",
              background: "#f5f5f7",
              borderRadius: 12,
              padding: "12px 16px",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#86868b" }}>
                  7-Day Outlook
                </span>
                <button
                  onClick={() => setShowTides(true)}
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    background: "#0071e3", color: "#fff", border: "none",
                    borderRadius: 6, padding: "4px 8px", fontSize: 10, fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  <WaveIcon />
                  <span>Tides</span>
                </button>
              </div>
              <div style={{ display: "flex", width: "100%" }}>
                {OUTLOOK_DATA.map((d, idx) => {
                  const isToday = idx === 0;
                  return (
                    <div key={idx} style={{
                      flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                      gap: 2, padding: "4px 0", borderRadius: 8,
                      background: isToday ? "rgba(255,255,255,0.8)" : "transparent"
                    }}>
                      <span style={{
                        fontSize: 12, fontWeight: 700, textTransform: "uppercase",
                        color: isToday ? "#0071e3" : "#86868b"
                      }}>
                        {d.day}
                      </span>
                      <WeatherIcon type={d.icon} />
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#1d1d1f" }}>
                        {d.speed}kt
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 500, color: "#86868b" }}>
                        {d.dir}
                      </span>
                      <div style={{ display: "flex", gap: 3 }}>
                        <span style={{
                          width: 18, height: 18, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 9, fontWeight: 700, color: "#fff",
                          background: d.dOk ? "#10b981" : "#ef4444"
                        }}>D</span>
                        <span style={{
                          width: 18, height: 18, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 9, fontWeight: 700, color: "#fff",
                          background: d.sOk ? "#10b981" : d.speed < 3 ? "#eab308" : "#ef4444"
                        }}>S</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{
              opacity: showTides ? 1 : 0,
              transform: showTides ? "translateY(0)" : "translateY(8px)",
              transition: "all 0.3s ease",
              pointerEvents: showTides ? "auto" : "none",
              position: showTides ? "relative" : "absolute",
              top: 0,
              width: "100%",
              background: "#f5f5f7",
              borderRadius: 12,
              padding: "12px 16px",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "#86868b" }}>
                  Tides — Portsea
                </span>
                <button
                  onClick={() => setShowTides(false)}
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    background: "#0071e3", color: "#fff", border: "none",
                    borderRadius: 6, padding: "4px 8px", fontSize: 10, fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  <span>7-Day</span>
                </button>
              </div>

              <svg
                ref={svgRef}
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                width="100%"
                style={{ cursor: "crosshair", userSelect: "none" }}
                onClick={handleSvgClick}
              >
                <defs>
                  <linearGradient id="tideFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0071e3" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="#0071e3" stopOpacity="0.02" />
                  </linearGradient>
                  <filter id="glow">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {gridLines.map(h => (
                  <g key={h}>
                    <line
                      x1={padLeft} y1={heightToY(h)}
                      x2={svgWidth - padRight} y2={heightToY(h)}
                      stroke="#c8c8cc" strokeWidth="0.5" strokeDasharray="3,3"
                    />
                    <text x={2} y={heightToY(h) + 5} textAnchor="start" fontSize="14" fontWeight="500" fill="#86868b">
                      {h.toFixed(1)}
                    </text>
                  </g>
                ))}

                {HOURS.map((label, idx) => {
                  const x = minuteToX(idx * 60);
                  return (
                    <g key={idx}>
                      <line x1={x} y1={padTop} x2={x} y2={svgHeight - padBottom} stroke="#d2d2d7" strokeWidth="0.3" />
                      <text x={x} y={svgHeight - 10} textAnchor="middle" fontSize="14" fontWeight="500" fill="#86868b">
                        {label}
                      </text>
                    </g>
                  );
                })}

                <path d={areaPath} fill="url(#tideFill)" />
                <path d={curvePath} fill="none" stroke="#0071e3" strokeWidth="2" strokeLinecap="round" />

                <g>
                  <text x={lowX} y={lowY + 18} textAnchor="middle" fontSize="14" fontWeight="800" fill="#0071e3">
                    L0.18m @ 5:30
                  </text>
                </g>

                <g>
                  <text x={svgWidth - padRight - 2} y={padTop + 14} textAnchor="end" fontSize="14" fontWeight="800" fill="#86868b">
                    H1.32m @ 10:00
                  </text>
                </g>

                <g style={{ transition: "transform 0.2s ease" }}>
                  <circle cx={markerX} cy={markerY} r="8" fill="#0071e3" opacity="0.15">
                    <animate attributeName="r" values="8;12;8" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.15;0.05;0.15" dur="2s" repeatCount="indefinite" />
                  </circle>
                  <circle cx={markerX} cy={markerY} r="5" fill="#0071e3" stroke="#fff" strokeWidth="2" />

                  <rect
                    x={markerX + 10} y={markerY - 24}
                    width="92" height="26" rx="6"
                    fill="rgba(0,0,0,0.78)"
                  />
                  <text x={markerX + 16} y={markerY - 6} fontSize="14" fontWeight="700" fill="#fff">
                    {markerH.toFixed(2)}m {arrow}
                  </text>
                  <text x={markerX + 70} y={markerY - 6} fontSize="12" fontWeight="500" fill="rgba(255,255,255,0.7)">
                    {markerTimeStr.replace(" PM", "")}
                  </text>
                </g>
              </svg>

              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                marginTop: 2, padding: "0 4px"
              }}>
                <span style={{ fontSize: 12, color: "#86868b", fontStyle: "italic" }}>
                  Click curve to scrub · 15-min increments
                </span>
                <span style={{
                  fontSize: 14, fontWeight: 700, color: isRising ? "#10b981" : "#0071e3",
                  display: "flex", alignItems: "center", gap: 2
                }}>
                  {isRising ? "▲ Rising" : "▼ Falling"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
