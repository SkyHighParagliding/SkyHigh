# Graph Report - C:\Users\User\Documents\CodeFolder\SkyHigh  (2026-06-10)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 2315 nodes · 5189 edges · 121 communities (112 shown, 9 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.76)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a11bf39b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Import Cycles
- None detected.

## Communities (121 total, 9 thin omitted)

### Community 0 - "Backend Auth & Routes"
Cohesion: 0.05
Nodes (60): log, router, cleanExpiredSessions(), DEV_ADMIN_USER, getSessionTtlMs(), isDevBypassActive(), requireAuth(), requireSOOrAdmin() (+52 more)

### Community 1 - "UI Modals & Dialogs"
Cohesion: 0.10
Nodes (37): AISiteGeneratorModal(), AISiteGeneratorModalProps, UnsavedChangesModal(), UnsavedChangesModalProps, ConnectionCard, FaqData, TierData, PageView (+29 more)

### Community 2 - "Wind Visualization"
Cohesion: 0.06
Nodes (49): BulkUploadDialog(), BulkUploadDialogProps, BulkUploadResult, UploadResult, WEATHER_ICON_MAP, WindMap, formatDisplayTime(), cn() (+41 more)

### Community 3 - "XC Flight Tracking"
Cohesion: 0.07
Nodes (51): WindCanvas, WindMapProps, WindMapProto(), DEFAULT_ZOOM_SETPOINTS, getCompassDirection(), nextSpeed(), PLAY_SPEEDS, PlaySpeed (+43 more)

### Community 4 - "Photo Management"
Cohesion: 0.03
Nodes (63): AuthProvider(), SettingsProvider(), AdminAIModels, AdminBranding, AdminBusinessDirectory, AdminCheckins, AdminCompetitions, AdminConnections (+55 more)

### Community 5 - "Backend Auth & Routes"
Cohesion: 0.07
Nodes (49): getSlugFromStationId(), router, finalizeBulkImport(), router, runBulkImportLoop(), triggerBulkImport(), uploadsDir, router (+41 more)

### Community 6 - "Backend Auth & Routes"
Cohesion: 0.05
Nodes (42): SocialIcons(), defaultSettings, emptyLogos, LogoSet, resolveActiveLogos(), resolveDarkLogos(), resolveLightLogos(), Settings (+34 more)

### Community 7 - "React Data Hooks"
Cohesion: 0.06
Nodes (35): ContentImageToolbar(), LibraryImage, ScreenshotEntry, GoogleDocsPaste(), GoogleDocsPasteProps, turndown, HeroImagePicker(), HeroImagePickerProps (+27 more)

### Community 8 - "XC Flight Tracking"
Cohesion: 0.08
Nodes (36): AIRSPACE_COLORS, BEARINGS, BreadcrumbData, buildRings(), CARDINAL_TO_DEGREES, createWindArrowIcon(), DEFAULT_RING_DISTANCES, destinationPoint() (+28 more)

### Community 9 - "Backend Auth & Routes"
Cohesion: 0.09
Nodes (38): router, router, DEMO_TOKENS, DemoPilot, DRIVER_FIRST_NAMES, DUTY_FIRST_NAMES, generateDemoTokens(), log (+30 more)

### Community 10 - "Backend Auth & Routes"
Cohesion: 0.06
Nodes (34): useClosureBanners(), useUpcomingEvents(), useHomeSites(), PhotoSlider(), PhotoSliderProps, SliderPhoto, VARIANT_DIMS, VARIANTS (+26 more)

### Community 11 - "Backend Auth & Routes"
Cohesion: 0.04
Nodes (45): dependencies, @aws-sdk/client-s3, bcryptjs, cheerio, class-variance-authority, clsx, compression, concurrently (+37 more)

