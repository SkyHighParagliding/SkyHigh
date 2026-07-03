/**
 * eligibility.ts — Deterministic SAFA site-eligibility engine.
 *
 * SAFETY-CRITICAL. A public AI assistant previously interpreted free-text
 * rating strings against prose rules and cleared a PG3 pilot for a PG4-only
 * site. This module removes all interpretation from the AI: it parses the
 * club's rating string, computes the verdict in code, and renders an
 * authoritative text block the AI must restate verbatim.
 *
 * Design rule: when the parser is unsure, it degrades to UNKNOWN + a warning.
 * It NEVER guesses. Unrecognized requirement text is preserved verbatim and
 * quoted back to the pilot; it is never expanded or interpreted.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type Discipline = 'PG' | 'HG';

/** A pilot's rating as understood from their message/history. */
export interface PilotRating {
  discipline: Discipline;
  level: number; // 1-5; roles map to 5
  role?: 'CFI' | 'FI' | 'SSO' | 'SO'; // set when pilot identified by role
  raw: string; // what they said, e.g. "PG3", "SSO"
}

/** One parsed tier (segment between "|") of a site rating string. */
export interface ParsedTier {
  minLevel: number; // numeric level for this tier
  supervised: boolean; // tier grants supervised access for pilots holding EXACTLY minLevel
  supervisors: string[]; // e.g. ["PG4","SO"] or ["FI","SSO"] or ["PG5"]; empty if unsupervised tier
  launch: string | null; // e.g. "North" when tier is launch-specific
  requirementNote: string | null; // unrecognized requirement kept VERBATIM, e.g. "Spion End"
  raw: string;
}

/** A fully parsed site rating string for one discipline. */
export interface ParsedRating {
  discipline: Discipline;
  notSuitable: boolean;
  tiers: ParsedTier[];
  multiLaunch: boolean;
  parseWarnings: string[]; // anything the parser was unsure about
  raw: string;
}

export type VerdictStatus =
  | 'ELIGIBLE_UNSUPERVISED'
  | 'ELIGIBLE_SUPERVISED'
  | 'INELIGIBLE'
  | 'NOT_SUITABLE'
  | 'UNKNOWN';

/** A computed eligibility verdict for one launch. */
export interface Verdict {
  status: VerdictStatus;
  supervisors: string[]; // when ELIGIBLE_SUPERVISED
  launch: string | null; // per-launch verdicts
  requirementNote: string | null;
  text: string; // one-sentence human rendering
}

// ---------------------------------------------------------------------------
// Internal helpers — token recognition
// ---------------------------------------------------------------------------

/** Recognized supervisor tokens: PG1-5, HG1-5, CFI, FI, SSO, SO. */
function isSupervisorToken(tok: string): boolean {
  return /^(?:PG|HG)[1-5]$/i.test(tok) || /^(?:CFI|FI|SSO|SO)$/i.test(tok);
}

/** Normalize a recognized supervisor token to canonical casing. */
function normalizeSupervisor(tok: string): string {
  return tok.trim().toUpperCase();
}

/**
 * Parse a "req"/"requires" clause into recognized supervisor tokens plus a
 * verbatim note. If ANY part is unrecognized, the ENTIRE clause is preserved
 * verbatim as the requirementNote (never interpreted).
 */
function parseRequirement(reqText: string): { supervisors: string[]; note: string | null } {
  const parts = reqText
    .split(/[/,]/)
    .map((p) => p.trim())
    .filter(Boolean);
  const supervisors: string[] = [];
  let anyUnrecognized = false;
  for (const p of parts) {
    if (isSupervisorToken(p)) supervisors.push(normalizeSupervisor(p));
    else anyUnrecognized = true;
  }
  return { supervisors, note: anyUnrecognized ? reqText.trim() : null };
}

/**
 * HG word-level map. The word IS the level. "Supervised" is special: it is the
 * SAFA Supervised certificate (level 2) AND carries the supervised marker —
 * "HG Supervised" behaves like "HG2 Supervised" (exactly-level-2 pilots fly
 * supervised; higher levels fly unsupervised), mirroring "PG2 Supervised".
 */
