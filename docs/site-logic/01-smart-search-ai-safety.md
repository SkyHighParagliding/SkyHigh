# Smart Search & AI Safety — Decisions, Thresholds, Gates, and Defaults

## Emergency Circuit-Breaker

### Emergency gate fires before the AI model is called
- **What it is:** A pre-LLM pattern-matcher that checks the current query and full conversation history for active-emergency signals. When triggered, the route returns a fixed verbatim response directing the user to call 000 and never calls the AI model.
- **Why (the decisions):** The July 2026 query-log audit found issues #59-84 where the model was coaching users through in-flight distress scenarios rather than directing them to emergency services. An LLM must never be in the decision loop for life-threatening situations. [Stated in commit 1455482 and the module docstring: "fixes #59-84 emergency roleplay coaching".]
- **How (the mechanism):** `checkEmergency(query, fullHistory)` in `server/utils/safetyGate.ts:223`. Two tiers: TIER A (unconditional whole-text scan — explicit phrases like "call 000", "I've crashed", "I am injured", "will I die", "bleeding") and TIER B (per-sentence with hypothetical guard — in-flight distress, physiological failure, equipment failure). Returns `{ triggered: true, reason }` when matched. Integration at `server/routes/search.ts:1577`.
- **Principles:** Refuse rather than improvise at the edges; Assume the safest reading when context is missing; Decisions stay with the human.

### Emergency gate persistence — once triggered, always triggered
- **What it is:** Once any message in a conversation would have triggered the gate, every subsequent turn is gated, regardless of what the user says next. A user saying "thanks I'm ok now" still receives the emergency response.
- **Why (the decisions):** [Inferred from code comment at search.ts:1575] "The FULL history is scanned (not the 6-turn LLM window) so long emergency conversations cannot age the trigger out of view." Prevents re-engagement after a person in distress sends a follow-up.
- **How (the mechanism):** `checkEmergency` scans all of `fullHistory` (not the 6-message LLM window) before the current query. Persistence detected via: (a) prior assistant message containing the sentinel phrase "call 000 (Triple Zero) now", or (b) any prior message that would independently trigger detection. `server/utils/safetyGate.ts:228–244`.
- **Principles:** Assume the safest reading when context is missing; Refuse rather than improvise at the edges.

### TIER A vs TIER B hypothetical guard
- **What it is:** TIER B patterns (in-flight distress, equipment failure, physiological) are suppressed when the containing sentence matches a hypothetical-guard phrase ("what if my…", "if I…", "in case of…"). TIER A (explicit rescue/injury/death phrases) fires unconditionally regardless of hypothetical framing.
- **Why (the decisions):** Legitimate safety-education queries like "What should I do if my reserve fails?" must not trigger the emergency gate. TIER A phrases are never hypothetical ("I've crashed", "I am bleeding") so no guard is needed there.
- **How (the mechanism):** `HYPOTHETICAL_RE` regex at `server/utils/safetyGate.ts:54`. `isHypothetical(sentence)` is called per sentence in the TIER B loop at `safetyGate.ts:183`. TIER A runs over the full normalized text at `safetyGate.ts:178`.
- **Principles:** Assume the safest reading when context is missing; Deliberate, explained differences.

### Fixed emergency response text — never modified at runtime
- **What it is:** `EMERGENCY_RESPONSE` is a module-level constant containing the 000 / Triple Zero guidance. The gate also uses this string as a sentinel to detect prior triggering in conversation history.
- **Why (the decisions):** Mutability would break the persistence check: if the string could change between turns, `msg.text.includes('call 000 (triple zero) now')` would fail to detect prior firing. The constant plays dual roles as response and sentinel.
- **How (the mechanism):** `server/utils/safetyGate.ts:27`. Persistence check at `safetyGate.ts:231–235`.
- **Principles:** One source of truth per rule; Refuse rather than improvise at the edges.

---

## Eligibility Engine — Rating-First Rule

### Rating-first gate: ask before naming any site
- **What it is:** If a pilot asks "can I fly X", "what sites can I fly", or any similar eligibility question without providing their rating in the message or earlier conversation, the AI must ask for their rating before naming any site.
- **Why (the decisions):** "This is a SAFETY rule — listing sites before knowing their rating could lead a pilot to assume they can fly somewhere dangerous for their level." [Public prompt, search.ts:845.] The rule prevents the default to PG5-capable sites.
- **How (the mechanism):** Stated in the `publicSearchPrompt` at `server/routes/search.ts:839–845`. The prompt also instructs the AI to detect ratings in the query itself (case-insensitive, e.g. "pg3", "HG2"), so it does not ask again when the rating is already present.
- **Principles:** Decisions stay with the human; Assume the safest reading when context is missing.

### Deterministic eligibility verdict — highest authority over AI reasoning
- **What it is:** When a pilot's rating and a specific site are both identified, the server computes a verdict deterministically from the database rating string and injects it as an "AUTHORITATIVE" block that the AI must restate verbatim. The AI may not contradict, soften, or revise it.
- **Why (the decisions):** Commit 1455482: "fixes #133 Paps, #128-130 Barwon Heads flip-flops" — the model was misinterpreting free-text rating strings and clearing pilots for sites above their level. Removing interpretation from the AI entirely solves the class of failure. The eligibility.ts module docstring: "SAFETY-CRITICAL. A public AI assistant previously interpreted free-text rating strings against prose rules and cleared a PG3 pilot for a PG4-only site."
- **How (the mechanism):** `computeEligibility(parsedRating, pilot)` in `server/utils/eligibility.ts:383`; `renderVerdictBlock` at `eligibility.ts:488`; verdict injected into the prompt at `server/routes/search.ts:1634`. The verdict block header text instructs the AI it "MUST restate it faithfully" and "may NOT contradict, soften, or revise it — including when the user pushes back".
- **Principles:** Compute in code, phrase with the model; One source of truth per rule; Traceable to code.