### Community 12 - "UI Modals & Dialogs"
Cohesion: 0.06
Nodes (35): useCreateCheckin(), useSite(), useSites(), useWeather(), FlyingSitesWidget(), EmergencyMedicalCard(), EmergencyMedicalCardProps, Hospital (+27 more)

### Community 13 - "UI Modals & Dialogs"
Cohesion: 0.07
Nodes (29): ensureDefaultAdmin(), escapeHtml(), log, rateLimitMap, router, sendPasswordResetEmail(), TokenInvalidError, CategoryRow (+21 more)

### Community 14 - "File Upload & Storage"
Cohesion: 0.07
Nodes (31): BRANDING_DIR, log, LogoVariant, router, upload, VARIANTS, attachmentsDir, PageAttachmentRow (+23 more)

### Community 15 - "XC Flight Tracking"
Cohesion: 0.09
Nodes (29): AdminSearchBox(), SearchResponse, SearchResult, ClassicFooter(), ClassicHeader(), Layout(), WonderfulFooter, WonderfulHeader (+21 more)

### Community 16 - "Photo Management"
Cohesion: 0.08
Nodes (28): FlightControls(), FlightControlsProps, formatDistance(), formatDuration(), ComposeTarget, MapMessage, MapMessaging(), MapMessagingProps (+20 more)

### Community 17 - "Backend Auth & Routes"
Cohesion: 0.09
Nodes (35): AIRSPACE_TYPE_MAP, AltLimit, ICAO_CLASS_MAP, OpenAIPFeature, OpenAIPResponse, router, XCSiteRow, AirspaceProperties (+27 more)

### Community 18 - "Wind Visualization"
Cohesion: 0.10
Nodes (30): adminKeys, useAdminSiteDetail(), useAdminSites(), useExternalSites(), useSaveSiteMutation(), adminDataKeys, useAIModels(), useDeleteAIModelMutation() (+22 more)

### Community 19 - "Search & Discovery"
Cohesion: 0.07
Nodes (24): CommitteeRow, ContactRow, log, router, log, pilotRateLimitMap, PilotRow, router (+16 more)

### Community 20 - "Backend Auth & Routes"
Cohesion: 0.09
Nodes (29): ALLOWED_PREFIXES, copyToDriveMarketingFolder(), generateSliderImages(), resizeAndCompress(), router, SLIDER_SIZES, uniqueFilename(), upload (+21 more)

### Community 21 - "Backend Auth & Routes"
Cohesion: 0.10
Nodes (5): DemoRetrievalService, RealRetrievalService, recalcProductionDriverETAs(), Pilot, SseClient

### Community 22 - "Wind Visualization"
Cohesion: 0.09
Nodes (24): useFlightTracker(), THRESHOLD_OPTIONS, useProximityAlerts(), RetrievalStatusData, useRetrievalStatus(), UseRetrievalStatusOptions, DEFAULT_DISABLED_AIRSPACE, haversineKm() (+16 more)

### Community 23 - "Wind Visualization"
Cohesion: 0.08
Nodes (28): ADMIN_NAV_INDEX, buildPublicContext(), CachedContext, COMPASS_DIRS, computeFlyability(), extractQueryDates(), filterContextByClosureDates(), findGoodHrlySlot() (+20 more)

### Community 24 - "Backend Auth & Routes"
Cohesion: 0.06
Nodes (31): audio-recorder, backlink, bases, bookmarks, canvas, command-palette, daily-notes, editor-status (+23 more)

### Community 25 - "Backend Auth & Routes"
Cohesion: 0.08
Nodes (20): useSafetyOfficers(), buildCallout(), CommitteeMember, CommitteeMemberCard(), CommitteeWidget(), CustomTagWidget(), extractRole(), getSortOrder() (+12 more)

### Community 26 - "Backend Auth & Routes"
Cohesion: 0.15
Nodes (12): bearingDeg(), DEFAULT_DEMO_SETTINGS, DemoSettings, DemoSimulation, distanceM(), offsetLatLon(), randRange(), SimConfig (+4 more)

