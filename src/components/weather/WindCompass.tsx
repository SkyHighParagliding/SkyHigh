import { useMemo, memo } from 'react';
import { getWindStatus } from '@/lib/utils';

const directionToDegrees: Record<string, number> = {
  'N': 0, 'NNE': 22.5, 'NE': 45, 'ENE': 67.5,
  'E': 90, 'ESE': 112.5, 'SE': 135, 'SSE': 157.5,
  'S': 180, 'SSW': 202.5, 'SW': 225, 'WSW': 247.5,
  'W': 270, 'WNW': 292.5, 'NW': 315, 'NNW': 337.5
};

const ALL_DIRS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];

function getCrossHalves(idealDirs: string[], crossLeft: boolean, crossRight: boolean): Array<{dir: string; side: 'left' | 'right'}> {
  const halves: Array<{dir: string; side: 'left' | 'right'}> = [];
  const idealSet = new Set(idealDirs);
  if (idealSet.size === 0) return halves;

  for (let i = 0; i < ALL_DIRS.length; i++) {
    if (!idealSet.has(ALL_DIRS[i])) continue;

    if (crossRight) {
      const nextIdx = (i + 1) % 16;
      if (!idealSet.has(ALL_DIRS[nextIdx])) {
        halves.push({ dir: ALL_DIRS[nextIdx], side: 'left' });
      }
    }

    if (crossLeft) {
      const prevIdx = (i - 1 + 16) % 16;
      if (!idealSet.has(ALL_DIRS[prevIdx])) {
        halves.push({ dir: ALL_DIRS[prevIdx], side: 'right' });
      }
    }
  }
  return halves;
}