const WORD_LEVELS: Array<[string, number]> = [
  ['student', 1],
  ['novice', 2],
  ['intermediate', 3],
  ['advanced', 4],
  ['supervised', 2],
];

// ---------------------------------------------------------------------------
// Tier parsing
// ---------------------------------------------------------------------------

/**
 * Parse a single tier segment. Returns null when no primary rating token can
 * be recognized (caller records a parse warning and degrades to UNKNOWN).
 */
function parseTier(rawSegment: string, discipline: Discipline): ParsedTier | null {
  const raw = rawSegment.trim();
  let s = raw;

  // 1. Launch parenthetical, e.g. "(North)".
  let launch: string | null = null;
  const lm = s.match(/\(([^)]+)\)/);
  if (lm) {
    launch = lm[1].trim();
    s = s.replace(lm[0], ' ').trim();
  }

  // 2. Requirement clause ("req"/"requires"/"requiring" + rest).
  let reqText: string | null = null;
  const reqIdx = s.search(/\b(?:req|requires|requiring)\b/i);
  if (reqIdx >= 0) {
    reqText = s.slice(reqIdx).replace(/^\S+\s*/, '').trim(); // drop the req word itself
    s = s.slice(0, reqIdx).trim();
  }

  // 3. Endorsed marker (treated like supervised-with-requirementNote: the
  //    requirement is always carried verbatim as a note).
  const endorsed = /\bendorsed\b/i.test(s);

  // 4. Primary rating token: numeric (PG3/HG4) or HG word-level.
  let minLevel: number | null = null;
  let numeric = false;
  let wordWasSupervised = false;
  const num = s.match(/\b(?:PG|HG)\s*-?\s*([1-5])\b/i);
  if (num) {
    minLevel = parseInt(num[1], 10);
    numeric = true;
  } else {
    for (const [w, lvl] of WORD_LEVELS) {
      if (new RegExp('\\b' + w + '\\b', 'i').test(s)) {
        minLevel = lvl;
        wordWasSupervised = w === 'supervised';
        break;
      }
    }
  }
  if (minLevel === null) return null; // unparseable primary token

  // 5. Supervised marker. For numeric tokens it is the explicit "Supervised"/
  //    "Sup" word. For word levels, "Supervised" is both the level (2) and the
  //    marker — "HG Supervised" === "HG2 Supervised".
  const supervised = (numeric && /\b(?:supervised|sup)\b/i.test(s)) || wordWasSupervised;

  // 6. Requirement -> supervisors + note.
  let supervisors: string[] = [];
  let requirementNote: string | null = null;
  if (reqText) {
    const parsed = parseRequirement(reqText);
    supervisors = parsed.supervisors;
    requirementNote = parsed.note;
    // Endorsed: always keep the full requirement clause verbatim as a note.
    if (endorsed) requirementNote = reqText.trim();
  }

  return {
    minLevel,
    supervised,
    supervisors,
    launch,
    requirementNote,
    raw,
  };
}

// ---------------------------------------------------------------------------
// parseRatingString
// ---------------------------------------------------------------------------

/**
 * Parse a free-text site rating string for one discipline into a structured
 * {@link ParsedRating}. Empty/null input and unparseable primary tokens yield
 * zero tiers plus a parse warning; callers treat that as UNKNOWN.
 */
export function parseRatingString(
  raw: string | null | undefined,
  discipline: Discipline,
): ParsedRating {
  const text = (raw ?? '').trim();

  if (!text) {
    return {
      discipline,
      notSuitable: false,
      tiers: [],
      multiLaunch: false,
      parseWarnings: ['Rating not recorded (empty).'],
      raw: text,
    };
  }

  if (/not\s+suitable/i.test(text)) {
    return {
      discipline,
      notSuitable: true,
      tiers: [],
      multiLaunch: false,
      parseWarnings: [],
      raw: text,
    };
  }

  const parseWarnings: string[] = [];
  const tiers: ParsedTier[] = [];
  for (const segment of text.split('|')) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    const tier = parseTier(trimmed, discipline);
    if (tier) tiers.push(tier);
    else parseWarnings.push(`Could not recognize a rating in tier: "${trimmed}"`);
  }

  if (tiers.length === 0) {
    parseWarnings.push(`No recognizable rating tier in: "${text}"`);
  }

  const multiLaunch = tiers.some((t) => t.launch !== null);

  return {
    discipline,
    notSuitable: false,
    tiers,
    multiLaunch,
    parseWarnings,
    raw: text,
  };
}

