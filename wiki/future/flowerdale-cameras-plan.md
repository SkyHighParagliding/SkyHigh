# Flowerdale cameras — upgrade plan

**Status:** IMPLEMENTED 2026-10-08 (all four phases), awaiting the first production run to confirm Railway can reach the feed. Decisions locked 2026-10-08 (see §11). Where this document and the code differ, the code and `wiki/05-file-map.md` (Camera Archive) win.

**Implementation notes (added after the build):**
- **Order actually built:** migration + ingest + R2 archive first, then the public API, live tiles from the archive, the viewer and `/cameras` page, then the admin page.
- **Measured sizes:** thumb 480w about 20 KB, medium 1280w about 125 KB, original about 395-445 KB. About 136 MB/day for both cameras, about 12 GB at 90 days. Sections below that quote keep-everything-forever figures are superseded by the 90-day decision.
- **Storage model:** one row per image (not per pair); north/south are paired at read time with a 90 s tolerance. Idempotent on `(sourceId, sourcePath)`.
- **Backfill** covers only the operator's last 8 days; earlier history does not exist anywhere.
- **Ventusky** tiles remain as an isolated fallback (`LegacyVentuskyWebcams.tsx`). Deleting it is a one-commit cleanup once the archive has run cleanly for a while.
- **Not built (optional later items):** AI vision descriptions and MP4 timelapse export.

**Source link:** `https://au2.airportweathercams.com/Flowerdale/timelapse.php`
**Replaces / builds on:** `src/components/weather/SiteWebcamPanel.tsx` (Ventusky tiles), `docs/flowerdale-camera-email.md` (no longer needed: the club owns the cameras).

---

## 1. TL;DR

- The link is more than a viewer. Behind it sit a **per-day JSON frame list** and **static full-resolution JPEGs** for both cameras: 2560×1920, one pair every ~6 min, 06:00 to ~18:00 local, **8 days of history**.
- Versus today's Ventusky tiles (600×450, ~hourly): about **18× the pixels and ~10× fresher**, plus history, synchronised North/South pairs and a built-in timelapse model.
- From our site, the browser **can show the images directly** (hotlinking works) but **cannot read the JSON** (no CORS). Filenames are not predictable, so a small **server-side step** is required either way.
- **Locked scope:** everything through Phase 4; keep **every frame at all sizes (originals included) for 90 days, then delete**; a dedicated `/cameras` page as well as the weather-card tiles; remove Ventusky once the new feed is proven.
- **Order:** spike (Railway reachability) → **ingest + R2 archive first** (the source only keeps 8 days, so history only starts accumulating once ingest runs) → live tiles served from the archive → viewer + `/cameras` page → admin. AI vision and MP4 timelapse remain optional later items.

---

## 2. What the link exposes (verified 2026-10-08 in a browser on Jon's AU connection)

| Item | Finding |
|---|---|
| Cameras | `Camera1` = North, `Camera2` = South |
| Frame list | `GET /Flowerdale/timelapse.php?action=getFrames&day=YYYYMMDD` → JSON, `Cache-Control: no-store`. This is the only API the viewer page uses. |
| JSON shape | `{day, first_time, last_time, first_seconds, last_seconds, match_tolerance_seconds, counts{north_images,south_images,synchronized_frames}, frames[]}` |
| Frame entry | `{seconds, time, time_full, north, south, north_file, south_file, north_status, south_status, north_message, south_message, north_time, south_time}`. Paths are relative to `/Flowerdale/`. N/S are already paired (tolerance 60 s). |
| Statuses seen | `ok`, `missing`, `unreadable` |
| Image URL | `/Flowerdale/Camera{1,2}/YYYYMMDD/images/PYYMMDDHHMMSSnn.jpg` (trailing `nn` was `10` in every sample). Seconds jitter by 1–3 s between cameras and frames, so **URLs cannot be guessed; the JSON is required**. |
| Image size | 2560×1920 JPEG, ≈ 390–440 KB each |
| Cadence | 358–362 s between frames (≈ 6 min), 120–121 frames/day (checked 7 and 8 Oct) |
| Daily window | 06:00 to 17:54/17:59 local (today and 1 Oct). Times are local station time; DST (AEDT) is already in effect. |
| History | Day selector offers 8 days (1–8 Oct) |
| Late arrivals | North count went 112 → 113 between two reads: frames can appear late, so recent history must be re-polled |
| Gaps | Today: North 8 of 120 `missing`, South 2 `unreadable` |
| Hotlinking | `<img>` from `skyhigh-production.up.railway.app` loads fine, with and without Referer |
| CORS | None. `fetch()` of the JSON from our origin fails; `crossOrigin="anonymous"` images fail, so no client-side canvas/pixel access |
| Directory listing | 403 (`/Flowerdale/`, `.../images/`) |
| robots.txt | 404 (none) |
| Server-side reachability | JSON fetched fine by Anthropic's fetch tool (a server-side client, IP location not known but presumably outside AU). Images not tested that way. |
| Extra links on the viewer | Windy satellite / wind / weather deep links centred on Flowerdale; **"Wind station" → `freeflightwx.com/flowerdale`** (unexplored) |

