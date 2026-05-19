# RESUME_HERE — Last updated: 2026-05-19 (session 4)

## Project: SkyHigh
## Status: **LIVE** ✅

## Current State

**The app is live at https://www.skyhighparagliding.org.au**

Go-live completed 2026-05-19. Site is stable. All session 4 changes deployed.

---

## What's Done (this session)

- ✅ **YouTube scrape — YouTube Data API v3** (commit 46b1c19) — RSS was blocked by Railway's cloud IP range. Switched to YouTube Data API v3: channels.list resolves @handle/@user/channel URLs, playlistItems.list fetches uploads playlist. Requires `YOUTUBE_API_KEY` env var in Railway.
- ✅ **YouTube thumbnail grey placeholder fix** (commit 1615644) — maxresdefault returns 200 OK with a 120×90 grey image (not a 404). Added onLoad check: if naturalWidth ≤ 120 advance to next quality (sddefault → hqdefault → mqdefault).
- ✅ **recordSiteView overcounting fix** (commit 064a568) — Bug: recordSiteView was in useEffect([site]) which fires on every React Query refetch (every 30s staleTime). Moved to useEffect([id]) so it fires exactly once per navigation. This was causing inflated counts for sites where users dwelt longer, skewing home page order.

---

## ACTION REQUIRED (next session)

- ⚠️ **Add `YOUTUBE_API_KEY` to Railway** — If not already done: Google Cloud Console → APIs & Services → YouTube Data API v3 → Credentials → API key. Add as Railway env var. Free quota: 10,000 units/day, ~2 units per scrape.
- ⚠️ **Update live Procedures Manual in production DB** — Go to Admin → Procedures Manual and manually update the `Website Management` and `Officer Toolkit & Handover` sections. The seed/migration files only affect fresh installs.
- ⚠️ **Fill in Webmaster contact details** in the Credential Recovery PDF and re-save to Google Drive (name, personal email, phone were left as placeholders).
- ⚠️ **Home page ordering reset** — Existing localStorage counts for Barwon Heads are inflated from the bug. User may want to clear `skyhigh_recent_sites` from browser DevTools → Application → Local Storage on skyhighparagliding.org.au to reset to clean geolocation-based seed.

---

## Known Issues / Backlog

- **mt-broughton-thistle-hill weather station** — External FreeFlightWx station returning bad JSON every cycle. Not our bug; station is down.
- **TASK-035** — `cross-env` installed via npx at runtime; should be added to package.json devDependencies
- **npm audit** — 11 vulnerabilities (8 moderate, 2 high, 1 critical) flagged at build time. Run `npm audit` locally to triage.
- **TASK-028** — CSRF Redis store deferred (single-instance Railway, not needed yet)
- **TASK-029** — DEFAULT_ADMINS hardening (partial — env var set, no setup script)
- **R2 custom domain** — Public dev URL (`pub-971a295c84fe4582b888c39e86cdbd8c.r2.dev`) is rate-limited. For production scale, add a custom domain (e.g. `media.skyhighparagliding.org.au`) to the R2 bucket.
- **Fine grid staleness root cause** — Unknown why the fine grid stopped refreshing on May 17–19. New logging will surface it in Railway logs if it recurs.

---

## Key Info

| Item | Value |
|---|---|
| Production URL | https://www.skyhighparagliding.org.au |
| Railway URL (backup) | https://skyhigh-production.up.railway.app |
| Admin login | jonpamment@gmail.com |
| GitHub repo | https://github.com/SkyHighParagliding/SkyHigh |
| Railway project | skyhigh (SkyHighParagliding org) |
| R2 bucket | skyhigh-media |
| R2 public URL | https://pub-971a295c84fe4582b888c39e86cdbd8c.r2.dev |
| DNS provider | Google Cloud DNS (Skyhigh DNS Service project) |
| TIDYHQ_CLUB_ID | skyhigh |
| Latest deploy | recordSiteView overcounting fix — commit 064a568 |

---

## Key Files

- `memory/project.md` — Full status, env var table
- `wiki/02-tasks.md` — Master task list across all phases
- `wiki/06-deployment.md` — Infrastructure, accounts, DNS, Railway setup details
- `credential-recovery.html` — Source for credential recovery PDF (gitignored, local only)
- `.env` — All local credentials (mirrored to Railway Variables)
