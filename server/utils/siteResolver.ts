/**
 * siteResolver.ts
 *
 * Centralised site-name resolution for the AI Smart Search assistant.
 *
 * Problems solved:
 *   - Silent substitution: "Bells Beach Winkipop" was silently answered with
 *     "Bells Beach - Southside" data because the orchestrator used naive substring.
 *   - Failed lookups: typos like "Fowlerdale" (Flowerdale) returned nothing.
 *   - Mismatched markdown links: site A's name linked to site B's /sites/<id>.
 *
 * Public API
 * ----------
 *   resolveSiteNames(queryText, sites)  → SiteResolution
 *   buildFuzzyDirective(fuzzy)          → string (prompt injection)
 *   validateSiteLinks(responseText, sites) → string (corrected markdown)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolvableSite {
  id: string;
  name: string;
  aliases?: string | null;
}

export interface SiteResolution {
  /** Confident matches — name, id, parenthetical, or alias hit. Safe to use directly. */
  exact: ResolvableSite[];
  /** Near-miss matches — MUST be confirmed with the user before use. */
  fuzzy: { site: ResolvableSite; matchedText: string }[];
}

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

/**
 * Normalise a string for comparison:
 *   - lower-case
 *   - en-dash / em-dash → space
 *   - strip diacritics (NFD + remove combining marks)
 *   - curly apostrophes / straight apostrophes → removed (not kept as spaces)
 *   - strip remaining punctuation except spaces
 *   - collapse whitespace
 */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[–—]/g, " ")          // en-dash, em-dash → space
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/['‘’ʼ]/g, "") // apostrophes → removed
    .replace(/[^a-z0-9 ]/g, " ")    // punctuation → space
    .replace(/\s+/g, " ")
    .trim();
}

/** Split a normalised string into tokens. */
function tokens(s: string): string[] {
  return s.split(" ").filter(Boolean);
}

// ---------------------------------------------------------------------------
// Stop tokens — individually insufficient as sole match evidence
// ---------------------------------------------------------------------------

const STOP_TOKENS = new Set([
  "mount", "mt", "beach", "bay", "hill", "point", "road",
  "lookout", "the", "lake", "river", "creek", "inlet", "head", "heads",
  "north", "south", "east", "west", "upper", "lower", "old",
]);

function isStopToken(t: string): boolean {
  return STOP_TOKENS.has(t);
}

/**
 * Common English query words that must never fuzzy-match a site-name token.
 * Real incident: "there" is Damerau-Levenshtein distance 1 from "three"
 * (Three Sisters), causing a spurious "Did you mean…?" clarification.
 * These words are only excluded from the FUZZY pass — exact phrase matches
 * are unaffected.
 */
const COMMON_QUERY_WORDS = new Set([
  "about", "above", "after", "again", "along", "anyone", "anywhere", "been",
  "before", "best", "better", "both", "cannot", "check", "close", "conditions",
  "could", "does", "down", "during", "early", "every", "flyable", "flying",
  "forecast", "from", "getting", "going", "good", "have", "here", "hours",
  "into", "just", "know", "late", "like", "list", "looking", "make", "many",
  "monday", "more", "morning", "most", "much", "near", "need", "next", "only",
  "open", "over", "place", "please", "rating", "ratings", "safe", "saturday",
  "should", "site", "sites", "some", "soon", "still", "such", "sunday",
  "supervised", "supervision", "sure", "take", "tell", "than", "thanks",
  "that", "their", "them", "then", "there", "these", "they", "think", "this",
  "those", "thursday", "time", "today", "tomorrow", "tonight", "tuesday",
  "unsupervised", "until", "want", "weather", "wednesday", "week", "weekend",
  "weeks", "went", "were", "what", "when", "where", "which", "while", "will",
  "wind", "winds", "with", "would", "your", "friday", "afternoon", "evening",
]);

// ---------------------------------------------------------------------------
// Damerau-Levenshtein distance (optimal string alignment)
// ---------------------------------------------------------------------------

function dl(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;

  // d[i][j] = edit distance between a[0..i-1] and b[0..j-1]
  const d: number[][] = Array.from({ length: la + 1 }, (_, i) =>
    Array.from({ length: lb + 1 }, (__, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,      // deletion
        d[i][j - 1] + 1,      // insertion
        d[i - 1][j - 1] + cost // substitution
      );
      // transposition
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost);
      }
    }
  }
  return d[la][lb];
}