### Community 27 - "Admin Dashboard"
Cohesion: 0.09
Nodes (23): fetchTidyHQEvents(), getCacheTtl(), log, normalizeEventDates(), parseTidyHQDate(), router, router, checkDatabase() (+15 more)

### Community 28 - "Backend Auth & Routes"
Cohesion: 0.10
Nodes (25): activeRecalcs, driverEtaLastCalc, fetchBestSatellitePosition(), getSettingNum(), liveDriverPositions, log, pollSatelliteForStaleRetrievals(), SatFix (+17 more)

### Community 29 - "Admin Dashboard"
Cohesion: 0.11
Nodes (24): eventKeys, HomeSitesResult, siteKeys, useBulkWeather(), useTideStations(), getRecentSites(), getStoredVisits(), recordSiteView() (+16 more)

### Community 30 - "Backend Auth & Routes"
Cohesion: 0.14
Nodes (21): flightKeys, useDeleteFlightMutation(), useFlight(), useFlights(), computePointsOfInterest(), distanceDisplay(), FlightDetailView(), FlightHistory() (+13 more)

### Community 31 - "XC Flight Tracking"
Cohesion: 0.09
Nodes (18): ErrorBoundary, Props, State, DEMO_DRIVERS, DEMO_PILOTS, DemoPilotConfig, DRIVER_FIRST_NAMES, DUTY_FIRST_NAMES (+10 more)

### Community 32 - "Backend Auth & Routes"
Cohesion: 0.11
Nodes (21): computeSegmentDistances(), decodePolyline(), DemoRouteAnim, fetchOSRMRoute(), haversineDistance(), LivePilotData, RetrievalRecord, RouteInfo (+13 more)

### Community 33 - "Backend Auth & Routes"
Cohesion: 0.15
Nodes (22): getIndexedDocumentsContext(), getPublicDocumentsContext(), log, router, upload, driveFilesCache, log, router (+14 more)

### Community 34 - "React Data Hooks"
Cohesion: 0.09
Nodes (3): DemoFlightService, RealFlightService, Flight

### Community 35 - "UI Modals & Dialogs"
Cohesion: 0.15
Nodes (26): buildExtendedTiles(), buildSiteExtendedForecast(), cacheWindGrid(), cleanupOldExtendedForecasts(), computeExtendedWindGrid(), ExtendedGrid, ExtendedGridPoint, extractAllSiteExtendedForecasts() (+18 more)

### Community 36 - "Weather & Forecasts"
Cohesion: 0.12
Nodes (26): AUSTRALIAN_TIDE_STATIONS, CachedPredictions, computeTideDataFromPredictions(), fetchAndCachePredictions(), fetchBomTideData(), findHighLowTidesAstronomical(), findNearestStation(), getAllStations() (+18 more)

### Community 37 - "UI Modals & Dialogs"
Cohesion: 0.15
Nodes (19): FlightTrail(), FlightTrailProps, LivePilot, PressureSensorConstructor, PressureSensorReading, Window, generateSimConfig(), Breadcrumb (+11 more)

### Community 38 - "Backend Auth & Routes"
Cohesion: 0.12
Nodes (19): adminCrudKeys, useAdminCompetitions(), useAdminNews(), useAdminSponsors(), useCompetitionMutation(), useCrudMutation(), useSponsorMutation(), NewsItem (+11 more)

### Community 39 - "XC Flight Tracking"
Cohesion: 0.15
Nodes (25): Insecure Direct Object Reference (IDOR), Memory Leak, Open Redirect Vulnerability, Race Condition, ReDoS (Regular Expression Denial of Service), Session Token Exposure, SSE Authentication Token Leakage, Stale Closure in React (+17 more)

### Community 40 - "UI Modals & Dialogs"
Cohesion: 0.13
Nodes (15): log, log, getSettingNum(), livePilots, log, pruneStalePositions(), Breadcrumb, DriverPosition (+7 more)

