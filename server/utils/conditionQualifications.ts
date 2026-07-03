/**
 * conditionQualifications.ts
 *
 * Deterministically computes weather hazards from per-day forecast slots and
 * composes the club's standardised qualification statement for the AI assistant
 * to lead its site/day response with when non-wind hazards are present.
 *
 * Design notes:
 *  - WMO weather codes drive primary detection.
 *  - Case-insensitive summary-text matching supplements (and is the sole source
 *    for today's slots that arrive with weatherCode === 0).
 *  - Strong-gust detection is purely wind-numeric (gust >= speed + 3 kt).
 *  - No external dependencies; pure synchronous functions only.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Minimal per-slot shape required for hazard detection.
 * Matches the extended-forecast slot as delivered to the AI assistant.
 */
export interface QualSlot {
  windSpeed: number;
  windGust: number;
  /** WMO weather code (0-99). May be 0 when sourced from today's table. */
  weatherCode?: number;
  /** Human-readable summary, e.g. "Light drizzle". Used as text-fallback. */
  weatherSummary?: string;
  /**
   * Pre-computed: true if this slot's wind direction AND speed are within site
   * limits; false if not; undefined if unknown.
   */
  flyable?: boolean;
}

/**
 * All supported hazard categories, in canonical severity order.
 * This ordering is enforced by `detectHazards`.
 */
export type Hazard =
  | 'Thunderstorms'
  | 'Heavy Rain'
  | 'Rain'
  | 'Rain Showers'
  | 'Snow'
  | 'Hail'
  | 'Drizzle'
  | 'Fog'
  | 'Mist'
  | 'Strong Gusts';

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

/** Canonical severity order — defines output ordering from detectHazards. */
const HAZARD_ORDER: Hazard[] = [
  'Thunderstorms',
  'Heavy Rain',
  'Rain',
  'Rain Showers',
  'Snow',
  'Hail',
  'Drizzle',
  'Fog',
  'Mist',
  'Strong Gusts',
];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Map a WMO weather code to the hazards it implies.
 * Returns an empty set for codes that are clear/benign (0-3, etc.).
 */
function hazardsFromCode(code: number): Set<Hazard> {
  const h = new Set<Hazard>();

  // Thunderstorm family (95-99)
  if (code >= 95 && code <= 99) {
    h.add('Thunderstorms');
    // 96 = thunderstorm with slight hail, 99 = with heavy hail
    if (code === 96 || code === 99) h.add('Hail');
  }

  // Heavy rain: 65 (heavy rain) and 82 (violent rain showers)
  if (code === 65 || code === 82) h.add('Heavy Rain');

  // Rain: 61 (slight) and 63 (moderate)
  if (code === 61 || code === 63) h.add('Rain');

  // Rain showers: 80 (slight) and 81 (moderate)
  if (code === 80 || code === 81) h.add('Rain Showers');

  // Snow family: 71-77 (snow fall/grains/crystals) and 85/86 (snow showers)
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) h.add('Snow');

  // Drizzle: 51/53/55 (light/moderate/dense) and 56/57 (freezing)
  if (code === 51 || code === 53 || code === 55 || code === 56 || code === 57) {
    h.add('Drizzle');
  }

  // Fog: 45 and 48 (depositing rime fog)
  if (code === 45 || code === 48) h.add('Fog');

  return h;
}

/**
 * Map a weatherSummary text string to hazards (case-insensitive substring match).
 * `alreadyInSlot` is the set already found for this slot (from code detection)
 * so that "rain" inside "heavy rain" does not also trigger the plain Rain hazard.
 */