/** Max edit distance allowed for a token of the given length. */
function maxDist(len: number): number {
  if (len < 4) return 0;
  if (len <= 6) return 1;
  return 2;
}

// ---------------------------------------------------------------------------
// Per-site derived data
// ---------------------------------------------------------------------------

interface SiteData {
  site: ResolvableSite;
  normName: string;          // normalised full name
  normId: string;            // id with dashes → spaces, normalised
  parenthetical: string;     // content inside "(…)", e.g. "flowerdale"
  baseName: string;          // name before first "(", e.g. "three sisters"
  aliasList: string[];       // normalised alias strings (each is a multi-word phrase)
  aliasTokens: string[];     // all individual tokens from all aliases
  distinctiveTokens: string[];// site name + alias tokens, non-stop, len >= 4
}

function buildSiteData(site: ResolvableSite): SiteData {
  const normName = norm(site.name);
  const normId = norm(site.id.replace(/-/g, " "));

  // parenthetical: text inside first (…)
  const parenMatch = site.name.match(/\(([^)]+)\)/);
  const parenthetical = parenMatch ? norm(parenMatch[1]) : "";

  // base name: before first "(" or "–" or "-" in the original name
  const baseMatch = site.name.match(/^([^(–\-]+)/);
  const baseName = baseMatch ? norm(baseMatch[1].trim()) : normName;

  // aliases
  const rawAliases = (site.aliases ?? "")
    .split(";")
    .map((a) => a.trim())
    .filter(Boolean);
  const aliasList = rawAliases.map(norm);
  const aliasTokens = aliasList.flatMap(tokens);

  // distinctive tokens: from name + aliases, non-stop, len >= 4
  const allNameTokens = tokens(normName).concat(tokens(normId));
  const distinctiveTokens = Array.from(
    new Set([...allNameTokens, ...aliasTokens].filter((t) => t.length >= 4 && !isStopToken(t)))
  );

  return { site, normName, normId, parenthetical, baseName, aliasList, aliasTokens, distinctiveTokens };
}

// ---------------------------------------------------------------------------
// Generic text "contains" — does haystack contain needle as a contiguous run?
// ---------------------------------------------------------------------------
function contains(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return haystack.includes(needle);
}

// ---------------------------------------------------------------------------
// resolveSiteNames
// ---------------------------------------------------------------------------

/**
 * Resolve site name references in a free-text query.
 *
 * EXACT tier  — returned in `.exact`; safe to use without user confirmation.
 * FUZZY tier  — returned in `.fuzzy`; MUST be confirmed with the user.
 *
 * When multiple sites would match as exact, all are returned (multi-site query).
 * Specificity: a more-specific match (longer alias/name) takes priority over a
 * shorter incidental substring hit — see Winkipop vs Southside example.
 */