// ---------------------------------------------------------------------------
// Eligibility computation
// ---------------------------------------------------------------------------

/** A role always counts as level 5 for the pilot's own eligibility. */
function effectiveLevel(pilot: PilotRating): number {
  return pilot.role ? 5 : pilot.level;
}

/**
 * General supervision matrix. Applies ONLY to a single plain (unsupervised,
 * non-multi-launch) tier. Returns the required supervisors, or null when the
 * pilot is ineligible even with supervision. Discipline prefixes level tokens.
 */
function matrixSupervisors(pilotLevel: number, siteLevel: number, disc: Discipline): string[] | null {
  if (pilotLevel <= 1) return null; // PG1/HG1: training operations only
  const key = `${pilotLevel}-${siteLevel}`;
  const map: Record<string, string[]> = {
    '2-2': [`${disc}4`, 'SO'],
    '2-3': [`${disc}5`],
    '2-4': ['CFI', 'FI', 'SSO'],
    '2-5': ['CFI', 'FI', 'SSO'],
    '3-4': [`${disc}5`],
    '3-5': ['CFI', 'FI', 'SSO'],
    '4-5': [`${disc}5`],
  };
  return map[key] ?? null;
}

/** Resolve a supervised tier's supervisors, applying the default when none stated. */
function resolveSupervisors(tier: ParsedTier, disc: Discipline): string[] {
  return tier.supervisors.length ? tier.supervisors : [`${disc}4`, 'SO'];
}

/** Human sentence quoting an unrecognized site requirement verbatim. */
function requirementSentence(note: string | null): string {
  if (!note) return '';
  return ` Additional site requirement applies: "${note}" — confirm what this involves with a club safety officer before flying.`;
}

/** Subject phrase for verdict text. */
function siteRef(launch: string | null): string {
  return launch ? `the ${launch} launch` : 'this site';
}

/** Build the one-sentence verdict text from its components. */
function renderVerdictText(
  status: VerdictStatus,
  pilot: PilotRating,
  disc: Discipline,
  launch: string | null,
  supervisors: string[],
  note: string | null,
  firstTierSummary: string,
): string {
  const who = `a ${pilot.raw} pilot`;
  const where = siteRef(launch);
  switch (status) {
    case 'ELIGIBLE_UNSUPERVISED':
      return `ELIGIBLE — ${who} may fly ${where} unsupervised.` + requirementSentence(note);
    case 'ELIGIBLE_SUPERVISED':
      return (
        `ELIGIBLE ONLY WITH SUPERVISION — ${who} may fly ${where} only under the supervision of ${supervisors.join(' or ')}.` +
        requirementSentence(note)
      );
    case 'INELIGIBLE':
      return `NOT ELIGIBLE — ${who} cannot fly ${where} under any supervision. Minimum requirement: ${firstTierSummary}.`;
    case 'NOT_SUITABLE':
      return `NOT OPEN — this site is not open to ${disc} pilots.`;
    case 'UNKNOWN':
    default:
      return `RATING NOT RECORDED — the ${disc} rating for this site is not recorded in the system. Do not assume eligibility; contact a club safety officer.`;
  }
}

