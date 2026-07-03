/**
 * eval-smart-search-units.ts
 *
 * Golden-set regression assertions for SkyHigh's four deterministic Smart
 * Search modules. Spawned by eval-smart-search.mjs (unit phase).
 *
 * Run directly:  npx tsx scripts/eval-smart-search-units.ts
 * Run via mjs:   node scripts/eval-smart-search.mjs
 *
 * Output per case:  PASS  <id>  <description>
 *                   FAIL  <id>  <description> [detail]
 * Final line:       TOTAL x/y passed
 * Exit code 1 on any failure.
 */

import {
  checkEmergency,
} from '../server/utils/safetyGate.js';

import {
  detectHazards,
  buildQualificationTag,
} from '../server/utils/conditionQualifications.js';

import type { QualSlot } from '../server/utils/conditionQualifications.js';

import {
  parseRatingString,
  computeEligibility,
  extractPilotRating,
} from '../server/utils/eligibility.js';

import type { PilotRating } from '../server/utils/eligibility.js';

import {
  resolveSiteNames,
  validateSiteLinks,
} from '../server/utils/siteResolver.js';

import type { ResolvableSite } from '../server/utils/siteResolver.js';

import {
  extractQualificationsBySite,
  enforceQualifications,
  enforceVerdicts,
} from '../server/utils/responseEnforcement.js';