export function resolveSiteNames(
  queryText: string,
  sites: ResolvableSite[]
): SiteResolution {
  // DoS guard: the public endpoint is unauthenticated; clamp attacker-controlled
  // input before running O(n·m) edit-distance work across every site token.
  const normQuery = norm(String(queryText ?? "").slice(0, 1500));
  const queryToks = tokens(normQuery);

  const allData = sites.map(buildSiteData);

  const exactSet = new Set<string>(); // site ids (post-dedup)
  /** Sites that had ANY exact-tier textual hit pre-dedup — excluded from fuzzy even if deduped. */
  const hadExactHit = new Set<string>();
  const fuzzySet = new Set<string>();

  const exact: ResolvableSite[] = [];
  const fuzzy: { site: ResolvableSite; matchedText: string }[] = [];

  // -------------------------------------------------------------------------
  // EXACT pass — check each site for a confident hit in the query
  // -------------------------------------------------------------------------
  for (const sd of allData) {
    // 1. Full normalised name is a substring of query
    if (sd.normName && contains(normQuery, sd.normName)) {
      exactSet.add(sd.site.id);
      hadExactHit.add(sd.site.id);
      continue;
    }
    // 2. Normalised id (dashes → spaces) is a substring of query
    if (sd.normId && contains(normQuery, sd.normId)) {
      exactSet.add(sd.site.id);
      hadExactHit.add(sd.site.id);
      continue;
    }
    // 3. Base name (before parenthetical) is a substring — only if non-trivial (>= 2 non-stop tokens)
    if (sd.baseName) {
      const baseToks = tokens(sd.baseName);
      const nonStop = baseToks.filter((t) => !isStopToken(t));
      if (nonStop.length >= 2 && contains(normQuery, sd.baseName)) {
        exactSet.add(sd.site.id);
        hadExactHit.add(sd.site.id);
        continue;
      }
      // single-token base that is non-stop and long enough
      if (nonStop.length === 1 && nonStop[0].length >= 5 && contains(normQuery, sd.baseName)) {
        exactSet.add(sd.site.id);
        hadExactHit.add(sd.site.id);
        continue;
      }
    }
    // 4. Parenthetical content is a substring — only if non-stop and substantial
    if (sd.parenthetical) {
      const parToks = tokens(sd.parenthetical);
      const nonStopPar = parToks.filter((t) => !isStopToken(t));
      if (nonStopPar.length >= 1 && nonStopPar[0].length >= 4 && contains(normQuery, sd.parenthetical)) {
        exactSet.add(sd.site.id);
        hadExactHit.add(sd.site.id);
        continue;
      }
    }
    // 5. Any alias phrase is a substring of query (or query contains alias)
    let aliasHit = false;
    for (const alias of sd.aliasList) {
      const aliasToks = tokens(alias);
      const nonStop = aliasToks.filter((t) => !isStopToken(t));
      if (nonStop.length === 0) continue;
      // For single-token aliases require length >= 4
      if (nonStop.length === 1 && nonStop[0].length < 4) continue;
      if (contains(normQuery, alias)) {
        exactSet.add(sd.site.id);
        hadExactHit.add(sd.site.id);
        aliasHit = true;
        break;
      }
    }
    if (aliasHit) continue;
  }

  // -------------------------------------------------------------------------
  // SPECIFICITY de-dup: if a more-specific site subsumes a less-specific one
  // (e.g. "bells beach winkipop" matches both bells-beach and bells-beach-winkipop),
  // keep only the most specific (longest normName that matched).
  // -------------------------------------------------------------------------
  if (exactSet.size > 1) {
    // Build candidate list with their match lengths
    const candidates = allData
      .filter((sd) => exactSet.has(sd.site.id))
      .map((sd) => ({
        sd,
        // score = length of the longest matching phrase in the query
        score: Math.max(
          contains(normQuery, sd.normName) ? sd.normName.length : 0,
          contains(normQuery, sd.normId) ? sd.normId.length : 0,
          contains(normQuery, sd.baseName) ? sd.baseName.length : 0,
          contains(normQuery, sd.parenthetical) ? sd.parenthetical.length : 0,
          ...sd.aliasList.map((a) => (contains(normQuery, a) ? a.length : 0)),
        ),
      }))
      .sort((a, b) => b.score - a.score);

    // Remove any candidate whose full normName is a substring of a better candidate's normName
    // (e.g. "bells beach" ⊂ "bells beach winkipop" → remove bells-beach)
    const kept = new Set<string>();
    for (const { sd } of candidates) {
      const dominated = candidates.some(
        (other) =>
          other.sd.site.id !== sd.site.id &&
          kept.has(other.sd.site.id) &&
          (contains(other.sd.normName, sd.normName) ||
            contains(other.sd.normId, sd.normId))
      );
      if (!dominated) kept.add(sd.site.id);
    }
    // Rebuild exactSet with only kept
    for (const id of Array.from(exactSet)) {
      if (!kept.has(id)) exactSet.delete(id);
    }
  }

  for (const sd of allData) {
    if (exactSet.has(sd.site.id)) exact.push(sd.site);
  }

  // -------------------------------------------------------------------------
  // FUZZY pass — only for sites not already exact AND that had no exact-tier
  // textual hit at all (deduped-out sites like "Bells Beach" when "Bells Beach
  // Winkipop" is present should not re-appear as fuzzy)
  // -------------------------------------------------------------------------
  for (const sd of allData) {
    if (exactSet.has(sd.site.id)) continue;
    if (hadExactHit.has(sd.site.id)) continue;

    let bestMatchText = "";
    let hasNonStopFuzzy = false;

    for (const siteTok of sd.distinctiveTokens) {
      const threshold = maxDist(siteTok.length);
      if (threshold === 0) continue; // len < 4, skip

      for (const qTok of queryToks) {
        if (qTok.length < 4 || qTok.length > 40) continue; // >40: no real site token is that long
        if (COMMON_QUERY_WORDS.has(qTok)) continue;
        const dist = dl(qTok, siteTok);
        if (dist > 0 && dist <= threshold) {
          if (!isStopToken(siteTok) && !isStopToken(qTok)) {
            hasNonStopFuzzy = true;
            if (!bestMatchText) bestMatchText = qTok;
          }
        }
      }
      if (hasNonStopFuzzy) break;
    }

    if (hasNonStopFuzzy && !fuzzySet.has(sd.site.id)) {
      fuzzySet.add(sd.site.id);
      fuzzy.push({ site: sd.site, matchedText: bestMatchText });
    }
  }

  return { exact, fuzzy };
}

