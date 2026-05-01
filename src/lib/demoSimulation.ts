export interface SimConfig {
  launchLat: number;
  launchLon: number;
  launchElevation: number;
  headingCenter: number;
  headingRange: number;
  groundSpeed: number;
  climbRate: number;
  descentRate: number;
  targetAltAGL: number;
  waitSeconds: number;
  landingElevation: number;
}

export interface DemoSettings {
  turnAngleMin: number;
  turnAngleMax: number;
  turnIntervalMin: number;
  turnIntervalMax: number;
  climbRateMin: number;
  climbRateMax: number;
  descentRateMin: number;
  descentRateMax: number;
  climbDurationMin: number;
  climbDurationMax: number;
  descentDurationMin: number;
  descentDurationMax: number;
  maxAltitudeAGL: number;
  trimSpeedMin: number;
  trimSpeedMax: number;
  thermalLiftMin: number;
  thermalLiftMax: number;
}

export const DEFAULT_DEMO_SETTINGS: DemoSettings = {
  turnAngleMin: 15,
  turnAngleMax: 35,
  turnIntervalMin: 30,
  turnIntervalMax: 90,
  climbRateMin: 200,
  climbRateMax: 600,
  descentRateMin: 100,
  descentRateMax: 400,
  climbDurationMin: 30,
  climbDurationMax: 120,
  descentDurationMin: 15,
  descentDurationMax: 60,
  maxAltitudeAGL: 2000,
  trimSpeedMin: 25,
  trimSpeedMax: 45,
  thermalLiftMin: 1000,
  thermalLiftMax: 5000,
};

export type SimPhase = 'waiting' | 'climbing' | 'descending' | 'thermaling' | 'landed';

export interface SimPosition {
  lat: number;
  lon: number;
  altitude: number;
  speed: number;
  heading: number;
  verticalSpeed: number;
  phase: SimPhase;
}

const TICK_SECONDS = 3;
const FT_TO_M = 0.3048;
const M_TO_FT = 1 / FT_TO_M;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const R_EARTH = 6371000;

const THERMAL_RADIUS = 100;
const THERMAL_CORE_CLIMB_FPM = 2000;
const THERMAL_ENTRY_MIN_SECONDS = 180;
const THERMAL_ENTRY_MAX_SECONDS = 480;
const THERMAL_ALTITUDE_GAIN_FT = 1500;
const THERMAL_MAX_DURATION_SECONDS = 600;
const THERMAL_MAX_SEARCH_PASSES = 8;
const THERMAL_FORCE_LOCK_PASSES = 5;

interface ThermalState {
  centerLat: number;
  centerLon: number;
  subPhase: 'entry' | 'searching' | 'centering' | 'locked' | 'exit';
  entryHeading: number;
  turnDirection: 1 | -1;
  circleRadius: number;
  circleCenter: { lat: number; lon: number };
  passCount: number;
  ticksInSubPhase: number;
  totalTicks: number;
  altitudeAtEntry: number;
  bestClimbSoFar: number;
  searchArcRemaining: number;
  exitHeading: number;
}

function randRange(min: number, max: number): number {
  return min + Math.random() * Math.max(0, max - min);
}

function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * Math.sin(dLon / 2) ** 2;
  return R_EARTH * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const y = Math.sin(dLon) * Math.cos(lat2 * DEG_TO_RAD);
  const x = Math.cos(lat1 * DEG_TO_RAD) * Math.sin(lat2 * DEG_TO_RAD) -
    Math.sin(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * Math.cos(dLon);
  return (Math.atan2(y, x) * RAD_TO_DEG + 360) % 360;
}

function offsetLatLon(lat: number, lon: number, distM: number, bearingDegrees: number): { lat: number; lon: number } {
  const brng = bearingDegrees * DEG_TO_RAD;
  const dLat = (distM * Math.cos(brng)) / R_EARTH;
  const dLon = (distM * Math.sin(brng)) / (R_EARTH * Math.cos(lat * DEG_TO_RAD));
  return { lat: lat + dLat * RAD_TO_DEG, lon: lon + dLon * RAD_TO_DEG };
}

function thermalClimbRate(distFromCenter: number, coreClimbFpm: number): number {
  if (distFromCenter >= THERMAL_RADIUS) return 0;
  const ratio = distFromCenter / THERMAL_RADIUS;
  return coreClimbFpm * Math.cos(ratio * Math.PI / 2);
}

