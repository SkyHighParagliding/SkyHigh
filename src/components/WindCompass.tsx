import { useState, useEffect } from "react";

const DIRECTIONS = [
  "N", "NNE", "NE", "ENE",
  "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW",
  "W", "WNW", "NW", "NNW"
];

const ANGLE_STEP = 360 / DIRECTIONS.length;
const HALF_STEP = ANGLE_STEP / 2;

interface WindCompassProps {
  value: string;
  onChange: (value: string) => void;
  crossLeft?: boolean;
  crossRight?: boolean;
}

function expandRange(startDir: string, endDir: string): string[] {
  const startIdx = DIRECTIONS.indexOf(startDir);
  const endIdx = DIRECTIONS.indexOf(endDir);
  if (startIdx === -1 || endIdx === -1) return [];
  const result: string[] = [];
  const dist = (endIdx - startIdx + 16) % 16;
  const revDist = (startIdx - endIdx + 16) % 16;
  const steps = dist <= revDist ? dist : -revDist;
  const count = Math.abs(steps);
  const dir = steps >= 0 ? 1 : -1;
  for (let i = 0; i <= count; i++) {
    result.push(DIRECTIONS[(startIdx + i * dir + 16) % 16]);
  }
  return result;
}

function parseDirections(value: string): Set<string> {
  const selected = new Set<string>();
  if (!value) return selected;
  const normalized = value.toUpperCase().trim();

  const segments = normalized.split(/[,]+/).map(s => s.trim()).filter(Boolean);
  for (const seg of segments) {
    if (seg.includes(" TO ") || seg.includes("-")) {
      const parts = seg.split(/ TO |-/).map(s => s.trim()).filter(Boolean);
      if (parts.length >= 2 && DIRECTIONS.includes(parts[0]) && DIRECTIONS.includes(parts[1])) {
        for (const d of expandRange(parts[0], parts[1])) selected.add(d);
        continue;
      }
    }
    const words = seg.split(/\s+/);
    for (const w of words) {
      if (DIRECTIONS.includes(w)) selected.add(w);
    }
  }
  return selected;
}

function directionsToString(selected: Set<string>): string {
  const ordered = DIRECTIONS.filter(d => selected.has(d));
  return ordered.join(", ");
}

function pieSegmentPath(cx: number, cy: number, r: number, centerAngleDeg: number): string {
  const startRad = (centerAngleDeg - HALF_STEP - 90) * (Math.PI / 180);
  const endRad = (centerAngleDeg + HALF_STEP - 90) * (Math.PI / 180);
  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy + r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy + r * Math.sin(endRad);
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`;
}

function halfPieSegmentPath(cx: number, cy: number, r: number, centerAngleDeg: number, side: "left" | "right"): string {
  const startDeg = centerAngleDeg - HALF_STEP;
  const midDeg = centerAngleDeg;
  const endDeg = centerAngleDeg + HALF_STEP;

  if (side === "left") {
    const startRad = (startDeg - 90) * (Math.PI / 180);
    const midRad = (midDeg - 90) * (Math.PI / 180);
    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(midRad);
    const y2 = cy + r * Math.sin(midRad);
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`;
  } else {
    const midRad = (midDeg - 90) * (Math.PI / 180);
    const endRad = (endDeg - 90) * (Math.PI / 180);
    const x1 = cx + r * Math.cos(midRad);
    const y1 = cy + r * Math.sin(midRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`;
  }
}

function getCrossDirections(selected: Set<string>, crossLeft: boolean, crossRight: boolean): Set<string> {
  const cross = new Set<string>();
  if (selected.size === 0) return cross;

  for (let i = 0; i < DIRECTIONS.length; i++) {
    if (!selected.has(DIRECTIONS[i])) continue;

    if (crossRight) {
      const nextIdx = (i + 1) % 16;
      if (!selected.has(DIRECTIONS[nextIdx])) {
        cross.add(`${DIRECTIONS[nextIdx]}-left`);
      }
    }

    if (crossLeft) {
      const prevIdx = (i - 1 + 16) % 16;
      if (!selected.has(DIRECTIONS[prevIdx])) {
        cross.add(`${DIRECTIONS[prevIdx]}-right`);
      }
    }
  }
  return cross;
}

export function WindCompass({ value, onChange, crossLeft = false, crossRight = false }: WindCompassProps) {
  const [selected, setSelected] = useState<Set<string>>(() => parseDirections(value));

  useEffect(() => {
    setSelected(parseDirections(value));
  }, [value]);

  const toggleDirection = (dir: string) => {
    const next = new Set(selected);
    if (next.has(dir)) {
      next.delete(dir);
    } else {
      next.add(dir);
    }
    setSelected(next);
    onChange(directionsToString(next));
  };

  const clearAll = () => {
    setSelected(new Set());
    onChange("");
  };

  const cx = 80;
  const cy = 80;
  const size = 160;
  const crossDirs = getCrossDirections(selected, crossLeft, crossRight);

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="select-none">
        <circle cx={cx} cy={cy} r={70} fill="none" stroke="#e5e7eb" strokeWidth={1} />
        <circle cx={cx} cy={cy} r={2} fill="#94a3b8" />

        {DIRECTIONS.map((dir, i) => {
          const angleDeg = i * ANGLE_STEP;
          const angle = (angleDeg - 90) * (Math.PI / 180);
          const isCardinal = i % 4 === 0;
          const isActive = selected.has(dir);
          const hasCrossLeft = crossDirs.has(`${dir}-left`);
          const hasCrossRight = crossDirs.has(`${dir}-right`);

          const labelR = 70;
          const dotR = 56;

          const lx = cx + labelR * Math.cos(angle);
          const ly = cy + labelR * Math.sin(angle);
          const dx = cx + dotR * Math.cos(angle);
          const dy = cy + dotR * Math.sin(angle);

          return (
            <g
              key={dir}
              onClick={() => toggleDirection(dir)}
              className="cursor-pointer"
            >
              {isActive && (
                <path
                  d={pieSegmentPath(cx, cy, 56, angleDeg)}
                  fill="#0ea5e9"
                  opacity={0.2}
                />
              )}

              {hasCrossLeft && (
                <path
                  d={halfPieSegmentPath(cx, cy, 56, angleDeg, "left")}
                  fill="#ff6b35"
                  opacity={0.2}
                />
              )}

              {hasCrossRight && (
                <path
                  d={halfPieSegmentPath(cx, cy, 56, angleDeg, "right")}
                  fill="#ff6b35"
                  opacity={0.2}
                />
              )}

              {isActive && (
                <circle
                  cx={dx} cy={dy} r={4}
                  fill="#0ea5e9"
                />
              )}

              {!isActive && (
                <circle
                  cx={dx} cy={dy} r={3}
                  fill="white"
                  stroke="#d1d5db"
                  strokeWidth={1}
                />
              )}

              <circle
                cx={dx} cy={dy} r={10}
                fill="transparent"
              />

              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="central"
                className={`select-none ${isActive ? "fill-sky" : "fill-gray-400"} ${isCardinal ? "font-bold" : "font-medium"}`}
                fontSize={8}
              >
                {dir}
              </text>
            </g>
          );
        })}
      </svg>

      {selected.size > 0 && (
        <button
          type="button"
          onClick={clearAll}
          className="text-[10px] text-foreground-faint hover:text-red-500 transition-colors"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
