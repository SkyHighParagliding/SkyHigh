export interface Site {
  id: string;
  name: string;
  type: string;
  pgRating: string;
  hgRating: string;
  windDir: string;
  windSpeed: string;
  status: string;
  hazardLevel: string;
  lat: number | null;
  lon: number | null;
  useLiveWeather: string;
  liveStationId: string;
  liveStationIdAlt: string;
  description: string;
  launch: string;
  landing: string;
  hazards: string[];
  rules: string[];
  image: string;
  siteguideUrl: string;
  siteContact: string;
  siteContactPhone: string;
  navigateTo: string;
  launchHeight: string;
  launchHeightHigh: string;
  launchHeight2: string;
  landingHeight2: string;
  hoodedPloversLink: string;
  hoodedPloversActive: string;
  emergencyMarker: string;
  what3words: string;
  isSkyHighSite: string;
  crossLeft: string;
  crossRight: string;
  overrideHideClosed: string;
  unassignedText: string;
  siteguideVersion: string;
  siteguideScrapedAt: string;
  isTidal: string;
  tideStationId: string;
  skipBulkImport: string;
  isXCSite: string;
  essentialInfoImages?: string[];
  essentialInfoText?: string;
  temporarilyClosed?: number;
  upcomingClosureDates?: string[];
  closurePillsMax?: number;
}

export interface WeatherData {
  error?: boolean;
  windSpeed?: number;
  windGust?: number;
  windDirection?: number;
  temperature?: number;
  humidity?: number;
  stationLat?: number;
  stationLon?: number;
  stationName?: string;
  observationTime?: string;
  source?: string;
  [key: string]: unknown;
}

export interface BulkWeatherResponse {
  [siteId: string]: WeatherData;
}

export interface EventItem {
  id: string;
  title: string;
  date: string;
  endDate?: string;
  location?: string;
  description?: string;
  slug?: string;
  type?: string;
}

export interface Sponsor {
  name: string;
  logo?: string;
  url?: string;
  markdown?: string;
}

export interface TideStation {
  id: string;
  name: string;
}

export interface NearbyStation {
  id: string;
  name: string;
  distanceKm: number;
  lat: number;
  lon: number;
  source: string;
}

export interface ExternalSite {
  name: string;
  url: string;
  state?: string;
  stateAbbr?: string;
  region?: string;
}

// ===== API Response Types (also defined in src/hooks/api/*.ts — keep in sync) =====

export interface NewsItem {
  id: string;
  title: string;
  slug: string;
  summary: string;
  content: string;
  author: string;
  category: string;
  published: boolean;
  publishedAt: string;
  image: string;
}

export interface PageData {
  slug: string;
  title: string;
  content: string;
  template: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PageAttachment {
  id: string;
  pageSlug: string;
  originalFilename: string;
  fileSize: number;
  mimeType: string;
  downloadCount: number;
  uploadedAt: string;
}

export interface Flight {
  id: string;
  pilotId: string;
  siteId: string;
  siteName: string;
  startedAt: string;
  endedAt: string | null;
  status: string;
  maxAltitude: number;
  maxSpeed: number;
  totalDistance: number;
  altitudeGain: number;
  altitudeLoss: number;
}

export interface Breadcrumb {
  id: number;
  flightId: string;
  timestamp: number;
  lat: number;
  lon: number;
  altitude: number;
  speed: number;
  heading: number;
}

export interface FlightDetail extends Flight {
  breadcrumbs: Breadcrumb[];
}

export interface Competition {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  location: string;
  pilotRating: string;
  rulesSummary: string;
  registrationUrl: string;
  status: string;
}

export interface BusinessListing {
  id: string;
  businessName: string;
  memberName: string;
  category: string;
  description: string;
  phone: string;
  email: string;
  websiteUrl: string;
  imagePath: string;
}

export interface SafetyOfficer {
  id: string;
  type: 'SO' | 'SSO';
  name: string;
  surname?: string;
  phone?: string;
  email?: string;
  fullNameDisplay?: number;
  showTelegram?: number;
  showPhone?: number;
  showEmail?: number;
  showAdminEmail?: number;
  photoUrl?: string;
}

export interface PublicContact {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  isDriver: boolean;
  displayName: string;
  [key: string]: unknown;
}

export interface XCSite {
  id: string;
  name: string;
  lat: string;
  lon: string;
  useLiveWeather: string;
  [key: string]: unknown;
}

export interface ClosureBanner {
  siteId: string;
  siteName: string;
  firstDate: string;
  lastDate: string;
}
