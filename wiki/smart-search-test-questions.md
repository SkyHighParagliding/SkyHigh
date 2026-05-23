# Smart Search — Test Question Bank
**Last updated:** 2026-05-23  
**Purpose:** Regression and acceptance testing for the Public Smart Assistant. Draw from this list when running test suites. Rotate dates, conditions, and question wording each session.

---

## How to use
- **Query column** — paste verbatim into the search box (or node test script with date injection)
- **Expected answer** — describes what the AI *must* say. It doesn't need to match word-for-word, but every point listed must be present and no point marked ❌ may appear.
- **Key rule tested** — which prompt/code rule this exercises

---

## Site Rating Reference (quick cheat-sheet)

| Site | PG Rating | Notes |
|------|-----------|-------|
| Flinders Monument | PG5 \| PG4 SO/SSO | Site-specific tiers — general matrix does NOT apply |
| Ben Nevis | PG4 | General matrix applies |
| Three Sisters (Flowerdale) | PG2 Sup (North) \| PG4 (South) | Site-specific tiers; closed until 31 May 2026 |
| Mt Buninyong | PG5 | No weather station; general matrix applies |
| Mt Buffalo – Reed's Lookout | PG5 \| PG4 req FI/SSO | Site-specific tiers; HG not suitable |
| Craigie Rd, Mt Martha | PG5 End \| PG4 End \| PG4 req PG5 End/FI/CFI/SSO | Site-specific tiers |
| Dunvegan Road, Phillip Island | PG4 \| PG3 Sup req PG5 | Site-specific tiers |
| Mt Emu | PG4 \| PG2 Sup req FI/SSO \| PG3 req PG5 | Site-specific tiers |
| Gundowring (Savhill) | PG4 \| PG2 Sup req PG4/SO \| PG3 req PG4/SO | Site-specific tiers |
| Great Missenden (Ex Landscape) | PG4 \| PG3 Sup req PG5 | Site-specific tiers |
| Flaxmans Hill | PG4 \| PG2 Sup req PG4 | Site-specific tiers |
| Grannies Grave | PG4 \| PG2 Sup req PG4 | Site-specific tiers |
| Barwon Heads (13th Beach) | PG2 Supervised | General matrix applies |
| Bells Beach – Southside | PG2 Supervised | General matrix applies |
| Bells Beach – Winkipop | HG ONLY (PG: Not suitable) | Absolute — PG pilots invisible here |
| Kilcunda | PG2 Supervised | General matrix applies |
| Ben More | PG2 Supervised | General matrix applies |
| Logans Beach | PG2 Supervised | General matrix applies |
| Gordon | PG2 Supervised | General matrix applies |
| Marriners Lookout | PG2 Supervised | General matrix applies |
| Mt Hollowback | PG2 Supervised | General matrix applies |
| Cairns Bay | PG4 | General matrix applies |
| Cape Liptrap | PG4 | General matrix applies |
| Mt Lonarch | PG4 | General matrix applies |
| Mt Meuron | PG4 | General matrix applies |
| Grossard Point, PI | PG4 | General matrix applies |
| Fisher Street, PI | PG4 (HG not suitable — PG only) | General matrix applies |
| Manny's | PG2 Sup req PG4/SO | General matrix applies |
| Flinders Golf Club | PG2 Sup req PG4/SO | General matrix applies |
| Mt Dandenong | PG5 Endorsed req PG5/SO induction | Complex endorsement site |
| Locksley Field | HG Intermediate Endorsed (PG: Not suitable) | HG only |
| Colliers Gap | HG Advanced (PG: Not suitable) | HG only |
| Mt Donna Buang | HG Advanced (PG: Not suitable) | HG only |
| Mt Buffalo – The Gorge HG Ramp | HG Adv \| HG Int req HG Adv Sup (PG: Not suitable) | HG only |

---

## CFI / Instructor role notes

| Role | Implied PG level | Can fly Monument? |
|------|-----------------|-------------------|
| CFI (Chief Flying Instructor) | PG5 minimum | ✅ Yes, unsupervised |
| FI (Flying Instructor) | PG4 minimum (often PG5) | Ask for PG rating — if PG5 yes alone; if PG4 yes with SO/SSO |
| SSO (Senior Safety Officer) | PG3+ (supervision role, not pilot rating) | Ask for PG rating |
| SO (Safety Officer) | PG3+ (supervision role, not pilot rating) | Ask for PG rating |