### PG1 / HG1 — no supervised path to any site
- **What it is:** The general supervision matrix returns `null` (ineligible) for any pilot at level 1, regardless of site rating. There is no supervisor who can make a PG1 eligible to fly an open site.
- **Why (the decisions):** PG1/HG1 is a training-operations certificate. [Inferred from matrix comment at `eligibility.ts:268`: "PG1/HG1: training operations only".] SAFA standards do not provide a supervision path for student-certificate holders at open flying sites.
- **How (the mechanism):** `matrixSupervisors` at `server/utils/eligibility.ts:266`: `if (pilotLevel <= 1) return null`. This causes `computeGroup` to fall through to INELIGIBLE at step 4.
- **Principles:** Assume the safest reading when context is missing; Refuse rather than improvise at the edges.

### General supervision matrix — five fixed level-pair rules
- **What it is:** For sites with a single plain (non-tiered, non-multi-launch) rating, the supervision matrix maps (pilot level, site level) pairs to required supervisor tokens. Five specific cross-level paths are recognized; all others are ineligible.
- **Why (the decisions):** Encodes the SAFA standard supervision framework. Explicitly computed in code so the AI cannot mis-apply it. [Inferred from matrix structure and commit message "removes interpretation from the AI".]
- **How (the mechanism):** `matrixSupervisors` lookup table at `server/utils/eligibility.ts:269–278`: `2-2` → `[PG4, SO]`; `2-3` → `[PG5]`; `2-4` → `[CFI, FI, SSO]`; `2-5` → `[CFI, FI, SSO]`; `3-4` → `[PG5]`; `3-5` → `[CFI, FI, SSO]`; `4-5` → `[PG5]`. Only single plain tiers use the matrix; exhaustive (tiered/multi-launch/supervised-first-tier) sites use only their stated tiers.
- **Principles:** Compute in code, phrase with the model; One source of truth per rule.

### Supervised-first-tier: default supervisors when none stated
- **What it is:** When a site rating tier carries the `supervised` marker (e.g. "PG2 Supervised") but no explicit supervisor token is listed, the required supervisors default to `[PG4, SO]`.
- **Why (the decisions):** [Inferred from `resolveSupervisors` at eligibility.ts:283] "tier.supervisors.length ? tier.supervisors : [`${disc}4`, 'SO']". The SAFA standard minimum for PG2 supervision is PG4 or SO, used as the safe default when the site guide omits specifics.
- **How (the mechanism):** `resolveSupervisors(tier, disc)` at `server/utils/eligibility.ts:283`.
- **Principles:** Assume the safest reading when context is missing; One source of truth per rule.

### Role (CFI/FI/SSO/SO) always maps to level 5
- **What it is:** When a pilot identifies themselves as a role (CFI, SSO, FI, SO), their effective level is treated as 5 for all eligibility checks.
- **Why (the decisions):** Role-holders are above the numeric scale by definition. [Inferred from `effectiveLevel` comment at eligibility.ts:256: "A role always counts as level 5 for the pilot's own eligibility."]
- **How (the mechanism):** `effectiveLevel(pilot)` at `server/utils/eligibility.ts:258`: `return pilot.role ? 5 : pilot.level`. SO requires an article in the self-identification pattern ("I am an SO") to avoid false-positive matches on the English word "so" (`extractFromText` at eligibility.ts:452).
- **Principles:** Assume the safest reading when context is missing; Deliberate, explained differences.

### Parser degrades to UNKNOWN — never guesses
- **What it is:** When `parseRatingString` cannot recognize the primary rating token in any tier, it records a parse warning and returns zero tiers. `computeEligibility` on a zero-tier rating produces a single `UNKNOWN` verdict, which renders as: "the rating for this site is not recorded in the system. Do not assume eligibility; contact a club safety officer."
- **Why (the decisions):** Eligibility.ts module docstring: "Design rule: when the parser is unsure, it degrades to UNKNOWN + a warning. It NEVER guesses. Unrecognized requirement text is preserved verbatim and quoted back to the pilot; it is never expanded or interpreted."
- **How (the mechanism):** `parseTier` returns `null` when `minLevel === null` (`eligibility.ts:161`); `parseRatingString` accumulates warnings (`eligibility.ts:233`); `computeEligibility` returns `bare('UNKNOWN')` when `tiers.length === 0` (`eligibility.ts:395`). Boot-time audit via `validateAllRatings` logs any problematic rating strings to the console at startup (`search.ts:236–244`).
- **Principles:** Refuse rather than improvise at the edges; Surface, don't hide.

### "Not suitable" — absolute discipline exclusion
- **What it is:** A site rated "Not suitable" for a discipline produces a `NOT_SUITABLE` verdict, rendered as the explicit label "HG ONLY — NOT OPEN TO PG PILOTS" (or PG ONLY for HG). The AI is instructed to treat these sites as invisible — not list them, not mention them, not use them as examples.
- **Why (the decisions):** An absolute hard stop. A PG pilot at an HG-only site cannot be made safe by any level of supervision. Labelling it explicitly prevents the AI from "softening" the restriction. [From eligibility rules at search.ts:879: "The label is an absolute disqualifier."]
- **How (the mechanism):** `parseRatingString` detects `/not\s+suitable/i` and sets `notSuitable: true` (`eligibility.ts:215`). Context builder renders the explicit label at `search.ts:302–306`. Prompt rule at `search.ts:879`: "It does not exist."
- **Principles:** Refuse rather than improvise at the edges; One source of truth per rule.

