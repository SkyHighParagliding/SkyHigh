/**
 * @file safetyGate.ts
 * Pre-LLM circuit-breaker for the SkyHigh AI search assistant.
 *
 * If a query — or any prior turn in the same conversation — indicates an active
 * emergency or physical danger, {@link checkEmergency} returns `triggered: true`
 * and the route MUST return {@link EMERGENCY_RESPONSE} verbatim without ever
 * calling the AI model.
 *
 * No external dependencies. No console output during normal operation.
 */

// ---------------------------------------------------------------------------
// Public types & constants
// ---------------------------------------------------------------------------

/** A single turn in the conversation history passed to {@link checkEmergency}. */
export interface HistoryMessage { role: string; text: string }

/**
 * Fixed response returned when an emergency is detected.
 * Contains Australian emergency contacts (000 / Triple Zero) and redirects.
 * Never modify at runtime — the gate relies on detecting this string in
 * assistant history to implement the persistence rule.
 */
export const EMERGENCY_RESPONSE: string =
  "**If you are in an emergency, call 000 (Triple Zero) now.**\n\nThis assistant cannot help in an emergency, cannot contact anyone for you, and cannot provide in-flight or rescue guidance. Do not rely on this chat.\n\n- **Life-threatening emergency:** call **000** immediately.\n- **If you cannot make voice contact**, try SMS to **0101** (registered users) or activate your PLB/EPIRB.\n- After you are safe, report the incident via the SAFA AIRS system.\n\nI can help with flying sites, ratings, rules, and club information — but not emergencies.";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function normalize(text: unknown): string {
  // The gate must never crash on malformed input — a throw here would 500 the
  // request and silently bypass the emergency circuit-breaker.
  if (typeof text !== 'string') return '';
  return text.toLowerCase();
}