/** Compute a verdict for one launch group (list of tiers in original order). */
function computeGroup(
  tiers: ParsedTier[],
  pilot: PilotRating,
  disc: Discipline,
  multiLaunch: boolean,
  launch: string | null,
): Verdict {
  const eff = effectiveLevel(pilot);
  const tier0 = tiers[0];

  // A multi-tier list, a multi-launch group, or a supervised first tier are
  // all EXHAUSTIVE: there is no fallback to the general matrix. The matrix
  // applies only to a single, plain, non-multi-launch tier.
  const exhaustive = multiLaunch || tiers.length > 1 || tier0.supervised;
  const matrixMode = !exhaustive;

  const firstTierSummary = `${disc}${tier0.minLevel}${tier0.supervised ? ' supervised' : ''}`;

  const make = (status: VerdictStatus, supervisors: string[], note: string | null): Verdict => ({
    status,
    supervisors,
    launch,
    requirementNote: note,
    text: renderVerdictText(status, pilot, disc, launch, supervisors, note, firstTierSummary),
  });

  // 1. Unsupervised threshold. A supervised first tier grants unsupervised
  //    access only ABOVE its level (pilots exactly at it fly supervised).
  const unsupMin = tier0.supervised ? tier0.minLevel + 1 : tier0.minLevel;
  if (eff >= unsupMin) {
    return make('ELIGIBLE_UNSUPERVISED', [], tier0.requirementNote);
  }

  // 2. Exact-level supervised slots. tier0 counts only if it carries a
  //    supervised marker; every subsequent tier is a supervised slot.
  const supervisedTiers = tiers.filter((t, i) => i > 0 || t.supervised);
  const match = supervisedTiers.find((t) => t.minLevel === eff);
  if (match) {
    return make('ELIGIBLE_SUPERVISED', resolveSupervisors(match, disc), match.requirementNote);
  }

  // 3. Matrix fallback (single plain tier only).
  if (matrixMode) {
    const sup = matrixSupervisors(eff, tier0.minLevel, disc);
    if (sup) return make('ELIGIBLE_SUPERVISED', sup, tier0.requirementNote);
  }

  // 4. No path.
  return make('INELIGIBLE', [], null);
}

/**
 * Compute one {@link Verdict} per launch for the given pilot against a parsed
 * site rating. Returns a single-element array for non-multi-launch sites.
 */
export function computeEligibility(parsed: ParsedRating, pilot: PilotRating): Verdict[] {
  const disc = parsed.discipline;

  const bare = (status: VerdictStatus): Verdict => ({
    status,
    supervisors: [],
    launch: null,
    requirementNote: null,
    text: renderVerdictText(status, pilot, disc, null, [], null, ''),
  });

  if (parsed.notSuitable) return [bare('NOT_SUITABLE')];
  if (parsed.tiers.length === 0) return [bare('UNKNOWN')];

  if (parsed.multiLaunch) {
    // Group tiers by launch, preserving first-seen order.
    const order: string[] = [];
    const groups = new Map<string, ParsedTier[]>();
    for (const t of parsed.tiers) {
      const key = t.launch ?? '(unspecified)';
      if (!groups.has(key)) {
        groups.set(key, []);
        order.push(key);
      }
      groups.get(key)!.push(t);
    }
    return order.map((key) => {
      const groupTiers = groups.get(key)!;
      return computeGroup(groupTiers, pilot, disc, true, groupTiers[0].launch);
    });
  }

  return [computeGroup(parsed.tiers, pilot, disc, false, null)];
}

// ---------------------------------------------------------------------------
// extractPilotRating
// ---------------------------------------------------------------------------

/**
 * Words that, immediately before a rating token, mean the pilot does NOT hold
 * that rating ("not a PG4", "want my PG4", "working towards PG4").
 */
const RATING_DISCLAIMER = /\b(?:not|isn['’]?t|aren['’]?t|no longer|want(?:ing)?|hop(?:e|ing)|aim(?:ing)?|get(?:ting)?|goal|towards?|working (?:on|towards?)|after|training for|studying for|almost|nearly|soon)\s*(?:my\s+|a\s+|an\s+|to\s+|for\s+|be\s+)*$/i;