### Extract pilot rating: safety-conservative on ambiguity
- **What it is:** When multiple distinct rating levels appear in a query (e.g. "I'm not PG4 yet, just PG3"), `extractPilotRating` discards tokens preceded by disclaimer phrases and takes the **lowest** remaining level.
- **Why (the decisions):** Code comment at `eligibility.ts:433`: "If several DISTINCT levels remain, take the LOWEST — the safety-conservative reading. ('I'm not a PG4 yet, just PG3' must never extract PG4.)"
- **How (the mechanism):** `RATING_DISCLAIMER` regex at `eligibility.ts:426` catches "not", "want", "working towards", "hoping", etc. within 30 characters before a rating token. `candidates.reduce((a, b) => (b.level < a.level ? b : a))` at `eligibility.ts:441`.
- **Principles:** Assume the safest reading when context is missing; Separate facts from judgements.

### Conversation history scan for rating — newest user message first
- **What it is:** `extractPilotRating` first checks the current query, then scans user messages from newest to oldest. The first rating found wins.
- **Why (the decisions):** A follow-up query ("what about this weekend?") must inherit the rating stated in the previous turn. Newest-first ensures a correction ("actually I'm PG3 not PG2") takes precedence over the earlier statement.
- **How (the mechanism):** `extractPilotRating` at `server/utils/eligibility.ts:465–478`: builds `sources = [query, ...userMessagesNewestFirst]` and returns on the first match.
- **Principles:** Decisions stay with the human; Assume the safest reading when context is missing.

---

## Context Filtering — Hard Exclusion of Unflyable / Ineligible Sites

### Server-side hard exclusion of closed/restricted sites from context
- **What it is:** Sites with `status = 'closed'`, `'permanently closed'`, or `'restricted'` are omitted entirely from the AI context; they are never injected into the prompt.
- **Why (the decisions):** A closed or restricted site should never appear as a recommendation. Omitting it from context, not just instructing the AI to skip it, is more reliable. [Code comment at search.ts:291–292: "Server-side hard exclusion: skip permanently closed and restricted sites entirely".]
- **How (the mechanism):** `if (site.status === 'closed' || site.status === 'permanently closed' || site.status === 'restricted') continue;` in `buildPublicContext` at `server/routes/search.ts:292`. Repeated in the 7-day block at `search.ts:418`.
- **Principles:** Refuse rather than improvise at the edges; One source of truth per rule.

### Advisory-exclusion filter: strip unflyable sites from conditions queries
- **What it is:** At query time, sites where LIVE and FCST lines carry a hard-exclusion advisory (`[WRONG DIRECTION — do not recommend]`, `[LIGHT WINDS — do not recommend]`, `[BLOWN OUT — do not recommend]`, `[GUST THRESHOLD EXCEEDED — do not recommend]`) are stripped from the prompt when the query is a conditions query. Rating/eligibility queries bypass this filter.
- **Why (the decisions):** Pre-computing flyability advisories on the server side and then filtering the context is more reliable than asking the AI to reason about raw wind numbers. [Code comment at search.ts:602: "Runs at query time so the shared cache is never modified."] Eligibility queries need site ratings even for unflyable sites, hence the `isRatingQuery` bypass.
- **How (the mechanism):** `filterContextByAdvisoryExclusions(context, queryStr)` at `server/routes/search.ts:608`. `isConditionsQuery` and `isRatingQuery` regexes at `search.ts:615–619`. Four `EXCLUSION_TAGS` strings used as exact substring tests on LIVE/FCST lines.
- **Principles:** Compute in code, phrase with the model; Separate facts from judgements.

### PG-default for conditions queries with no explicit pilot type
- **What it is:** For a conditions query that mentions neither "PG" nor "HG", the filter defaults to PG behaviour and strips HG-only sites. The reasoning is that generic "what's flyable?" queries come predominantly from PG pilots; HG pilots almost always say "HG" when asking about conditions.
- **Why (the decisions):** Code comment at search.ts:493–498: "HG pilots asking about conditions almost always say 'HG'; a generic 'what's flyable this weekend?' is almost always from a PG pilot, and conversational follow-ups lose the PG context from the previous turn."
- **How (the mechanism):** `filterContextByPilotType` at `server/routes/search.ts:491`. `effectivelyPg = isPgQuery || (!isHgQuery && isConditionsQuery)` at `search.ts:499`.
- **Principles:** Assume the safest reading when context is missing; Deliberate, explained differences.

### Closure-date filter: 7-day default window for generic queries
- **What it is:** Sites with scheduled closures overlapping the queried dates are stripped from context. When the query names no specific dates, the filter defaults to the **next 7 days**.
- **Why (the decisions):** A pilot asking "where can I fly?" without specifying a date is almost certainly planning for the near future. Using 7 days avoids recommending a site that will be closed before the pilot can visit. [Code comment at search.ts:711: "Generic query — use the next 7 days as the default window".]
- **How (the mechanism):** `filterContextByClosureDates` at `server/routes/search.ts:709`. `extractQueryDates` detects day names, "today", "tomorrow", "weekend", and explicit Month Day patterns (e.g. "June 5th") at search.ts:535. Fallback: 7-day loop at search.ts:714.
- **Principles:** Assume the safest reading when context is missing; One source of truth per rule.

### Named-site preservation: never strip a site the pilot asked about directly
- **What it is:** Any site explicitly named in the query is immune to advisory-exclusion and closure-date stripping. The pilot needs the site's rating and closure information even if conditions are currently unflyable or the site is closed.
- **Why (the decisions):** [Code comment at search.ts:635–638: "Sites explicitly named in the query are never stripped — the pilot asked about them specifically and needs their eligibility/rating info even if no weather station exists."] Without this exception, a query about a named-but-closed site would return "I don't have that site in my database."
- **How (the mechanism):** `mentionedInQuery` and `mentionedNames` sets built in both `filterContextByAdvisoryExclusions` (search.ts:637) and `filterContextByClosureDates` (search.ts:724). Word-length gate: query words under 4 characters are excluded from name-matching to avoid false positives.
- **Principles:** Decisions stay with the human; Surface, don't hide.