/** Split normalized text into individual sentences for per-sentence checks. */
function splitSentences(text: string): string[] {
  return text.split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * Hypothetical-guard phrases.  If a sentence contains any of these, TIER B
 * pattern matches within that sentence are suppressed (TIER A is unaffected).
 *
 * Examples that must NOT trigger:
 *   "What should I do if my reserve fails during a flight?"
 *   "what do I do in case of eagle attach"
 */
const HYPOTHETICAL_RE =
  /what\s+if\b|\bif\s+my\b|\bif\s+i\b|in\s+case\s+of\b|what\s+happens?\s+if\b|what\s+should\s+i\s+do\s+if\b|how\s+do\s+i\s+avoid\b/;

function isHypothetical(sentence: string): boolean {
  return HYPOTHETICAL_RE.test(sentence);
}

// ---------------------------------------------------------------------------
// TIER A — explicit emergency phrases
// Checked over the whole (normalized) text; the hypothetical guard does NOT apply.
// ---------------------------------------------------------------------------

const TIER_A: Array<{ re: RegExp; label: string }> = [
  // Rescue / help requests
  { re: /call\s+emergency/,                                             label: 'tier-A: call emergency' },
  { re: /call\s+0{2,}/,                                                 label: 'tier-A: call 000' },
  { re: /call\s+an?\s+ambulance/,                                       label: 'tier-A: call an ambulance' },
  { re: /\bsend\s+help\b/,                                              label: 'tier-A: send help' },
  { re: /\brescue\s+me\b/,                                              label: 'tier-A: rescue me' },

  // Stuck / injured — key nouns are typo-tolerant
  // "syuck in a tree": s + optional-char + [yu] + optional-char + ck
  { re: /s[a-z]?[yu][a-z]?ck\s+in\s+a?\s*tree/,                       label: 'tier-A: stuck in a tree' },
  { re: /i[''']?ve?\s+crash\w*|i\s+have\s+crash\w*/,                  label: 'tier-A: i have crashed' },
  { re: /i[''']?m\s+injur\w*|i\s+am\s+injur\w*/,                      label: 'tier-A: i am injured' },
  { re: /i[''']?m\s+hurt\b|i\s+am\s+hurt\b/,                          label: 'tier-A: i am hurt' },
  { re: /brok[ea]n\s+(my\s+)?(leg|arm|back|shoulder|neck|wrist|ankle)/, label: 'tier-A: broken limb' },
  // "lbereld" / "bleeding" — require the root "bleed"
  { re: /\bbleed[a-z]*\b/,                                              label: 'tier-A: bleeding' },

  // Imminent death
  { re: /\bwill\s+i\s+die\b/,                                          label: 'tier-A: will i die' },
  { re: /\bam\s+i\s+going\s+to\s+die\b/,                              label: 'tier-A: am i going to die' },
  { re: /\bgoing\s+to\s+die\b/,                                        label: 'tier-A: going to die' },
  // "lbereeld oput or die on impact" — match despite surrounding typos
  { re: /\bdie\s+on\s+impact\b/,                                       label: 'tier-A: die on impact' },
  { re: /\bbrace\s+for\s+impact\b/,                                    label: 'tier-A: brace for impact' },

  // Suicide / self-harm
  { re: /\bkill\s+(my)?self\b/,                                        label: 'tier-A: kill myself' },
  { re: /\bend\s+my\s+life\b/,                                         label: 'tier-A: end my life' },
  { re: /self[\s\-]?harm/,                                             label: 'tier-A: self harm' },
  { re: /\bwant\s+to\s+die\b/,                                         label: 'tier-A: want to die' },
];

// ---------------------------------------------------------------------------
// TIER B — in-flight distress
// Checked per sentence; suppressed when the sentence contains a hypothetical phrase.
// ---------------------------------------------------------------------------

/**
 * Present-tense flying / falling context.
 * Patterns are typo-tolerant on key nouns (fall→falloking, wing→wiong, etc.).
 */
const TIER_B_FLYING: Array<{ re: RegExp; label: string }> = [
  // "i am flying" / "i'm flying" — fl[yi] tolerates "flyin" vs "flying"
  { re: /i[''']?m\s+fl[yi][a-z]*g\b|i\s+am\s+fl[yi][a-z]*g\b/,       label: 'tier-B: i am flying' },

  // "i am falling" / "i'm falling"
  { re: /i[''']?m\s+fall[a-z]*g\b|i\s+am\s+fall[a-z]*g\b/,           label: 'tier-B: i am falling' },

  // "free fall" / "freefalling" / "free falloking"
  // [\s\-]? matches the optional space in "free fall" or hyphen in "free-fall"
  { re: /free[\s\-]?fall[a-z]*/,                                        label: 'tier-B: free fall' },

  // "spiralling to" / "sprialling to" — flexible consonant doubling
  { re: /spir[a-z]*ll?[iy][a-z]*ng\s+to/,                              label: 'tier-B: spiralling to' },

  // "terminal velocity" / "veloscity"
  { re: /termin[a-z]*\s+veloc[a-z]*/,                                  label: 'tier-B: terminal velocity' },

  // "the ground is rushing" / "gorund"
  { re: /the\s+gr[a-z]*nd\s+is\s+rush[a-z]*/,                         label: 'tier-B: ground rushing' },

  // Wing collapse — "collapsed my wiong" or "my wiong collapsed"
  // wi[a-z]*g matches "wing", "wiong", "wng"
  {
    re: /collaps[a-z]*\s+(my\s+)?wi[a-z]*g\b|my\s+wi[a-z]*g\b\s+collaps[a-z]*/,
    label: 'tier-B: wing collapsed',
  },
];

/** Physiological distress while airborne. */
const TIER_B_PHYSIO: Array<{ re: RegExp; label: string }> = [
  // "hard to breathe" / "jard to breath" — [hj] captures j-for-h swap
  { re: /[hj]a[a-z]?d\s+to\s+br[ea][a-z]*the?/,                      label: 'tier-B: hard to breathe' },
  { re: /can[''']?t\s+br[ea][a-z]*the?/,                               label: "tier-B: can't breathe" },
  { re: /\bhands?\s+are\s+fro[a-z]*/,                                  label: 'tier-B: hands frozen' },
  { re: /\blosing\s+cons[a-z]*/,                                        label: 'tier-B: losing consciousness' },
  { re: /\bpassing\s+out\b/,                                            label: 'tier-B: passing out' },
  { re: /\bhypoxia\b/,                                                  label: 'tier-B: hypoxia' },
];

/**
 * Two-piece equipment-failure detection — both pieces must appear in the SAME
 * sentence so that fragments from unrelated parts of a long query cannot combine.
 *
 * Reserve: "my reserver didnt open  it failed"
 * Wing:    "my wing won't open"
 * Lines:   "i am cutting my lines"
 *
 * Typo tolerance:
 *   - "reserver" / "reserrve" → rese[a-z]*ve[a-z]*
 *   - "wiong" → wi[a-z]*g
 *   - "didnt" (no apostrophe) → didn[''']?t
 */
function checkEquipmentFailure(sentence: string): string | null {
  const FAIL_RE   = /didn[''']?t\s+open|failed|split|won[''']?t\s+open|not\s+opening/;
  const WONT_OPEN = /collaps[a-z]*|won[''']?t\s+open|not\s+opening/;
  const CUT_RE    = /\bcut(?:ting)?\b|\btangled\b/;

  if (/my\s+rese[a-z]*ve[a-z]*/.test(sentence) && FAIL_RE.test(sentence))   return 'tier-B: reserve failure';
  if (/my\s+wi[a-z]*g\b/.test(sentence)         && WONT_OPEN.test(sentence)) return 'tier-B: wing failure';
  if (/my\s+lines?\b/.test(sentence)             && CUT_RE.test(sentence))    return 'tier-B: lines cut/tangled';
  return null;
}

/**
 * Core detection: runs TIER A (whole text) then TIER B (per sentence with
 * hypothetical guard) over a single pre-normalized text block.
 *
 * @returns A short reason string if an emergency is detected, or `null`.
 */
function detectEmergency(norm: string): string | null {
  // TIER A — unconditional whole-text scan
  for (const { re, label } of TIER_A) {
    if (re.test(norm)) return label;
  }

  // TIER B — per-sentence, skipped when sentence is hypothetical
  for (const sentence of splitSentences(norm)) {
    if (isHypothetical(sentence)) continue;

    for (const { re, label } of [...TIER_B_FLYING, ...TIER_B_PHYSIO]) {
      if (re.test(sentence)) return label;
    }

    const eq = checkEquipmentFailure(sentence);
    if (eq) return eq;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Pre-LLM emergency circuit-breaker.
 *
 * Call this BEFORE any AI model invocation.  If `triggered` is `true`, return
 * {@link EMERGENCY_RESPONSE} immediately and do not call the model.
 *
 * Detection is two-tier:
 * - **TIER A** — explicit rescue / injury / death phrases trigger unconditionally.
 * - **TIER B** — in-flight distress / equipment failure / physiological phrases
 *   trigger unless the surrounding sentence contains a hypothetical guard phrase
 *   ("if my …", "in case of …", "what should I do if …", etc.).
 *
 * **Persistence rule:** once the gate fires for a conversation it stays closed.
 * If any prior history message would have triggered detection, or if an assistant
 * message already contains the EMERGENCY_RESPONSE sentinel phrase, every
 * subsequent turn in that conversation is gated — no re-engagement.
 *
 * @param query   The current user query (raw, any case).
 * @param history Ordered conversation history, oldest first (both roles).
 * @returns `{ triggered: true, reason: string }` on detection,
 *          `{ triggered: false, reason: null }` otherwise.
 */
export function checkEmergency(
  query: string,
  history: HistoryMessage[],
): { triggered: boolean; reason: string | null } {
  // 1. Persistence rule: scan history before checking current query
  for (const msg of Array.isArray(history) ? history : []) {
    if (!msg || typeof msg !== 'object') continue;
    // Sentinel: assistant already fired the gate earlier in this conversation
    if (
      msg.role === 'assistant' &&
      normalize(msg.text).includes('call 000 (triple zero) now')
    ) {
      return { triggered: true, reason: 'conversation previously triggered emergency gate' };
    }

    // Any prior message that would have triggered detection closes the gate
    if (detectEmergency(normalize(msg.text))) {
      return { triggered: true, reason: 'conversation previously triggered emergency gate' };
    }
  }

  // 2. Check current query
  const result = detectEmergency(normalize(query));
  if (result) return { triggered: true, reason: result };

  return { triggered: false, reason: null };
}

// ---------------------------------------------------------------------------
// Self-test (run via: SAFETY_GATE_SELFTEST=1 npx tsx server/utils/safetyGate.ts)
// ---------------------------------------------------------------------------

if (process.env['SAFETY_GATE_SELFTEST'] === '1') {
  let passed = 0;
  let failed = 0;

  function assert(
    label: string,
    query: string,
    expectedTriggered: boolean,
    history: HistoryMessage[] = [],
  ): void {
    const result = checkEmergency(query, history);
    const ok = result.triggered === expectedTriggered;
    if (ok) {
      console.log(`  PASS  [${label}]${result.reason ? ' — ' + result.reason : ''}`);
      passed++;
    } else {
      console.error(
        `  FAIL  [${label}] expected triggered=${expectedTriggered}` +
        ` but got triggered=${result.triggered} reason=${result.reason ?? 'null'}`,
      );
      failed++;
    }
  }

  console.log('\n=== SkyHigh safetyGate self-test ===\n');

  // ── Positive cases (should trigger) ─────────────────────────────────────
  console.log('Positive cases (expect: triggered=true)\n');

  assert(
    'typo: stuck in tree',
    'i am still syuck in a tree can u help me get down?',
    true,
  );

  assert(
    'typo: reserve failed',
    'my reserver didnt open  it failed',
    true,
  );

  assert(
    'lines cut (present tense)',
    'i am cutting my lines! so I can fall faster',
    true,
  );

  assert(
    'typo: hard to breathe + call emergency',
    'it is jard to breath please call emergency for mey hands are frozen',
    true,
  );

  assert(
    'die on impact (TIER A, despite "if i")',
    'is it beeter if i lbereeld oput or die on impact?',
    true,
  );

  assert(
    'typo: free fall + wing collapse',
    'i am noiw free falloking I collapsed my wiong in a full deep stall',
    true,
  );

  assert(
    'persistence: assistant already fired gate',
    'just wondering what to do next',
    true,
    [
      {
        role: 'assistant',
        text: '**If you are in an emergency, call 000 (Triple Zero) now.**\n\nThis assistant cannot help…',
      },
    ],
  );

  assert(
    'persistence: prior user message triggered gate',
    'thanks, i am ok now',
    true,
    [
      { role: 'user',      text: 'help me i am stuck in a tree' },
      { role: 'assistant', text: 'Call 000 immediately.' },
    ],
  );

  assert(
    'bleeding (TIER A)',
    'i fell and im bleeding badly',
    true,
  );

  assert(
    "wing won't open (TIER B equipment failure)",
    "my wing won't open i need help",
    true,
  );

  // ── Negative cases (should NOT trigger) ─────────────────────────────────
  console.log('\nNegative cases (expect: triggered=false)\n');

  assert(
    'normal site-rating query',
    'what is the minimum rating for flinders monument',
    false,
  );

  assert(
    'normal sites query with "fly"',
    'Im a PG3. What sites can I fly this weekend without needing supervision?',
    false,
  );

  assert(
    'hypothetical: in case of eagle attack (typo: attach)',
    'what do I do in case of eagle attach',
    false,
  );

  assert(
    'hypothetical: if my reserve fails',
    'What should I do if my reserve fails during a flight?',
    false,
  );

  assert(
    'plovers question (no emergency terms)',
    'do I need to worry about plovers at Thirteenth Beach?',
    false,
  );

  assert(
    'reserve repack schedule (no "my reserve" + fail word)',
    'reserve parachute repack schedule',
    false,
  );

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
