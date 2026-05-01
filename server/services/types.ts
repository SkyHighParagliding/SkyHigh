export interface Pilot {
  id: string;
  email?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
}

export interface Flight {
  id: string;
  pilotId: string | null;
  sessionToken: string | null;
  siteId: string | null;
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
  flightId?: string;
  timestamp: number;
  lat: number;
  lon: number;
  altitude: number;
  speed: number;
  heading: number;
}

export interface LivePilotPosition {
  pilotId: string;
  firstName: string;
  lat: number;
  lon: number;
  altitude: number;
  speed: number;
  heading: number;
  verticalSpeed: number;
  updatedAt: number;
  landed: boolean;
  landedAt: number | null;
}

export interface FlightStats {
  maxAltitude?: number;
  maxSpeed?: number;
  totalDistance?: number;
  altitudeGain?: number;
  altitudeLoss?: number;
}

export interface FlightService {
  createFlight(pilotId: string | null, sessionToken: string | null, siteId: string | null, siteName: string): Promise<Flight>;
  addBreadcrumbs(flightId: string, breadcrumbs: Breadcrumb[], pilot: Pilot | null, sessionToken?: string): Promise<{ inserted: number; total: number } | { error: string; status: number } | null>;
  updatePosition(pilot: Pilot, pos: { lat: number; lon: number; altitude?: number; speed?: number; heading?: number; verticalSpeed?: number }): void;
  getLivePilots(myId: string, isDutyPilot?: boolean): Omit<LivePilotPosition, 'updatedAt' | 'landedAt'>[];
  markLanded(pilotId: string): void;
  endFlight(flightId: string, stats: FlightStats | undefined, pilot: Pilot | null, sessionToken?: string): Promise<{ ok: boolean; error?: string; status?: number; pilotId?: string | null; pilotName?: string; flightId?: string }>;
  getFlightWithBreadcrumbs(flightId: string, pilot: Pilot | null, sessionToken?: string): Promise<{ flight: any; breadcrumbs: any[] } | { error: string; status: number } | null>;
  listFlights(pilotId: string | null, sessionToken?: string): Promise<Flight[]>;
  deleteFlight(flightId: string, pilot: Pilot | null, sessionToken?: string): Promise<{ ok: boolean; error?: string; status?: number }>;
  getFlight(flightId: string): Promise<Flight | null>;
  verifyOwnership(flight: Flight, pilot: Pilot | null, sessionToken?: string): boolean;
  getPilotPosition(pilotId: string): { lat: number; lon: number } | null;
}

export interface Retrieval {
  id: string;
  pilotId: string;
  pilotName: string;
  pilotLat: number | null;
  pilotLon: number | null;
  pilotUpdatedAt: number | null;
  driverId: string | null;
  driverName: string | null;
  driverLat: number | null;
  driverLon: number | null;
  driverUpdatedAt: number | null;
  status: 'awaiting' | 'claimed' | 'completed';
  flightId: string | null;
  createdAt: string;
  completedAt: string | null;
  claimedAt: number | null;
  etaMinutes: number | null;
  positionSource?: string;
}

export interface DriverPosition {
  driverId: string;
  driverName: string;
  lat: number;
  lon: number;
  updatedAt: number;
}

export interface DutyPilotPosition {
  pilotId: string;
  name: string;
  lat: number;
  lon: number;
  updatedAt: number;
}

export interface LaunchSiteInfo {
  available: boolean;
  name?: string;
  lat?: number;
  lon?: number;
}

export interface RetrievalStatusResponse {
  active: boolean;
  status?: string;
  driverName?: string | null;
  driverId?: string | null;
  driverLat?: number | null;
  driverLon?: number | null;
  driverUpdatedAt?: number | null;
  pilotLat?: number | null;
  pilotLon?: number | null;
  etaMinutes?: number | null;
  positionSource?: string;
}

export interface SseClient {
  res: any;
  pilotId?: string;
  role: string;
}

export interface RetrievalService {
  requestRetrieval(pilot: Pilot, lat: number | null, lon: number | null, flightId?: string | null): Promise<{ ok: boolean; alreadyExists?: boolean; alreadyActive?: boolean }>;
  getUnretrieved(): Promise<Retrieval[]>;
  claimRetrieval(pilotId: string, driver: Pilot): Promise<{ ok: boolean; error?: string; status?: number }>;
  unclaimRetrieval(pilotId: string, caller: Pilot): Promise<{ ok: boolean; error?: string; status?: number }>;
  completeRetrieval(pilotId: string, caller: Pilot): Promise<{ ok: boolean; error?: string; status?: number }>;
  updateDriverPosition(driver: Pilot, lat: number, lon: number): Promise<{ ok: boolean; updated: number }>;
  getDriverPositions(): DriverPosition[];
  updatePilotPosition(pilot: Pilot, lat: number, lon: number): Promise<{ ok: boolean; updated: number }>;
  getRetrievalStatus(pilotId: string, callerId: string): Promise<RetrievalStatusResponse | { error: string; status: number }>;
  updateDutyPilotPosition(pilot: Pilot, lat: number, lon: number): void;
  getDutyPilotPosition(): { available: boolean } & Partial<DutyPilotPosition>;
  getLaunchSite(): Promise<LaunchSiteInfo>;
  createRetrievalForPilot(pilotId: string, pilotName: string, pilotLat: number | null, pilotLon: number | null, flightId: string): Promise<void>;

  addSseClient(client: SseClient): void;
  removeSseClient(client: SseClient): void;
  broadcastUpdate(): void;
}

export interface MapMessage {
  id: number | string;
  senderPilotId: string;
  senderName: string;
  recipientPilotId: string;
  recipientName?: string;
  message: string;
  thumbsUp?: number;
  createdAt: string;
  deliveredAt?: string | null;
}

export interface MessageService {
  sendMessage(sender: Pilot, recipientPilotId: string, recipientName: string, message: string): Promise<MapMessage | { error: string; status: number }>;
  getInbox(pilotId: string): Promise<{ messages: any[]; thumbsUps: any[] }>;
  thumbsUp(msgId: string | number, pilotId: string): Promise<{ ok: boolean; error?: string; status?: number }>;
  thumbsDown(msgId: string | number, pilotId: string): Promise<{ ok: boolean; error?: string; status?: number }>;
  markDelivered(msgId: string | number, pilotId: string): Promise<{ ok: boolean; error?: string; status?: number }>;
}

export interface Services {
  flights: FlightService;
  retrievals: RetrievalService;
  messages: MessageService;
}