### Gust check runs before light-wind check; compound reasons reported
- **What it is:** In the 7-day extended forecast block, gusts exceeding the site maximum are checked first and reported independently of the mean wind speed. A 4 kt mean with a 30 kt gust reports the gust, never "wind too light".
- **Why (the decisions):** Commit 1455482: "gust checks now precede light-wind checks with compound reasons (#9)". [Code comment at search.ts:449: "Gusts are checked FIRST and independently of mean speed: a 4kt mean with a 30kt gust must report the gust, never just 'wind too light'."]
- **How (the mechanism):** `reasons` array built at `server/routes/search.ts:453–459`. `gustExceeds` check (`gust > siteRange.max`) evaluated before `fly.direction` and `fly.speed` checks.
- **Principles:** Compute in code, phrase with the model; Surface, don't hide.

### Gust threshold: site-maximum with zero grace margin
- **What it is:** A gust is considered to exceed the site limit when `Math.round(windGust) > range.max`. No tolerance buffer is applied.
- **Why (the decisions):** Commit 1455482: "unified gust threshold (removed +2 grace)". A grace margin was previously applied (`gust > range.max + 2`) and was removed because any gust above the site maximum is a legitimate concern.
- **How (the mechanism):** `computeFlyability` at `server/routes/search.ts:116`: `Math.round(windGust) > range.max`. `gustWarning` string at `search.ts:117`. Same threshold applied in the 7-day block at `search.ts:451`.
- **Principles:** Assume the safest reading when context is missing; One source of truth per rule.

### HRLY improving-note fallback: replace raw hourly with a plain improving advisory
- **What it is:** When current LIVE and FCST lines are unflyable but the hourly slot data contains a `[OK]` slot, the raw HRLY line is replaced with a plain "Conditions expected to improve — Dir:X Spd:Good at approx Hpm" note.
- **Why (the decisions):** [Inferred from code comment at search.ts:602] Prevents the AI from encountering a confusing HRLY line alongside stripped LIVE/FCST and misinterpreting the data. The improving time is surfaced as a late-day option for the pilot to decide on.
- **How (the mechanism):** `findGoodHrlySlot` at `server/routes/search.ts:589`. Replacement at `search.ts:678`. Pilot prompt rule at `search.ts:884`: "If a site has a FCST line containing 'Conditions expected to improve', current conditions are poor but a later time today may be suitable — surface the improving time to the pilot as a late-day option and let them decide."
- **Principles:** Surface, don't hide; Decisions stay with the human.

### Today-only date scoping — forbid using another day's forecast as current
- **What it is:** When the query contains "today", "tonight", "right now", or "now" and all extracted dates are today's date, a `DATE SCOPE — TODAY ONLY` directive is injected into the prompt, instructing the AI to use only LIVE/FCST lines and 7-day entries labelled "TODAY".
- **Why (the decisions):** Commit 1455482: "today-only date scoping (#86-88)". Log incidents 86-88 showed the AI presenting the next day's better forecast as today's conditions when today's LIVE/FCST was absent.
- **How (the mechanism):** `todayDirective` constructed at `server/routes/search.ts:1743–1748`. Injected into prompt at `search.ts:1751`.
- **Principles:** Refuse rather than improvise at the edges; Compute in code, phrase with the model.

---

## Conditions Qualifications — Mandatory Hazard Opening

### Qualification statement must precede Good/Good verdict verbatim
- **What it is:** When a site/day has hazardous weather (precipitation, fog, mist, strong gusts) but otherwise-good wind direction and speed, a bracketed `[QUALIFICATIONS — MUST OPEN YOUR ANSWER ... VERBATIM: "..."]` tag is attached to the site's context line. The AI prompt rule mandates this statement be presented before any positive assessment.
- **Why (the decisions):** Commit 1455482: "fixes #131, #102, #114, #27 drizzle-as-Good". The AI was presenting "Good/Good" verdicts for sites with precipitation forecast, omitting the hazard entirely. The club's standard qualification statement delegates the fly/no-fly decision to the pilot while ensuring they have the hazard information first.
- **How (the mechanism):** `buildQualificationTag(slots)` at `server/utils/conditionQualifications.ts:236`. Injected into context at `server/routes/search.ts:377–378` (today forecast) and `search.ts:473` (7-day slots). Prompt rule at `search.ts:851–852`.
- **Principles:** Surface, don't hide; Decisions stay with the human; Compute in code, phrase with the model.

### Strong-gust threshold: gust ≥ wind-speed + 3 kt
- **What it is:** A slot is flagged as "Strong Gusts" when `windGust >= windSpeed + 3` (kt). This is distinct from the site-maximum gust check — it applies even when gusts are within the site limit.
- **Why (the decisions):** Code comment at `conditionQualifications.ts:177`: "club rule — gust 3 kt or more above average wind." A slot with windSpeed 0 is excluded to prevent false positives. The qualification is informational (fly/no-fly for pilot), not a hard exclusion.
- **How (the mechanism):** `detectHazards` at `server/utils/conditionQualifications.ts:180`: `if (slot.windSpeed > 0 && slot.windGust >= slot.windSpeed + 3) found.add('Strong Gusts')`.
- **Principles:** Compute in code, phrase with the model; Decisions stay with the human.

### WMO code → hazard mapping (primary), text fallback for code-0 slots
- **What it is:** Hazard detection uses the WMO weather code as primary source and falls back to case-insensitive substring matching on `weatherSummary` text when the code is 0 (the value for "today's" forecast slots that arrive without a code).
- **Why (the decisions):** [Stated in conditionQualifications.ts:9–14.] Today's forecast table provides only text summaries; extended-forecast slots include WMO codes. A single detection function must serve both. Text-only fallback is secondary because text is less structured and more ambiguous.
- **How (the mechanism):** `hazardsFromCode(code)` and `hazardsFromText(summary, alreadyInSlot)` at `conditionQualifications.ts:80` and `118`. Text "rain" is blocked from adding the plain Rain hazard when Heavy Rain or Rain Showers is already in the slot, to prevent double-counting.
- **Principles:** One source of truth per rule; Compute in code, phrase with the model.