// ---------------------------------------------------------------------------
// buildFuzzyDirective
// ---------------------------------------------------------------------------

/**
 * Build a prompt directive instructing the AI to seek confirmation before
 * answering with fuzzy-matched site data. Returns '' when input is empty.
 */
export function buildFuzzyDirective(
  fuzzy: { site: ResolvableSite; matchedText: string }[]
): string {
  if (fuzzy.length === 0) return "";

  const lines = fuzzy
    .map(
      ({ site, matchedText }) =>
        `- Pilot wrote "${matchedText}" — closest known site: ${site.name}. Ask: "Did you mean ${site.name}?"`
    )
    .join("\n");

  return (
    "=== SITE NAME CLARIFICATION REQUIRED ===\n" +
    "The pilot's message appears to reference the following site(s) by an approximate or misspelled name. " +
    "You MUST ask the pilot to confirm before giving site-specific details. " +
    "Do NOT answer as if the match is certain, and do NOT silently substitute a different site.\n" +
    lines +
    "\n=== END CLARIFICATION ==="
  );
}

// ---------------------------------------------------------------------------
// validateSiteLinks
// ---------------------------------------------------------------------------

/** Generic text tokens that are never site names — OK as link text for any site. */
const GENERIC_LINK_TEXT = new Set([
  "site page", "view site", "this site", "here", "the site", "site details",
  "site info", "more info", "more information", "click here", "learn more",
]);

function isGenericLinkText(text: string): boolean {
  return GENERIC_LINK_TEXT.has(norm(text));
}

/**
 * Fix AI-generated markdown links that reference `/sites/<id>` URLs.
 *
 * Rules:
 *   1. If the <id> is a known site and the link text names a DIFFERENT known
 *      site (exact match), replace the URL with the correct site's id.
 *   2. If the <id> is NOT a known site: try resolving link text to a site
 *      (exact only) and fix the URL; otherwise strip the link to plain text.
 *   3. External links and non-/sites/ URLs are left untouched.
 */
