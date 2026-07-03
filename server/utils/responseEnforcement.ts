/**
 * responseEnforcement.ts
 *
 * Post-generation enforcement for the public Smart Search assistant.
 *
 * The model's streamed answer is checked — deterministically — against the
 * computed eligibility verdicts and conditions-qualification statements that
 * were injected into its prompt. When the model dropped, softened, or
 * contradicted one of them, the response text is corrected before the final
 * `replace` SSE event and before logging.
 *
 * All matching is SITE-SCOPED: checks run only against the sentences that
 * mention the specific site (plus the immediately following sentence, to catch
 * pronoun references like "You cannot fly it."). Whole-text matching is unsafe
 * in multi-site answers — phrases about site B must never satisfy or trip a
 * check for site A.
 */

import type { Verdict } from './eligibility.js';

export interface ComputedSiteVerdicts {
  siteName: string;
  verdicts: Verdict[];
}

// ---------------------------------------------------------------------------
// Site-scoped sentence extraction
// ---------------------------------------------------------------------------

/**
 * Return the sentences of `text` that mention `siteName` (full name or base
 * name before any parenthetical), each with its following sentence appended so
 * pronoun-based follow-ups ("You cannot fly it.") stay in scope.
 * Returns '' when the site is not mentioned.
 */
export function siteScopedText(text: string, siteName: string): string {
  const base = siteName.replace(/\s*\(.*$/, '').trim();
  const needles = Array.from(new Set([siteName.toLowerCase(), base.toLowerCase()]))
    .filter((n) => n.length >= 4);
  if (needles.length === 0) return '';

  const sentences = text.split(/(?<=[.!?])\s+|\n+/);
  const picked = new Set<number>();
  for (let i = 0; i < sentences.length; i++) {
    const sLower = sentences[i].toLowerCase();
    if (needles.some((n) => sLower.includes(n))) {
      picked.add(i);
      if (i + 1 < sentences.length) picked.add(i + 1);
    }
  }
  return Array.from(picked).sort((a, b) => a - b).map((i) => sentences[i]).join(' ');
}

// ---------------------------------------------------------------------------
// Qualification extraction & enforcement
// ---------------------------------------------------------------------------

/**
 * Context-line prefixes that are data labels, not site names. A QUALIFICATIONS
 * tag on one of these lines belongs to the current `## Site` section.
 */
const NON_SITE_PREFIXES = new Set([
  'live', 'fcst', 'hrly', 'type', 'desc', 'hazards', 'launch', 'landing',
  'rules', 'access', 'wind dir', 'pg rating', 'hg rating', 'club site',
  'scheduled closures',
]);

/**
 * Extract per-site qualification statements from the final filtered context.
 * Handles both site-section weather lines (LIVE/FCST under a `## Site` header)
 * and 7-day forecast lines (`Site Name: ... [QUALIFICATIONS — ... "..."]`).
 */
export function extractQualificationsBySite(context: string): Map<string, string> {
  const result = new Map<string, string>();
  let currentSite = '';
  for (const line of context.split('\n')) {
    const header = line.match(/^## ([^\[(]+)/);
    if (header) currentSite = header[1].trim();
    const tagMatch = line.match(/\[QUALIFICATIONS — [^"]*"([^"]+)"\]/);
    if (!tagMatch) continue;

    const linePrefix = line.match(/^([A-Za-z][^:]{2,60}): /);
    const prefixIsSite =
      linePrefix && !NON_SITE_PREFIXES.has(linePrefix[1].trim().toLowerCase());
    const siteName = line.startsWith('## ')
      ? currentSite
      : prefixIsSite
        ? linePrefix![1].trim()
        : currentSite;
    if (siteName && !result.has(siteName)) result.set(siteName, tagMatch[1]);
  }
  return result;
}

/**
 * Guarantee conditions-qualification statements reach the pilot: for every
 * qualified site the response discusses, the site's statement must be present.
 * Missing statements are appended as a conditions advisory. Checked per site —
 * one included statement must not mask another site's missing one.
 */
export function enforceQualifications(text: string, quals: Map<string, string>): string {
  if (quals.size === 0) return text;
  const textLower = text.toLowerCase();
  const missing: string[] = [];
  for (const [siteName, statement] of quals) {
    if (!textLower.includes(siteName.toLowerCase())) {
      const base = siteName.replace(/\s*\(.*$/, '').trim().toLowerCase();
      if (base.length < 4 || !textLower.includes(base)) continue;
    }
    // Presence check on a distinctive slice of the statement itself (hazard
    // list differs per site, so the opening is the discriminating part).
    const probe = statement.slice(0, Math.min(60, statement.length));
    if (!text.includes(probe) && !missing.includes(statement)) {
      missing.push(statement);
    }
  }
  if (missing.length === 0) return text;
  return text + '\n\n⚠️ **Conditions advisory:** ' + missing.join(' ');
}

// ---------------------------------------------------------------------------
// Verdict enforcement
// ---------------------------------------------------------------------------

const CONTRADICTS_UNSUPERVISED = [
  /(cannot|can not|can['’]t)\s+fly/i,
  /not\s+(currently\s+)?eligible|ineligible/i,
  /under any supervision/i,
  /(require|need)s?\s+(a\s+|an\s+)?(pg\s*[1-5]|sso|cfi|fi\b|so\b|supervision|supervisor)/i,
];

/** "do not need supervision" / "without supervision" must not read as a contradiction. */
const AFFIRMS_UNSUPERVISED =
  /(unsupervised|without (any )?supervision|no supervision|do(es)? not (need|require)|don['’]t (need|require))/i;

/**
 * Guarantee computed eligibility verdicts reach the pilot intact.
 *
 * Two failure modes are corrected:
 *  1. A restrictive verdict (INELIGIBLE / SUPERVISED / NOT_SUITABLE / UNKNOWN)
 *     the model omitted or softened → authoritative verdict lines appended.
 *  2. A permissive verdict (ELIGIBLE_UNSUPERVISED) the model contradicted
 *     ("No, a PG3 pilot cannot fly X under any supervision") → a prominent
 *     authoritative correction prepended.
 *
 * All checks are scoped to the sentences that mention the site.
 */
export function enforceVerdicts(text: string, computed: ComputedSiteVerdicts[]): string {
  if (computed.length === 0) return text;
  const appendLines: string[] = [];
  const correctionLines: string[] = [];

  for (const { siteName, verdicts } of computed) {
    const scoped = siteScopedText(text, siteName);
    if (!scoped) continue; // site not discussed — nothing to enforce

    for (const v of verdicts) {
      const launchLabel = v.launch ? ` (${v.launch} launch)` : '';
      if (v.status === 'ELIGIBLE_UNSUPERVISED') {
        const contradiction =
          CONTRADICTS_UNSUPERVISED.some((re) => re.test(scoped)) &&
          !AFFIRMS_UNSUPERVISED.test(scoped);
        if (contradiction) {
          correctionLines.push(`- ${siteName}${launchLabel}: ${v.text}`);
        }
        continue;
      }
      const restrictionShown =
        (v.status === 'INELIGIBLE' &&
          /cannot fly|can not fly|can['’]t fly|not eligible|not able to fly|ineligible/i.test(scoped)) ||
        (v.status === 'NOT_SUITABLE' && /not open|not suitable/i.test(scoped)) ||
        (v.status === 'ELIGIBLE_SUPERVISED' && /supervis/i.test(scoped)) ||
        (v.status === 'UNKNOWN' && /not (currently )?recorded/i.test(scoped));
      if (!restrictionShown) {
        appendLines.push(`- ${siteName}${launchLabel}: ${v.text}`);
      }
    }
  }

  let result = text;
  if (correctionLines.length > 0) {
    result =
      "**Correction — the club's computed eligibility verdict (authoritative):**\n" +
      correctionLines.join('\n') +
      '\n\nIf any statement below conflicts with this verdict, the verdict above is correct. Please contact a club safety officer with any questions.\n\n---\n\n' +
      result;
  }
  if (appendLines.length > 0) {
    result += '\n\n**Computed eligibility (authoritative):**\n' + appendLines.join('\n');
  }
  return result;
}