### Canonical hazard severity order — Thunderstorms first, Strong Gusts last
- **What it is:** Hazards are always listed in a fixed canonical order: Thunderstorms → Heavy Rain → Rain → Rain Showers → Snow → Hail → Drizzle → Fog → Mist → Strong Gusts.
- **Why (the decisions):** [Inferred from `HAZARD_ORDER` definition at conditionQualifications.ts:59, comment: "Canonical severity order — defines output ordering from detectHazards."] The most severe hazards lead so the pilot's attention is on the worst risk first.
- **How (the mechanism):** `HAZARD_ORDER.filter(h => found.has(h))` at `conditionQualifications.ts:185` reorders any Set of detected hazards into the canonical sequence.
- **Principles:** Decisions stay with the human; Surface, don't hide.

### Partial-day phrasing when good and bad slots coexist
- **What it is:** The qualification statement uses "at some, but not all, times of the day" when the slot array contains both flyable (`flyable === true`) and not-flyable (`flyable === false`) slots; otherwise "at all times of the day".
- **Why (the decisions):** [Stated at `conditionQualifications.ts:238–241`.] A day with a narrow good window and hours of rain should not be described the same as a day that is uniformly hazardous.
- **How (the mechanism):** `hasFlyable && hasNotFlyable` check at `conditionQualifications.ts:240–241`. Phrasing selection at `composeQualification` `opts.partialDay` at `conditionQualifications.ts:219`.
- **Principles:** Surface, don't hide; Decisions stay with the human.

---

## Post-Generation Response Enforcement