export const WindCompass = memo(function WindCompass({ currentDir, idealDirs, directionStatus, speedStatus, siteId, isDirectionIdeal, crossLeft = false, crossRight = false }: { currentDir: string, idealDirs: string[], directionStatus: string, speedStatus: string, siteId: string, isDirectionIdeal: boolean, crossLeft?: boolean, crossRight?: boolean }) {
  const currentAngle = directionToDegrees[currentDir] ?? 0;
  
  const statusColors: Record<string, string> = {
    'Good': '#10b981',
    'Light': '#eab308',
    'Blown Out': '#ef4444',
    'Cross': '#ff6b35',
    'Not Flyable': '#ef4444',
    'N/A': '#9ca3af'
  };

  const arrowColor = statusColors[directionStatus] || '#0ea5e9';
  const ringColor = statusColors[speedStatus] || '#0ea5e9';
  const roseTextColor = '#4b5563';
  
  const sectors = useMemo(() => idealDirs.map(dir => {
    const angle = directionToDegrees[dir];
    if (angle === undefined) return null;
    
    const startAngle = (angle - 11.25 - 90) * (Math.PI / 180);
    const endAngle = (angle + 11.25 - 90) * (Math.PI / 180);
    
    const x1 = 25 + 20 * Math.cos(startAngle);
    const y1 = 25 + 20 * Math.sin(startAngle);
    const x2 = 25 + 20 * Math.cos(endAngle);
    const y2 = 25 + 20 * Math.sin(endAngle);
    
    return (
      <path
        key={dir}
        d={`M 25 25 L ${x1} ${y1} A 20 20 0 0 1 ${x2} ${y2} Z`}
        fill="rgba(14, 165, 233, 0.5)"
        stroke="none"
      />
    );
  }), [idealDirs]);

  const crossSectors = useMemo(() => {
    const crossHalves = getCrossHalves(idealDirs, crossLeft, crossRight);
    return crossHalves.map(({ dir, side }, idx) => {
      const angle = directionToDegrees[dir];
      if (angle === undefined) return null;

      let startDeg: number, endDeg: number;
      if (side === 'left') {
        startDeg = angle - 11.25;
        endDeg = angle;
      } else {
        startDeg = angle;
        endDeg = angle + 11.25;
      }

      const startRad = (startDeg - 90) * (Math.PI / 180);
      const endRad = (endDeg - 90) * (Math.PI / 180);
      const x1 = 25 + 20 * Math.cos(startRad);
      const y1 = 25 + 20 * Math.sin(startRad);
      const x2 = 25 + 20 * Math.cos(endRad);
      const y2 = 25 + 20 * Math.sin(endRad);

      return (
        <path
          key={`cross-${dir}-${side}-${idx}`}
          d={`M 25 25 L ${x1} ${y1} A 20 20 0 0 1 ${x2} ${y2} Z`}
          fill="rgba(255, 107, 53, 0.5)"
          stroke="none"
        />
      );
    });
  }, [idealDirs, crossLeft, crossRight]);

  const ringSegments = useMemo(() => Array.from({ length: 16 }).map((_, i) => {
    const angle = i * 22.5;
    const gap = 6;
    const startAngle = (angle - 11.25 + gap - 90) * (Math.PI / 180);
    const endAngle = (angle + 11.25 - gap - 90) * (Math.PI / 180);
    
    const x1 = 25 + 23 * Math.cos(startAngle);
    const y1 = 25 + 23 * Math.sin(startAngle);
    const x2 = 25 + 23 * Math.cos(endAngle);
    const y2 = 25 + 23 * Math.sin(endAngle);
    
    return (
      <path
        key={i}
        d={`M ${x1} ${y1} A 23 23 0 0 1 ${x2} ${y2}`}
        fill="none"
        stroke={ringColor}
        strokeWidth="2"
        strokeLinecap="round"
      />
    );
  }), [ringColor]);

  return (
    <div className="relative w-24 h-24 sm:w-40 sm:h-40 bg-white/60 rounded-full border border-sky/20 flex items-center justify-center shadow-[inset_0_4px_12px_rgba(0,0,0,0.25)]">
      <svg viewBox="0 0 50 50" className="w-full h-full">
        {ringSegments}
        
        <text x="25" y="9" fontSize="4.5" textAnchor="middle" fill={roseTextColor} className="font-black">N</text>
        <text x="41" y="25" fontSize="4.5" textAnchor="middle" dominantBaseline="central" fill={roseTextColor} className="font-black">E</text>
        <text x="25" y="45" fontSize="4.5" textAnchor="middle" fill={roseTextColor} className="font-black">S</text>
        <text x="9" y="25" fontSize="4.5" textAnchor="middle" dominantBaseline="central" fill={roseTextColor} className="font-black">W</text>
        
        {sectors}
        {crossSectors}

        <g transform={`rotate(${currentAngle}, 25, 25)`}>
          <line x1="25" y1="11" x2="25" y2="25" stroke={arrowColor} strokeWidth="2.5" strokeLinecap="round" />
          <path d="M 21 21 L 25 25 L 29 21" fill="none" stroke={arrowColor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
});

export const DayOutlookStatus = memo(function DayOutlookStatus({ speed, direction, site }: { speed: number; direction: string; site: any }) {
  const status = getWindStatus(speed, direction, site);
  const colorMap: Record<string, string> = {
    'Good': 'bg-emerald-500',
    'Light': 'bg-yellow-500',
    'Blown Out': 'bg-red-500',
    'Cross': 'bg-orange',
    'Not Flyable': 'bg-red-500',
    'N/A': 'bg-gray-300',
  };
  const dirColor = colorMap[status.directionStatus?.label] || 'bg-gray-300';
  const spdColor = colorMap[status.speedStatus?.label] || 'bg-gray-300';
  return (
    <div className="flex gap-0.5">
      <span className={`w-3.5 h-3.5 rounded-full ${dirColor} flex items-center justify-center text-[7px] font-bold text-white leading-none`} title={`Direction: ${status.directionStatus?.label}`}>D</span>
      <span className={`w-3.5 h-3.5 rounded-full ${spdColor} flex items-center justify-center text-[7px] font-bold text-white leading-none`} title={`Speed: ${status.speedStatus?.label}`}>S</span>
    </div>
  );
});
