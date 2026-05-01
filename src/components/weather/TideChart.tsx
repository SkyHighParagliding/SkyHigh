import { useState, useRef, useCallback, useMemo, memo } from 'react';
import type { TideData } from './types';

export const TideChart = memo(function TideChart({ tideData, forecastStartMs, forecastEndMs }: { tideData: TideData; forecastStartMs?: number; forecastEndMs?: number }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [markerIdx, setMarkerIdx] = useState<number | null>(null);

  const preds = tideData.predictions;
  if (preds.length < 2) return null;

  const svgWidth = 460;
  const svgHeight = 130;
  const padLeft = 4;
  const padRight = 4;
  const padTop = 15;
  const padBottom = 25;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const now = Date.now();
  const windowStartMs = forecastStartMs ?? (now - 2 * 60 * 60 * 1000);
  const windowEndMs = forecastEndMs ?? (now + 12 * 60 * 60 * 1000);
  const spanMs = windowEndMs - windowStartMs;

  const allHeights = preds.map(p => p.height);
  const minH = Math.min(...allHeights) * 0.9;
  const maxH = Math.max(...allHeights) * 1.1;
  const rangeH = maxH - minH || 1;

  const timeToX = useCallback((ms: number) => {
    return padLeft + ((ms - windowStartMs) / spanMs) * plotW;
  }, [windowStartMs, spanMs, plotW]);

  const heightToY = useCallback((h: number) => {
    return padTop + plotH - ((h - minH) / rangeH) * plotH;
  }, [plotH, minH, rangeH]);

  const anchoredPreds = useMemo(() => {
    const sorted = [...preds].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    const seen = new Set<number>();
    return sorted.filter(p => {
      const t = new Date(p.time).getTime();
      const key = Math.round(t / 60000);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [preds]);

  const interpHeight = useCallback((ms: number): number => {
    const pts = anchoredPreds;
    for (let i = 0; i < pts.length - 1; i++) {
      const t0 = new Date(pts[i].time).getTime();
      const t1 = new Date(pts[i + 1].time).getTime();
      if (ms >= t0 && ms <= t1) {
        const progress = (ms - t0) / (t1 - t0);
        const cos = (1 - Math.cos(progress * Math.PI)) / 2;
        return pts[i].height + (pts[i + 1].height - pts[i].height) * cos;
      }
    }
    if (ms <= new Date(pts[0].time).getTime()) return pts[0].height;
    return pts[pts.length - 1].height;
  }, [anchoredPreds]);

  const curvePoints = useMemo(() => {
    const pts: string[] = [];
    const steps = 200;
    for (let i = 0; i <= steps; i++) {
      const ms = windowStartMs + (i / steps) * spanMs;
      const x = timeToX(ms);
      const y = heightToY(interpHeight(ms));
      pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(" ");
  }, [windowStartMs, spanMs, timeToX, heightToY, interpHeight]);

  const areaPath = useMemo(() => {
    const pts: string[] = [];
    const steps = 200;
    for (let i = 0; i <= steps; i++) {
      const ms = windowStartMs + (i / steps) * spanMs;
      const x = timeToX(ms);
      const y = heightToY(interpHeight(ms));
      pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
    }
    pts.push(`L${timeToX(windowEndMs).toFixed(1)},${heightToY(minH).toFixed(1)}`);
    pts.push(`L${timeToX(windowStartMs).toFixed(1)},${heightToY(minH).toFixed(1)}`);
    pts.push("Z");
    return pts.join(" ");
  }, [windowStartMs, windowEndMs, spanMs, timeToX, heightToY, interpHeight, minH]);

  const nowX = timeToX(now);
  const nowH = interpHeight(now);
  const nowY = heightToY(nowH);
  const futureH = interpHeight(now + 15 * 60 * 1000);
  const isRising = futureH > nowH;

  const hourLabels = useMemo(() => {
    const labels: { label: string; ms: number }[] = [];
    const startHour = new Date(windowStartMs);
    startHour.setMinutes(0, 0, 0);
    let t = startHour.getTime();
    if (t < windowStartMs) t += 3600000;
    while (t <= windowEndMs) {
      const d = new Date(t);
      const h = d.getHours();
      const ampm = h >= 12 ? "PM" : "AM";
      const h12 = h % 12 || 12;
      labels.push({ label: `${h12} ${ampm}`, ms: t });
      t += 2 * 3600000;
    }
    return labels;
  }, [windowStartMs, windowEndMs]);

  const gridHeights = useMemo(() => {
    const step = rangeH > 1 ? 0.5 : 0.25;
    const lines: number[] = [];
    let h = Math.ceil(minH / step) * step;
    while (h <= maxH) {
      lines.push(h);
      h += step;
    }
    return lines;
  }, [minH, maxH, rangeH]);

  const hiLo = preds.filter(p => {
    const t = new Date(p.time).getTime();
    return t >= windowStartMs && t <= windowEndMs;
  });

  const handleSvgClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const scale = svgWidth / rect.width;
    const scaledX = clickX * scale;
    const clickMs = windowStartMs + ((scaledX - padLeft) / plotW) * spanMs;
    const snappedMs = Math.round(clickMs / (15 * 60 * 1000)) * (15 * 60 * 1000);
    if (snappedMs >= windowStartMs && snappedMs <= windowEndMs) {
      if (markerIdx !== null && Math.abs(snappedMs - markerIdx) < 20 * 60 * 1000) {
        setMarkerIdx(null);
      } else {
        setMarkerIdx(snappedMs);
      }
    }
  }, [windowStartMs, spanMs, plotW, windowEndMs, markerIdx]);

  const markerMs = markerIdx ?? now;
  const mH = interpHeight(markerMs);
  const mX = timeToX(markerMs);
  const mY = heightToY(mH);
  const mFuture = interpHeight(markerMs + 15 * 60 * 1000);
  const mRising = mFuture > mH;
  const mTime = new Date(markerMs);
  const mTimeStr = mTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });

  return (
    <div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        width="100%"
        style={{ cursor: "crosshair", userSelect: "none" }}
        onClick={handleSvgClick}
      >
        <defs>
          <linearGradient id="tideFillGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0071e3" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#0071e3" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {gridHeights.map(h => (
          <g key={h}>
            <line x1={padLeft} y1={heightToY(h)} x2={svgWidth - padRight} y2={heightToY(h)} stroke="#c8c8cc" strokeWidth="0.5" strokeDasharray="3,3" />
          </g>
        ))}

        {hourLabels.map((hl, idx) => {
          const x = timeToX(hl.ms);
          return (
            <g key={idx}>
              <line x1={x} y1={padTop} x2={x} y2={svgHeight - padBottom} stroke="#d2d2d7" strokeWidth="0.3" />
              <text x={x} y={svgHeight - 6} textAnchor="middle" fontSize="12" fontWeight="500" fill="#86868b">{hl.label}</text>
            </g>
          );
        })}

        <path d={areaPath} fill="url(#tideFillGrad)" />
        <path d={curvePoints} fill="none" stroke="#0071e3" strokeWidth="2" strokeLinecap="round" />

        {hiLo.map((p, i) => {
          const t = new Date(p.time).getTime();
          const px = timeToX(t);
          const py = heightToY(p.height);
          const d = new Date(p.time);
          const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
          const timeAxisTop = svgHeight - padBottom - 4;
          const tooltipZone = 22;
          const nearMarker = Math.abs(px - mX) < 50;
          const nearNow = Math.abs(px - nowX) < 50;
          let ly: number;
          if (p.type === "low") {
            ly = py + 14;
            if (ly > timeAxisTop || (nearMarker && ly > py - 4)) ly = py - 8;
          } else {
            ly = py - 6;
            if (ly < tooltipZone || (nearMarker && ly < tooltipZone) || (nearNow && ly < tooltipZone)) ly = py + 14;
          }
          return (
            <text key={i} x={px} y={ly} textAnchor="middle" fontSize="8" fontWeight="700" fill="#0071e3">
              {p.type === "high" ? "H" : "L"} {p.height.toFixed(2)}m {timeStr}
            </text>
          );
        })}

        <line x1={nowX} y1={padTop} x2={nowX} y2={svgHeight - padBottom} stroke="#0071e3" strokeWidth="0.5" strokeDasharray="2,2" opacity="0.4" />

        {markerIdx !== null && (
          <g style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); setMarkerIdx(null); }}>
            <rect x={nowX - 24} y={0} width="48" height="16" rx="4" fill="#0071e3" />
            <text x={nowX} y={11} textAnchor="middle" fontSize="9" fontWeight="600" fill="#fff">Now</text>
            <polygon points={`${nowX - 4},16 ${nowX + 4},16 ${nowX},20`} fill="#0071e3" />
          </g>
        )}

        <g>
          <circle cx={mX} cy={mY} r="8" fill="#0071e3" opacity="0.15">
            <animate attributeName="r" values="8;12;8" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.15;0.05;0.15" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle cx={mX} cy={mY} r="5" fill="#0071e3" stroke="#fff" strokeWidth="2" />
          <line x1={mX} y1={mY - 6} x2={mX} y2={padTop + 2} stroke="#0071e3" strokeWidth="0.5" strokeDasharray="2,2" opacity="0.4" />
          <rect x={mX - 36} y={0} width="72" height="16" rx="4" fill="rgba(0,0,0,0.75)" />
          <text x={mX - 32} y={11} fontSize="9" fontWeight="600" fill="#fff">
            {mH.toFixed(2)}m {mRising ? "↑" : "↓"}
          </text>
          <text x={mX + 8} y={11} fontSize="7" fontWeight="500" fill="rgba(255,255,255,0.7)">
            {mTimeStr.replace(/ (AM|PM)/, "")}
          </text>
        </g>
      </svg>

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginTop: 2, padding: "0 4px" }}>
        <span style={{ fontSize: 9, fontWeight: 600, color: isRising ? "#10b981" : "#0071e3", display: "flex", alignItems: "center", gap: 2 }}>
          {isRising ? "▲ Rising" : "▼ Falling"}
        </span>
      </div>
    </div>
  );
});