export function validateSiteLinks(
  responseText: string,
  sites: ResolvableSite[]
): string {
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const allData = sites.map(buildSiteData);

  /**
   * Try to find a single exact site for `text`. Returns the site or null.
   * Uses exact resolution only (no fuzzy).
   */
  function exactSiteForText(text: string): ResolvableSite | null {
    const { exact } = resolveSiteNames(text, sites);
    return exact.length === 1 ? exact[0] : null;
  }

  /**
   * Does the normalised link text clearly name `site` (or a known alias)?
   * Returns true if the text contains the site's name/alias in a substantial way.
   */
  function textMatchesSite(normText: string, sd: SiteData): boolean {
    if (contains(normText, sd.normName)) return true;
    if (contains(normText, sd.baseName) && tokens(sd.baseName).filter((t) => !isStopToken(t)).length >= 1) return true;
    if (sd.parenthetical && contains(normText, sd.parenthetical)) return true;
    for (const alias of sd.aliasList) {
      if (alias && contains(normText, alias)) return true;
    }
    return false;
  }

  /**
   * Does the link text clearly name a DIFFERENT known site from `currentId`?
   * Returns that site, or null.
   */
  function detectMismatch(linkText: string, currentId: string): ResolvableSite | null {
    const normText = norm(linkText);
    for (const sd of allData) {
      if (sd.site.id === currentId) continue;
      if (textMatchesSite(normText, sd)) return sd.site;
    }
    return null;
  }

  // Match all [text](/sites/<id>) links
  return responseText.replace(
    /\[([^\]]+)\]\(\/sites\/([^)\s]+)\)/g,
    (fullMatch, linkText, siteId) => {
      const normText = norm(linkText);

      if (isGenericLinkText(linkText)) {
        // Generic text — validate the id is real; if not, try to infer or strip
        if (siteById.has(siteId)) return fullMatch; // valid, keep
        // Unknown id with generic text — strip to plain text
        return linkText;
      }

      if (siteById.has(siteId)) {
        // Known id — check for text/id mismatch
        const mismatch = detectMismatch(linkText, siteId);
        if (mismatch) {
          return `[${linkText}](/sites/${mismatch.id})`;
        }
        return fullMatch; // text matches or is neutral — keep
      }

      // Unknown id — try to resolve link text to a site
      const resolved = exactSiteForText(linkText);
      if (resolved) {
        return `[${linkText}](/sites/${resolved.id})`;
      }

      // Unresolvable — strip link, leave plain text
      return linkText;
    }
  );
}

// ---------------------------------------------------------------------------
// Self-test (run: RESOLVER_SELFTEST=1 npx tsx server/utils/siteResolver.ts)
// ---------------------------------------------------------------------------