### Community 41 - "XC Flight Tracking"
Cohesion: 0.10
Nodes (17): AIImageEnhancerModal(), CROP_STEPS, CropStep, SliderData, BannedIp, ImagePair, SCREENSHOT_CATEGORIES, ScreenshotEntry (+9 more)

### Community 42 - "Wind Visualization"
Cohesion: 0.10
Nodes (20): BulkWeatherRow, extendedGridHandler, log, router, SiteCoordRow, SiteRow, WeatherForecastRow, WeatherObservationRow (+12 more)

### Community 43 - "Backend Auth & Routes"
Cohesion: 0.13
Nodes (16): XCMap(), DataUsageStats, formatBytes(), formatRate(), globalTracker, installFetchInterceptor(), notifyListeners(), PhoneDataUsage (+8 more)

### Community 44 - "Backend Auth & Routes"
Cohesion: 0.14
Nodes (16): EXEMPT_CATEGORIES, generateCorrectedFilename(), getExtension(), getTodayISO(), isExemptCategory(), isValidFilename(), renameFile(), stripExtension() (+8 more)

### Community 45 - "Weather & Forecasts"
Cohesion: 0.14
Nodes (20): active, bases:Create new base, canvas:Create new canvas, command-palette:Open command palette, daily-notes:Open today's daily note, graph:Open graph view, switcher:Open quick switcher, templates:Insert template (+12 more)

### Community 46 - "UI Modals & Dialogs"
Cohesion: 0.21
Nodes (20): cleanupOldGridData(), doFetchCoarseGrid(), escapeLike(), extractSiteForecast(), fetchCoarseGrid(), fetchCoarseGridWithStatus(), fetchFineGrid(), fetchFineGridWithStatus() (+12 more)

### Community 47 - "Wind Visualization"
Cohesion: 0.11
Nodes (19): Duplication & Architecture Review — Cycle 4, server/.env.ts, server/routes/settings.ts, server/routes/sites/crud.ts, server/services/imageProcessing.ts, server/utils/date.ts, server/utils/pagination.ts, src/components/AIImageEnhancerModal.ts (+11 more)

### Community 48 - "UI Modals & Dialogs"
Cohesion: 0.16
Nodes (14): useNewsMutation(), useNews(), PageAttachment, PageData, pageKeys, useDeletePageMutation(), usePage(), usePageAttachments() (+6 more)

### Community 49 - "Backend Auth & Routes"
Cohesion: 0.11
Nodes (15): contactsCount, coreSeedPages, count, eslCount, existingPrompt, ghCount, log, newsCount (+7 more)

### Community 50 - "UI Modals & Dialogs"
Cohesion: 0.14
Nodes (13): AdminProjectEdit(), Contact, DocumentModal(), DriveSearchResult, formatFileSize(), getMimeIcon(), Project, ProjectDocument (+5 more)

### Community 51 - "UI Modals & Dialogs"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+8 more)

### Community 52 - "Weather & Forecasts"
Cohesion: 0.14
Nodes (10): Bounds, calcPoints(), COARSE_ICON, DEFAULT_COARSE, DEFAULT_FINE, FINE_ICON, getStatus(), GridBoundsSelector() (+2 more)

### Community 53 - "React Data Hooks"
Cohesion: 0.14
Nodes (16): Authentication & Authorization Bypass, Cloudflare R2, Express 4 + TypeScript, Gemini AI (@google/genai), Leaflet + D3 + Canvas Wind Map, Open-Meteo Weather API, React 19 + TypeScript (Vite), react-query (+8 more)

### Community 54 - "Backend Auth & Routes"
Cohesion: 0.12
Nodes (16): Tailwind CSS v4, devDependencies, cross-env, esbuild, fallow, rollup-plugin-visualizer, @tailwindcss/vite, tsx (+8 more)