## 3. What I could not verify (resolve in Phase 0)

1. **Railway → operator reachability** for both JSON and image bytes (Railway region unknown; the main `myairportcams.com` domain previously geo-blocked AU, this `au2` mirror clearly serves AU browsers and a non-AU fetcher got the JSON).
2. ~~Permission / terms.~~ **Resolved:** the club owns the cameras and supplies the images to the operator with the right to retrieve them, so caching and re-serving is within our rights and no permission email is needed. (A courtesy heads-up about a ~3-min polling rate is optional.)
3. **Capture window.** Frames stop ~18:00 even though October sunset is ~19:50 and summer is later. Unknown if fixed or seasonal. Since the club owns the cameras, this can be changed at source if wanted (storage grows accordingly).
4. **URL stability.** "au2" looks like a regional mirror; unknown whether the host/path is permanent.
5. **Retention beyond 8 days** and any rate limits.
6. What `freeflightwx.com/flowerdale` offers (possible live Flowerdale wind data).

---

## 4. Current state (for contrast)

- `SiteWebcamPanel.tsx` shows two thumbnails (N/S) from Ventusky `latest_medium.jpg` (600×450), cache-busted on a 5-min bucket, tap for fullscreen. Effective freshness ~hourly.
- Config is **hard-coded** in the component (`SITE_WEBCAMS`, one site id: `three-sisters-flowerdale`).
- Offline detection is a hack (`PLACEHOLDER_MIN_WIDTH`: anything wider than 700 px is "the placeholder").
- No history, no timelapse, no capture-time display beyond the stamp burned into the image.
- Rendered once, from `WeatherCardApple.tsx` (just before `windMapPortal`).
- Credit link goes to ventusky.com.

---

## 5. Upgrade options

| # | Upgrade | Value | Effort |
|---|---|---|---|
| U1 | **Better live tiles**: newest synced N/S pair from the new feed, "captured 6 min ago", real offline/stale state from the JSON, fullscreen in near-full-res | High | S |
| U2 | **Timelapse / scrub viewer**: play today (and recent days) as a synced N+S flipbook with time slider, speed control, day picker, mobile landscape | High | M |
| U3 | **Own cache + archive in R2** (thumb/medium/original derivatives): speed, resilience, retention past 8 days, kind to the operator | High | M |
| U4 | **Data-driven camera config + health in admin**: per-site cameras, source adapters, last-frame age, gap count, storage use | Medium | S–M |
| U5 | **Comparison views**: "now vs an hour ago / yesterday same time" | Medium | S (after U3) |
| U6 | **Daily MP4/animated timelapse** | Low–Med | M–L (needs ffmpeg on Railway) |
| U7 | **AI vision read of the newest frame** (cloud cover, low cloud/haze, visibility) for Smart Search / the weather card | Speculative | L, needs a scored eval first |
| U8 | **Flowerdale wind station** via `freeflightwx.com/flowerdale` | Unknown | Separate investigation |

---

## 6. Recommended architecture

**Server**

