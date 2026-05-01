import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { TideData } from './types';

export interface WeatherCardRenderProps {
  site: any;
  activeWeather: any;
  weather: any;
  distance?: number;
  hasAlt: boolean;
  showAlt: boolean;
  setShowAlt: (v: boolean) => void;
  direction: string;
  windStatus: any;
  idealDirs: string[];
  isDirectionIdeal: boolean;
  windowedForecasts: any[];
  forecastSubtitle: string;
  forecastWindowStartMs?: number;
  forecastWindowEndMs?: number;
  hasExtended: boolean;
  extendedForecast: any;
  tideData: TideData | null;
  showTides: boolean;
  setShowTides: (v: boolean) => void;
  effectiveShowTides: boolean;
  setShowWindMap: (v: boolean) => void;
  windMapPortal: ReactNode;
  IconComponent?: LucideIcon;
  WEATHER_ICON_MAP: Record<string, LucideIcon>;
}
