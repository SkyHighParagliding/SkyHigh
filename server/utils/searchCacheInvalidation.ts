type InvalidateFn = () => void;

let _invalidateFn: InvalidateFn | null = null;

export function registerSearchCacheInvalidator(fn: InvalidateFn) {
  _invalidateFn = fn;
}

// Same name as routes/search.ts on purpose: this is the registry dispatcher,
// that is the real cache-clearer registered into it. The indirection lets modules
// invalidate the search caches without importing (and cycling through) search.ts.
// fallow-ignore-next-line duplicate-export
export function invalidateSearchCaches() {
  if (_invalidateFn) _invalidateFn();
}
