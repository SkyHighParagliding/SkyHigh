export interface Paired<T> {
  /** Earliest capture time in the group (epoch ms). */
  ts: number;
  frames: Record<string, T>;
}

/**
 * Groups images from different cameras whose capture times are within
 * toleranceMs of the group's first image (the operator's own pairing tolerance
 * is 60 s; cadence is ~6 min, so there is no ambiguity). Each camera appears at
 * most once per group, so a late-arriving image simply joins its group.
 */
export function pairByTime<T extends { camera: string; ts: number }>(items: T[], toleranceMs = 90_000): Paired<T>[] {
  const sorted = [...items].sort((a, b) => a.ts - b.ts);
  const groups: Paired<T>[] = [];
  for (const it of sorted) {
    let target: Paired<T> | undefined;
    for (let i = groups.length - 1; i >= 0 && it.ts - groups[i].ts <= toleranceMs; i--) {
      if (!groups[i].frames[it.camera]) { target = groups[i]; break; }
    }
    if (target) target.frames[it.camera] = it;
    else groups.push({ ts: it.ts, frames: { [it.camera]: it } });
  }
  return groups;
}
