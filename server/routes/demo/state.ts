import createLogger from "../../utils/logger.js";
import { requireAuth } from "../../middleware/auth.js";

export const log = createLogger("demo");

export interface DemoPilot {
  id: string;
  email: string;
  name: string;
  firstName: string;
  lastName: string;
}

export const DEMO_TOKENS: Record<string, DemoPilot> = {};

export const PILOT_FIRST_NAMES = [
  'Alex', 'Sam', 'Jordan', 'Casey', 'Riley', 'Morgan',
  'Quinn', 'Avery', 'Blake', 'Drew', 'Emery', 'Finley',
  'Lane', 'Micah', 'Nico', 'Parker',
];

const DRIVER_FIRST_NAMES = [
  'Charlie', 'Taylor', 'Harper', 'Kai',
  'Reese', 'Sage', 'Skyler', 'Tatum',
  'Val', 'Wren', 'Zion', 'Ash', 'Bay', 'Cruz',
];

const DUTY_FIRST_NAMES = [
  'Robin', 'Dana', 'Jesse', 'Pat', 'Kerry', 'Kim',
  'Lee', 'Chris', 'Jamie', 'Frankie',
];

export function generateDemoTokens(pilotCount: number, driverCount: number) {
  for (const key of Object.keys(DEMO_TOKENS)) delete DEMO_TOKENS[key];

  for (let i = 1; i <= pilotCount; i++) {
    const token = `demo-token-pilot-${i}`;
    DEMO_TOKENS[token] = {
      id: `demo-pilot-${i}`,
      email: `pilot${i}@demo.local`,
      name: `${PILOT_FIRST_NAMES[(i - 1) % PILOT_FIRST_NAMES.length]} Demo`,
      firstName: PILOT_FIRST_NAMES[(i - 1) % PILOT_FIRST_NAMES.length],
      lastName: 'Demo',
    };
  }
  for (let i = 1; i <= driverCount; i++) {
    const token = `demo-token-driver-${i}`;
    const nameIdx = (i - 1) % DRIVER_FIRST_NAMES.length;
    DEMO_TOKENS[token] = {
      id: `demo-driver-${i}`,
      email: `driver${i}@demo.local`,
      name: `${DRIVER_FIRST_NAMES[nameIdx]} Demo`,
      firstName: DRIVER_FIRST_NAMES[nameIdx],
      lastName: 'Demo',
    };
  }
  const dutyToken = `demo-token-duty-1`;
  const dutyNameIdx = 0;
  DEMO_TOKENS[dutyToken] = {
    id: `demo-duty-1`,
    email: `duty1@demo.local`,
    name: `${DUTY_FIRST_NAMES[dutyNameIdx]} Demo`,
    firstName: DUTY_FIRST_NAMES[dutyNameIdx],
    lastName: 'Demo',
  };
}

generateDemoTokens(2, 2);

export function requireDemoAuth(req: any, res: any, next: any) {
  const token = req.headers["x-pilot-token"] || req.headers.authorization?.replace("Bearer ", "") || req.query?.pilotToken;
  const pilot = token ? DEMO_TOKENS[token] : null;
  if (!pilot) {
    return res.status(401).json({ error: "Invalid demo token" });
  }
  req.pilot = pilot;
  next();
}

export function optionalDemoAuth(req: any, _res: any, next: any) {
  const token = req.headers["x-pilot-token"] || req.headers.authorization?.replace("Bearer ", "");
  req.pilot = token ? DEMO_TOKENS[token] || null : null;
  next();
}

export let activeDemoSession: string | null = null;
export let demoSessionExpiry: number = 0;
export let demoPilotCount = 2;
export let demoDriverCount = 2;

export function setSessionState(s: { session: string | null; expiry: number; pilots: number; drivers: number }) {
  activeDemoSession = s.session;
  demoSessionExpiry = s.expiry;
  demoPilotCount = s.pilots;
  demoDriverCount = s.drivers;
}

export function requireAdminAuth(req: any, res: any, next: any) {
  requireAuth(req, res, (err?: any) => {
    if (err) return next(err);
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    next();
  });
}

export function requireDemoSession(req: any, res: any, next: any) {
  const sessionId = req.headers['x-demo-session'] || req.query?.demoSession;
  if (!activeDemoSession || activeDemoSession !== sessionId || Date.now() > demoSessionExpiry) {
    log.info(`Demo session rejected: url=${req.url} provided=${sessionId || 'none'} active=${activeDemoSession || 'none'}`);
    return res.status(403).json({ error: "Invalid or expired demo session" });
  }
  next();
}
