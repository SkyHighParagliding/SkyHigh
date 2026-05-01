type InvalidateFn = () => void;

let _invalidateFn: InvalidateFn | null = null;

export function registerSearchCacheInvalidator(fn: InvalidateFn) {
  _invalidateFn = fn;
}

export function invalidateSearchCaches() {
  if (_invalidateFn) _invalidateFn();
}
