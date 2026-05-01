import { Router } from "express";
import sessionsRouter from "./sessions.js";
import flightsRouter from "../flights.js";
import retrievalsRouter from "../retrievals.js";
import mapMessagesRouter from "../mapMessages.js";
import pilotAuthRouter from "../pilotAuth.js";
import { injectServices } from "../../services/index.js";

const router = Router();

router.use(sessionsRouter);

function injectDemoHeaders(req: any, _res: any, next: any) {
  req.headers['x-demo'] = 'true';
  next();
}

router.use("/flights", injectDemoHeaders, injectServices, flightsRouter);
router.use("/retrievals", injectDemoHeaders, injectServices, retrievalsRouter);
router.use("/map-messages", injectDemoHeaders, injectServices, mapMessagesRouter);
router.use("/pilot-auth", injectDemoHeaders, pilotAuthRouter);

export default router;
