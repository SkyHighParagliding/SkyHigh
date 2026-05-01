export const DEMO_LAUNCH = {
  lat: -36.18041,
  lon: 147.98305,
  elevation: 1456,
  siteName: 'Mt Elliot',
};

export interface DemoPilotConfig {
  id: string;
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  token: string;
}

const PILOT_FIRST_NAMES = [
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

export function generateDemoPilots(count: number): Record<string, DemoPilotConfig> {
  const result: Record<string, DemoPilotConfig> = {};
  for (let i = 1; i <= count; i++) {
    const key = `pilot${i}`;
    result[key] = {
      id: `demo-pilot-${i}`,
      email: `pilot${i}@demo.local`,
      name: `${PILOT_FIRST_NAMES[(i - 1) % PILOT_FIRST_NAMES.length]} Demo`,
      firstName: PILOT_FIRST_NAMES[(i - 1) % PILOT_FIRST_NAMES.length],
      lastName: 'Demo',
      token: `demo-token-pilot-${i}`,
    };
  }
  return result;
}

export function generateDemoDrivers(count: number, _pilotCount?: number): Record<string, DemoPilotConfig> {
  const result: Record<string, DemoPilotConfig> = {};
  for (let i = 1; i <= count; i++) {
    const key = `driver${i}`;
    const nameIdx = (i - 1) % DRIVER_FIRST_NAMES.length;
    result[key] = {
      id: `demo-driver-${i}`,
      email: `driver${i}@demo.local`,
      name: `${DRIVER_FIRST_NAMES[nameIdx]} Demo`,
      firstName: DRIVER_FIRST_NAMES[nameIdx],
      lastName: 'Demo',
      token: `demo-token-driver-${i}`,
    };
  }
  return result;
}

export function generateDemoDutyPilots(count: number, _pilotCount?: number, _driverCount?: number): Record<string, DemoPilotConfig> {
  const result: Record<string, DemoPilotConfig> = {};
  for (let i = 1; i <= count; i++) {
    const key = `duty${i}`;
    const nameIdx = (i - 1) % DUTY_FIRST_NAMES.length;
    result[key] = {
      id: `demo-duty-${i}`,
      email: `duty${i}@demo.local`,
      name: `${DUTY_FIRST_NAMES[nameIdx]} Demo`,
      firstName: DUTY_FIRST_NAMES[nameIdx],
      lastName: 'Demo',
      token: `demo-token-duty-${i}`,
    };
  }
  return result;
}

export const DEMO_PILOTS = generateDemoPilots(2);
export const DEMO_DRIVERS = generateDemoDrivers(2, 2);

export function generateSimConfig(pilotIndex: number, trimSpeedMin = 25, trimSpeedMax = 45) {
  const headings = [315, 45, 135, 225, 270, 90, 180, 0];
  const heading = headings[(pilotIndex - 1) % headings.length];
  const climbVariation = 50 + ((pilotIndex * 37) % 200);
  const speedRange = trimSpeedMax - trimSpeedMin;
  const trimSpeed = trimSpeedMin + ((pilotIndex * 7) % Math.max(1, speedRange + 1));
  return {
    launchLat: DEMO_LAUNCH.lat,
    launchLon: DEMO_LAUNCH.lon,
    launchElevation: DEMO_LAUNCH.elevation,
    headingCenter: heading,
    headingRange: 45,
    groundSpeed: Math.min(trimSpeed, trimSpeedMax),
    climbRate: 150 + climbVariation,
    descentRate: 150 + climbVariation,
    targetAltAGL: 2000,
    waitSeconds: 15 + (pilotIndex * 5) % 20,
    landingElevation: 350,
  };
}

export const PILOT1_SIM_CONFIG = generateSimConfig(1);
export const PILOT2_SIM_CONFIG = generateSimConfig(2);

export function getDemoRole(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('demo');
}

export function isDemoMode(): boolean {
  return !!getDemoRole();
}
