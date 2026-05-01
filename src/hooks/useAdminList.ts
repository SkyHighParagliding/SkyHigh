import { useState, useCallback, useMemo } from "react";
import { toast } from "sonner";

interface UseAdminListOptions<T> {
  items: T[];
  filterFn: (item: T, searchTerm: string) => boolean;
  deleteFn?: (item: T) => Promise<void>;
  deleteLabel?: string;
}

export function useAdminList<T extends { id: string }>({
  items,
  filterFn,
  deleteFn,
  deleteLabel = "Item",
}: UseAdminListOptions<T>) {
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<T | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    if (!search) return items;
    const term = search.toLowerCase();
    return items.filter((item) => filterFn(item, term));
  }, [items, search, filterFn]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget || !deleteFn) return;
    setDeleteError("");
    setDeleting(true);
    try {
      await deleteFn(deleteTarget);
      setDeleteTarget(null);
      toast.success(`${deleteLabel} deleted`);
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : `Failed to delete ${deleteLabel.toLowerCase()}`);
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, deleteFn, deleteLabel]);

  const openDelete = useCallback((item: T) => {
    setDeleteTarget(item);
    setDeleteError("");
  }, []);

  return {
    search,
    setSearch,
    filtered,
    deleteTarget,
    setDeleteTarget,
    deleteError,
    deleting,
    confirmDelete,
    openDelete,
  };
}