if (process.env["RESOLVER_SELFTEST"] === "1") {
  const FIXTURE_SITES: ResolvableSite[] = [
    { id: "bells-beach",          name: "Bells Beach - Southside",        aliases: "Southside;Bels Beach" },
    { id: "bells-beach-winkipop", name: "Bells Beach - Winkipop",         aliases: "Winkipop;Winki Pop" },
    // Fowlerdale intentionally omitted from aliases — test 3 verifies fuzzy DL catches it
    { id: "three-sisters-flowerdale", name: "Three Sisters (Flowerdale)", aliases: "Flowerdale;3 Sisters" },
    { id: "flinders-monument",    name: "Flinders Monument",              aliases: "Monument" },
    { id: "flinders-golf-club",   name: "Flinders Golf Club",             aliases: "" },
    { id: "mt-buninyong",         name: "Mt Buninyong",                   aliases: "" },
    { id: "mt-buffalo-reed-s-lookout-paraglider-launch", name: "Mt Buffalo – Reed's Lookout", aliases: "Reeds Lookout;Mt Buffelo" },
  ];

  let pass = 0;
  let fail = 0;

  function assert(label: string, condition: boolean, detail = "") {
    if (condition) {
      console.log(`  ✓ ${label}`);
      pass++;
    } else {
      console.error(`  ✗ FAIL: ${label}${detail ? " — " + detail : ""}`);
      fail++;
    }
  }

  console.log("\n=== siteResolver self-test ===\n");

  // 1. Winkipop query → exact Winkipop only, NOT Southside
  {
    const r = resolveSiteNames("Im PG4, can I fly Bells Beach Winkipop on Saturday?", FIXTURE_SITES);
    assert(
      "Winkipop query — exact contains winkipop",
      r.exact.some((s) => s.id === "bells-beach-winkipop"),
      JSON.stringify(r.exact.map((s) => s.id))
    );
    assert(
      "Winkipop query — exact does NOT contain southside",
      !r.exact.some((s) => s.id === "bells-beach"),
      JSON.stringify(r.exact.map((s) => s.id))
    );
    assert(
      "Winkipop query — fuzzy is empty",
      r.fuzzy.length === 0,
      JSON.stringify(r.fuzzy.map((f) => f.site.id))
    );
  }

  // 2. "flowerdale" → exact Three Sisters
  {
    const r = resolveSiteNames("can I fly at flowerdale", FIXTURE_SITES);
    assert(
      "flowerdale → exact Three Sisters",
      r.exact.some((s) => s.id === "three-sisters-flowerdale"),
      JSON.stringify(r.exact.map((s) => s.id))
    );
  }

  // 3. "Fowlerdale" → fuzzy Three Sisters (not exact)
  {
    const r = resolveSiteNames("Im PG4 can I fly Fowlerdale this week", FIXTURE_SITES);
    assert(
      "Fowlerdale → NOT in exact",
      !r.exact.some((s) => s.id === "three-sisters-flowerdale"),
      "exact: " + JSON.stringify(r.exact.map((s) => s.id))
    );
    assert(
      "Fowlerdale → fuzzy Three Sisters",
      r.fuzzy.some((f) => f.site.id === "three-sisters-flowerdale"),
      "fuzzy: " + JSON.stringify(r.fuzzy.map((f) => f.site.id))
    );
  }

  // 4. "Mt Buffelo Reeds Lookout" → exact via alias
  {
    const r = resolveSiteNames("Im PG5 can I fly Mt Buffelo Reeds Lookout", FIXTURE_SITES);
    assert(
      "Mt Buffelo Reeds Lookout → exact Mt Buffalo",
      r.exact.some((s) => s.id === "mt-buffalo-reed-s-lookout-paraglider-launch"),
      JSON.stringify(r.exact.map((s) => s.id))
    );
  }

  // 5. "ben nevis" → empty (not in fixture)
  {
    const r = resolveSiteNames("can i fly ben nevis", FIXTURE_SITES);
    assert(
      "ben nevis → exact empty",
      r.exact.length === 0,
      JSON.stringify(r.exact.map((s) => s.id))
    );
    assert(
      "ben nevis → fuzzy empty",
      r.fuzzy.length === 0,
      JSON.stringify(r.fuzzy.map((f) => f.site.id))
    );
  }

  // 6. "flinders monument" → exact Flinders Monument only, not Golf Club
  {
    const r = resolveSiteNames("what is the minimum rating for flinders monument", FIXTURE_SITES);
    assert(
      "flinders monument → exact Monument",
      r.exact.some((s) => s.id === "flinders-monument"),
      JSON.stringify(r.exact.map((s) => s.id))
    );
    assert(
      "flinders monument → NOT Golf Club",
      !r.exact.some((s) => s.id === "flinders-golf-club"),
      JSON.stringify(r.exact.map((s) => s.id))
    );
  }

  // 7. validateSiteLinks — mismatched id (Flinders Monument text, golf club id) → corrected
  {
    const input = "[Flinders Monument site page](/sites/flinders-golf-club)";
    const out = validateSiteLinks(input, FIXTURE_SITES);
    assert(
      "validateSiteLinks — mismatched id corrected to /sites/flinders-monument",
      out.includes("/sites/flinders-monument"),
      out
    );
    assert(
      "validateSiteLinks — mismatched id no longer has /sites/flinders-golf-club",
      !out.includes("/sites/flinders-golf-club"),
      out
    );
  }

  // 8. validateSiteLinks — valid pair (Mt Buffalo text + correct id) unchanged
  {
    const input =
      "Please check the [Mt Buffalo – Reed's Lookout](/sites/mt-buffalo-reed-s-lookout-paraglider-launch) site page";
    const out = validateSiteLinks(input, FIXTURE_SITES);
    assert(
      "validateSiteLinks — valid pair unchanged",
      out === input,
      out
    );
  }

  // 8b. Common query words never fuzzy-match site tokens ("there" vs "three")
  {
    const r = resolveSiteNames("So I need PG4 supervision to fly there as a pg3?", FIXTURE_SITES);
    assert(
      "common word 'there' does not fuzzy-match Three Sisters",
      r.fuzzy.length === 0 && r.exact.length === 0,
      JSON.stringify({ exact: r.exact.map((s) => s.id), fuzzy: r.fuzzy.map((f) => f.site.id) })
    );
  }

  // 9. validateSiteLinks — nonexistent id with generic text → unlinked to plain text
  {
    const input = "[View Site](/sites/nonexistent-site)";
    const out = validateSiteLinks(input, FIXTURE_SITES);
    assert(
      "validateSiteLinks — nonexistent id unlinked to plain text",
      out === "View Site",
      out
    );
  }

  console.log(`\n${pass} passed, ${fail} failed.\n`);
  if (fail > 0) process.exit(1);
}
