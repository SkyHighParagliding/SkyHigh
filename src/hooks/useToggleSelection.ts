import { useState } from 'react';

/**
 * Generic Set-based selection hook.
 * Handles toggle-one and toggle-all (clears when all selected, fills otherwise).
 *
 * @template T  Type of the id values stored in the Set.
 */
export function useToggleSelection<T>(initialIds: Iterable<T> = []) {
  const [selectedIds, setSelectedIds] = useState<Set<T>>(new Set(initialIds));

  const toggleId = (id: T) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** Clears selection when all items are selected, otherwise selects all. */
  const toggleSelectAll = (allIds: T[]) => {
    if (selectedIds.size === allIds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
  };

  return { selectedIds, setSelectedIds, toggleId, toggleSelectAll };
}
