# Current Tasks — Last updated: 2026-10-26

> Companion file: `RESUME_HERE.md` has the same info in a different format.

## 🟡 Open / on hold
- ⬜ **FreeFlightWx unreachable from Railway (found 2026-10-26 21:15).** Since the `0af64bc` deploy (21:09) every FFWX fetch logs `fetch failed`. Railway network logs: 210 outbound connections to 110.232.143.90:443, all 74 B, **no reply**; DNS fine; other sites reachable; the hub gets 200. So FFWX's host is dropping the new container's address. The old container saved FFWX readings up to 21:12. **Checked 26 Oct 22:10, not us:** earlier containers today (03:00–10:10 UTC) made a steady ~12 calls/10 min and got a reply to every one; the new container got no reply from its first call. Same region (asia-southeast1), same code path (deploy changed only logger + site-guide data). The hub gets 200 on the exact same request. Our failure retries push it to 120–186 calls/10 min, which should be capped. Options: redeploy (`railway redeploy --service SkyHigh`) to get a different address, ask the FFWX operator to allow Railway, or a Railway static outbound IP (Pro plan). Also consider: FFWX polling every 2–3 min × 9 stations, plus 5 retries on network errors, may be what got us blocked.
- ⏸️ **Flinders Golf Club Weather Station (FGC) — WU key throttled (found 2026-10-26). Waiting on the station operator.** Every WU call returns `401 API key is throttled`, so no WU station has saved a reading since **22 Oct 05:19 Melbourne**: IFLINDER3 (Flinders Golf Club alt), IKEVIN1 (Mt Terrible), IMANSF25 (The Paps), ILOCKS1 (Locksley Field), IAPOLL12 (Marriners Lookout), ISURFB3 (Dunvegan Rd), IOCEAN111 (Ocean Grove alt), IVICTORI1128 (Red Bluff alt), IVICTORI1308 (Cape Liptrap alt). Not a daily quota (it hasn't reset) and not our volume (~400 calls/day vs ~1,500). Prod and dev `.env` hold the same `WU_API_KEY`; nothing else on the hub uses it. **Root cause (found 26 Oct 22:10):** our `WU_API_KEY` was never a personal key. It came with the Replit code (1 May) and is one of the two publicly published wunderground.com website keys; WU's site now uses different keys, and this one is throttled. The stations are fine: with the key WU's site uses today, IFLINDER3 returned live data (11:07 UTC, 17 km/h). Fix: a proper personal key (WU gives free keys to PWS owners; FGC operator may help) — or, short term, the site's current key (works but breaks again, against WU terms). Jon has asked the FGC operator for help. **When he replies:** check the key's owner account (wunderground.com → Member Settings → API Keys; is its PWS still uploading?), make a new key, set `WU_API_KEY` in Railway + `.env`, then Claude tests all 9 stations with the new key and checks the next scraper run saves readings. Done meanwhile: `fc422de` uppercases WU station IDs on site save (deployed; FGC was stored as `IFlinder3`, now `IFLINDER3`); `da18b2f` logger shows Error messages instead of `{}` (deployed 26 Oct with `0af64bc`; prod log now reads `HTTP error! status: 401 — API key is throttled`).
- 🔗 **Sizzle links:** Drive folder `I:/My Drive/SkyHigh Club Documents/08_Projects/Sizzle 2026 NTVO`; till https://skyhighparagliding.org.au/admin/sizzle (Docs tab saves to Drive); Railway https://railway.com/project/ebcf7ad4-eb48-46b0-bc58-a675e82ce819/service/8f103c7a-5797-4ef8-8a4d-40fe2952be31?environmentId=a54cc7f7-c0f0-45a2-b69b-2b95240174e2; mandarin https://www.woolworths.com.au/shop/productdetails/314075 (fallback https://www.woolworths.com.au/shop/productdetails/731091).
- ⬜ **Sizzle: check the mandarin price at Woolworths Bright** (online price used, $0.46 each) and delete the three `2026-10-24 2147 …` Drive copies (Price board, Float & cash-up, Costing) that lack `$` signs.
- ✅ **Sizzle: frying pan + tarps on the Equipment checklist (2026-10-24).** Frying pan for the veg sausages and 2 tarps added (`1e1a64f`, deployed); pan is the VEG zone (`01f8ec4`); docs 03 + 04 re-saved to club Drive from the till Docs tab (`2026-10-24 2243`).
- ⬜ **XC map "simple view" — due Thu 29 Oct 2026 (added 2026-10-24).** Revise Cross Country so it can be switched on and just shows the map area with the SAFA site-guide overlay (landing zones, no-landing, emergency LZs, no-fly, powerlines, hazards), without the other XC clutter (rings, bearing lines, wind field, station markers, airspace etc.). The overlay already exists: `src/components/xcmap/SiteguideZoneLayer.tsx`, used by `src/components/XCMap.tsx`; page `src/pages/XCMaps.tsx`, state `src/hooks/useXCMapState.ts`. Decide with Jon: a toggle on the XC page, or its own link/QR.
- ⬜ **Ground Handling animations on the website (idea, added 2026-10-26).** Scope and placement TBC with Jon. Related: the animated `training/cloud-engine/` page (see TRAINING below).
- ⬜ **QR Links admin (planned 2026-10-24, needed by ~26 Oct for the NTVO gazebo banner).** General, reusable redirectable QR codes; today only the per-site ones exist (`src/lib/qrRedirect.tsx`, `sites."qrRedirects"`, set on AdminSiteEdit). New table of named links (slug, destination, enabled, note). Public `/go/:slug` redirects to the destination; when the link is off or unknown it goes to the home page. New Admin page to list, add and edit links, with a QR download (SVG/PNG, `qrcode.react` is already a dependency). Seed `banner-left` → `/` and `banner-right` → Mystic site page. Must be easy to add more (e.g. Voyager project). Full staged plan: `Non-Code Projects\SkyHigh Admin\tasks\todo.md` (gazebo banner).
- ✅ **Sizzle: prices step in 50c everywhere (done 2026-10-24, `cfae07e` + `$` fix `082b4b7`).** `priceStep` 0.5; shared `price()` formatter (cents only when needed) on the price board, costing PDF and Admin hint; help text and manual say 50c. Live effect: only Banana moved ($2 → $1.50, not overridden); all other items are admin overrides. Re-saved to Drive 22:04: Price board (sausage and veg $3.50 now match the till), Float & cash-up sheet, Costing. The 21:47 copies of those three are missing their `$` signs: ignore or delete them. Railway: the `082b4b7` build sat 10 min on "All aboard, next stop: builder v4" with no build steps run (Railway builder queue, not our code; normal builds take about 1 min). Jon aborted it; the empty commit `4985730` rebuilt normally.
- ✅ **Sizzle: oranges swapped for mandarins (done 2026-10-24).** Product `mandarin` = Mandarin Afourer each $0.46 (Woolworths online 24 Oct, stockcode 314075; fallback Delite Seedless $0.59, 731091), replacing Orange Navel 5 pack $4.50. Till button "Mandarin" sells at **$1** (cost-plus rule; oranges were $2), so the price board now lists Apple $2 / Mandarin $1 / Banana $2 instead of one "Fruit $2" line. Changed docs: 01 Initial shopping list, 02 top-ups (all five), 05 Price board, 06 Float & cash-up, 07 Costing. Unchanged: 03, 04, 08, 09, 10. If Jon wants mandarins at $2, add a price override in the till Admin tab and re-save 05. Old rehearsal sales/stock keyed `orange` are just ignored. Check the mandarin price at Bright when shopping. Pushed + deployed 24 Oct (main `22b81c3`; live till bundle has the mandarin; /, /admin/sizzle, /sizzle/phone 200). Re-saved to Drive from the till Docs tab 24 Oct 21:35 (`08_Projects/Sizzle 2026 NTVO`, all `2026-10-24 2135 …`): Initial shopping list, Day 2/3/4 top-ups, Days 2-3 and 3-4 combined, Price board, Float & cash-up sheet, Costing & power summary; checked each says Mandarin.
- ✅ **Pushed 2026-10-23 (main `96c5283`, deployed `index-Cw9rN8vC.js`); docs 01, 03, 04, 09 re-saved to Drive one at a time.** Was: push `73fa95b` (new shopping, equipment and Total Fire Ban items, GF rule in the shop assistant how-to; on the branch only). Then re-save to Drive one at a time: 01 Initial shopping list, 03 Equipment checklist, 04 Compliance checklist, 09 Shop assistant how-to. New prices are Woolworths online 23 Oct — check at Bright when shopping. Rehearsal 27 Oct: $1 Stripe Tap to Pay on two phones at once.
- ⬜ **Security check 2026-10-23 — remaining items** (MUST 1–2 done: `9a2b680`, npm audit 30 → 2 build-only moderates). MUST 3 = Railway key change, waiting for Railway to say who was affected (see the incident item). SHOULD: (4) `server/routes/submissions.ts:168` uses raw X-Forwarded-For (spoofable; use `req.ip`, trust proxy is 1); (5) confirm `ALLOW_PLAINTEXT_PASSWORDS` is not set on Railway (not NODE_ENV-gated, `server/routes/auth.ts:120`); (6) pin Node (`engines` 22.x; Railpack defaults to 22, this PC runs 24); (7) GitHub Dependabot alerts + `.github/dependabot.yml`. COULD (after the event): drop `X-Powered-By`; unknown `/api/*` → 404 JSON not the SPA; CSP without `'unsafe-inline'` scripts; majors (Express 5, Vite 8, TS 7, @google/genai 2, lucide 1); override postcss-selector-parser under @tailwindcss/typography. Also: `/health` reports "unhealthy" from a false memory alarm (`server/utils/health.ts` compares heapUsed to heapTotal, which always sits near 100%; use `v8.getHeapStatistics().heap_size_limit`). No Railway health check uses it today. Live check after `9a2b680`: site, till, DB 1 ms, elevation-at (sharp decoding tiles) 309 m at Bright — all OK.
- ✅ **Pushed + deployed 2026-10-23 (main `c250648`), live-checked: $20 on $3.50 → $10+$5+$1+50c; iPad Card says "Type this amount into the Stripe phone", no Copy; guides 08/09/10 re-saved to Drive.** Then `59c2693` (deployed, server checks OK): icon sets itself up from the QR (start_url carries ?pair=), New code button per phone; 09/10 re-saved to Drive again. Still to do: Jon tests on his iPhone (delete icon → New code → scan → Add to Home Screen → open icon, no typing); watch for Docs saves hanging when several are clicked at once right after a deploy (two hung, single retries worked). Was: `f766f43` 50c fix (on main, not deployed) + `03bc6c8` iPad card screen "Type this amount into the Stripe phone", phones keep Copy, + `993aea2` phone home-screen app set up with a typed 8-character code (branch only). After deploy: Jon re-adds his phone on the iPad, adds the icon, types the code. After deploy: re-save Card guide, 09 Shop assistant how-to, 10 Admin how-to to Drive (Docs tab); confirm several team-member phones can run Stripe Tap to Pay at once ($1 test on two phones).

### ⏸️ Railway security incident (21–22 Oct 2026): waiting for Railway's email
- Railway invalidated all API tokens and **recommends changing every secret stored in Railway** (status.railway.com; blog post "security-disclosure-wednesday-october-21st"). They will email affected accounts.
- Jon's call (2026-10-22): wait for the email before doing the manual key changes. If it arrives, or Railway widens its advice, change the keys at each provider, update Railway → Variables, then deploy (only works once builds are back). Start with `DATABASE_URL` and `SESSION_SECRET`. Changing `SESSION_SECRET` logs everyone out, so do it before the 27 Oct rehearsal, not on an event day.
- Cheap check now: Google Cloud billing (Gemini) and Stripe payments/API logs for anything unexpected.
- **How to do the key change (agreed 2026-10-22):**
  1. Jon makes each new key at the provider (Gemini, TidyHQ ×4, Resend, Cloudflare R2, GitHub PAT, weather keys, sizzle Google Drive link, `SESSION_SECRET`, anything else in Railway → Variables) and saves it in 1Password: one item per key, or one "SkyHigh Railway" item with a field per variable name. He gives Claude the vault and item names only.
  2. Jon runs `! railway login` so Claude has the CLI again (all Railway API tokens were reset).
  3. Claude pipes each one straight across, never shown on screen or in the transcript: `op read "op://<Vault>/<Item>/<field>" | railway variable set <NAME> --stdin --skip-deploys`. Jon approves each 1Password read.
  4. One deploy at the end, then Claude checks the site, till login and Drive saves. Same pipe can update this PC's `.env` for dev.
  - `DATABASE_URL` is set by Railway's Postgres: change the database password inside Railway (their Postgres credentials guide), not through 1Password.

### ✅ CHECK — Critical PHP flaws (done 2026-10-22)
- Two critical PHP flaws (found with AI tools) were disclosed and patched on 21 Oct 2026. Government sites, Wikipedia and others went offline as a precaution, and attacks have been reported (ABC News 22 Oct 2026).
- **Result: SkyHigh not exposed.** The live site is Node/Express on Railway (`x-powered-by: Express`), and the repo and lockfile contain no PHP. The domain's DNS is Cloudflare → Railway. The old Google Sites site is private in the club Google account and Google runs it, with no PHP. The old Vodien A record (103.11.189.189) is Vodien's shared parking page, and our domain doesn't point there. No action needed.

### ✅ TASK-042 Dev safe mode + copy production into dev (2026-10-23, session "Docker Transfer")
- ✅ Safe mode (DECISION-021) on branch `feat/dev-safe-mode` (`3d2087a`, `184598a`): `DEV_LIVE` in `.env`, `npm run live` (60 min) / `safe` / `devmode`, admin badge, SessionEnd hook reset. 27 tests + full suite pass; live-checked against the running dev server.
- ✅ `npm run db:pull-prod` written; refusals tested (dev live, dev server running, no URL).
- ✅ Production copied into dev (23 Oct): Railway CLI signed in as web@ and this folder linked to project SkyHigh / production. All 53 tables match production. Dev moved to **Postgres 18** to match production (`docker-compose.dev.yml`, new volume `skyhigh_skyhigh_pg18_data`; the old 16 volume `skyhigh_skyhigh_pg_data` is kept, unused, plus `db_backups/dev-pg16-before-upgrade-2026-10-23.dump`). Script fix: `railway` runs through the shell on Windows. Remote sign-in: `! railway login --browserless`.
- ⬜ Seen once on dev start: weather scraper `wport` duplicate key on `weather_observations` insert (startup race between scrapers?). Check whether prod logs show it too.
- ✅ Old Postgres 16 volume `skyhigh_skyhigh_pg_data` deleted 23 Oct (Jon's OK). Its data survives in `db_backups/dev-pg16-before-upgrade-2026-10-23.dump`.
- ✅ Merged and deployed 23 Oct (Jon: "A"): `main` = `feature/sausage-sizzle` = `60665cd`, Railway SUCCESS; production `/api/dev-safety` → `production`, /, /admin/sizzle, /sizzle/phone 200, 50 sites. Last fix before deploy: devMode reads `.env` every check (mtime cache missed quick flips → flaky test).
- Note: production logs also show the `wport`/`wu` duplicate-key on `weather_observations` in the first weather run after restart only (2 Phillip Island sites); no weather code changed in this release.

### ✅ Dev Postgres moved from the Surface to this PC (done 2026-10-23, session "Docker Transfer")
- Docker Desktop on Garage (WSL2, autostart on, `~\.wslconfig` memory=8GB). `skyhigh-pg-dev` runs from `docker-compose.dev.yml` on 5432 (restart unless-stopped).
- Restored from `db_backups\2026-10-23-surface\skyhigh_dev.dump`: all 47 tables match the Surface row counts. On first `npm run dev` migrations v47–v53 applied (Surface DB was behind).
- `.env` now exists on this PC, built with `op inject -i .env.template -o .env` (1Password `Private/SkyHigh`). Re-run that after the Railway key change. `WEATHER_API_KEY` / `OPEN_METEO_API_KEY` are blank in the template.
- Checked: `/health` DB connected, Vite 5173 serves, `/api/sites` via proxy returns data. WU scraper logs "Failed primary" for every station — not caused by the move; check the WU key.
- Surface: containers, volumes, images, Docker Desktop, its WSL distro and data folders removed; WSL + VirtualMachinePlatform disabled (finishes on the Surface's next restart). Backups (dump + raw volume tarball) stay in `db_backups\`.
- Decide: copy (keep the Surface's as a backup) or move. Afterwards point this PC's `.env` `DATABASE_URL` at the local container and check `npm run dev` starts and migrations run.

### ⬜ Retire the 1Password draw/wipe docs (added 2026-10-21, workspace cleanup)
- The 1Password `.env` draw/wipe lifecycle was dropped as unreliable. Secrets now live in the gitignored `.env` (Jon, 2026-10-21), and no machine runs the hooks any more. The Surface's were removed on 2026-10-21, and the hub never had them.
- Update `CLAUDE.md`: the DECISION-009 bullet in Section 0; Section 4 step 3 ("Verify credentials have been drawn") and the "Securely wipe `.env`" session-end step; and the matching `wiki/03-decisions-log.md` entry (mark DECISION-009 superseded, with the date and reason). Check `.env.template` and any wiki or deployment pages that tell you to run `draw-env.ps1`.
- **Don't run `wipe-env.ps1`.** The `.env` is the only copy of the secrets. It's backed up by Kopia (encrypted).

### ⬜ Check archived May uploads (added 2026-10-21, workspace cleanup)
- The Surface's old `OneDrive\Documents\AntiGravityCodeFolder\SkyHigh` (1–10 May) had 151 `uploads\` images and an old SQLite db that aren't in this folder. They're archived at `C:\CodeFolder\.claude\backups\surface-antigravity-skyhigh-2026-05\`. Copy back any images that dev still needs, then delete the archive. Its source files weren't kept: git history shows they were deleted on purpose.

### ✅ FIX — Bare domain HTTPS (skyhighparagliding.org.au) → DNS moved to Cloudflare
- **Status:** ✅ LIVE 2026-10-16 — registrar is **Vodien** (not Crazy Domains); Vodien support set nameservers to Cloudflare. Verified: `https://skyhighparagliding.org.au` 200 with valid cert, `www` 200, Gmail MX intact, Railway green tick on both domains. See DECISION-018 and `wiki/06-deployment.md` → Domain Management. Gmail DKIM done 2026-10-16 (authenticating). Workspace redirect: inert, no remove option, left as-is. Remaining: delete Cloud DNS zone ~2026-10-23.
- **Cause:** bare-domain A records `216.239.32/34/36/38.21` are the Google Workspace naked-domain redirect (Admin → Domains → Manage → "Change redirect"), which is HTTP-only. Cloud DNS can't ALIAS/flatten the apex to Railway.
- **Where things live:** registrar **Crazy Domains** (Web Address Registration Pty Ltd); DNS = Google Cloud DNS zone `skyhigh-zone`, project "Skyhigh DNS Service" (`glass-indexer-201105`), club Google account.
- **Current records (copy exactly):** `www` CNAME `33bp9c73.up.railway.app`; `_railway-verify.www` TXT `railway-verify=128b03c8fbf5b4b6e3a6ff5d515a45741054c2637edf64e017a5fdd8a913f978`; MX `1 aspmx.l.google.com`, `5 alt1.aspmx.l.google.com`, `5 alt2.aspmx.l.google.com`; `_dmarc` TXT `v=DMARC1; p=none;`; `send` MX `10 feedback-smtp.ap-northeast-1.amazonses.com`; `send` TXT `v=spf1 include:amazonses.com ~all`; `resend._domainkey` TXT `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC8C108fOGaT4PPaSpmy1jcYJvF80wSMcdGnVTx2e7ejfS7wx+2ESiKbDwar5Oo0pxbhbf4e0s9EeFkrGAtAu2Wb3EQ1AQQW86zTsAY5p7O+0zQ/Fnn/b8Njmyrg/MItC8pqS8ffD+ookflZbM7IRkB2bD8KwnYAh58A91JJgAm0QIDAQAB`. Drop the four `A @ 216.239.x.21`.
- **Plan:** (1) Railway → add custom domain `skyhighparagliding.org.au`, note CNAME target + `_railway-verify` TXT. (2) Cloudflare → add zone (Free), import, delete the 4 A records, `CNAME @` → Railway target (DNS only), add Railway TXT, add Gmail SPF `TXT @ v=spf1 include:_spf.google.com ~all`, verify all records above. (3) Crazy Domains → nameservers to Cloudflare's two. (4) Verify HTTPS apex + www, MX, Resend. (5) Workspace: remove naked-domain redirect; Gmail DKIM (Apps → Gmail → Authenticate email → `google._domainkey` TXT → Start authentication). Keep Cloud DNS zone ~1 week for rollback, then delete.
- **Step 1 DONE 2026-10-16:** Railway custom domain `skyhighparagliding.org.au` (port 8080) added. Needs: `CNAME @` → `ec6h5vtz.up.railway.app`; `TXT _railway-verify` → `railway-verify=9660350820ee026d3a4afb3a05186ea5a2697e013952fac692ba4580ab886dd7`. Undo: bin icon on that domain in Railway → SkyHigh → Settings → Networking.
- **Step 2 DONE 2026-10-16:** Cloudflare zone created (account Web@skyhighparagliding.org.au, Free), 12 records imported from a BIND file, both CNAMEs DNS-only; verified against `dana.ns.cloudflare.com` (apex flattens to Railway 69.46.46.49). Cloudflare nameservers: `abdullah.ns.cloudflare.com`, `dana.ns.cloudflare.com`.
- **Step 3 DONE 2026-10-16:** Vodien (manage.vodien.com) nameservers → Cloudflare.
- **Rollback:** set Vodien nameservers back to `ns-cloud-a1..a4.googledomains.com`.
- **Method:** Jon installing Claude in Chrome; resume with `claude --continue --chrome` and do one step at a time, confirming before each DNS change.

### VERIFY — Flowerdale camera archive first production run
- **Status:** ✅ DONE (Jon-verified) 2026-10-16 — prod `live`, ~120 frames/day continuous since 2 Oct; `npm run build` + `npm test` pass locally (stale grid key-set test fixed `4c5ea20`); Ventusky fallback deleted. Jon checked `/cameras` + Flowerdale card 2026-10-16 ✅. North camera clock is not on daylight saving (South is) and cannot easily be changed: handled by a per-camera admin switch (migration 049, `server/webcams/restamp.ts`); North/South alignment confirmed by Jon 2026-10-16 ✅.
- After deploy: Admin → Cameras → **Run now**; confirm `Last error` is empty and frames appear. If it says the host cannot be reached, Railway cannot see the operator's site (the dev sandbox could not test this).
- Then check `/cameras`, the Flowerdale weather card, and the Community → Cameras menu link.
- Run `npm run build` and `npm test` locally (the Cowork sandbox cannot run `vite build`).
- ~~Delete `LegacyVentuskyWebcams.tsx` + fallback branch~~ — done 2026-10-16. Not built (optional): AI vision descriptions, MP4 timelapse export.

### FOLLOW-UP — Session 73 loose ends
- **Status:** OPEN (found during the 2026-10-05 docs sync)
- ~~Stale wiki refs / DECISION-014 / `memory/project.md` / leftover `SiteThermalPanel` comment + meteogram-plan notes~~ — all fixed 2026-10-05.
- **Done 2026-10-05 (uncommitted):** removed the dead `GET /api/weather/:siteId/meteogram` route from `server/routes/weather.ts` (35 lines; `tsc --noEmit` clean). The live `/api/weather/meteogram/point` route and `buildSiteMeteogram` are untouched.
- **Knowledge graph is stale:** `wiki/graphify-knowledge-graph/` and `graphify-out/` date from 2026-06-10 and still list the deleted map components. Regenerate on Jon's machine (`graphify . --update`, needs `ANTHROPIC_API_KEY` — see `memory/graphify_obsidian_setup.md`); not run from Cowork.
- Several memory files named in RESUME_HERE (`smart-search-reeval-decisions.md`, `gust-tolerance-rule.md`, …) are not in `memory/` — recover the Smart Search design ruleset from RESUME_HERE's session 66 section before building it.

### REVIEW — Big page-clone refactors (+ possible wider design/feature review)
- **Status:** DEFERRED (Jon's call 2026-09-18). Surfaced by the fallow `find_dupes` scan.
- **The two large clones to break up:**
  1. `src/pages/SiteDetail.tsx` ↔ `src/pages/SiteFieldView.tsx` — **~575 duplicated lines** (field view is a stripped-down site detail).
  2. `src/pages/AdminPageEdit.tsx` ↔ `src/pages/Airspace.tsx` — **~348 lines** (Airspace re-implements the CMS content/attachment rendering).
- **Why deferred:** real but higher-risk refactors, not a quick pass. Jon wants to **do these alongside a wider design/feature review** rather than in isolation — so revisit when that review happens, and fold the extraction into it.
- Smaller clones already handled this session (thermal legend, Drive helpers, XC types, MapResizer). Everything else fallow flagged was false-positive-heavy (barrel re-exports, query-key factories).

### TRAINING — Club "weather school" content pages
- **Status:** First page LIVE/DEPLOYED (`567b149`, pushed 2026-09-18). Jon may still revise + add topics — iterate in place.
- **What exists:** `training/cloud-engine/index.html` — self-contained "The Cloud Engine" thermal/SkewT explainer for novices (animated hero, 3-players, chart anatomy with real screenshot, **interactive drag-to-heat SVG simulator**, four real screenshots showing capped→breakthrough→collapse→soar, summary table, takeaways, 3-Q quiz). Images in `img/`; model tuning in `_tune.mjs`. Vanilla HTML/CSS/JS, no deps.
- **Viewable:** `http://localhost:5173/training/cloud-engine/index.html` (Vite serves project-root files). Phone: `vite --host` + same LAN + VPN off.
- **Next (when Jon returns to it):**
  1. Jon to review copy/visuals/simulator feel and request tweaks.
  2. Brainstorm + build MORE topics (e.g. sea-breeze/coastal, wind gradient, airspace basics, overdevelopment, launch decision-making). Reuse the same page shell/idiom.
  3. Decide the home for the series: standalone files vs an app route vs CMS pages (link from a "Weather School" index). Currently a standalone file at `training/cloud-engine/`, not linked in any menu.

> **No incomplete *backlog* tasks remain** beyond the training initiative. See wiki/02-tasks.md for the full log.

## ✅ Done

### Flowerdale camera archive (ingest, 90-day retention, tiles, /cameras, admin)
- **Completed:** 2026-10-08 (local commits; push pending)
- **What changed:** migration 048, `server/webcams/*`, `/api/webcams`, `WebcamViewer`, `/cameras` (Community menu), weather-card tiles from the archive, `/admin/webcams`, `camerasEnabled` setting. Decision: DECISION-017. Ventusky kept only as an isolated fallback.

### One map everywhere — site maps reuse the Flying Sites map
- **Completed:** 2026-10-04 (`e949172`, pushed)
- **What changed:** weather-card "Map" + AdminWeather preview open `SitesWindMapProto` pre-tapped at the site (`focusSite` / `startFullscreen` / `onExitFullscreen`); six site-specific map files deleted; `wiki/12-map-ui-style-guide.md` rewritten.

### Live-wind radius, SkewT overheat + splines, Flying Sites layout
- **Completed:** 2026-10-04 (`5afabec`, `54898ae`, `47e0823`, `11c2e28`, pushed)
- **What changed:** 30 px zoom-aware live-wind radius + nearest-site-with-live-reading; admin `skewtOverheatC`; `openSpline()` for SkewT traces; intro text below the map.

### Rain-radar layer + tapped-point card redesign (DECISION-016)
- **Completed:** 2026-10-03 (merged `39210c0`; CSP fix `326cd2a`; cross-layer carry `61a3bc9`)

### TASK-030 — Siteguide Version Change Email Notification
- **Completed:** 2026-09-15. NOTE: an earlier "done session 47" mark was wrong — the
  cron/detection/DB-log/auto-import existed but the **email was never wired**.
  Added `notifySiteguideVersionChange()` (`server/utils/siteguideVersionCheck.ts`,
  called from `scheduledJobs.ts` change branch): emails admins + the
  `siteguideAlertRecipients` setting via Resend. Best-effort, never throws.

### Smart Search manual-test issues — Fixed
- **Completed:** 2026-09-05 (session 47)

### Craigie Rd, Mt Martha — Repointed to Davis station
- **Completed:** 2026-09-05 (session 47)

### Smart Search — "Report bad answer" button + reason field
- **Completed:** 2026-09-15
- **What changed:** The ThumbsDown "Report incorrect response" button already existed. Added an optional free-text **reason** field: clicking the button now opens an inline textarea ("what was wrong with this answer?") with Submit/Cancel. Reason (≤1000 chars) is POSTed to `/api/search-logs/flag` and stored in the new `search_logs.flag_reason` column (migration `046`). Admin log view (Admin → API Settings → Smart Assistant → Search Query Logging) shows the reason under flagged entries. Files: `PublicSearchBox.tsx`, `searchLogs.ts`, `useConnectionsConfig.ts`, `AdminConnections.tsx`, `046_search_logs_flag_reason.sql`.

### TASK-031 — Pilot XC Flight History Export (CSV/GPX)
- **Completed:** 2026-06-03
- **What changed:** Added `GET /api/flights/export?format=csv|gpx` endpoint in `server/routes/flights.ts`. Implemented database queries to resolve sites landing zones and bulk flight breadcrumbs. Added "Export All" dropdown menu to `src/pages/FlightHistory.tsx` list view. Download logic uses secure fetch with authorization headers.

### TASK-SQLITE-REMOVAL — Complete SQLite → PostgreSQL migration
- **Completed:** 2026-05-27
- **What changed:** Removed `better-sqlite3` entirely. Converted all server code to use
  `query`/`queryOne`/`execute`/`transaction` from `server/pg.ts`. Deleted 28 migration files,
  4 dead utility files, `sqliteDb.ts`, `pgDb.ts`, `migrate_storage.ts`, `api.test.ts`.
  Stripped `server/db.ts` to PG-only. Zero `db.prepare` / `import db from` references remain.

### TASK-035 — Add cross-env to package.json
- **Completed:** 2026-05-20
- **What changed:** Added `cross-env: ^7.0.3` to devDependencies. Both `npx cross-env` → `cross-env` in start + analyze scripts.

---

## ✅ Done (continued)

### TASK-SW-001 — Consolidate the two `/`-scope service workers
- **Completed:** 2026-09-15
- **What changed:** Merged `sw-tiles.js`'s tile-caching fetch handler into `public/sw.js` (now the single `/`-scope worker, registered once in `main.tsx`). Its activate handler preserves `skyhigh-offline-tiles` and only clears legacy caches (was wiping ALL caches — the real bug). Deleted `public/sw-tiles.js` and its `useXCMapState.ts` registration. CARTO-exclusion caveat preserved.

### TASK-REVIEW-F — useWindPlayback Hook Extraction
- **Completed:** already done in an earlier session (verified 2026-09-15). `src/hooks/useWindPlayback.ts` exists and both `WindMapProto.tsx` (since deleted, `e949172`) + `SitesWindMap.tsx` consume it; no duplication remains. The deferred note was stale.

---