### Community 55 - "Wind Visualization"
Cohesion: 0.16
Nodes (12): ASPECT_MAP, BEST_RES_ORDER, buildGridTiles(), ClubPhotos(), GridTile, ImageEntry, pickSize(), PlacedTile (+4 more)

### Community 56 - "UI Modals & Dialogs"
Cohesion: 0.18
Nodes (14): cache, degToCardinal(), fetchFreeFlightWxData(), fetchWithRetryLocal(), FreeFlightWxData, FreeFlightWxRawRecord, FreeFlightWxReading, FreeFlightWxStation (+6 more)

### Community 57 - "Photo Management"
Cohesion: 0.21
Nodes (14): Dual-Database Compatibility, Path Traversal Vulnerability, Database Compatibility Review — Cycle 4, Coordinator Fix Plan — Cycle 4, Security Review — Cycle 4, Cycle 5 Coordinator Fix Plan, Cycle 5 Type Safety Review, server/middleware/auth.ts (+6 more)

### Community 58 - "Backend Auth & Routes"
Cohesion: 0.19
Nodes (5): DemoMapMessage, DemoMessageService, log, MapMessage, MessageService

### Community 59 - "React Data Hooks"
Cohesion: 0.24
Nodes (9): annotations, HomePageMapContent(), HomePageMapIcon(), socialLinks, useHomeSettings(), ALLOWED_YT_HOSTS, extractVideoId(), AdminHomeSettings() (+1 more)

### Community 60 - "Weather & Forecasts"
Cohesion: 0.18
Nodes (11): buildWindObservations(), CARDINAL_TO_DEGREES, haversineKm(), idwInterpolate(), parseWindDirection(), Particle, WIND_FIELD_DEFAULTS, WindFieldLayer() (+3 more)

### Community 61 - "Backend Auth & Routes"
Cohesion: 0.27
Nodes (10): contactKeys, PublicContact, useDeleteContactMutation(), usePublicContacts(), useSaveContactMutation(), useSendResetMutation(), AdminPublicContacts(), PilotRow (+2 more)

### Community 62 - "Weather & Forecasts"
Cohesion: 0.20
Nodes (8): Message, PublicSearchBox(), renderInlineMarkdown(), renderMarkdown(), SpeechRecognition, SpeechRecognitionEvent, VoiceMicButtonProps, Window

### Community 63 - "UI Modals & Dialogs"
Cohesion: 0.24
Nodes (12): P-002: SSE Token Leak Fix, P-003: useRetrievalMap Record<string,unknown> Fix, P-007: SSE Connection Churn Fix, P-009: useXCMapState Background Wind Polling Fix, P-011: DutyPilotMap Unguarded lat! Fix, T-002: useRetrievalMap Record<string,unknown> Mismatch, T-004: pilotLat!/pilotLon! Non-null Assertions, src/pages/DutyPilotMap.tsx (+4 more)

### Community 64 - "Wind Visualization"
Cohesion: 0.26
Nodes (9): csrfTokenProvider(), csrfTokenValidator(), getCSRFTokenRoute(), log, CSRFToken, generateCSRFToken(), getOrCreateCSRFToken(), tokenStore (+1 more)

### Community 65 - "Weather & Forecasts"
Cohesion: 0.23
Nodes (11): cacheKey(), calculateSequentialETAs(), _fetchOSRM(), fetchOSRMDrivingETA(), haversineDistance(), inFlightRequests, log, osrmCache (+3 more)

### Community 66 - "React Data Hooks"
Cohesion: 0.18
Nodes (9): description, hooks, PreToolUse, SessionEnd, SessionStart, permissions, allow, airspaces (+1 more)

### Community 67 - "UI Modals & Dialogs"
Cohesion: 0.18
Nodes (11): scripts, analyze, build, clean, dev, dev:api, dev:client, lint (+3 more)

