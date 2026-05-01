import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { useUnsavedChanges } from "./useUnsavedChanges";

interface UseAdminFormOptions {
  successMessage?: string;
}

export function useAdminForm(options: UseAdminFormOptions = {}) {
  const { isDirty, markDirty, markClean, blocker } = useUnsavedChanges();
  const [saving, setSaving] = useState(false);
  const activePromise = useRef<Promise<void> | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  const save = useCallback(
    async (fn: () => Promise<void>) => {
      if (activePromise.current) {
        return activePromise.current;
      }
      setSaveError("");
      setSaving(true);
      const promise = (async () => {
        try {
          await fn();
          markClean();
          setJustSaved(true);
          toast.success(options.successMessage ?? "Saved successfully");
          setTimeout(() => setJustSaved(false), 2000);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Save failed";
          setSaveError(msg);
          toast.error(msg);
          throw err;
        } finally {
          activePromise.current = null;
          setSaving(false);
        }
      })();
      activePromise.current = promise;
      return promise;
    },
    [markClean, options.successMessage],
  );

  return {
    isDirty,
    markDirty,
    markClean,
    blocker,
    saving,
    justSaved,
    saveError,
    setSaveError,
    save,
  };
}