- `server/webcams/airportweathercams.ts`: adapter. Fetch day JSON, validate, convert to absolute URLs, drop `missing`/`unreadable`, parse local time with `Australia/Melbourne` (do not trust server TZ; the Oct DST switch already happened this week).
- Ingest job in `server/utils/scheduledJobs.ts` (node-cron, Melbourne TZ): poll every ~3 min between ~05:55 and ~18:30 (window configurable); skip frames already stored by source filename; always re-poll the last ~2 h to catch late frames; on first run backfill every day the operator still lists (8 days).
- Per new frame: download original → `sharp` → thumb (~480 w) + medium (~1280 w) → upload thumb, medium **and original** via `server/storage.ts` (R2 in prod, `/uploads/` in dev; DECISION-002).
- Table `webcam_frames` (metadata only, **no image bytes in Postgres** after the 500 MB volume incident): `siteId, camera, capturedAt (timestamptz, UTC), sourcePath (unique), status, keyThumb, keyMedium, keyOriginal, bytes`. ≈ 21.6k rows at steady state (90 days × 240), trivial. Needs a migration that passes `scripts/lint-migrations.mjs`.
- Retention is a setting (`webcamRetentionDays`, **default 90** per decision). A daily cleanup job (≈ 03:30 Melbourne) deletes R2 objects then rows older than the cutoff: idempotent, per-run delete cap, minimum allowed setting 7 days, dry-run count shown in the admin card, never deletes today's frames. Usage alert reuses the `checkDatabaseVolume` pattern (admin email if R2 usage for this prefix passes a threshold, e.g. 25 GB, which would mean cleanup has stopped working).
- Public routes, short `Cache-Control`: `GET /api/webcams/:siteId/latest`, `GET /api/webcams/:siteId/day/:yyyymmdd`, plus a days-index route for the `/cameras` page.
- **Failure behaviour (no second vendor):** if the operator feed is down, serve the last archived frame with a visible "last updated HH:MM" stale banner. Ventusky code is removed once the new feed has run cleanly for a few days.

**Client**

- `SiteWebcamPanel` reads its camera list from the API instead of the hard-coded map; shows capture age; stale/offline state comes from server health, not image width.
- `WebcamViewer` (modal from the tiles, and the main body of `/cameras`): synced N/S (or single camera), scrubber, play/pause, speed, day picker across the 90-day archive, preloads `medium`, "open full-res" (original), keyboard + swipe, deep-link `?cam=…&day=…&t=…`.
- New `/cameras` page, linked from the **Community** nav dropdown as "Cameras" (`SiteHeader.tsx`, alongside Image Wall / Video Wall / Insta Wall / Business Directory), behind a `camerasEnabled` setting that follows the existing `businessDirectoryEnabled` pattern: site/camera selector (Flowerdale only for now), same viewer full-width, calendar/day list, compare mode ("now vs 1 h ago / yesterday same time").
- No operator credit line (decision); the existing Ventusky credit link goes away with the Ventusky code.

---

## 7. Phases

**Phase 0: Spikes (≈ 1–2 h, gates everything)**
1. Temporary admin-only diagnostic (not part of the product) to fetch JSON + one image from **Railway** and report status/size/timing.
2. Measure `sharp` outputs on 5 real frames (thumb/medium sizes) to firm up §8.
3. Look at `freeflightwx.com/flowerdale`.
4. Optional courtesy note to the operator (poll rate, URL stability).
- **Gate:** Railway can fetch both JSON and image bytes. If not: use a different fetcher (e.g. a Cloudflare Worker/cron near AU pushing to R2) or ask the operator to whitelist Railway.

**Phase 1: Ingest and R2 archive (U3, ≈ 1–2 days) — first, so history starts accumulating**
Migration, adapter, job, derivatives, idempotency, 8-day backfill, 90-day cleanup job, usage alert, admin on/off switch.

**Phase 2: Live tiles from the archive (U1, ≈ ½ day)**
`latest` endpoint, panel switch, capture-age label, stale state. Remove Ventusky (code + `SITE_WEBCAMS` entry + credit) after a few clean days.

**Phase 3: Viewer and `/cameras` page (U2 + U5, ≈ 2–3 days)**
Modal, page, scrubber, day picker, preloading strategy, mobile portrait/landscape, deep links, compare mode, Community menu entry + `camerasEnabled` setting (`SettingsContext`, `AdminHomeSettings`).