### Community 68 - "UI Modals & Dialogs"
Cohesion: 0.18
Nodes (7): MosaicItem, Row, SLOT_CYCLE, SLOT_DIMS, SlotType, VideoWall(), YT_QUALITY_FALLBACKS

### Community 69 - "UI Modals & Dialogs"
Cohesion: 0.22
Nodes (7): COMPASS_POINTS, matchWtfSite(), normalizeName(), normalizeUrl(), WtfData, WtfSite, WtfWindData

### Community 70 - "Backend Auth & Routes"
Cohesion: 0.27
Nodes (10): Particle Rendering Performance, Performance Review — Cycle 4, P-008: WindCanvas rAF Re-init Fix, T-007: WindCanvas zoom as any, server/routes/retrievals.ts, server/routes/search.ts, server/victoriaGrid.ts, src/components/windmap/windInterpolation.ts (+2 more)

### Community 71 - "UI Modals & Dialogs"
Cohesion: 0.24
Nodes (8): TemplateContext, TemplateProvider(), classicTemplate, getTemplate(), TemplateDefinition, templates, TemplateTokens, wonderfulWhiteTemplate

### Community 72 - "Backend Auth & Routes"
Cohesion: 0.36
Nodes (6): LocationConsentBanner(), CachedLocation, getCached(), getCachedLocation(), getLocationConsent(), requestBrowserLocation()

### Community 73 - "Backend Auth & Routes"
Cohesion: 0.28
Nodes (6): DIRECTIONS, expandRange(), getCrossDirections(), parseDirections(), WindCompass(), WindCompassProps

### Community 74 - "UI Modals & Dialogs"
Cohesion: 0.25
Nodes (4): log, sanitizeString(), validationMiddleware(), validationRules

### Community 75 - "React Data Hooks"
Cohesion: 0.31
Nodes (7): ApiError, createErrorResponse(), errorHandlerMiddleware(), handleError(), log, sanitizeErrorMessage(), SENSITIVE_KEYWORDS

### Community 76 - "Code Utilities"
Cohesion: 0.29
Nodes (7): SKILLSMP_API_KEY, codegraph, npx, fallow, skillsmp, fallow-mcp, skillsmp-mcp

### Community 77 - "Backend Auth & Routes"
Cohesion: 0.38
Nodes (6): useAdminBusinessDirectory(), useBusinessDirectoryMutation(), AdminBusinessDirectory(), BusinessListing, DEFAULT_CATEGORIES, emptyForm

### Community 78 - "Backend Auth & Routes"
Cohesion: 0.33
Nodes (6): Checkin, checkinKeys, CheckinStats, useCheckins(), useCheckinStats(), AdminCheckins()

### Community 79 - "Wind Visualization"
Cohesion: 0.33
Nodes (7): Bundle / Code-Splitting, Memory & Resource Leaks, N+1 Query Pattern, Performance Review Output, React Re-render Patterns, Server-Sent Events (SSE), Review Performance Skill

### Community 80 - "Backend Auth & Routes"
Cohesion: 0.29
Nodes (7): CSRF Protection, File Upload Vulnerability, MarkdownRenderer Component (XSS Risk), Security Review Output, SQL Injection Vulnerability, TidyHQ Webhook Verification, Review Security Skill

### Community 81 - "Backend Auth & Routes"
Cohesion: 0.29
Nodes (6): distMigrations, distPgMigrations, externalDeps, pkg, srcMigrations, srcPgMigrations

### Community 82 - "Backend Auth & Routes"
Cohesion: 0.29
Nodes (6): name, overrides, picomatch, private, type, version

### Community 83 - "Backend Auth & Routes"
Cohesion: 0.47
Nodes (4): useSponsors(), SponsorCard(), SponsorCardProps, Sponsors()

### Community 84 - "Backend Auth & Routes"
Cohesion: 0.33
Nodes (6): TypeScript any Types, Non-Null Assertions (!), Railway Auto-Deploy (GitHub Push), Shared Type Drift Client/Server, Type Safety Review Output, Review TypeScript Types Skill

