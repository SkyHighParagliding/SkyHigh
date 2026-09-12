import type { GridRequest, ModelFamily, ProviderResult, SourceId, Variable } from "../types.js";

/**
 * A source of gridded forecast data.
 *
 * Contract:
 *  - `fetch` returns only the points it could supply. Returning a partial
 *    result is normal and expected — the orchestrator asks the next tier for
 *    whatever is missing. Throw only on total failure (auth, network, parse).
 *  - Implementations must respect `req.signal` and must not retry a 429
 *    internally; surface it so the orchestrator can escalate tiers immediately.
 */
export interface GridProvider {
  readonly id: SourceId;
  /** Lower is preferred. The registry is sorted by this. */
  readonly tier: number;
  /** Sources sharing a family mix seamlessly; crossing families shows a seam. */
  readonly modelFamily: ModelFamily;
  /** Human-readable, shown in the admin panel. */
  readonly label: string;
  /** Native grid spacing in degrees, for provenance reporting. */
  readonly resolutionDeg: number;

  supports(variable: Variable): boolean;

  /** Cheap liveness probe. Should not count meaningfully against any quota. */
  available(): Promise<boolean>;

  fetch(req: GridRequest): Promise<ProviderResult>;
}