**Phase 4: Admin and generalisation (U4, ≈ ½–1 day)**
Per-site camera config, health card (last frame, gaps today, storage used, projected cost), retention setting and cleanup dry-run view, docs/wiki updates (`wiki/05-file-map.md`, `docs/`, RESUME_HERE).

**Phase 5: Optional (each needs its own go/no-go)**
MP4 timelapse (ffmpeg), AI vision read behind an inspect-ai scored eval, wind station (U8).

---

## 8. Storage estimate, 90-day retention (re-measure in Phase 0)

Assumptions: 240 frames/day (120 × 2 cameras), thumb ≈ 35 KB, medium ≈ 170 KB, original ≈ 420 KB → ≈ 625 KB per frame, **≈ 150 MB/day**, all sizes kept for 90 days then deleted.

| After | Size | Approx. R2 cost* |
|---|---|---|
| 1 month | ≈ 4.5 GB | free (10 GB tier) |
| 2 months | ≈ 9 GB | free |
| 3 months onward (steady state) | **≈ 13.5 GB, flat** | **≈ US$0.05/month** |

\*At ≈ US$0.015/GB-month with 10 GB free and free egress. Verify current R2 pricing before build. Write operations (~720/day) are negligible.
Because storage is flat after day 90, the retention setting can later be raised (keeps more from then on; already-deleted frames don't come back) or lowered without code changes. Extending the daily capture window past 18:00 grows these numbers proportionally.
Bandwidth in: ≈ 100 MB/day from the operator (240 × ~420 KB), fetched sequentially by one server.
Options considered and rejected: keep everything forever (≈ 55 GB/yr), keep originals only 30 days, thin to hourly after 90 days.

---

## 9. Risks

- **8-day source window.** Anything before ingest starts is unrecoverable beyond what the operator still lists; hence Phase 1 first.
- **Feed reliability.** Missing/unreadable frames are normal (10 of 240 today); UI must show gaps gracefully and the job must be idempotent.
- **Late frames and DST.** Timezone bugs are the likeliest silent failure; test around the DST boundaries.
- **Hot path size.** 120 × 420 KB ≈ 50 MB for a full day at original size, so the viewer must use `medium` and progressive preload; originals only on explicit "full-res".
- **Cleanup job deletes data permanently.** Mitigated by the delete cap, 7-day minimum, dry-run view, "never today" rule and the usage alert (which also catches the job silently failing).
- **Public archive and privacy.** All 90 days are public (decision), and frames may include people or vehicles at the site. Accepted by Jon; the club owns the cameras. Revisit if a complaint arises (the retention setting and a per-frame delete in admin would be the levers).
- **Railway reachability.** Unverified until Phase 0.
- **URL change.** Host/path lives in one adapter behind a setting; the last-archived-frame stale mode covers short outages.

---

## 10. Verification plan

- Save today's JSON as a test fixture; unit-test the adapter on: normal, `missing`, `unreadable`, empty day, late-arriving frame, duplicate poll.
- Timezone tests around the DST boundary (first Sunday of October and April).
- Idempotency: run the ingest twice, expect zero duplicates.
- Cleanup: fixture with frames at 89/90/91 days old; expect only >90 removed, objects and rows together, safe to re-run, cap respected, today's frames never touched.
- Failure injection: operator returns 403/timeout → stale banner with last archived frame, health flag turns on, admin card shows it.
- Manual: real phone on mobile data (portrait + landscape), desktop, slow-3G throttling for the viewer and `/cameras`.
- Prod check from an AU connection after each phase (same method used for the live-wind radius).

---

## 11. Decisions

**Locked (Jon, 2026-10-08):**

1. Scope: everything through Phase 4.
2. Retention: **90 days, then delete** (revised from "keep everything" on 2026-10-08).
3. Originals: kept for the same 90 days as the other sizes (revised from "keep all").
4. Ventusky: remove once the new feed is proven.
5. Where it shows: weather card **and** a dedicated `/cameras` page, linked from the **Community** nav dropdown.
6. Operator permission: not needed — the club owns the cameras and supplies the images to the operator with the right to retrieve them.
7. Archive visibility: all days public (no login needed).
8. Operator credit: none.

**Still open:** nothing blocking. Phase 0 spike is the next step.
