import { RealFlightService } from "./realFlightService.js";
import { DemoFlightService } from "./demoFlightService.js";
import { RealRetrievalService } from "./realRetrievalService.js";
import { DemoRetrievalService } from "./demoRetrievalService.js";
import { RealMessageService } from "./realMessageService.js";
import { DemoMessageService } from "./demoMessageService.js";
import type { Services } from "./types.js";

const realFlightService = new RealFlightService();
const realRetrievalService = new RealRetrievalService();
const realMessageService = new RealMessageService();

const demoFlightService = new DemoFlightService();
const demoRetrievalService = new DemoRetrievalService();
const demoMessageService = new DemoMessageService();

demoRetrievalService.flightService = demoFlightService;

const realServices: Services = {
  flights: realFlightService,
  retrievals: realRetrievalService,
  messages: realMessageService,
};

const demoServices: Services = {
  flights: demoFlightService,
  retrievals: demoRetrievalService,
  messages: demoMessageService,
};

export function clearDemoState() {
  demoFlightService.clear();
  demoRetrievalService.clear();
  demoMessageService.clear();
}

export function isDemoRequest(req: any): boolean {
  return req.headers['x-demo'] === 'true' || req.query?.demo === 'true';
}

function getServicesForRequest(req: any): Services {
  return isDemoRequest(req) ? demoServices : realServices;
}

export function injectServices(req: any, _res: any, next: any) {
  if (isDemoRequest(req) && req.headers['x-demo'] !== 'true') {
    req.headers['x-demo'] = 'true';
  }
  req.services = getServicesForRequest(req);
  next();
}
