import { Router } from "express";
import crudRouter from "./crud.js";
import closuresRouter from "./closures.js";
import scrapingRouter, { externalSitesRouter } from "./scraping.js";
import bulkImportRouter from "./bulkImport.js";
import archiveRouter from "./archive.js";
import mediaRouter from "./media.js";
import xcRouter from "./xc.js";
import miscRouter from "./misc.js";

const router = Router();

router.use(scrapingRouter);
router.use(bulkImportRouter);
router.use(archiveRouter);
router.use(mediaRouter);
router.use(xcRouter);
router.use(miscRouter);
router.use(closuresRouter);
router.use(crudRouter);

export { externalSitesRouter };
export default router;