export class DemoSimulation {
  private config: SimConfig;
  private settings: DemoSettings;
  private heading: number;
  private lat: number;
  private lon: number;
  private altitude: number;
  private phase: SimPhase = 'waiting';
  private elapsedSeconds = 0;
  private flightSeconds = 0;
  private nextTurnAt = 30;

  private reachedMax = false;
  private segmentSeconds = 0;
  private segmentDuration = 0;
  private currentClimbRate = 0;
  private currentDescentRate = 0;

  private thermalPlaced = false;
  private thermalDone = false;
  private thermalCenterLat = 0;
  private thermalCenterLon = 0;
  private thermalTriggerSeconds = 0;
  private thermal: ThermalState | null = null;

  constructor(config: SimConfig, settings?: DemoSettings) {
    this.config = config;
    this.settings = settings || DEFAULT_DEMO_SETTINGS;
    const offset = (Math.random() * 2 - 1) * config.headingRange;
    this.heading = (config.headingCenter + offset + 360) % 360;
    this.lat = config.launchLat;
    this.lon = config.launchLon;
    this.altitude = config.launchElevation;
    this.placeThermal();
    this.startClimbSegment();
  }

  private currentCoreClimbFpm = THERMAL_CORE_CLIMB_FPM;

  setSettings(s: DemoSettings) {
    this.settings = s;
    const range = s.trimSpeedMax - s.trimSpeedMin;
    this.config.groundSpeed = s.trimSpeedMin + Math.random() * range;
  }

  private placeThermal() {
    this.thermalTriggerSeconds = randRange(THERMAL_ENTRY_MIN_SECONDS, THERMAL_ENTRY_MAX_SECONDS);
    this.thermalPlaced = false;
    this.currentCoreClimbFpm = randRange(this.settings.thermalLiftMin, this.settings.thermalLiftMax);
  }

  private placeThermalAhead() {
    const speedMs = (this.config.groundSpeed * 1000) / 3600;
    const leadDistM = speedMs * randRange(3, 8);
    const jitterAngle = (Math.random() * 2 - 1) * 10;
    const bearing = (this.heading + jitterAngle + 360) % 360;
    const pos = offsetLatLon(this.lat, this.lon, leadDistM, bearing);
    this.thermalCenterLat = pos.lat;
    this.thermalCenterLon = pos.lon;
    this.thermalPlaced = true;
  }

  private startClimbSegment() {
    this.segmentSeconds = 0;
    this.currentClimbRate = randRange(this.settings.climbRateMin, this.settings.climbRateMax);
    if (!this.reachedMax) {
      this.segmentDuration = randRange(this.settings.climbDurationMin, this.settings.climbDurationMax);
    } else {
      this.segmentDuration = randRange(this.settings.descentDurationMin, this.settings.descentDurationMax);
    }
  }

  private startDescentSegment() {
    this.segmentSeconds = 0;
    this.currentDescentRate = randRange(this.settings.descentRateMin, this.settings.descentRateMax);
    if (!this.reachedMax) {
      this.segmentDuration = randRange(this.settings.descentDurationMin, this.settings.descentDurationMax);
    } else {
      this.segmentDuration = randRange(this.settings.climbDurationMin, this.settings.climbDurationMax);
    }
  }

  private shouldEnterThermal(): boolean {
    if (this.thermalDone) return false;
    if (this.phase !== 'climbing' && this.phase !== 'descending') return false;

    if (!this.thermalPlaced) {
      if (this.flightSeconds >= this.thermalTriggerSeconds) {
        this.placeThermalAhead();
      }
      return false;
    }

    const dist = distanceM(this.lat, this.lon, this.thermalCenterLat, this.thermalCenterLon);
    return dist < THERMAL_RADIUS;
  }

  private initThermal() {
    const turnDir = Math.random() < 0.5 ? 1 : -1 as 1 | -1;
    const initialCircleRadius = THERMAL_RADIUS * 1.8;
    const perpBearing = (this.heading + turnDir * 90 + 360) % 360;
    const circleCenter = offsetLatLon(this.lat, this.lon, initialCircleRadius, perpBearing);

    this.thermal = {
      centerLat: this.thermalCenterLat,
      centerLon: this.thermalCenterLon,
      subPhase: 'entry',
      entryHeading: this.heading,
      turnDirection: turnDir,
      circleRadius: initialCircleRadius,
      circleCenter: circleCenter,
      passCount: 0,
      ticksInSubPhase: 0,
      totalTicks: 0,
      altitudeAtEntry: this.altitude,
      bestClimbSoFar: 0,
      searchArcRemaining: 0,
      exitHeading: (this.heading + randRange(-30, 30) + 360) % 360,
    };
    this.phase = 'thermaling';
  }