### Verdict enforcement backstop: append dropped, prepend contradicted
- **What it is:** After streaming, the complete response text is checked deterministically against computed eligibility verdicts. Two correction modes: (1) a restrictive verdict that the model dropped or softened is appended; (2) a permissive verdict that the model contradicted ("No, you cannot fly X under any supervision") is prepended with a bold correction.
- **Why (the decisions):** Commit 1455482: "site-scoped post-generation backstop — dropped restrictive verdicts appended, contradicted permissive verdicts corrected". Even with authoritative verdict blocks in the prompt, models occasionally omit or invert them. The backstop catches this deterministically without re-running inference.
- **How (the mechanism):** `enforceVerdicts(text, computed)` at `server/utils/responseEnforcement.ts:148`. Scoping via `siteScopedText` (the site's sentences plus one following) to avoid false matches from unrelated site mentions. Contradictions detected by `CONTRADICTS_UNSUPERVISED` pattern list at `responseEnforcement.ts:125`, guarded by `AFFIRMS_UNSUPERVISED` regex at `responseEnforcement.ts:133`. Applied at `server/routes/search.ts:1798`.
- **Principles:** Compute in code, phrase with the model; Refuse rather than improvise at the edges.

### Qualification enforcement backstop: append missing hazard statements
- **What it is:** After streaming, each site's qualification statement (if present in the filtered context) is checked for presence in the response. Missing statements are appended as a "Conditions advisory".
- **Why (the decisions):** Models occasionally drop qualification statements when the answer is long or the site is discussed briefly. The backstop ensures the hazard information always reaches the pilot. [Code comment at responseEnforcement.ts:97: "Guarantee conditions-qualification statements reach the pilot intact."]
- **How (the mechanism):** `enforceQualifications(text, quals)` at `server/utils/responseEnforcement.ts:101`. Presence check uses the first 60 characters of each statement as a probe (sufficient to distinguish between statements). Applied at `server/routes/search.ts:1796`. `extractQualificationsBySite` at `responseEnforcement.ts:73` maps site names to their statements from the filtered context.
- **Principles:** Surface, don't hide; Refuse rather than improvise at the edges.

### Site-link validation: wrong ID corrected, unknown ID stripped
- **What it is:** All `[text](/sites/<id>)` markdown links in the AI response are validated post-generation. If the link text clearly names site A but the ID is site B, the URL is corrected. If the ID is unknown, the link is stripped to plain text.
- **Why (the decisions):** Commit 1455482: "fixes #28, #6, #23 — no silent substitution." The AI was generating links where the visible text named one site but the URL pointed to a different site, misleading pilots to the wrong site page.
- **How (the mechanism):** `validateSiteLinks(responseText, sites)` at `server/utils/siteResolver.ts:428`. Generic link text list at `siteResolver.ts:407` (e.g. "site page", "here") is always left to the ID validator rather than text-matching. Applied at `server/routes/search.ts:1794`.
- **Principles:** Surface, don't hide; Traceable to code.

---

## Site Name Resolution

### Exact vs fuzzy resolution: fuzzy requires user confirmation
- **What it is:** Site names in queries are classified into `exact` (confident match — safe to use) or `fuzzy` (near-miss — must confirm with user). Fuzzy matches trigger a "Did you mean…?" directive injected into the prompt; the AI must not answer as if the match is certain.
- **Why (the decisions):** Module docstring: "Silent substitution: 'Bells Beach Winkipop' was silently answered with 'Bells Beach - Southside' data because the orchestrator used naive substring." A fuzzy match that silently substitutes site data is a safety risk — the pilot may receive eligibility or hazard information for the wrong site.
- **How (the mechanism):** `resolveSiteNames(queryText, sites)` at `server/utils/siteResolver.ts:209`. Exact tier: full name, ID, base name (≥2 non-stop tokens or single token length ≥5), parenthetical (non-stop, ≥4 chars), alias. Fuzzy tier: Damerau-Levenshtein distance ≤`maxDist(tokenLength)`. `buildFuzzyDirective` at `siteResolver.ts:381` constructs the prompt directive. Applied at `server/routes/search.ts:1616–1619`.
- **Principles:** Refuse rather than improvise at the edges; Surface, don't hide.

### Fuzzy distance thresholds: 0 for len<4, 1 for len 4–6, 2 for len≥7
- **What it is:** The maximum Damerau-Levenshtein edit distance allowed for a fuzzy token match depends on token length. Tokens under 4 characters are never fuzzy-matched.
- **Why (the decisions):** [Inferred from `maxDist` at siteResolver.ts:137.] Short tokens have fewer characters, so even distance-1 matches produce high false-positive rates ("so" matches "SO"). Longer tokens tolerate more edits because they carry more discriminating information.
- **How (the mechanism):** `maxDist(len)` at `server/utils/siteResolver.ts:137`: `if (len < 4) return 0; if (len <= 6) return 1; return 2`. Applied per token pair in the fuzzy pass at `siteResolver.ts:349`.
- **Principles:** Assume the safest reading when context is missing; Deliberate, explained differences.

### DoS guard: query clamped to 1500 characters before edit-distance work
- **What it is:** `resolveSiteNames` truncates the input query to 1500 characters before running the O(n·m) edit-distance computation across every site token.
- **Why (the decisions):** Code comment at `siteResolver.ts:215`: "DoS guard: the public endpoint is unauthenticated; clamp attacker-controlled input before running O(n·m) edit-distance work across every site token."
- **How (the mechanism):** `String(queryText ?? "").slice(0, 1500)` at `server/utils/siteResolver.ts:215`.
- **Principles:** Assume the safest reading when context is missing.

### Common query words excluded from fuzzy matching
- **What it is:** A hardcoded list of ~80 common English query words (e.g. "there", "where", "good", "forecast", "tuesday") is excluded from the fuzzy matching pass, even if they are within edit distance of a site name token.
- **Why (the decisions):** Code comment at `siteResolver.ts:88–90`: "Real incident: 'there' is Damerau-Levenshtein distance 1 from 'three' (Three Sisters), causing a spurious 'Did you mean…?' clarification." Common words must never trigger a site name clarification.
- **How (the mechanism):** `COMMON_QUERY_WORDS` Set at `server/utils/siteResolver.ts:87`. Checked at `siteResolver.ts:352`: `if (COMMON_QUERY_WORDS.has(qTok)) continue`.
- **Principles:** Refuse rather than improvise at the edges; One source of truth per rule.

### Specificity de-dup: longer match wins over shorter substring
- **What it is:** When multiple sites match exactly in the same query (e.g. "Bells Beach Southside" matching both "Bells Beach" and "Bells Beach - Southside"), the less-specific site is removed. The site whose name is a substring of another matched site's name is dropped.
- **Why (the decisions):** Module docstring: "Silent substitution: 'Bells Beach Winkipop' was silently answered with 'Bells Beach - Southside' data." Without de-dup, both sites appear as exact matches and the AI may pick the wrong one.
- **How (the mechanism):** De-dup block at `server/utils/siteResolver.ts:293–327`. Score = length of the longest matching phrase. Sites whose normName is a substring of a higher-scoring site's normName are removed.
- **Principles:** Refuse rather than improvise at the edges; One source of truth per rule.

### History fallback for follow-up site resolution
- **What it is:** When the current query names no site exactly, `resolveSiteNames` is re-run against the full text of the last 6 conversation messages. If that resolves a site, it is used without triggering a "did you mean?" clarification.
- **Why (the decisions):** [Code comment at search.ts:1607–1614] "Follow-up queries ('can I fly there?') name the site only in earlier turns — fall back to resolving against the conversation history (newest first)." Without this, conversational follow-ups would always fail site resolution.
- **How (the mechanism):** `resolveSiteNames(historyText, liveSites)` at `server/routes/search.ts:1612`. History text is joined newest-first to bias towards the most recent mention.
- **Principles:** Decisions stay with the human; Assume the safest reading when context is missing.

---

## Caching

### Search context TTL: 5 minutes default, admin-configurable
- **What it is:** The in-memory cache for public and admin search context (site data, weather, procedures) expires after N minutes, where N is read from the `cacheSearchContextTtl` settings key, defaulting to 5 if absent.
- **Why (the decisions):** [Inferred from cache comment at search.ts:131: "OPTIMIZATION: Context caching".] Building the full context requires multiple DB queries and weather joins. Caching avoids hammering the database on every AI call while keeping weather data reasonably fresh.
- **How (the mechanism):** `getContextTtl()` at `server/routes/search.ts:143`: `parseInt(row?.value || "5", 10) * 60 * 1000`. Checked at `search.ts:248` (public) and `search.ts:988` (internal).
- **Principles:** One source of truth per rule.

### Asset register TTL: 10 minutes default, admin-configurable
- **What it is:** The in-memory cache for the Google Sheets asset register data expires after N minutes, defaulting to 10. The asset register is fetched separately from the main context because it is an external HTTP call to an Apps Script endpoint.
- **Why (the decisions):** [Inferred from code comment at search.ts:149: "OPTIMIZATION: Asset register caching".] A 10-minute window balances freshness against the latency and failure risk of an external HTTP call.
- **How (the mechanism):** `getAssetTtl()` at `server/routes/search.ts:153`: `parseInt(row?.value || "10", 10) * 60 * 1000`.
- **Principles:** One source of truth per rule.

### Asset register capped at 50 items
- **What it is:** When the Apps Script endpoint returns asset register results, only the first 50 items are cached and injected into the search context.
- **Why (the decisions):** [Inferred from code at search.ts:197: `assetJson.results.slice(0, 50)`; log message: `caching ${Math.min(assetJson.results.length, 50)}`]. The asset register can be large; the 50-item cap keeps the prompt context size bounded.
- **How (the mechanism):** `items = assetJson.results.slice(0, 50)` at `server/routes/search.ts:197`.
- **Principles:** One source of truth per rule.

### Asset register fetch timeout: 5 seconds
- **What it is:** The fetch to the Google Apps Script asset register endpoint aborts after 5000 ms.
- **Why (the decisions):** [Inferred from code at search.ts:189: `setTimeout(() => controller.abort(), 5000)`]. The asset register is a non-critical addition to the admin context; a slow or unresponsive Apps Script must not stall the search response.
- **How (the mechanism):** `AbortController` with `setTimeout(5000)` at `server/routes/search.ts:189`.
- **Principles:** Refuse rather than improvise at the edges.

### Closure date window in context: next 14 days
- **What it is:** The context builder fetches scheduled closure dates for the **next 14 days** from the database and annotates site context lines with them.
- **Why (the decisions):** [Inferred from search.ts:267: `const in14 = new Date(Date.now() + 14 * 86400000)...`]. The 7-day extended forecast is the maximum forecast horizon; 14 days captures all forecast days with some buffer for weekly queries.
- **How (the mechanism):** `closureRows` query at `server/routes/search.ts:269` with `closure_date <= $2` where `$2` is `Date.now() + 14 * 86400000`.
- **Principles:** One source of truth per rule.

### Hourly forecast: first 4 slots injected into context
- **What it is:** When an hourly forecast array is available, only the first 4 time slots are included in the HRLY context line.
- **Why (the decisions):** [Inferred from search.ts:386: `hourly.slice(0, 4)`]. The first 4 slots cover the core flying window (typically morning through mid-afternoon). More slots would inflate the context unnecessarily.
- **How (the mechanism):** `hourly.slice(0, 4)` at `server/routes/search.ts:386`.
- **Principles:** One source of truth per rule.

### Context description fields truncated at 150–200 characters
- **What it is:** Site description is truncated at 200 characters; hazards, launch, landing, rules, and access fields at 150 characters in the public context.
- **Why (the decisions):** [Inferred from search.ts:315–320]. Fields must be informative without bloating the prompt token count; these limits are generous enough for salient content while preventing very long site guides from dominating the context.
- **How (the mechanism):** `.substring(0, 200)` and `.substring(0, 150)` throughout `buildPublicContext` at `server/routes/search.ts:315–320`.
- **Principles:** One source of truth per rule.

---

## AI Model Configuration

### Zero temperature for all text generation
- **What it is:** All AI text generation calls use `temperature: 0`, making outputs deterministic given the same prompt.
- **Why (the decisions):** [Inferred from `generateTextWithFallback` at aiModels.ts:71: `temperature: 0`.] Eligibility and flyability answers must be reproducible; creative variation is harmful in a safety-relevant assistant.
- **How (the mechanism):** `config: { temperature: 0 }` applied unconditionally in `generateTextWithFallback` at `server/utils/aiModels.ts:71`, overriding any caller-supplied config.
- **Principles:** Compute in code, phrase with the model; Refuse rather than improvise at the edges.

### Thinking budget disabled (0)
- **What it is:** All Gemini calls pass `thinkingConfig: { thinkingBudget: 0 }`, disabling the model's extended-thinking mode.
- **Why (the decisions):** [Inferred from all call sites at search.ts:1063, 1479, 1767.] Extended thinking increases latency and cost; for a real-time streaming assistant the deterministic safety layers (verdict injection, enforcement) replace the need for the model to reason deeply about eligibility.
- **How (the mechanism):** `config: { thinkingConfig: { thinkingBudget: 0 } }` at `server/routes/search.ts:1063`, `1479`, `1767`.
- **Principles:** Compute in code, phrase with the model.

### Default model fallback chain: Flash → Pro → Flash 2.0
- **What it is:** If no model list is configured in the database, the default ordered list is `["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"]`. Models are tried in order; the first to succeed is used.
- **Why (the decisions):** [Inferred from `DEFAULT_TEXT_MODELS` at aiModels.ts:8.] Flash is preferred for cost and latency; Pro is the fallback for quality; Flash 2.0 is the final fallback for availability.
- **How (the mechanism):** `DEFAULT_TEXT_MODELS` at `server/utils/aiModels.ts:8`. `generateTextWithFallback` iterates the list at `aiModels.ts:65`. Admin can override via `aiTextModels` settings key.
- **Principles:** One source of truth per rule.

### API key preference: USER_GEMINI_API_KEY before GEMINI_API_KEY
- **What it is:** The public and admin search routes use `process.env.USER_GEMINI_API_KEY || process.env.GEMINI_API_KEY`. If both are set, the user key is preferred.
- **Why (the decisions):** [Inferred from search.ts:981 and 1284.] Allows a per-user quota key for public traffic separate from a shared admin key.
- **How (the mechanism):** `const apiKey = process.env.USER_GEMINI_API_KEY || process.env.GEMINI_API_KEY` at `server/routes/search.ts:981` (internal) and `search.ts:1284` (admin).
- **Principles:** One source of truth per rule.

---

## Search Query Logging

### Log size warning threshold: 10 MB default, admin-configurable
- **What it is:** After each logged public search, the total byte size of all entries is checked. If it exceeds the `searchLogSizeWarningMb` setting (default 10 MB), an email alert is sent and `searchLogWarningSent` is set to prevent repeat alerts.
- **Why (the decisions):** [Inferred from logPublicSearch at search.ts:33–45.] Search logs can grow rapidly; the warning prevents unnoticed disk/memory pressure on the database without imposing a hard limit.
- **How (the mechanism):** `warnMb = parseFloat(warnMbRow?.value || "10")` at `server/routes/search.ts:33`. Size computed as `SUM(LENGTH(query) + LENGTH(response))` in bytes, converted to MB.
- **Principles:** Surface, don't hide.

### One warning email per log table (not per query)
- **What it is:** Once the size warning email is sent, `searchLogWarningSent` is set to `true` and no further emails are sent until the admin clears the logs (which resets the flag to `false`).
- **Why (the decisions):** [Inferred from search.ts:29–30 and searchLogs.ts:89.] Sending one email per query after the threshold would flood the admin inbox.
- **How (the mechanism):** `if (warnSentRow?.value === "true") return;` at `server/routes/search.ts:30`. Reset at `server/routes/searchLogs.ts:89` on DELETE.
- **Principles:** Surface, don't hide; Refuse rather than improvise at the edges.

### Search log flag reason capped at 1000 characters
- **What it is:** When a pilot flags a response as incorrect, the optional reason text is trimmed to 1000 characters before being stored.
- **Why (the decisions):** [Inferred from searchLogs.ts:72: `reason.trim().slice(0, 1000)`]. Prevents excessively long free-text entries while allowing detailed feedback.
- **How (the mechanism):** `cleanReason = typeof reason === "string" ? reason.trim().slice(0, 1000) : ""` at `server/routes/searchLogs.ts:72`.
- **Principles:** One source of truth per rule.

### Search log pagination: default 50, max 100 per page
- **What it is:** The search logs listing endpoint caps results at 100 per page regardless of the requested `limit` parameter.
- **Why (the decisions):** [Inferred from searchLogs.ts:12: `Math.min(100, Math.max(1, parseInt(req.query.limit) || 50))`]. Prevents an accidental or malicious request from fetching the entire log table in one hit.
- **How (the mechanism):** `limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50))` at `server/routes/searchLogs.ts:12`.
- **Principles:** Refuse rather than improvise at the edges.

---

## AI JSON Parsing Fallbacks

### Four-stage JSON recovery chain
- **What it is:** The AI JSON parser attempts to parse model output through four progressively more invasive strategies before throwing: (1) basic cleanup + `JSON.parse`; (2) regex-extracted JSON object + basic cleanup; (3) `fixBrokenJson` (character-level escape repair + bracket balancing) + parse; (4) `rebuildJson` (key-value regex extraction into a new object).
- **Why (the decisions):** [Inferred from `parseAiJsonResponse` at aiJsonParser.ts:6–57.] Gemini models occasionally produce JSON with unclosed strings, trailing commas, or surrounding prose. The cascade maximises the chance of recovering structured data without manual retry. Throwing only as a final resort avoids crashing the caller.
- **How (the mechanism):** `parseAiJsonResponse` at `server/utils/aiJsonParser.ts:6`. Applied in internal and admin search routes at `search.ts:1069–1076`.
- **Principles:** Refuse rather than improvise at the edges.

### Rebuild guard: requires at least 3 keys
- **What it is:** `rebuildJson` (the last-resort JSON reconstruction) returns `null` rather than an empty object if it extracted fewer than 3 key-value pairs.
- **Why (the decisions):** [Inferred from aiJsonParser.ts:151: `if (Object.keys(obj).length < 3) return null`.] A result with 0–2 keys is more likely a partial parse of noise than a meaningful response structure. Returning null allows the caller to fall through to an error state rather than accepting a nearly-empty result.
- **How (the mechanism):** Guard at `server/utils/aiJsonParser.ts:151`.
- **Principles:** Refuse rather than improvise at the edges.

---

## Client-Side Decisions

### Conversation history sent to server: last 6 messages (excluding CTAs)
- **What it is:** The `PublicSearchBox` sends at most the last 6 messages from the conversation to the `/api/search/public` endpoint. CTA (call-to-action) messages are filtered out before slicing.
- **Why (the decisions):** [Inferred from PublicSearchBox.tsx:204: `updatedMessages.filter(m => !m.isCta).slice(-6)`.] Bounding history size limits prompt token consumption and prevents very old context from influencing current responses.
- **How (the mechanism):** `.filter(m => !m.isCta).slice(-6)` at `src/components/PublicSearchBox.tsx:204`. Server-side: `fullHistory.slice(-6)` for the LLM context window at `server/routes/search.ts:1569`, but the full history is kept for the emergency gate scan.
- **Principles:** One source of truth per rule.

### Duplicate-query guard: pending request ref prevents double-submit
- **What it is:** If the same query string is already in flight, the submit handler returns early without making a second request.
- **Why (the decisions):** [Inferred from PublicSearchBox.tsx:180: `if (pendingRequestRef.current === q) return;`]. Prevents double-posting from rapid user input or accidental double-click.
- **How (the mechanism):** `pendingRequestRef.current` checked and set at `src/components/PublicSearchBox.tsx:180–181`.
- **Principles:** Refuse rather than improvise at the edges.

### URL safety check: only relative, http, https, and anchor links rendered
- **What it is:** The markdown renderer in `PublicSearchBox` only renders links as clickable anchors when the URL starts with `/`, `http://`, `https://`, or `#`. Any other URL scheme is rendered as plain text.
- **Why (the decisions):** [Inferred from `isSafeUrl` at PublicSearchBox.tsx:14.] Prevents the AI-generated response from producing clickable `javascript:` or `data:` URLs that could be exploited.
- **How (the mechanism):** `isSafeUrl(url)` at `src/components/PublicSearchBox.tsx:14`, checked before rendering link elements at `PublicSearchBox.tsx:23` and `43`.
- **Principles:** Assume the safest reading when context is missing; Refuse rather than improvise at the edges.

### Prompt auto-upgrade on server restart: required rule markers checked
- **What it is:** On each server start, `seedPublicPrompt` checks the stored `publicSearchPrompt` and `publicSearchEligibilityRules` for a set of required marker strings. If any is absent, the stored prompt is replaced with the current default and a warning is logged.
- **Why (the decisions):** [Stated in seedPublicPrompt at search.ts:1836–1857.] As new safety rules are added (e.g. `COMPUTED ELIGIBILITY VERDICT`, `CONDITIONS QUALIFICATIONS`, `NOT FLYABLE] IS A WEATHER TAG`), old customized prompts that predate those rules would silently omit them. The auto-upgrade ensures critical safety rules are always present even if the admin had customized the prompt.
- **How (the mechanism):** `seedPublicPrompt()` at `server/routes/search.ts:1826`. Marker list: 8 strings for the behavior prompt, 12 strings for the eligibility rules.
- **Principles:** One source of truth per rule; Surface, don't hide.
