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

export function getDemoRole(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('demo');
}
