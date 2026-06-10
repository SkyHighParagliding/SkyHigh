import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { haversineKm } from "@/lib/geomath";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** @deprecated Import haversineKm from @/lib/geomath directly. */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  return haversineKm(lat1, lon1, lat2, lon2);
}

export function getWeatherIcon(icon?: string) {
  if (!icon) return "CloudSun";
  
  // If it's a URL (legacy or from other sources), extract the filename
  if (icon.includes('/') || icon.includes('.')) {
    const iconMap: { [key: string]: string } = {
      "113.png": "Sun", // Sunny
      "116.png": "CloudSun", // Partly cloudy
      "119.png": "Cloudy", // Cloudy
      "122.png": "Cloudy", // Overcast
      "176.png": "CloudRain", // Patchy rain possible
      "266.png": "CloudDrizzle", // Light drizzle
      "302.png": "CloudRain", // Moderate rain
      "308.png": "CloudRain", // Heavy rain
      "338.png": "CloudSnow", // Heavy snow
      "353.png": "CloudDrizzle", // Light shower
    };
    const iconName = icon.split('/').pop() || "";
    return iconMap[iconName] || "CloudSun";
  }

  // Otherwise assume it's already a Lucide icon name
  return icon;
}

const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

export function parseWindSpeed(text: string): { min: number, max: number } | null {
  if (!text) return null;
  const numbers = text.match(/\d+/g);
  if (!numbers || numbers.length === 0) return null;
  
  const min = parseInt(numbers[0]);
  const max = numbers.length > 1 ? parseInt(numbers[1]) : min;
  
  return { min, max };
}

function expandRange(startDir: string, endDir: string): string[] {
  const startIdx = directions.indexOf(startDir);
  const endIdx = directions.indexOf(endDir);
  if (startIdx === -1 || endIdx === -1) return [];
  const result: string[] = [];
  const dist = (endIdx - startIdx + 16) % 16;
  const revDist = (startIdx - endIdx + 16) % 16;
  const steps = dist <= revDist ? dist : -revDist;
  const count = Math.abs(steps);
  const dir = steps >= 0 ? 1 : -1;
  for (let i = 0; i <= count; i++) {
    result.push(directions[(startIdx + i * dir + 16) % 16]);
  }
  return result;
}

function parseWindDirection(text: string): string[] {
  if (!text) return [];
  
  const normalized = text.toUpperCase().trim();
  const segments = normalized.split(',').map(s => s.trim()).filter(Boolean);
  const result: string[] = [];

  for (const seg of segments) {
    if (seg.includes('-') || /\bTO\b/.test(seg)) {
      const parts = seg.split(/[-]|\s+TO\s+/).map(p => p.trim());
      if (parts.length >= 2) {
        const expanded = expandRange(parts[0], parts[1]);
        if (expanded.length > 0) {
          expanded.forEach(d => { if (!result.includes(d)) result.push(d); });
          continue;
        }
      }
    }
    const tokens = seg.split(/\s+/).map(s => s.trim());
    tokens.forEach(t => {
      if (directions.includes(t) && !result.includes(t)) result.push(t);
    });
  }

  if (result.length > 0) return result;
  
  const found: string[] = [];
  directions.forEach(d => {
    if (new RegExp(`\\b${d}\\b`).test(normalized)) {
      found.push(d);
    }
  });
  
  return found;
}

export function getIdealDirections(site: any): string[] {
  let idealDirs: string[] = [];
  if (site.windDir) {
    idealDirs = parseWindDirection(site.windDir);
  }
  if (idealDirs.length === 0 && site.windSpeed) {
    idealDirs = parseWindDirection(site.windSpeed);
  }
  if (idealDirs.length === 0) return [];

  const activeIndices = new Set(idealDirs.map(d => directions.indexOf(d)).filter(i => i !== -1));
  return Array.from(activeIndices).map(idx => directions[idx]);
}

function getCrossDirections(idealDirs: string[], crossLeft: boolean, crossRight: boolean): string[] {
  const crossDirs: string[] = [];
  const idealSet = new Set(idealDirs);
  if (idealSet.size === 0) return crossDirs;

  for (let i = 0; i < directions.length; i++) {
    if (!idealSet.has(directions[i])) continue;
    if (crossRight) {
      const nextIdx = (i + 1) % 16;
      if (!idealSet.has(directions[nextIdx]) && !crossDirs.includes(directions[nextIdx])) {
        crossDirs.push(directions[nextIdx]);
      }
    }
    if (crossLeft) {
      const prevIdx = (i - 1 + 16) % 16;
      if (!idealSet.has(directions[prevIdx]) && !crossDirs.includes(directions[prevIdx])) {
        crossDirs.push(directions[prevIdx]);
      }
    }
  }
  return crossDirs;
}

export function getWindStatus(windSpeed: number, windDirection: string, site: any) {
  let speedRange = parseWindSpeed(site.windSpeed);
  if (!speedRange) speedRange = parseWindSpeed(site.windDir);
  let minSpeed = speedRange?.min ?? null;
  let maxSpeed = speedRange?.max ?? null;
  
  const idealDirs = getIdealDirections(site);
  
  if (minSpeed == null || maxSpeed == null || idealDirs.length === 0) {
    return { 
      label: "N/A", 
      color: "bg-gray-400",
      speedStatus: { label: "N/A", color: "bg-gray-400" },
      directionStatus: { label: "N/A", color: "bg-gray-400" }
    };
  }

  const roundedSpeed = Math.round(windSpeed);
  const isDirectionIdeal = idealDirs.includes(windDirection);

  let speedStatus = { label: "Good", color: "bg-emerald-500" };
  if (roundedSpeed > maxSpeed) {
    speedStatus = { label: "Blown Out", color: "bg-red-500" };
  } else if (roundedSpeed < minSpeed) {
    speedStatus = { label: "Light", color: "bg-yellow-500" };
  }

  const crossLeft = site.crossLeft === "true" || site.crossLeft === true;
  const crossRight = site.crossRight === "true" || site.crossRight === true;
  const crossDirs = getCrossDirections(idealDirs, crossLeft, crossRight);
  const isCross = crossDirs.includes(windDirection);

  let directionStatus = { label: "Good", color: "bg-emerald-500" };
  if (isDirectionIdeal) {
    directionStatus = { label: "Good", color: "bg-emerald-500" };
  } else if (isCross) {
    directionStatus = { label: "Cross", color: "bg-orange" };
  } else {
    directionStatus = { label: "Not Flyable", color: "bg-red-500" };
  }

  let overall = { label: "Good", color: "bg-emerald-500" };
  if (speedStatus.label === "Blown Out") {
    overall = speedStatus;
  } else if (directionStatus.label === "Not Flyable") {
    overall = directionStatus;
  } else if (directionStatus.label === "Cross") {
    overall = directionStatus;
  } else if (speedStatus.label === "Light") {
    overall = speedStatus;
  }

  return { 
    ...overall,
    speedStatus,
    directionStatus
  };
}
