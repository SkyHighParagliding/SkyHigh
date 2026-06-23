import "dotenv/config";
import express from "express";
import compression from "compression";
import fs from "fs";
import path from "path";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

import "./server/db.js";
import "./server/seed.js";
import { queryOne } from "./server/pg.js";
import { startWeatherScrapers } from "./server/weather.js";
import { cleanExpiredSessions } from "./server/middleware/auth.js";
import { csrfTokenProvider, csrfTokenValidator, getCSRFTokenRoute } from "./server/middleware/csrf.js";
import createLogger from "./server/utils/logger.js";
import { startScheduledJobs } from "./server/utils/scheduledJobs.js";
import { precomputeWindGridIfNeeded } from "./server/extendedForecast.js";

import sitesRouter, { externalSitesRouter } from "./server/routes/sites/index.js";
import weatherRouter from "./server/routes/weather.js";
import aiRouter from "./server/routes/ai.js";
import pagesRouter from "./server/routes/pages.js";
import newsRouter from "./server/routes/news.js";
import settingsRouter from "./server/routes/settings.js";
import officersRouter from "./server/routes/officers.js";
import checkinsRouter from "./server/routes/checkins.js";
import eventsRouter from "./server/routes/events.js";
import authRouter from "./server/routes/auth.js";
import { isDevBypassActive } from "./server/middleware/auth.js";
import { validationMiddleware } from "./server/middleware/validation.js";
import pageviewsRouter from "./server/routes/pageviews.js";
import proceduresRouter from "./server/routes/procedures.js";
import searchRouter, { seedPublicPrompt } from "./server/routes/search.js";
import contactsRouter from "./server/routes/contacts.js";
import documentsRouter from "./server/routes/documents.js";
import projectsRouter from "./server/routes/projects.js";
import brandingRouter from "./server/routes/branding.js";
import shopRouter from "./server/routes/shop.js";
import tidyhqRouter from "./server/routes/tidyhq.js";
import submissionsRouter from "./server/routes/submissions.js";
import sponsorsRouter from "./server/routes/sponsors.js";
import groundHandlingRouter from "./server/routes/groundHandling.js";
import businessDirectoryRouter from "./server/routes/businessDirectory.js";
import competitionsRouter from "./server/routes/competitions.js";
import pilotAuthRouter from "./server/routes/pilotAuth.js";
import flightsRouter from "./server/routes/flights.js";
import retrievalsRouter from "./server/routes/retrievals.js";
import publicContactsRouter from "./server/routes/publicContacts.js";
import demoRouter from "./server/routes/demo/index.js";
import mapMessagesRouter from "./server/routes/mapMessages.js";
import safetyRouter from "./server/routes/safety.js";
import populateBannersRouter from "./server/routes/admin/populate-banners.js";
import searchLogsRouter from "./server/routes/searchLogs.js";
import { injectServices } from "./server/services/index.js";
import { getHealthStatus } from "./server/utils/health.js";
import { errorHandlerMiddleware } from "./server/utils/errorHandler.js";

const log = createLogger("server");

log.info("Server starting...");
if (isDevBypassActive()) {
  log.warn("DEV_BYPASS_AUTH is active — all authentication is disabled. Do NOT deploy with this enabled.");
}

// Database backups handled by PostgreSQL (no longer needed for SQLite file copies)

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: "Too many search requests. Please try again shortly." },
  standardHeaders: true,
  legacyHeaders: false,
});

const submissionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: async () => {
    try {
      const row = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'submissionRateLimit'");
      const val = row?.value ? parseInt(row.value, 10) : 100;
      return (val > 0 && val <= 500) ? val : 100;
    } catch { return 100; }
  },
  message: { error: "Too many upload attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for general state-changing operations (POST, PUT, DELETE)
// Authenticated users: 100 requests/hour per user
const stateChangeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => {
    // Use authenticated user ID if available, otherwise IP with proper IPv6 handling
    if (req.user?.id) return req.user.id;
    return ipKeyGenerator(req);
  },
  skip: (req) => {
    // Skip rate limiting for safe HTTP methods
    return ["GET", "HEAD", "OPTIONS"].includes(req.method);
  },
});