  private exitThermal() {
    this.thermalDone = true;
    this.thermal = null;
    this.phase = 'climbing';
    this.reachedMax = false;
    this.startClimbSegment();
  }

  private forceLock(t: ThermalState) {
    t.subPhase = 'locked';
    t.ticksInSubPhase = 0;
    const bearingToCore = bearingDeg(this.lat, this.lon, t.centerLat, t.centerLon);
    const dist = distanceM(this.lat, this.lon, t.centerLat, t.centerLon);
    t.circleRadius = Math.max(dist * 0.8, 50);
    const perpB = (bearingToCore + t.turnDirection * 90 + 360) % 360;
    t.circleCenter = offsetLatLon(t.centerLat, t.centerLon, t.circleRadius * 0.3, perpB);
  }

  private tickThermal(): SimPosition {
    const t = this.thermal!;
    t.ticksInSubPhase++;
    t.totalTicks++;
    this.flightSeconds += TICK_SECONDS;

    if (this.altitude <= this.config.landingElevation) {
      this.altitude = this.config.landingElevation;
      this.exitThermal();
      this.phase = 'landed';
      return this.position();
    }

    const thermalElapsed = t.totalTicks * TICK_SECONDS;
    if (thermalElapsed >= THERMAL_MAX_DURATION_SECONDS && t.subPhase !== 'exit') {
      t.subPhase = 'exit';
      t.ticksInSubPhase = 0;
    }

    if (t.passCount >= THERMAL_FORCE_LOCK_PASSES && (t.subPhase === 'searching' || t.subPhase === 'centering')) {
      this.forceLock(t);
    }

    if (t.passCount >= THERMAL_MAX_SEARCH_PASSES && t.subPhase !== 'locked' && t.subPhase !== 'exit') {
      t.subPhase = 'exit';
      t.ticksInSubPhase = 0;
    }

    const speedMs = (this.config.groundSpeed * 1000) / 3600;
    const stepM = speedMs * TICK_SECONDS;
    const distToThermalCenter = distanceM(this.lat, this.lon, t.centerLat, t.centerLon);
    const currentClimb = thermalClimbRate(distToThermalCenter, this.currentCoreClimbFpm);
    const altGainedFt = (this.altitude - t.altitudeAtEntry) * M_TO_FT;

    switch (t.subPhase) {
      case 'entry': {
        this.moveForward();
        const climbM = (currentClimb * FT_TO_M * TICK_SECONDS) / 60;
        this.altitude += climbM;

        if (distToThermalCenter > THERMAL_RADIUS * 0.9 || t.ticksInSubPhase > 10) {
          t.subPhase = 'searching';
          t.ticksInSubPhase = 0;
          t.passCount = 1;
          t.searchArcRemaining = randRange(160, 220);
          t.bestClimbSoFar = currentClimb;

          const perpBearing = (this.heading + t.turnDirection * 90 + 360) % 360;
          const r = THERMAL_RADIUS * randRange(1.4, 2.0);
          t.circleRadius = r;
          t.circleCenter = offsetLatLon(this.lat, this.lon, r, perpBearing);
        }
        break;
      }

      case 'searching': {
        const arcPerTick = (stepM / t.circleRadius) * RAD_TO_DEG;
        this.heading = (this.heading + t.turnDirection * arcPerTick + 360) % 360;
        this.moveForward();

        const climbM = (currentClimb * FT_TO_M * TICK_SECONDS) / 60;
        const sinkRate = 150;
        const sinkM = currentClimb > 0 ? 0 : (sinkRate * FT_TO_M * TICK_SECONDS) / 60;
        this.altitude += climbM - sinkM;

        t.searchArcRemaining -= arcPerTick;

        if (currentClimb > t.bestClimbSoFar * 0.3 && distToThermalCenter < THERMAL_RADIUS * 1.2) {
          t.subPhase = 'centering';
          t.ticksInSubPhase = 0;
          t.passCount++;
          t.bestClimbSoFar = Math.max(t.bestClimbSoFar, currentClimb);
        } else if (t.searchArcRemaining <= 0) {
          t.searchArcRemaining = randRange(180, 270);
          t.circleRadius *= 0.85;
          if (t.circleRadius < THERMAL_RADIUS * 0.5) {
            t.circleRadius = THERMAL_RADIUS * randRange(1.0, 1.5);
          }
          const perpBearing = (this.heading + t.turnDirection * 90 + 360) % 360;
          t.circleCenter = offsetLatLon(this.lat, this.lon, t.circleRadius, perpBearing);
          t.passCount++;
        }
        break;
      }

      case 'centering': {
        const bearingToCore = bearingDeg(this.lat, this.lon, t.centerLat, t.centerLon);
        const headingDiff = ((bearingToCore - this.heading + 540) % 360) - 180;
        const turnRate = (stepM / (t.circleRadius * 0.9)) * RAD_TO_DEG;
        const adjustment = Math.sign(headingDiff) * Math.min(Math.abs(headingDiff) * 0.3, turnRate * 1.5);
        this.heading = (this.heading + t.turnDirection * turnRate + adjustment + 360) % 360;
        this.moveForward();

        const climbM = (currentClimb * FT_TO_M * TICK_SECONDS) / 60;
        this.altitude += climbM;

        t.bestClimbSoFar = Math.max(t.bestClimbSoFar, currentClimb);

        if (currentClimb > this.currentCoreClimbFpm * 0.6) {
          t.circleRadius = Math.max(t.circleRadius * 0.95, THERMAL_RADIUS * 0.7);
        } else if (currentClimb < this.currentCoreClimbFpm * 0.2) {
          t.circleRadius = Math.min(t.circleRadius * 1.1, THERMAL_RADIUS * 2.0);
        }

        const perpBearing = (this.heading + t.turnDirection * 90 + 360) % 360;
        t.circleCenter = offsetLatLon(this.lat, this.lon, t.circleRadius, perpBearing);

        if (distToThermalCenter > THERMAL_RADIUS * 1.3) {
          t.subPhase = 'searching';
          t.ticksInSubPhase = 0;
          t.searchArcRemaining = randRange(140, 200);
        }

        if (t.ticksInSubPhase > 15 && distToThermalCenter < THERMAL_RADIUS * 0.6 && currentClimb > this.currentCoreClimbFpm * 0.5) {
          t.subPhase = 'locked';
          t.ticksInSubPhase = 0;
          t.circleRadius = distToThermalCenter + randRange(10, 30);
          if (t.circleRadius < 40) t.circleRadius = 40;
          const perpB = (this.heading + t.turnDirection * 90 + 360) % 360;
          t.circleCenter = offsetLatLon(this.lat, this.lon, t.circleRadius, perpB);
        }
        break;
      }

      case 'locked': {
        const bearingToCore = bearingDeg(this.lat, this.lon, t.centerLat, t.centerLon);
        const headingDiff = ((bearingToCore - this.heading + 540) % 360) - 180;
        const turnRate = (stepM / t.circleRadius) * RAD_TO_DEG;
        const correction = Math.sign(headingDiff) * Math.min(Math.abs(headingDiff) * 0.15, turnRate * 0.5);
        this.heading = (this.heading + t.turnDirection * turnRate + correction + 360) % 360;
        this.moveForward();

        const climbM = (currentClimb * FT_TO_M * TICK_SECONDS) / 60;
        this.altitude += climbM;

        if (altGainedFt >= THERMAL_ALTITUDE_GAIN_FT) {
          t.subPhase = 'exit';
          t.ticksInSubPhase = 0;
        }
        break;
      }

      case 'exit': {
        const targetHeading = t.exitHeading;
        const diff = ((targetHeading - this.heading + 540) % 360) - 180;
        const maxTurn = 8;
        const turn = Math.sign(diff) * Math.min(Math.abs(diff), maxTurn);
        this.heading = (this.heading + turn + 360) % 360;
        this.moveForward();

        if (Math.abs(diff) < 5 || t.ticksInSubPhase > 20) {
          this.exitThermal();
        }
        break;
      }
    }

    return this.position();
  }