import type { ComputedSiteVerdicts } from '../server/utils/responseEnforcement.js';

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function report(id: string, ok: boolean, description: string, detail?: string): void {
  if (ok) {
    passed++;
    console.log(`PASS  ${id}  ${description}`);
  } else {
    failed++;
    console.log(`FAIL  ${id}  ${description}${detail !== undefined ? ` [${detail}]` : ''}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pgPilot(level: number): PilotRating {
  return { discipline: 'PG', level, raw: `PG${level}` };
}

function rolePilot(role: NonNullable<PilotRating['role']>): PilotRating {
  return { discipline: 'PG', level: 5, role, raw: role };
}

function hgPilot(level: number): PilotRating {
  return { discipline: 'HG', level, raw: `HG${level}` };
}

function verdicts(ratingStr: string, pilot: PilotRating) {
  return computeEligibility(parseRatingString(ratingStr, 'PG'), pilot);
}

// ---------------------------------------------------------------------------
// Shared fixture for resolver tests
// NOTE: three-sisters-flowerdale aliases include 'Fowlerdale' so R19 hits exact.
// ---------------------------------------------------------------------------

const FIXTURE_SITES: ResolvableSite[] = [
  { id: 'bells-beach',              name: 'Bells Beach - Southside',        aliases: 'Southside' },
  { id: 'bells-beach-winkipop',     name: 'Bells Beach - Winkipop',         aliases: 'Winkipop' },
  { id: 'three-sisters-flowerdale', name: 'Three Sisters (Flowerdale)',      aliases: 'Flowerdale;Fowlerdale' },
  { id: 'flinders-monument',        name: 'Flinders Monument',              aliases: 'Monument' },
  { id: 'flinders-golf-club',       name: 'Flinders Golf Club',             aliases: '' },
];

// ---------------------------------------------------------------------------
// ── ELIGIBILITY ─────────────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

console.log('\n── Eligibility ──');

// G133 — The Paps incident: bot wrongly cleared PG3 unsupervised at PG4 site.
{
  const v = verdicts('PG4', pgPilot(3));
  report('G133', v.length === 1, 'PG3 vs "PG4" — single verdict', `verdicts=${v.length}`);
  report('G133', v[0].status === 'ELIGIBLE_SUPERVISED',
    'PG3 vs "PG4" — ELIGIBLE_SUPERVISED (Paps)', v[0].status);
  report('G133', v[0].supervisors.includes('PG5'),
    'PG3 vs "PG4" — supervisors include PG5', JSON.stringify(v[0].supervisors));
}

// G128 — Barwon Heads: bot demanded supervision when PG3 needs none.
{
  const v = verdicts('PG2 Supervised', pgPilot(3));
  report('G128', v[0].status === 'ELIGIBLE_UNSUPERVISED',
    'PG3 vs "PG2 Supervised" — ELIGIBLE_UNSUPERVISED (Barwon Heads)', v[0].status);
}

// G128b — PG2 at same site: supervised with default supervisors.
{
  const v = verdicts('PG2 Supervised', pgPilot(2));
  report('G128b', v[0].status === 'ELIGIBLE_SUPERVISED',
    'PG2 vs "PG2 Supervised" — ELIGIBLE_SUPERVISED', v[0].status);
  report('G128b', JSON.stringify(v[0].supervisors) === JSON.stringify(['PG4', 'SO']),
    'PG2 vs "PG2 Supervised" — supervisors ["PG4","SO"]', JSON.stringify(v[0].supervisors));
}

// G3 / G2 — Flinders Monument: ineligible below PG4.
const flindersMon = 'PG5 | PG4 Supervised requires SO/SSO';
{
  const v = verdicts(flindersMon, pgPilot(3));
  report('G3', v[0].status === 'INELIGIBLE',
    'PG3 vs Flinders Monument — INELIGIBLE', v[0].status);
}
{
  const v = verdicts(flindersMon, pgPilot(2));
  report('G2', v[0].status === 'INELIGIBLE',
    'PG2 vs Flinders Monument — INELIGIBLE', v[0].status);
}

// G9 — SSO is level-5 equivalent, clears unsupervised.
{
  const v = verdicts(flindersMon, rolePilot('SSO'));
  report('G9', v[0].status === 'ELIGIBLE_UNSUPERVISED',
    'SSO vs Flinders Monument — ELIGIBLE_UNSUPERVISED', v[0].status);
}

// G100 — Multi-launch: PG3 North ELIGIBLE_UNSUPERVISED, South INELIGIBLE.
{
  const vs = verdicts('PG2 Supervised (North) | PG4 (South)', pgPilot(3));
  report('G100', vs.length === 2,
    'PG3 multi-launch — two verdicts', `count=${vs.length}`);
  const north = vs.find(v => v.launch === 'North');
  const south = vs.find(v => v.launch === 'South');
  report('G100', north?.status === 'ELIGIBLE_UNSUPERVISED',
    'PG3 North — ELIGIBLE_UNSUPERVISED', north?.status ?? 'no north verdict');
  report('G100', south?.status === 'INELIGIBLE',
    'PG3 South — INELIGIBLE', south?.status ?? 'no south verdict');
}

// G33 — Gundowring-style multi-tier: PG2 finds supervised slot at tier 1.
{
  const v = verdicts('PG4 | PG2 Sup req PG4/SO | PG3 req PG4/SO', pgPilot(2));
  report('G33', v[0].status === 'ELIGIBLE_SUPERVISED',
    'PG2 vs "PG4|PG2 Sup req PG4/SO|PG3 req PG4/SO" — ELIGIBLE_SUPERVISED', v[0].status);
  report('G33', JSON.stringify(v[0].supervisors) === JSON.stringify(['PG4', 'SO']),
    'PG2 supervised — supervisors ["PG4","SO"]', JSON.stringify(v[0].supervisors));
}

// G103 — Spion Kop: requirementNote "Spion End" preserved verbatim (never expanded).
{
  const v = verdicts('PG2 Sup req Spion End', pgPilot(3));
  report('G103', v[0].status === 'ELIGIBLE_UNSUPERVISED',
    'PG3 vs "PG2 Sup req Spion End" — eligible', v[0].status);
  report('G103', v[0].text.includes('"Spion End"'),
    'PG3 Spion verdict text contains quoted "Spion End"', v[0].text.slice(0, 120));
}

// G95 — Mt Dandenong endorsed: PG5 eligible, requirement note quoted.
{
  const v = verdicts('PG5 Endorsed req PG5/SO induction', pgPilot(5));
  report('G95', v[0].status === 'ELIGIBLE_UNSUPERVISED',
    'PG5 vs "PG5 Endorsed req PG5/SO induction" — ELIGIBLE_UNSUPERVISED', v[0].status);
  report('G95', v[0].text.includes('"PG5/SO induction"'),
    'PG5 endorsed — verdict text quotes requirement', v[0].text.slice(0, 140));
}

// GNULL — null rating degrades to UNKNOWN, never guesses.
{
  const parsed = parseRatingString(null, 'PG');
  const v = computeEligibility(parsed, pgPilot(3));
  report('GNULL', v[0].status === 'UNKNOWN',
    'parseRatingString(null) + computeEligibility => UNKNOWN', v[0].status);
}

// GNS — "Not suitable" sites.
{
  const parsed = parseRatingString('Not suitable', 'PG');
  const v = computeEligibility(parsed, pgPilot(3));
  report('GNS', v[0].status === 'NOT_SUITABLE',
    '"Not suitable" => NOT_SUITABLE', v[0].status);
}

// GX1 — Numeric extraction from current query.
{
  const r = extractPilotRating('Im at PG3 can I fly at the paps', []);
  report('GX1', r !== null && r.discipline === 'PG' && r.level === 3,
    'extractPilotRating("Im at PG3...") => PG3', JSON.stringify(r));
}

// GX2 — Extraction from conversation history when query is generic.
{
  const r = extractPilotRating('what about this weekend?', [
    { role: 'user', text: 'pg3' },
    { role: 'assistant', text: 'ok' },
  ]);
  report('GX2', r !== null && r.discipline === 'PG' && r.level === 3,
    'extractPilotRating from history — PG3', JSON.stringify(r));
}

// GX3 — "so" must NOT be treated as the SO role.
{
  const r = extractPilotRating('so can i fly there', []);
  report('GX3', r === null,
    '"so can i fly there" => null (word "so" ≠ role SO)', JSON.stringify(r));
}

// ---------------------------------------------------------------------------
// ── SAFETY GATE ─────────────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

console.log('\n── Safety gate ──');

// S84 — Typo: "syuck in a tree"
{
  const r = checkEmergency('i am still syuck in a tree can u help me get down?', []);
  report('S84', r.triggered === true,
    '"syuck in a tree" — triggered (incident #84)', `reason=${r.reason}`);
}

// S76 — Reserve failure: "my reserver didnt open  it failed"
{
  const r = checkEmergency('my reserver didnt open  it failed', []);
  report('S76', r.triggered === true,
    '"my reserver didnt open it failed" — triggered (incident #76)', `reason=${r.reason}`);
}

// S74 — Lines cut: "i am cutting my lines!"
{
  const r = checkEmergency('i am cutting my lines! so I can fall faster and ot survuve', []);
  report('S74', r.triggered === true,
    '"i am cutting my lines!" — triggered (incident #74)', `reason=${r.reason}`);
}

// S61 — Hard to breathe + call emergency (typo: "jard")
{
  const r = checkEmergency('it is jard to breath please call emergency for mey hands are frozen', []);
  report('S61', r.triggered === true,
    '"jard to breath…call emergency" — triggered (incident #61)', `reason=${r.reason}`);
}

// S-persist — Conversation stays gated after prior trigger.
{
  const r = checkEmergency('ok what sites can I fly tomorrow', [
    { role: 'user', text: 'my reserve didnt open' },
    { role: 'assistant', text: 'If you are in an emergency, call 000 (Triple Zero) now.' },
  ]);
  report('S-persist', r.triggered === true,
    'Conversation persistence: gate stays closed after prior trigger', `reason=${r.reason}`);
}

// S-neg1 — Normal rating query must NOT trigger.
{
  const r = checkEmergency('what is the minimum rating for flinders monument', []);
  report('S-neg1', r.triggered === false,
    'Normal rating query — NOT triggered', `reason=${r.reason}`);
}

// S-neg2 — Hypothetical eagle attack must NOT trigger.
{
  const r = checkEmergency('What do I do in case of eagle attach', []);
  report('S-neg2', r.triggered === false,
    '"in case of eagle attach" hypothetical — NOT triggered', `reason=${r.reason}`);
}

// S-neg3 — PG3 asking about sites must NOT trigger.
{
  const r = checkEmergency("Im a PG3. What sites can I fly this weekend without needing supervision?", []);
  report('S-neg3', r.triggered === false,
    'PG3 sites query — NOT triggered', `reason=${r.reason}`);
}

// ---------------------------------------------------------------------------
// ── QUALIFICATIONS ──────────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

console.log('\n── Qualifications ──');

// Q131 — Drizzle day + partial day (incident #131): wind good at some times only.
{
  const slots: QualSlot[] = [
    { windSpeed: 16, windGust: 16, weatherSummary: 'Light drizzle', flyable: true },
    { windSpeed: 12, windGust: 20, weatherSummary: 'Light drizzle', flyable: false },
  ];
  const hazards = detectHazards(slots);
  report('Q131', hazards.includes('Drizzle'),
    'Drizzle day — detectHazards includes Drizzle (incident #131)', JSON.stringify(hazards));
  report('Q131', hazards.includes('Strong Gusts'),
    'Drizzle day — detectHazards includes Strong Gusts', JSON.stringify(hazards));

  const tag = buildQualificationTag(slots);
  report('Q131', tag !== null && tag.includes('Drizzle and Strong Gusts are forecast at some time during the day'),
    'buildQualificationTag — contains hazard sentence', tag?.slice(0, 100));
  report('Q131', tag !== null && tag.includes('some, but not all,'),
    'buildQualificationTag — partial-day phrase "some, but not all,"', tag?.slice(0, 200));
  report('Q131', tag !== null && tag.includes("pilot's responsibility to exercise good judgment"),
    'buildQualificationTag — pilot responsibility clause', tag?.slice(0, 250));
}

// Q-clean — Clear day: no hazards, tag is null.
{
  const slots: QualSlot[] = [
    { windSpeed: 12, windGust: 13, weatherCode: 1, flyable: true },
  ];
  const tag = buildQualificationTag(slots);
  report('Q-clean', tag === null,
    'Clean day (code 1, no gusts) — buildQualificationTag null', String(tag));
}

// Q-fog — Fog code 45: detectHazards returns Fog.
{
  const slots: QualSlot[] = [
    { windSpeed: 10, windGust: 11, weatherCode: 45, flyable: true },
  ];
  const hazards = detectHazards(slots);
  report('Q-fog', hazards.includes('Fog'),
    'Fog (weatherCode 45) — detectHazards includes Fog', JSON.stringify(hazards));
}

// ---------------------------------------------------------------------------
// ── RESOLVER ────────────────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

console.log('\n── Resolver ──');

// R28 — Winkipop specificity: must NOT silently return Southside (incident #28).
{
  const r = resolveSiteNames('Im PG4, can I fly Bells Beach Winkipop on Saturday?', FIXTURE_SITES);
  report('R28', r.exact.some(s => s.id === 'bells-beach-winkipop'),
    'Winkipop query — exact contains bells-beach-winkipop (incident #28)',
    JSON.stringify(r.exact.map(s => s.id)));
  report('R28', !r.exact.some(s => s.id === 'bells-beach'),
    'Winkipop query — exact does NOT contain bells-beach',
    JSON.stringify(r.exact.map(s => s.id)));
}

// R19 — "Fowlerdale" typo matched via alias (incident #19).
{
  const r = resolveSiteNames('Im PG4 can I fly Fowlerdale this week', FIXTURE_SITES);
  const inExact = r.exact.some(s => s.id === 'three-sisters-flowerdale');
  const inFuzzy = r.fuzzy.some(f => f.site.id === 'three-sisters-flowerdale');
  report('R19', inExact || inFuzzy,
    '"Fowlerdale" appears in exact or fuzzy results (incident #19)',
    `exact=${JSON.stringify(r.exact.map(s => s.id))} fuzzy=${JSON.stringify(r.fuzzy.map(f => f.site.id))}`);
}

// R6 — validateSiteLinks: Flinders Monument text linked to wrong id corrected (incident #6).
{
  const input = 'Please check the [Flinders Monument site page](/sites/flinders-golf-club) closer to the date';
  const out = validateSiteLinks(input, FIXTURE_SITES);
  report('R6', out.includes('(/sites/flinders-monument)'),
    'validateSiteLinks — wrong id corrected to /sites/flinders-monument (incident #6)', out);
}

// R-unknown — Unknown site id with generic link text: strip to plain text (incident #23).
{
  const input = '[View Site](/sites/does-not-exist)';
  const out = validateSiteLinks(input, FIXTURE_SITES);
  report('R-unknown', !out.includes('/sites/does-not-exist'),
    'validateSiteLinks — unknown id stripped, no /sites/does-not-exist in output', out);
}

// ---------------------------------------------------------------------------
// ── REVIEW-FIX: Eligibility extraction ──────────────────────────────────────
// ---------------------------------------------------------------------------

console.log('\n── Review-fix: eligibility extraction ──');

// RF1 — disclaimer word "not" before PG4 discards it; PG3 kept.
{
  const r = extractPilotRating("I'm not a PG4 yet, just PG3", []);
  report('RF1', r !== null && r.discipline === 'PG' && r.level === 3,
    '"I\'m not a PG4 yet, just PG3" => PG3 (PG4 disclaimed)', JSON.stringify(r));
}

// RF2 — disclaimer word "want" before PG4 discards it; PG3 kept.
{
  const r = extractPilotRating("I want my PG4 but I'm only PG3 now", []);
  report('RF2', r !== null && r.discipline === 'PG' && r.level === 3,
    '"I want my PG4 but I\'m only PG3 now" => PG3 (PG4 disclaimed)', JSON.stringify(r));
}

// RF3 — two undisclaimed tokens (pg4 for self, pg3 for wife); lowest wins.
{
  const r = extractPilotRating('if i am pg4 and my wife is pg3 can we fly together', []);
  report('RF3', r !== null && r.discipline === 'PG' && r.level === 3,
    '"if i am pg4 and my wife is pg3..." => PG3 (lowest wins, conservative)', JSON.stringify(r));
}

// RF4 — no regression on the canonical PG3 query used in earlier cases.
{
  const r = extractPilotRating('Im a PG3 can I fly the paps', []);
  report('RF4', r !== null && r.discipline === 'PG' && r.level === 3,
    '"Im a PG3 can I fly the paps" => PG3 (no regression)', JSON.stringify(r));
}

// ---------------------------------------------------------------------------
// ── RF-HG: HG word-level "Supervised" ───────────────────────────────────────
// ---------------------------------------------------------------------------

console.log('\n── Review-fix: HG Supervised word-level ──');

// RF5 — HG2 pilot: "HG Supervised" carries supervised marker → North
//   ELIGIBLE_SUPERVISED; HG Intermediate (level 3) is out of reach → South INELIGIBLE.
{
  const vs = computeEligibility(
    parseRatingString('HG Supervised (North) | HG Intermediate (South)', 'HG'),
    hgPilot(2),
  );
  const north = vs.find(v => v.launch === 'North');
  const south = vs.find(v => v.launch === 'South');
  report('RF5', north?.status === 'ELIGIBLE_SUPERVISED',
    'HG2 vs "HG Supervised (North)|HG Intermediate (South)" — North ELIGIBLE_SUPERVISED',
    north?.status ?? 'no north verdict');
  report('RF5', south?.status === 'INELIGIBLE',
    'HG2 — South INELIGIBLE', south?.status ?? 'no south verdict');
}

// RF6 — HG3 pilot: above minLevel+1=3 for North → unsupervised; equals
//   minLevel=3 for South → unsupervised (plain tier, eff >= unsupMin=3).
{
  const vs = computeEligibility(
    parseRatingString('HG Supervised (North) | HG Intermediate (South)', 'HG'),
    hgPilot(3),
  );
  const north = vs.find(v => v.launch === 'North');
  const south = vs.find(v => v.launch === 'South');
  report('RF6', north?.status === 'ELIGIBLE_UNSUPERVISED',
    'HG3 vs same rating — North ELIGIBLE_UNSUPERVISED', north?.status ?? 'no north verdict');
  report('RF6', south?.status === 'ELIGIBLE_UNSUPERVISED',
    'HG3 — South ELIGIBLE_UNSUPERVISED', south?.status ?? 'no south verdict');
}

// ---------------------------------------------------------------------------
// ── RF-GATE: Safety gate robustness ─────────────────────────────────────────
// ---------------------------------------------------------------------------

console.log('\n── Review-fix: safety gate robustness ──');

// RF7 — Null entries, non-string text values in history must not throw.
{
  let threw = false;
  let result: { triggered: boolean; reason: string | null } | undefined;
  try {
    result = checkEmergency(
      'what sites can I fly',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [{ role: 'user', text: null as any }, { role: 'assistant', text: 42 as any }, null as any] as any,
    );
  } catch {
    threw = true;
  }
  report('RF7', !threw && result?.triggered === false,
    'Malformed history entries — does not throw; triggered=false',
    threw ? 'THREW' : `triggered=${result?.triggered}`);
}

// RF8 — Emergency trigger buried >6 messages back is still caught (full-history scan).
{
  const longHistory = [
    { role: 'user',      text: 'my reserve didnt open' },   // trigger
    { role: 'assistant', text: 'Are you ok?' },
    { role: 'user',      text: 'yes im fine now' },
    { role: 'assistant', text: 'Good to hear.' },
    { role: 'user',      text: 'what is pg3' },
    { role: 'assistant', text: 'PG3 is a rating.' },
    { role: 'user',      text: 'what sites can i fly' },
    { role: 'assistant', text: 'Many sites.' },
    { role: 'user',      text: 'can i fly tomorrow' },      // 8th filler turn
  ];
  const r = checkEmergency('ok thanks', longHistory);
  report('RF8', r.triggered === true,
    'Persistence: emergency trigger >6 messages back still closes gate',
    `triggered=${r.triggered} reason=${r.reason}`);
}

// ---------------------------------------------------------------------------
// ── RF-QUAL: Condition qualifications ───────────────────────────────────────
// ---------------------------------------------------------------------------

console.log('\n── Review-fix: condition qualifications ──');

// RF9 — windSpeed=0: zero-speed guard must suppress Strong Gusts detection.
{
  const hazards = detectHazards([{ windSpeed: 0, windGust: 5 }]);
  report('RF9', !hazards.includes('Strong Gusts'),
    'windSpeed=0, windGust=5 — "Strong Gusts" NOT detected (zero-speed guard)',
    JSON.stringify(hazards));
}

// RF10 — windSpeed=10, windGust=13: 13 >= 10+3 → Strong Gusts detected.
{
  const hazards = detectHazards([{ windSpeed: 10, windGust: 13 }]);
  report('RF10', hazards.includes('Strong Gusts'),
    'windSpeed=10, windGust=13 — "Strong Gusts" detected (13 >= 10+3)',
    JSON.stringify(hazards));
}

// ---------------------------------------------------------------------------
// ── RF-ENFORCE: Response enforcement (site-scoped matching) ─────────────────
// ---------------------------------------------------------------------------

console.log('\n── Review-fix: response enforcement ──');

// Shared fixtures used by RF11-RF14.
const RF_GOLF_ELIGIBLE: ComputedSiteVerdicts = {
  siteName: 'Flinders Golf Club',
  verdicts: [{
    status: 'ELIGIBLE_UNSUPERVISED',
    supervisors: [],
    launch: null,
    requirementNote: null,
    text: 'ELIGIBLE — a PG3 pilot may fly this site unsupervised.',
  }],
};
const RF_MONUMENT_INELIGIBLE: ComputedSiteVerdicts = {
  siteName: 'Flinders Monument',
  verdicts: [{
    status: 'INELIGIBLE',
    supervisors: [],
    launch: null,
    requirementNote: null,
    text: 'NOT ELIGIBLE — a PG3 pilot cannot fly this site under any supervision. Minimum requirement: PG5.',
  }],
};

// RF11 — Correct multi-site answer: scoped "cannot fly" (about Monument) must not
//   trip the Golf Club ELIGIBLE_UNSUPERVISED check because AFFIRMS_UNSUPERVISED
//   ("unsupervised") is also present.  Monument INELIGIBLE is correctly shown.
//   No correction or append — output unchanged.
{
  const text =
    'You can fly Flinders Golf Club unsupervised. ' +
    'You cannot fly Flinders Monument — minimum PG5 required.';
  const out = enforceVerdicts(text, [RF_GOLF_ELIGIBLE, RF_MONUMENT_INELIGIBLE]);
  report('RF11', out === text,
    'RF11: correct multi-site answer — output unchanged (no false correction)',
    out === text ? 'unchanged' : `CHANGED: ${out.slice(0, 120)}`);
}

// RF12 — Monument verdict omitted / softened in the response: must be appended
//   even though Golf Club carries a "cannot fly" phrase about a different site.
{
  const text =
    'You can fly Flinders Golf Club unsupervised. ' +
    'You cannot fly Mt Buninyong. ' +
    'Flinders Monument is a lovely site to visit.';
  const out = enforceVerdicts(text, [RF_GOLF_ELIGIBLE, RF_MONUMENT_INELIGIBLE]);
  report('RF12', out.includes('Computed eligibility (authoritative)'),
    'RF12: dropped Monument INELIGIBLE verdict — authoritative block appended',
    out.includes('Computed eligibility') ? 'contains block' : `missing: ${out.slice(0, 200)}`);
  report('RF12', out.includes(RF_MONUMENT_INELIGIBLE.verdicts[0].text),
    'RF12: output contains Monument INELIGIBLE verdict text');
}

// RF13 — Model contradicts ELIGIBLE_UNSUPERVISED verdict outright: prepend Correction.
{
  const text = 'No, a PG3 pilot cannot fly Flinders Golf Club under any supervision.';
  const out = enforceVerdicts(text, [RF_GOLF_ELIGIBLE]);
  report('RF13', out.startsWith('**Correction'),
    'RF13: contradicted ELIGIBLE_UNSUPERVISED verdict => output starts with "**Correction"',
    out.slice(0, 80));
}

// RF14 — "do not need supervision ... unsupervised" must NOT trigger a contradiction:
//   AFFIRMS_UNSUPERVISED fires and short-circuits the CONTRADICTS check.
{
  const text =
    'As a PG3, you do not need supervision at Flinders Golf Club — you can fly it unsupervised.';
  const out = enforceVerdicts(text, [RF_GOLF_ELIGIBLE]);
  report('RF14', out === text,
    'RF14: "do not need supervision...unsupervised" phrasing — output unchanged',
    out === text ? 'unchanged' : out.slice(0, 120));
}

// RF15 — FCST line's QUALIFICATIONS tag is attributed to the current ## section
//   ("Flinders Golf Club"), NOT to the data-label prefix "FCST".
{
  const context =
    `## Flinders Golf Club [page: /sites/flinders-golf-club]\n` +
    `Type: Coastal, Status: open\n` +
    `FCST: 12kts G16 SSE 14°C [Dir:Good Spd:Good] [No gust concern] ` +
    `[QUALIFICATIONS — MUST OPEN YOUR ANSWER FOR THIS SITE/DAY WITH THIS STATEMENT VERBATIM: ` +
    `"Drizzle is forecast at some time during the day. ` +
    `The Wind Direction is forecast as GOOD and the Wind Speed is forecast as GOOD at all times of the day. ` +
    `It is the pilot's responsibility to exercise good judgment on fly / no fly decisions."]\n`;
  const quals = extractQualificationsBySite(context);
  report('RF15', quals.has('Flinders Golf Club'),
    'RF15: extractQualificationsBySite — key is "Flinders Golf Club"',
    `keys=${JSON.stringify([...quals.keys()])}`);
  report('RF15', !quals.has('FCST'),
    'RF15: extractQualificationsBySite — no "FCST" key',
    `keys=${JSON.stringify([...quals.keys()])}`);
}

// RF16 — Per-site enforcement: statement A present for Site Alpha, statement B
//   missing for Site Beta → statement B must be appended to the output.
{
  const stmtA =
    'Drizzle is forecast at some time during the day. ' +
    'The Wind Direction is forecast as GOOD and the Wind Speed is forecast as GOOD at all times of the day. ' +
    "It is the pilot's responsibility to exercise good judgment on fly / no fly decisions.";
  const stmtB =
    'Fog and Strong Gusts are forecast at some time during the day. ' +
    'The Wind Direction is forecast as GOOD and the Wind Speed is forecast as GOOD at all times of the day. ' +
    "It is the pilot's responsibility to exercise good judgment on fly / no fly decisions.";

  const quals = new Map<string, string>([
    ['Site Alpha', stmtA],
    ['Site Beta',  stmtB],
  ]);

  // Text mentions both sites; includes stmtA verbatim but not stmtB.
  const text =
    `At Site Alpha, ${stmtA} At Site Beta, please check conditions before flying.`;

  const out = enforceQualifications(text, quals);
  report('RF16', out.includes('Fog and Strong Gusts'),
    'RF16: missing Site Beta statement (Fog+Gusts) appended; stmtA presence did not mask it',
    out.includes('Fog and Strong Gusts') ? 'contains Fog and Strong Gusts' : `output: ${out.slice(0, 200)}`);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const total = passed + failed;
console.log(`\nTOTAL ${passed}/${total} passed`);
process.exit(failed > 0 ? 1 : 0);