---

## The 50 Questions

### GROUP A — Flinders Monument: ineligible pilots (Q1–Q5)

| # | Query | Expected answer | Key rule |
|---|-------|-----------------|----------|
| Q01 | "Im a PG1 pilot, can I fly Flinders Monument on Saturday?" | ❌ No. PG1 is below all site tiers (minimum is PG4 with SO/SSO). No supervisor type can make a PG1 eligible. | STEP 1 site-specific tiers; PG1 below all |
| Q02 | "I am PG2. Can I fly Monument if I have a CFI with me?" | ❌ No. PG2 is below all tiers at Flinders Monument. A CFI cannot make a PG2 eligible here. | FORBIDDEN OPENING; CFI workaround must be absent |
| Q03 | "Im PG3 can I fly Flinders Monument this weekend with an FI supervising me?" | ❌ No. PG3 is below the minimum supervised tier (PG4). An FI cannot make a PG3 eligible at this site. | STEP 1; FORBIDDEN OPENING |
| Q04 | "what is the minimum rating for flinders monument" | The minimum to fly supervised is PG4 (with SO/SSO). The minimum to fly unsupervised is PG5. PG3 and below cannot fly regardless of supervision. | Site-specific tiers explanation |
| Q05 | "My 17 year old son is PG2 and wants to fly Monument for his first lead-off. What do I need to organise?" | ❌ Not possible. PG2 pilots are below all tiers at Flinders Monument and cannot fly this site under any supervision. | FORBIDDEN OPENING; third-person framing |

---

### GROUP B — Flinders Monument: eligible pilots (Q6–Q9)

| # | Query | Expected answer | Key rule |
|---|-------|-----------------|----------|
| Q06 | "Im a PG4 can I fly Flinders Monument on Thursday?" | ✅ Yes, as a PG4 you can fly Monument with SO/SSO supervision. Then note Thursday forecast conditions. | STEP 1; PG4 supervised tier |
| Q07 | "PG5 pilot here. Can I fly Flinders Monument this Sunday?" | ✅ Yes, as a PG5 pilot you can fly Flinders Monument unsupervised. Then note Sunday forecast. | PG5 meets top tier |
| Q08 | "Im a CFI can I fly Monument" | ✅ Yes. As a CFI (Chief Flying Instructor) you hold at least a PG5 rating and can fly Flinders Monument unsupervised. | CFI ≥ PG5 recognition |
| Q09 | "I'm an SSO. Can I fly Flinders Monument next friday?" | Ask for PG pilot rating. SSO is a supervision qualification, not a pilot rating. To fly Monument, the pilot needs PG4 (with SO/SSO supervision) or PG5 (unsupervised). | SSO is role not rating |

---

### GROUP C — Flinders Monument: spelling variants (Q10–Q11)

| # | Query | Expected answer | Key rule |
|---|-------|-----------------|----------|
| Q10 | "Im PG3 can I fly Flindas Monument on wednesday" | Find as Flinders Monument. ❌ No, PG3 cannot fly under any supervision. | Fuzzy name matching; STEP 1 |
| Q11 | "PG4. Can I fly the monument at flinders? Got a safety officer with me for Tuesday." | ✅ Yes, PG4 can fly Flinders Monument with SO/SSO supervision. Tuesday conditions noted. | Informal naming; PG4 + SO = valid |

---

### GROUP D — Ben Nevis: various ratings (Q12–Q16)