  tick(): SimPosition {
    this.elapsedSeconds += TICK_SECONDS;

    switch (this.phase) {
      case 'waiting':
        if (this.elapsedSeconds >= this.config.waitSeconds) {
          this.phase = 'climbing';
          this.flightSeconds = 0;
          this.nextTurnAt = this.settings.turnIntervalMin;
          this.reachedMax = false;
          this.startClimbSegment();
        }
        return this.position();

      case 'climbing': {
        this.flightSeconds += TICK_SECONDS;
        this.segmentSeconds += TICK_SECONDS;

        if (this.shouldEnterThermal()) {
          this.initThermal();
          return this.position();
        }

        this.maybeChangeHeading();
        this.moveForward();

        const climbM = (this.currentClimbRate * FT_TO_M * TICK_SECONDS) / 60;
        this.altitude += climbM;

        const maxAltMSL = this.config.launchElevation + this.settings.maxAltitudeAGL * FT_TO_M;
        if (this.altitude >= maxAltMSL) {
          this.altitude = maxAltMSL;
          this.reachedMax = true;
          this.phase = 'descending';
          this.startDescentSegment();
        } else if (this.segmentSeconds >= this.segmentDuration) {
          this.phase = 'descending';
          this.startDescentSegment();
        }
        return this.position();
      }

      case 'descending': {
        this.flightSeconds += TICK_SECONDS;
        this.segmentSeconds += TICK_SECONDS;

        if (this.shouldEnterThermal()) {
          this.initThermal();
          return this.position();
        }

        this.maybeChangeHeading();
        this.moveForward();

        const descentM = (this.currentDescentRate * FT_TO_M * TICK_SECONDS) / 60;
        this.altitude -= descentM;

        if (this.altitude <= this.config.landingElevation) {
          this.altitude = this.config.landingElevation;
          this.phase = 'landed';
        } else if (this.segmentSeconds >= this.segmentDuration) {
          this.phase = 'climbing';
          this.startClimbSegment();
        }
        return this.position();
      }

      case 'thermaling':
        return this.tickThermal();

      case 'landed':
        return this.position();
    }
  }

