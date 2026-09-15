/**
 * Shared S3 read primitives for the Open-Meteo .om providers.
 *
 * Extracted from openMeteoS3.ts so that both openMeteoS3.ts and
 * ecmwfLiftedIndex.ts can share the same concurrency/retry discipline and
 * HTTP reader tuning without forming an import cycle between the two
 * provider modules. This is a leaf module — it imports nothing from the
 * providers.
 *
 * Constraints established empirically in spike/prove.mjs:
 *  - S3 returns SlowDown throttling under burst traffic; bounded retry handles this.
 *  - Parallelism P≈20 is safe without triggering SlowDown under normal load.
 */

/** Bounded parallelism for row-by-row reads. The spike found P=20 is safe
 *  without triggering S3 SlowDown. */
export const READ_PARALLELISM = 20;

/** HTTP reader tuning, matching the spike. */
export const IO_SIZE_MAX  = BigInt(512 * 1024); // 512 KB per HTTP range request
export const IO_SIZE_MERGE = BigInt(128 * 1024); // merge adjacent chunks within 128 KB

/** Bounded-concurrency limiter shared by the .om providers. */
export function makeSemaphore(limit: number) {
  let running = 0;
  const queue: Array<() => void> = [];

  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (running >= limit) {
      await new Promise<void>(resolve => queue.push(resolve));
    }
    running++;
    try {
      return await fn();
    } finally {
      running--;
      queue.shift()?.();
    }
  };
}

/** Retries fn up to maxAttempts when S3 returns a SlowDown error.
 *  Uses exponential backoff with jitter. Does NOT retry on AbortError. */
export async function withSlowDownRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 4,
): Promise<T> {
  let delay = 500;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if ((err as { name?: string }).name === "AbortError") throw err;
      if (!msg.includes("SlowDown") || attempt === maxAttempts) throw err;
      await new Promise(r => setTimeout(r, delay + Math.random() * 200));
      delay *= 2;
    }
  }
  // TypeScript: unreachable, but satisfies exhaustive flow
  throw new Error("withSlowDownRetry: exhausted");
}