// Rate limiter for bulk delete operations: 20 requests/hour
const bulkOperationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: "Too many bulk operations. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => {
    if (req.user?.id) return req.user.id;
    return ipKeyGenerator(req);
  },
});

// Rate limiter for public registration: 3 attempts/hour per IP
const publicRegistrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: "Too many registration attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for password reset requests: 5 per hour per IP
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: "Too many password reset attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

async function startServer() {
  const app = express();
  const isProduction = process.env.NODE_ENV === "production";
  const PORT = isProduction ? (process.env.PORT || 5000) : 3001;

  app.set("trust proxy", 1);
  app.use(compression({ level: 6, threshold: 1024 }));
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",  // unsafe-inline needed for React/Vite — replace with nonces when feasible
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '));
    next();
  });
  app.use(express.json({
    limit: '20mb',
    verify: (req: any, _res, buf) => {
      if (req.url?.includes('tidyhq/webhook') || req.originalUrl?.includes('tidyhq/webhook')) {
        req.rawBody = buf.toString('utf8');
      }
    },
  }));
  app.use(validationMiddleware);
  app.use("/uploads/submissions", (_req, res) => {
    res.status(403).json({ error: "Access denied" });
  });
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads"), {
    maxAge: '7d',
    immutable: true,
  }));

  app.get("/ping", (req, res) => {
    res.send("pong");
  });

  app.use((req, res, next) => {
    const isAsset = req.url.startsWith('/@') || req.url.startsWith('/src') || req.url.startsWith('/node_modules') || req.url.includes('.');
    if (!isAsset) {
      log.debug(`${req.method} ${req.path}`);
    }
    next();
  });

  app.use("/api/auth/login", loginLimiter);
  app.use("/api/search/public", searchLimiter);
  app.use("/api/search/admin", searchLimiter);

  // CSRF Protection: Validate tokens on state-changing requests
  app.use("/api/", csrfTokenValidator);
  // CSRF Token Provider: Include token in response headers for authenticated users
  app.use("/api/", csrfTokenProvider);

  // CSRF Token endpoint: Allow frontend to fetch token without side effects
  app.get("/api/csrf-token", csrfTokenProvider, getCSRFTokenRoute);

  // Rate limiting: Apply general rate limiter to all state-changing operations
  // Skips GET/HEAD/OPTIONS (safe methods), limits POST/PUT/DELETE/PATCH
  app.use("/api/", stateChangeLimiter);

  // Rate limiting: Public registration endpoint
  app.post("/api/auth/register-provider", publicRegistrationLimiter);

  // Rate limiting: Password reset request endpoints
  app.post("/api/auth/request-password-reset", passwordResetLimiter);
  app.post("/api/auth/request-pilot-password-reset", passwordResetLimiter);

  // Rate limiting: Bulk delete operations
  app.post("/api/contacts/bulk-delete", bulkOperationLimiter);

  app.use("/api/sites", sitesRouter);
  app.use("/api/weather", weatherRouter);
  app.use("/api/ai", aiRouter);
  app.use("/api/pages", pagesRouter);
  app.use("/api/news", newsRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/safety-officers", officersRouter);
  app.use("/api/checkins", checkinsRouter);
  app.use("/api/events", eventsRouter);
  app.use("/api/external-sites", externalSitesRouter);
  app.get("/api/dev-mode", (_req, res) => {
    res.json({ active: isDevBypassActive() });
  });
  app.use("/api/auth", authRouter);
  app.use("/api/pageviews", pageviewsRouter);
  app.use("/api/procedures", proceduresRouter);
  app.use("/api/search", searchRouter);
  app.use("/api/contacts", contactsRouter);
  app.use("/api/documents", documentsRouter);
  app.use("/api/projects", projectsRouter);
  app.use("/api/branding", brandingRouter);
  app.use("/api/shop", shopRouter);
  app.use("/api/tidyhq", tidyhqRouter);
  app.use("/api/sponsors", sponsorsRouter);
  app.use("/api/ground-handling", groundHandlingRouter);
  app.use("/api/business-directory", businessDirectoryRouter);
  app.use("/api/competitions", competitionsRouter);
  app.use("/api/pilot-auth", pilotAuthRouter);
  app.use("/api/public-contacts", publicContactsRouter);
  app.use("/api/flights", injectServices, flightsRouter);
  app.use("/api/retrievals", injectServices, retrievalsRouter);
  app.use("/api/demo", demoRouter);
  app.use("/api/map-messages", injectServices, mapMessagesRouter);
  app.post("/api/submissions", submissionLimiter);
  app.use("/api/submissions", submissionsRouter);
  app.use("/api/safety-sections", safetyRouter);
  app.use("/api/admin", populateBannersRouter);
  app.use("/api/search-logs", searchLogsRouter);

  app.get("/manifest.json", async (req, res) => {
    const clubName = (await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = $1", ["clubName"]))?.value || "SkyHigh";
    const pwaIcon192 = (await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = $1", ["pwaIcon192"]))?.value || "";
    const pwaIcon512 = (await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = $1", ["pwaIcon512"]))?.value || "";
    const clubFavicon = (await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = $1", ["clubLogoFavicon"]))?.value || "";
    const themeColor = (await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = $1", ["clubPrimaryColor"]))?.value || "#00a8e8";

    const icons: any[] = [];
    if (pwaIcon192) {
      icons.push({ src: pwaIcon192, sizes: "192x192", type: "image/png" });
    } else if (clubFavicon) {
      icons.push({ src: clubFavicon, sizes: "128x128", type: "image/png" });
    }
    if (pwaIcon512) {
      icons.push({ src: pwaIcon512, sizes: "512x512", type: "image/png" });
    }

    res.json({
      name: clubName,
      short_name: clubName,
      start_url: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: themeColor,
      icons,
    });
  });

  app.get("/health", async (req, res) => {
    const health = await getHealthStatus();
    const statusCode = health.status === 'unhealthy' ? 503 : health.status === 'degraded' ? 200 : 200;
    res.status(statusCode).json(health);
  });

  if (isProduction) {
    const publicPath = path.join(process.cwd(), "dist", "public");
    if (fs.existsSync(publicPath)) {
      app.use('/assets', express.static(path.join(publicPath, 'assets'), {
        maxAge: '1y',
        immutable: true,
      }));
      app.use(express.static(publicPath, {
        maxAge: '1h',
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
          }
        },
      }));
      app.get("*", (req, res) => {
        const indexPath = path.join(publicPath, "index.html");
        if (fs.existsSync(indexPath)) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
          res.sendFile(indexPath);
        } else {
          res.status(200).send("OK");
        }
      });
    } else {
      app.get("*", (req, res) => {
        res.status(200).send("OK");
      });
    }
  }

  app.use(errorHandlerMiddleware);

  log.info(`Attempting to listen on port ${PORT}...`);

  const server = app.listen(Number(PORT), "0.0.0.0", () => {
    log.info(`API server listening on http://0.0.0.0:${PORT}`);
    try {
      startWeatherScrapers();
    } catch (e: any) {
      log.error("Fetch weather data error", e?.message);
    }
  });

  server.on('error', (e: any) => {
    log.error("SERVER ERROR", e?.message);
    process.exit(1);
  });

  setInterval(() => {
    cleanExpiredSessions();
  }, 60 * 60 * 1000);

  await precomputeWindGridIfNeeded();
  startScheduledJobs();
  seedPublicPrompt().catch(e => log.error("seedPublicPrompt failed", e?.message));
}

startServer().catch(err => {
  log.error("CRITICAL: Failed to start server", err?.message);
  process.exit(1);
});