  private maybeChangeHeading() {
    if (this.flightSeconds >= this.nextTurnAt) {
      const { turnAngleMin, turnAngleMax, turnIntervalMin, turnIntervalMax } = this.settings;
      const turnAmount = randRange(turnAngleMin, turnAngleMax);
      const direction = Math.random() < 0.5 ? -1 : 1;
      this.heading = (this.heading + direction * turnAmount + 360) % 360;
      this.nextTurnAt = this.flightSeconds + randRange(turnIntervalMin, turnIntervalMax);
    }
  }

  private moveForward() {
    const distanceMeters = (this.config.groundSpeed * 1000 * TICK_SECONDS) / 3600;
    const headingRad = this.heading * DEG_TO_RAD;
    const dLat = (distanceMeters * Math.cos(headingRad)) / R_EARTH;
    const dLon = (distanceMeters * Math.sin(headingRad)) / (R_EARTH * Math.cos(this.lat * DEG_TO_RAD));
    this.lat += dLat * RAD_TO_DEG;
    this.lon += dLon * RAD_TO_DEG;
  }

  private position(): SimPosition {
    let verticalSpeed = 0;
    if (this.phase === 'climbing') {
      verticalSpeed = (this.currentClimbRate * FT_TO_M) / 60;
    } else if (this.phase === 'descending') {
      verticalSpeed = -(this.currentDescentRate * FT_TO_M) / 60;
    } else if (this.phase === 'thermaling' && this.thermal) {
      const dist = distanceM(this.lat, this.lon, this.thermal.centerLat, this.thermal.centerLon);
      const climbFpm = thermalClimbRate(dist, this.currentCoreClimbFpm);
      verticalSpeed = (climbFpm * FT_TO_M) / 60;
      if (this.thermal.subPhase === 'searching' && climbFpm === 0) {
        verticalSpeed = -(150 * FT_TO_M) / 60;
      }
    }
    return {
      lat: this.lat,
      lon: this.lon,
      altitude: this.altitude,
      speed: this.phase === 'waiting' || this.phase === 'landed' ? 0 : this.config.groundSpeed,
      heading: this.heading,
      verticalSpeed,
      phase: this.phase,
    };
  }

  getPhase(): SimPhase {
    return this.phase;
  }

  reset() {
    this.elapsedSeconds = 0;
    this.flightSeconds = 0;
    this.nextTurnAt = this.settings.turnIntervalMin;
    this.phase = 'waiting';
    this.reachedMax = false;
    this.segmentSeconds = 0;
    this.lat = this.config.launchLat;
    this.lon = this.config.launchLon;
    this.altitude = this.config.launchElevation;
    const offset = (Math.random() * 2 - 1) * this.config.headingRange;
    this.heading = (this.config.headingCenter + offset + 360) % 360;
    this.thermalDone = false;
    this.thermal = null;
    this.placeThermal();
    this.startClimbSegment();
  }
}