### Community 85 - "Backend Auth & Routes"
Cohesion: 0.60
Nodes (6): P-001: apiClient Empty Response Fix, P-006: AdminSites as unknown as Type Erasure Fix, T-001: apiClient Returns undefined as T, T-003: AdminSites.tsx Pervasive as unknown as, src/pages/AdminSites.tsx, src/lib/apiClient.ts

### Community 86 - "Code Utilities"
Cohesion: 0.60
Nodes (6): P-004: useAdminForm setTimeout Fix, src/pages/AdminConnections.tsx, src/pages/AdminHomeSettings.tsx, src/pages/AdminImages.tsx, src/pages/AdminSiteEdit.tsx, src/hooks/useAdminForm.ts

### Community 87 - "Backend Auth & Routes"
Cohesion: 0.47
Nodes (6): Review System Analysis, Review Bugs Skill, Review Coordinator Skill, Review Database Skill, Review Duplication Skill, Review Fixer Skill

### Community 88 - "Backend Auth & Routes"
Cohesion: 0.53
Nodes (5): getMigrationsDir(), log, parseMigrationVersion(), runPostgresMigrations(), splitSqlStatements()

### Community 89 - "Code Utilities"
Cohesion: 0.50
Nodes (3): MarkdownProps, RendererProps, sanitizeSchema

### Community 90 - "Code Utilities"
Cohesion: 0.70
Nodes (4): fetchWeatherData(), log, scheduleNextFetch(), WeatherScrapeResult

### Community 91 - "Backend Auth & Routes"
Cohesion: 0.40
Nodes (4): scripts, dev, dev:api, dev:client

### Community 92 - "Wind Visualization"
Cohesion: 0.50
Nodes (3): errors, files, versionMap

### Community 93 - "Backend Auth & Routes"
Cohesion: 0.67
Nodes (4): extractFullWindGrid(), extractWindParticles(), getTimeWindow(), gridToWindData()

### Community 94 - "UI Modals & Dialogs"
Cohesion: 0.50
Nodes (3): ClosureDatePicker(), ClosureDatePickerProps, DAY_HEADERS

## Knowledge Gaps
- **808 isolated node(s):** `allow`, `PreToolUse`, `SessionStart`, `SessionEnd`, `allow` (+803 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Performance Review — Cycle 4` connect `Community 70` to `Community 35`, `Community 39`, `Community 88`, `Community 57`, `Community 63`?**
  _High betweenness centrality (0.165) - this node is a cross-community bridge._
- **Why does `execute()` connect `Community 13` to `Community 0`, `Community 5`, `Community 9`, `Community 14`, `Community 17`, `Community 19`, `Community 20`, `Community 21`, `Community 23`, `Community 27`, `Community 28`, `Community 33`, `Community 34`, `Community 35`, `Community 40`, `Community 42`, `Community 46`, `Community 49`, `Community 61`, `Community 90`?**
  _High betweenness centrality (0.120) - this node is a cross-community bridge._
- **Why does `api` connect `Community 10` to `Community 1`, `Community 2`, `Community 3`, `Community 4`, `Community 6`, `Community 7`, `Community 12`, `Community 15`, `Community 16`, `Community 18`, `Community 22`, `Community 25`, `Community 29`, `Community 30`, `Community 32`, `Community 38`, `Community 41`, `Community 44`, `Community 48`, `Community 50`, `Community 52`, `Community 55`, `Community 59`, `Community 61`, `Community 78`?**
  _High betweenness centrality (0.119) - this node is a cross-community bridge._
- **What connects `allow`, `PreToolUse`, `SessionStart` to the rest of the system?**
  _817 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.052349336057201226 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.09701492537313433 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.061018437225636525 - nodes in this community are weakly interconnected._