| # | Query | Expected answer | Key rule |
|---|-------|-----------------|----------|
| Q12 | "Im PG4. Can I fly Ben Nevis on Monday?" | ✅ Yes, PG4 can fly Ben Nevis unsupervised. Note Monday ECMWF forecast (cite actual day's data — direction, speed). | T4 core fix; cite actual forecast not today's FCST |
| Q13 | "PG3 pilot — can I fly Ben Nevis this Friday?" | ✅ Yes, but only with PG5 supervision (general matrix: PG3 at PG4 site → PG5 supervisor). Note Friday conditions. | STEP 2 general matrix; PG3→PG4 site |
| Q14 | "Im PG2, my club has an outing to Ben Neavis on Sunday. Will I be allowed?" | ✅ Yes, with CFI, FI, or SSO supervision (general matrix: PG2 at PG4 site). Use name "Ben Nevis" in response (correct the misspelling). | STEP 2; PG2→PG4 site; spelling fix |
| Q15 | "PG5. Heading to Ben Nevis Saturday morning, conditions?" | ✅ Yes, PG5 can fly Ben Nevis unsupervised. Quote Saturday's 7-day forecast data from extended forecasts. | PG5 qualified; cite forecast |
| Q16 | "can i fly ben nevis" (no day, no rating) | Ask for PG rating first before recommending any site. | RATING-FIRST rule |

---

### GROUP E — Three Sisters (Flowerdale): closed site + name variants (Q17–Q21)

| # | Query | Expected answer | Key rule |
|---|-------|-----------------|----------|
| Q17 | "Im a PG3 can I fly Flowerdale next friday" | Three Sisters (Flowerdale) is currently closed until 31 May. After reopening: North launch yes (PG2 supervised site — PG3 qualifies with or without supervision); South launch no (PG4 required). | Closure direct-query rule; parenthetical name matching |
| Q18 | "Im a pg3 can I fly 3 sisters next friday" | Same as Q17 — find Three Sisters (Flowerdale) via "sisters" keyword. Closed until 31 May. | Keyword matching; closure rule |
| Q19 | "Im PG4 can I fly Fowlerdale this week" | Three Sisters (Flowerdale) — note the spelling correction. Closed until 31 May. After reopening: PG4 can fly both North and South launches. | Spelling mistake "Fowlerdale" |
| Q20 | "PG2 pilot. Can I fly Three Sisters Flowerdale on June 2nd?" | After the 31 May closure ends: PG2 can fly the North launch with supervision. PG2 cannot fly the South launch (PG4 required). Note supervision requirement. | Post-closure eligibility; site-specific multi-launch tiers |
| Q21 | "Does Three Sisters open again soon?" | Yes, Three Sisters (Flowerdale) is currently closed until 31 May and will reopen on 1 June. | Scheduled closure direct-query |

---

### GROUP F — Mt Buninyong: no weather station (Q22–Q24)

| # | Query | Expected answer | Key rule |
|---|-------|-----------------|----------|
| Q22 | "Can anyone fly Mt Buninyong on Sunday?" | Ask for PG rating first. | RATING-FIRST; no rating given |
| Q23 | "Im PG5. Can I fly Mt Buninyong on Sunday?" | ✅ Yes, PG5 can fly Mt Buninyong unsupervised. Note there is no live weather station — check conditions closer to the date. The 7-day extended forecast (if available) may show forecast conditions; if Sunday is absent/NOT FLYABLE, note that. | No weather station; PG5 qualified |
| Q24 | "Im PG4. Can I fly Mt Buninyong?" | ✅ Yes, with PG5 supervision (general matrix: PG4 at PG5 site). Note no live weather station. | STEP 2; PG4 at PG5 site |

---

### GROUP G — Mt Buffalo Reed's Lookout: site-specific tiers (Q25–Q27)

| # | Query | Expected answer | Key rule |
|---|-------|-----------------|----------|
| Q25 | "Im PG3 can I fly Mt Buffalo Reeds Lookout on Wednesday?" | ❌ No. PG3 is below all tiers at Mt Buffalo – Reed's Lookout (minimum supervised is PG4 with FI/SSO). | STEP 1; PG3 below all tiers |
| Q26 | "PG4 pilot. Can I fly Mt Buffalo Reeds Lookout on Thursday?" | ✅ Yes, with FI or SSO supervision. Note Thursday forecast conditions. | STEP 1; PG4 + FI/SSO tier |
| Q27 | "Im PG5, planning a fly at Mt Buffalo Reed's Lookout on Friday" | ✅ Yes, PG5 can fly unsupervised. Note it's a valley breeze site. Note Friday forecast. | PG5 top tier |

---

### GROUP H — HG-only sites queried by PG pilots (Q28–Q30)

| # | Query | Expected answer | Key rule |
|---|-------|-----------------|----------|
| Q28 | "Im PG4, can I fly Bells Beach Winkipop on Saturday?" | ❌ Bells Beach – Winkipop is an HG-only site. PG pilots cannot fly here under any circumstances. Do not mention it as an option. | HG ONLY absolute exclusion |
| Q29 | "PG5 here. Can I fly Colliers Gap?" | ❌ Colliers Gap is an HG-only site. Not available to PG pilots regardless of rating or supervision. | HG ONLY absolute exclusion |
| Q30 | "Can a PG3 fly Mt Donna Buang?" | ❌ Mt Donna Buang is an HG-only site. PG pilots cannot fly here. | HG ONLY absolute exclusion |

---

### GROUP I — Site-specific tiers with PG2 below all tiers (Q31–Q33)

| # | Query | Expected answer | Key rule |
|---|-------|-----------------|----------|
| Q31 | "Im PG2. Can I fly Dunvegan Road Phillip Island on Sunday?" | ❌ No. Dunvegan Road has site-specific tiers starting at PG3. PG2 is below all listed tiers and cannot fly here under any supervision. | STEP 1; PG2 below all tiers for "|" site |
| Q32 | "Im PG2. My instructor says I can fly Great Missenden. Is that right? Going Tuesday." | ❌ Incorrect. Great Missenden (Ex Landscape) has site-specific tiers starting at PG3. PG2 is below all listed tiers and cannot fly here. Recommend checking with the club on the correct site for PG2 pilots. | STEP 1; PG2 below all tiers; instructor override impossible |
| Q33 | "PG2 here. Can I fly Gundowring with a PG4 supervising me on Wednesday?" | ✅ Yes. Gundowring (Savhill) has a PG2 supervised tier requiring PG4 or SO supervision. With a PG4 supervisor that satisfies the requirement. Note Wednesday forecast. | STEP 1; PG2 tier at Gundowring; PG4 supervisor valid |

---

### GROUP J — Complex supervision tier matches (Q34–Q36)

| # | Query | Expected answer | Key rule |
|---|-------|-----------------|----------|
| Q34 | "Im PG3. Can I fly Mt Emu on Thursday?" | ✅ Yes, with PG5 supervision (Mt Emu site-specific tier: PG3 requires PG5). Note Thursday forecast. | STEP 1; PG3 tier at Mt Emu |
| Q35 | "Im PG2. Can I fly Mt Emu with a CFI on Saturday?" | ✅ Yes. Mt Emu's PG2 supervised tier requires FI or SSO. A CFI qualifies as a supervising FI. Note Saturday conditions. | STEP 1; PG2 tier at Mt Emu; CFI = FI for supervision |
| Q36 | "PG3 pilot. Can I fly Gundowring Savhill on Monday?" | ✅ Yes, with PG4 or SO supervision (Gundowring PG3 tier: requires PG4/SO). Note Monday forecast. | STEP 1; PG3 tier at Gundowring |

---

### GROUP K — PG2 listing queries (Q37–Q38)

| # | Query | Expected answer | Key rule |
|---|-------|-----------------|----------|
| Q37 | "Im PG2. What sites can I fly this Saturday?" | ✅ Lists sites with flyable conditions on Saturday where PG2 pilots can fly supervised. Must state that PG2 requires supervision at EVERY site. Must not include Flinders Monument, Dunvegan Road, Great Missenden Ex Landscape, Winkipop, Colliers Gap, or any site where PG2 is below all tiers. | PG2 universal supervision rule; STEP 1 exclusions |
| Q38 | "Im a PG2 pilot new to the club. What sites should I be looking at for supervised flights?" | General overview: PG2 requires supervision everywhere. List sites rated PG2 Supervised (Barwon Heads, Kilcunda, Bells Beach Southside, Ben More, Gordon, etc.). Do not list PG5 sites or site-specific tier sites where PG2 is excluded. | PG2 rule; site curation |

---

### GROUP L — PG3 listing queries (Q39–Q40)

| # | Query | Expected answer | Key rule |
|---|-------|-----------------|----------|
| Q39 | "Im a PG3. What sites can I fly this weekend without needing supervision?" | Lists PG2 and PG3 rated sites where PG3 is qualified (Barwon Heads, Kilcunda, Bells Beach Southside, Ben More, etc.). Does NOT list PG4+ sites or Flinders Monument. Mentions that PG4+ sites require PG5 supervision. | PG3 AND ABOVE rule; no false generalisation |
| Q40 | "PG3 here. Can I fly Cairns Bay on Tuesday with a PG5 friend?" | ✅ Yes. Cairns Bay is a PG4-rated site. With a PG5 supervisor, a PG3 can fly (general matrix: PG3 at PG4 site → PG5). Note Tuesday forecast. | STEP 2 general matrix; PG3+PG5→PG4 site |

---

### GROUP M — No rating stated — RATING-FIRST (Q41–Q43)

| # | Query | Expected answer | Key rule |
|---|-------|-----------------|----------|
| Q41 | "Can I fly Eagles Nest?" | Ask for PG rating first before answering. Do not name any sites. (Eagles Nest is closed, but the rating-first rule should still apply or the AI should handle both — ask for rating AND note the site is currently closed.) | RATING-FIRST rule |
| Q42 | "What sites can I fly near the coast this weekend?" | Ask for PG rating first. Do not list any sites. | RATING-FIRST rule |
| Q43 | "Where should I fly on Sunday?" | Ask for PG rating first before recommending any sites. | RATING-FIRST rule |

---

### GROUP N — Third-person and unusual framing (Q44–Q46)

| # | Query | Expected answer | Key rule |
|---|-------|-----------------|----------|
| Q44 | "My wife just got her PG2. Where can she fly with me (Im PG5) on Sunday?" | ✅ Lists PG2 supervised sites where conditions are suitable on Sunday. States PG2 requires supervision at every site — the PG5 pilot qualifies as supervisor on PG2/PG3-rated sites (check matrix: PG2 at PG2 site needs PG4 supervisor; PG5 > PG4, so yes). | PG2 rule; PG5 as supervisor |
| Q45 | "A mate of mine is visiting from interstate, he holds PG4. Can he fly Ben Nevis on Friday?" | ✅ Yes, PG4 can fly Ben Nevis unsupervised. Note Friday forecast conditions. | Third-person; STEP 2 |
| Q46 | "Is Flinders Monument suitable for a beginner looking to progress?" | ❌ No. Flinders Monument requires PG5 (unsupervised) or PG4 (with SO/SSO). It is not suitable for beginners or intermediate pilots. Recommend checking beginner-friendly PG2/PG3 sites. | Site rating context without direct eligibility query |

---

### GROUP O — Spelling and name errors (Q47–Q50)

| # | Query | Expected answer | Key rule |
|---|-------|-----------------|----------|
| Q47 | "Im PG4 can I fly Ben Neavis on Wednesday" | ✅ Yes, Ben Nevis — PG4 unsupervised. Cite Wednesday forecast conditions (actual ECMWF data). Do not confabulate today's forecast. | Spelling: Ben Neavis → Ben Nevis; NOT FLYABLE cite rule |
| Q48 | "Im PG2 can I fly Barwen Heads on Friday" | ✅ Yes, Barwon Heads (13th Beach) — PG2 requires supervision. State supervisor types. Note Friday forecast. | Spelling: Barwen → Barwon |
| Q49 | "Im PG5 can I fly Mt Buffelo Reeds Lookout" | ✅ Yes, Mt Buffalo – Reed's Lookout — PG5 can fly unsupervised. Note it's a valley breeze site. | Spelling: Buffelo → Buffalo |
| Q50 | "Im PG3 can I fly Bels Beach on Sunday" | Bells Beach has two launches — ask which they mean, or address both: Southside (PG2 Supervised — PG3 qualifies, no supervision needed); Winkipop (HG only — not available to PG pilots). Note Sunday conditions for Southside. | Spelling: Bels → Bells; multi-launch clarification |

---

## Key rules cross-reference

| Rule | Questions that exercise it |
|------|---------------------------|
| STEP 1 — Site-specific tiers | Q01–Q11, Q25–Q27, Q31–Q36 |
| STEP 2 — General matrix | Q13, Q14, Q24, Q33, Q40, Q44, Q45 |
| FORBIDDEN OPENING (clear No first) | Q01, Q02, Q03, Q05, Q10 |
| ECHO PILOT'S EXACT RATING | All eligibility questions — verify the answer uses the rating the pilot stated |
| RATING-FIRST (no rating given) | Q16, Q22, Q41, Q42, Q43 |
| PG2 universal supervision rule | Q37, Q38, Q44 |
| PG3 AND ABOVE — no false generalisation | Q39, Q40 |
| HG ONLY absolute | Q28, Q29, Q30 |
| CFI ≥ PG5 | Q08, Q35 |
| NOT FLYABLE cite actual data | Q12, Q13, Q47 |
| [NOT FLYABLE] is weather-only | Q06, Q13, Q15, Q26 |
| SCHEDULED CLOSURES (direct query) | Q17, Q18, Q19, Q20, Q21 |
| Parenthetical name matching | Q17, Q18, Q19 |
| Spelling/fuzzy name matching | Q10, Q14, Q18, Q47, Q48, Q49, Q50 |
| Third-person framing | Q05, Q44, Q45 |
| Multi-launch sites | Q20, Q50 |