function hazardsFromText(summary: string, alreadyInSlot: Set<Hazard>): Set<Hazard> {
  const h = new Set<Hazard>();
  const s = summary.toLowerCase();

  if (s.includes('thunder')) h.add('Thunderstorms');

  // "heavy rain" / "violent" → Heavy Rain (more specific than plain Rain)
  if (s.includes('heavy rain') || s.includes('violent')) h.add('Heavy Rain');

  // "shower" → Rain Showers
  if (s.includes('shower')) h.add('Rain Showers');

  // "rain" → Rain, but ONLY when Heavy Rain and Rain Showers are not already
  // present in this slot — prevents "heavy rain" from double-triggering Rain.
  const slotHasHeavyOrShowers =
    alreadyInSlot.has('Heavy Rain') ||
    alreadyInSlot.has('Rain Showers') ||
    h.has('Heavy Rain') ||
    h.has('Rain Showers');
  if (s.includes('rain') && !slotHasHeavyOrShowers) h.add('Rain');

  if (s.includes('snow')) h.add('Snow');
  if (s.includes('hail')) h.add('Hail');
  if (s.includes('drizzle')) h.add('Drizzle');
  // "rime" catches "Depositing rime fog" even if "fog" keyword is absent
  if (s.includes('fog') || s.includes('rime')) h.add('Fog');
  if (s.includes('mist')) h.add('Mist');

  return h;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Scan every slot and return deduplicated hazards in canonical severity order.
 *
 * Detection strategy per slot:
 *   1. WMO code → hazards
 *   2. weatherSummary text → additional hazards (fallback for code-0 slots)
 *   3. windGust >= windSpeed + 3 → Strong Gusts
 *
 * Returns [] when no hazards are detected.
 */
export function detectHazards(slots: QualSlot[]): Hazard[] {
  const found = new Set<Hazard>();

  for (const slot of slots) {
    // Code-based detection (code 0 yields empty set, so text fallback runs freely)
    const fromCode = hazardsFromCode(slot.weatherCode ?? 0);
    for (const h of fromCode) found.add(h);

    // Text-based detection — supplements code; sole source when code is 0
    if (slot.weatherSummary) {
      const fromText = hazardsFromText(slot.weatherSummary, fromCode);
      for (const h of fromText) found.add(h);
    }

    // Strong gusts: club rule — gust 3 kt or more above average wind.
    // Requires a real mean speed: slots with missing/zero windSpeed would
    // otherwise flag any small gust as "Strong Gusts".
    if (slot.windSpeed > 0 && slot.windGust >= slot.windSpeed + 3) {
      found.add('Strong Gusts');
    }
  }

  return HAZARD_ORDER.filter(h => found.has(h));
}

/**
 * Compose the club's standard qualification statement.
 *
 * Returns null when `hazards` is empty.
 *
 * @param hazards  Output of detectHazards — must already be in canonical order.
 * @param opts.partialDay  true when the day has both flyable AND non-flyable slots.
 */
export function composeQualification(
  hazards: Hazard[],
  opts: { partialDay: boolean }
): string | null {
  if (hazards.length === 0) return null;

  // Grammatical list:  "X is" | "X and Y are" | "X, Y and Z are"
  let hazardList: string;
  let verb: string;

  if (hazards.length === 1) {
    hazardList = hazards[0];
    verb = 'is';
  } else if (hazards.length === 2) {
    hazardList = `${hazards[0]} and ${hazards[1]}`;
    verb = 'are';
  } else {
    const allButLast = hazards.slice(0, -1).join(', ');
    const last = hazards[hazards.length - 1];
    hazardList = `${allButLast} and ${last}`;
    verb = 'are';
  }

  const timePhrase = opts.partialDay ? 'some, but not all,' : 'all';

  return (
    `${hazardList} ${verb} forecast at some time during the day. ` +
    `The Wind Direction is forecast as GOOD and the Wind Speed is forecast as GOOD at ${timePhrase} times of the day. ` +
    `It is the pilot's responsibility to exercise good judgment on fly / no fly decisions.`
  );
}

/**
 * Convenience wrapper: detect hazards, determine partial-day status, and
 * return the full bracketed qualification tag that the AI must open its
 * site/day answer with — or null if conditions are hazard-free.
 *
 * partialDay is true iff at least one slot is flyable===true AND at least one
 * is flyable===false (i.e. good wind windows exist but not all day).
 */
export function buildQualificationTag(slots: QualSlot[]): string | null {
  const hazards = detectHazards(slots);
  if (hazards.length === 0) return null;

  const hasFlyable = slots.some(s => s.flyable === true);
  const hasNotFlyable = slots.some(s => s.flyable === false);
  const partialDay = hasFlyable && hasNotFlyable;

  const statement = composeQualification(hazards, { partialDay });
  if (!statement) return null;

  // Em-dash — intentional (U+2014), matches the required tag format exactly.
  return `[QUALIFICATIONS — MUST OPEN YOUR ANSWER FOR THIS SITE/DAY WITH THIS STATEMENT VERBATIM: "${statement}"]`;
}

// ---------------------------------------------------------------------------
// Self-test  (run with:  $env:QUAL_SELFTEST='1'; npx tsx server/utils/conditionQualifications.ts)
// ---------------------------------------------------------------------------

if (process.env.QUAL_SELFTEST === '1') {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, label: string): void {
    if (condition) {
      console.log(`  PASS  ${label}`);
      passed++;
    } else {
      console.error(`  FAIL  ${label}`);
      failed++;
    }
  }

  function deepEq<T>(a: T, b: T): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  console.log('\n=== conditionQualifications self-test ===\n');

  // ── 1. Drizzle-only day (WMO code 55) ────────────────────────────────────
  {
    const slots: QualSlot[] = [
      { windSpeed: 8, windGust: 10, weatherCode: 55 },
      { windSpeed: 9, windGust: 11, weatherCode: 55 },
    ];
    const h = detectHazards(slots);
    assert(deepEq(h, ['Drizzle']), '1a. drizzle-only (code 55) → [Drizzle]');
    assert(
      composeQualification(h, { partialDay: false }) !== null,
      '1b. composeQualification is non-null for drizzle day'
    );
  }

  // ── 2. Drizzle + strong gusts (12 kt wind, 16 kt gust → 16 >= 12+3) ─────
  {
    const slots: QualSlot[] = [
      { windSpeed: 12, windGust: 16, weatherCode: 51, flyable: true },
      { windSpeed: 12, windGust: 16, weatherCode: 51, flyable: false },
    ];
    const h = detectHazards(slots);
    assert(deepEq(h, ['Drizzle', 'Strong Gusts']), '2a. drizzle+gusts → [Drizzle, Strong Gusts]');

    const sentence = composeQualification(h, { partialDay: true })!;
    const expected =
      "Drizzle and Strong Gusts are forecast at some time during the day. " +
      "The Wind Direction is forecast as GOOD and the Wind Speed is forecast as GOOD at some, but not all, times of the day. " +
      "It is the pilot's responsibility to exercise good judgment on fly / no fly decisions.";
    assert(sentence === expected, '2b. drizzle+gusts partial-day sentence exact match');
    console.log('\n  Drizzle+strong-gusts partial-day sentence:\n  ' + sentence + '\n');
  }

  // ── 3. Clean day (code 0, benign summary) ────────────────────────────────
  {
    const slots: QualSlot[] = [
      { windSpeed: 10, windGust: 12, weatherCode: 0, weatherSummary: 'Clear sky' },
    ];
    const h = detectHazards(slots);
    assert(deepEq(h, []), '3a. clean day → []');
    assert(composeQualification(h, { partialDay: false }) === null, '3b. compose returns null for clean day');
  }

  // ── 4. Text-only detection (code 0, summary "Light drizzle") ─────────────
  {
    const slots: QualSlot[] = [
      { windSpeed: 8, windGust: 9, weatherCode: 0, weatherSummary: 'Light drizzle' },
    ];
    const h = detectHazards(slots);
    assert(deepEq(h, ['Drizzle']), '4. text-only "Light drizzle" (code 0) → [Drizzle]');
  }

  // ── 5. Fog code 45 ────────────────────────────────────────────────────────
  {
    const slots: QualSlot[] = [{ windSpeed: 5, windGust: 6, weatherCode: 45 }];
    const h = detectHazards(slots);
    assert(deepEq(h, ['Fog']), '5. fog code 45 → [Fog]');
  }

  // ── 6. Thunderstorm code 95 (gusts intentionally low to isolate code detection) ──
  {
    const slots: QualSlot[] = [{ windSpeed: 15, windGust: 17, weatherCode: 95 }];
    const h = detectHazards(slots);
    assert(deepEq(h, ['Thunderstorms']), '6. thunderstorm code 95 → [Thunderstorms]');
  }

  // ── 7. Partial-day phrasing via buildQualificationTag ────────────────────
  {
    const slots: QualSlot[] = [
      { windSpeed: 8, windGust: 9, weatherCode: 51, flyable: true },
      { windSpeed: 20, windGust: 22, weatherCode: 51, flyable: false },
    ];
    const tag = buildQualificationTag(slots);
    assert(
      tag !== null && tag.includes('some, but not all,'),
      '7. partial-day tag includes "some, but not all,"'
    );
  }

  // ── 8. Three-hazard list grammar ─────────────────────────────────────────
  {
    const hazards: Hazard[] = ['Rain', 'Fog', 'Strong Gusts'];
    const sentence = composeQualification(hazards, { partialDay: false });
    assert(
      sentence !== null && sentence.startsWith('Rain, Fog and Strong Gusts are'),
      '8. 3-hazard grammar → "Rain, Fog and Strong Gusts are"'
    );
  }

  // ── 9. buildQualificationTag returns null for clean day ──────────────────
  {
    const slots: QualSlot[] = [
      { windSpeed: 10, windGust: 11, weatherCode: 1, weatherSummary: 'Mainly clear' },
    ];
    assert(buildQualificationTag(slots) === null, '9. buildQualificationTag null for clean day');
  }

  // ── 10. buildQualificationTag output contains em-dash ────────────────────
  {
    const slots: QualSlot[] = [
      { windSpeed: 10, windGust: 15, weatherCode: 63, flyable: false },
    ];
    const tag = buildQualificationTag(slots);
    assert(tag !== null && tag.includes('—'), '10. buildQualificationTag contains em-dash (U+2014)');
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}
