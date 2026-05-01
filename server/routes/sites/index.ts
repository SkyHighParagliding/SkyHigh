import { Router } from "express";
import "./helpers.js";
import crudRouter from "./crud.js";
import scrapingRouter, { externalSitesRouter } from "./scraping.js";
import bulkImportRouter, { triggerBulkImport } from "./bulkImport.js";
import archiveRouter from "./archive.js";
import mediaRouter from "./media.js";
import xcRouter from "./xc.js";
import miscRouter from "./misc.js";
import { invalidateSitesCache } from "./helpers.js";

const router = Router();

router.use(scrapingRouter);
router.use(bulkImportRouter);
router.use(archiveRouter);
router.use(mediaRouter);
router.use(xcRouter);
router.use(miscRouter);
router.use(crudRouter);

export { externalSitesRouter, invalidateSitesCache, triggerBulkImport };
export default router;