/** Try to extract a rating from a single block of text. */
function extractFromText(text: string): PilotRating | null {
  // Numeric ratings: "pg3", "PG 3", "hg-2" (case-insensitive). Collect ALL
  // matches; drop tokens preceded by a disclaimer ("not a PG4", "want my PG4").
  // If several DISTINCT levels remain, take the LOWEST — the safety-conservative
  // reading. ("I'm not a PG4 yet, just PG3" must never extract PG4.)
  const candidates: { discipline: Discipline; level: number }[] = [];
  for (const m of text.matchAll(/\b(pg|hg)\s*-?\s*([1-5])\b/gi)) {
    const before = text.slice(Math.max(0, (m.index ?? 0) - 30), m.index ?? 0);
    if (RATING_DISCLAIMER.test(before)) continue;
    candidates.push({ discipline: m[1].toUpperCase() as Discipline, level: parseInt(m[2], 10) });
  }
  if (candidates.length > 0) {
    const lowest = candidates.reduce((a, b) => (b.level < a.level ? b : a));
    return { discipline: lowest.discipline, level: lowest.level, raw: `${lowest.discipline}${lowest.level}` };
  }

  // Role self-identification. CFI/SSO: article optional. FI/SO: article
  // REQUIRED, to avoid matching the English word "so".
  const cfiSso = text.match(/(?:i(?:'|’)?m|i am|as)\s+(?:an?\s+|the\s+)?(cfi|sso)\b/i);
  if (cfiSso) {
    const role = cfiSso[1].toUpperCase() as PilotRating['role'];
    return { discipline: 'PG', level: 5, role, raw: role! };
  }
  const fiSo = text.match(/(?:i(?:'|’)?m|i am|as)\s+(?:an?\s+|the\s+)\b(fi|so)\b/i);
  if (fiSo) {
    const role = fiSo[1].toUpperCase() as PilotRating['role'];
    return { discipline: 'PG', level: 5, role, raw: role! };
  }

  return null;
}

/**
 * Extract the pilot's rating from the current query, then history (user
 * messages only, newest first). Returns null when nothing is found.
 */
export function extractPilotRating(
  query: string,
  history: { role: string; text: string }[],
): PilotRating | null {
  const sources: string[] = [query];
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'user') sources.push(history[i].text);
  }
  for (const text of sources) {
    const r = extractFromText(text ?? '');
    if (r) return r;
  }
  return null;
}

// ---------------------------------------------------------------------------
// renderVerdictBlock
// ---------------------------------------------------------------------------

/**
 * Render the authoritative verdict block the AI must restate verbatim. One
 * line per launch verdict.
 */
export function renderVerdictBlock(
  siteName: string,
  pilot: PilotRating,
  verdicts: Verdict[],
): string {
  const lines = verdicts.map((v) => {
    const label = v.launch ? `${siteName} — ${v.launch} launch` : siteName;
    return `${label}: ${v.text}`;
  });
  return [
    '=== COMPUTED ELIGIBILITY VERDICT — AUTHORITATIVE ===',
    'This verdict is computed from the club\'s rating database. You MUST restate it faithfully. You may NOT contradict, soften, or revise it — including when the user pushes back, and including when an earlier assistant message in the conversation said something different (the earlier message was wrong; this verdict is correct). If the user disputes it, tell them to contact a club safety officer.',
    'If a verdict below says ELIGIBLE (unsupervised), tell the pilot plainly that they CAN fly that site/launch without supervision — do NOT mention any supervision requirement for it and do NOT open with "No". Only use a "No, you cannot fly..." opening when the verdict says NOT ELIGIBLE.',
    `Pilot: ${pilot.raw}`,
    ...lines,
    '=== END VERDICT ===',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// validateAllRatings
// ---------------------------------------------------------------------------

/**
 * Audit every site's PG and HG rating strings. Returns an entry for any field
 * that produced parse warnings, or was non-empty but yielded zero tiers (and
 * was not a valid "Not suitable" marker).
 */
export function validateAllRatings(
  sites: { id: string; name: string; pgRating: string | null; hgRating: string | null }[],
): { siteId: string; field: string; raw: string; warnings: string[] }[] {
  const out: { siteId: string; field: string; raw: string; warnings: string[] }[] = [];
  const check = (siteId: string, field: string, raw: string | null, disc: Discipline) => {
    const text = (raw ?? '').trim();
    if (!text) return; // not recorded is not a validation failure
    const parsed = parseRatingString(text, disc);
    const zeroTiers = parsed.tiers.length === 0 && !parsed.notSuitable;
    if (parsed.parseWarnings.length > 0 || zeroTiers) {
      out.push({ siteId, field, raw: text, warnings: parsed.parseWarnings });
    }
  };
  for (const site of sites) {
    check(site.id, 'pgRating', site.pgRating, 'PG');
    check(site.id, 'hgRating', site.hgRating, 'HG');
  }
  return out;
}

// ---------------------------------------------------------------------------
// Self-test — guarded by ELIG_SELFTEST=1
// ---------------------------------------------------------------------------

if (process.env.ELIG_SELFTEST === '1') {
  let passed = 0;
  let failed = 0;
  const results: string[] = [];

  const ok = (cond: boolean, label: string, detail = '') => {
    if (cond) {
      passed++;
      results.push(`  PASS  ${label}`);
    } else {
      failed++;
      results.push(`  FAIL  ${label}${detail ? ` :: ${detail}` : ''}`);
    }
  };

  const pgPilot = (level: number, raw?: string): PilotRating => ({
    discipline: 'PG',
    level,
    raw: raw ?? `PG${level}`,
  });
  const rolePilot = (role: PilotRating['role']): PilotRating => ({
    discipline: 'PG',
    level: 5,
    role,
    raw: role!,
  });

  const verdict = (rating: string, pilot: PilotRating): Verdict[] =>
    computeEligibility(parseRatingString(rating, 'PG'), pilot);

  // PG3 vs "PG4" (The Paps): supervised via matrix ["PG5"], NOT unsupervised.
  {
    const v = verdict('PG4', pgPilot(3))[0];
    ok(v.status === 'ELIGIBLE_SUPERVISED', 'PG3 vs PG4 => ELIGIBLE_SUPERVISED', v.status);
    ok(JSON.stringify(v.supervisors) === JSON.stringify(['PG5']), 'PG3 vs PG4 => supervisors [PG5]', JSON.stringify(v.supervisors));
  }

  // PG3 vs "PG2 Supervised" (Barwon Heads): unsupervised (no supervision!).
  {
    const v = verdict('PG2 Supervised', pgPilot(3))[0];
    ok(v.status === 'ELIGIBLE_UNSUPERVISED', 'PG3 vs "PG2 Supervised" => ELIGIBLE_UNSUPERVISED', v.status);
  }

  // PG2 vs "PG2 Supervised": supervised ["PG4","SO"].
  {
    const v = verdict('PG2 Supervised', pgPilot(2))[0];
    ok(v.status === 'ELIGIBLE_SUPERVISED', 'PG2 vs "PG2 Supervised" => ELIGIBLE_SUPERVISED', v.status);
    ok(JSON.stringify(v.supervisors) === JSON.stringify(['PG4', 'SO']), 'PG2 vs "PG2 Supervised" => ["PG4","SO"]', JSON.stringify(v.supervisors));
  }

  // Flinders Monument "PG5 | PG4 Supervised requires SO/SSO".
  const flinders = 'PG5 | PG4 Supervised requires SO/SSO';
  {
    const v = verdict(flinders, pgPilot(3))[0];
    ok(v.status === 'INELIGIBLE', 'PG3 vs Flinders => INELIGIBLE', v.status);
  }
  {
    // PG2 even with CFI present -> INELIGIBLE (no supervised path for level 2).
    const v = verdict(flinders, pgPilot(2))[0];
    ok(v.status === 'INELIGIBLE', 'PG2 vs Flinders => INELIGIBLE (even with CFI)', v.status);
  }
  {
    const v = verdict(flinders, rolePilot('SSO'))[0];
    ok(v.status === 'ELIGIBLE_UNSUPERVISED', 'SSO vs Flinders => ELIGIBLE_UNSUPERVISED', v.status);
  }
  {
    const v = verdict(flinders, pgPilot(4))[0];
    ok(v.status === 'ELIGIBLE_SUPERVISED', 'PG4 vs Flinders => ELIGIBLE_SUPERVISED', v.status);
    ok(JSON.stringify(v.supervisors) === JSON.stringify(['SO', 'SSO']), 'PG4 vs Flinders => ["SO","SSO"]', JSON.stringify(v.supervisors));
  }

  // Multi-launch "PG2 Supervised (North) | PG4 (South)".
  {
    const vs = verdict('PG2 Supervised (North) | PG4 (South)', pgPilot(3));
    ok(vs.length === 2, 'multi-launch => two verdicts', String(vs.length));
    const north = vs.find((v) => v.launch === 'North');
    const south = vs.find((v) => v.launch === 'South');
    ok(!!north && north.status === 'ELIGIBLE_UNSUPERVISED', 'PG3 North => ELIGIBLE_UNSUPERVISED', north?.status);
    ok(!!south && south.status === 'INELIGIBLE', 'PG3 South => INELIGIBLE', south?.status);
  }

  // Gundowring "PG4 | PG2 Sup req PG4/SO | PG3 req PG4/SO".
  {
    const v = verdict('PG4 | PG2 Sup req PG4/SO | PG3 req PG4/SO', pgPilot(3))[0];
    ok(v.status === 'ELIGIBLE_SUPERVISED', 'PG3 vs Gundowring => ELIGIBLE_SUPERVISED', v.status);
    ok(JSON.stringify(v.supervisors) === JSON.stringify(['PG4', 'SO']), 'PG3 vs Gundowring => ["PG4","SO"]', JSON.stringify(v.supervisors));
  }

  // Spion Kop "PG2 Sup req Spion End": PG3 unsupervised, note carried & quoted.
  {
    const v = verdict('PG2 Sup req Spion End', pgPilot(3))[0];
    ok(v.status === 'ELIGIBLE_UNSUPERVISED', 'PG3 vs Spion => ELIGIBLE_UNSUPERVISED', v.status);
    ok(v.requirementNote === 'Spion End', 'PG3 vs Spion => note "Spion End"', String(v.requirementNote));
    ok(v.text.includes('"Spion End"'), 'PG3 vs Spion => note quoted in text');
  }

  // Mt Dandenong "PG5 Endorsed req PG5/SO induction": PG5 eligible + note quoted.
  {
    const v = verdict('PG5 Endorsed req PG5/SO induction', pgPilot(5))[0];
    ok(v.status.startsWith('ELIGIBLE'), 'PG5 vs Mt Dandenong => eligible', v.status);
    ok(v.requirementNote === 'PG5/SO induction', 'PG5 vs Mt Dandenong => note "PG5/SO induction"', String(v.requirementNote));
    ok(v.text.includes('"PG5/SO induction"'), 'PG5 vs Mt Dandenong => note quoted');
  }

  // extractPilotRating cases.
  {
    const r = extractPilotRating('Im a PG3 can I fly the paps', []);
    ok(!!r && r.discipline === 'PG' && r.level === 3, 'extract "Im a PG3" => PG3', JSON.stringify(r));
  }
  {
    const r = extractPilotRating('what about tomorrow', [
      { role: 'user', text: 'pg3' },
      { role: 'assistant', text: '...' },
    ]);
    ok(!!r && r.level === 3 && r.discipline === 'PG', 'extract from history => PG3', JSON.stringify(r));
  }
  {
    const r = extractPilotRating("I'm an SSO. Can I fly Flinders Monument next friday?", []);
    ok(!!r && r.role === 'SSO', 'extract "I\'m an SSO" => role SSO', JSON.stringify(r));
  }
  {
    const r = extractPilotRating('is it flyable today', []);
    ok(r === null, 'extract "is it flyable today" => null', JSON.stringify(r));
  }
  {
    const r = extractPilotRating('so can i fly there', []);
    ok(r === null, 'extract "so can i fly there" => NOT role SO', JSON.stringify(r));
  }

  // parseRatingString edge cases.
  {
    const p = parseRatingString(null, 'PG');
    ok(!p.notSuitable && p.tiers.length === 0, 'parse null => UNKNOWN path', JSON.stringify(p));
    const v = computeEligibility(p, pgPilot(3))[0];
    ok(v.status === 'UNKNOWN', 'compute on null => UNKNOWN verdict', v.status);
  }
  {
    const p = parseRatingString('Not suitable', 'PG');
    ok(p.notSuitable === true, 'parse "Not suitable" => notSuitable true', JSON.stringify(p));
    const v = computeEligibility(p, pgPilot(3))[0];
    ok(v.status === 'NOT_SUITABLE', 'compute "Not suitable" => NOT_SUITABLE', v.status);
  }

  // eslint-disable-next-line no-console
  console.log('\nELIGIBILITY SELF-TEST\n' + results.join('\n') + `\n\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}
