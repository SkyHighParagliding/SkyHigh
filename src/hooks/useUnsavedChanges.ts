import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

interface BlockerState {
  state: "idle" | "blocked";
  proceed: () => void;
  reset: () => void;
}

export function useUnsavedChanges() {
  const [isDirty, setIsDirty] = useState(false);
  const savedRef = useRef(false);
  const dirtyRef = useRef(false);
  const blockingRef = useRef(false);
  const [blockerState, setBlockerState] = useState<BlockerState>({
    state: "idle",
    proceed: () => {},
    reset: () => {},
  });
  const location = useLocation();
  const navigate = useNavigate();
  const pendingPath = useRef<string | null>(null);
  const locationRef = useRef(location.pathname);

  dirtyRef.current = isDirty;
  locationRef.current = location.pathname;

  const markDirty = useCallback(() => {
    if (!savedRef.current) {
      setIsDirty(true);
    }
  }, []);

  const markClean = useCallback(() => {
    setIsDirty(false);
    savedRef.current = true;
    setTimeout(() => { savedRef.current = false; }, 500);
  }, []);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  useEffect(() => {
    const origPushState = history.pushState.bind(history);
    const origReplaceState = history.replaceState.bind(history);

    const intercept = (original: typeof history.pushState, args: Parameters<typeof history.pushState>) => {
      if (!dirtyRef.current || blockingRef.current) {
        return original(...args);
      }

      const url = args[2];
      if (!url) return original(...args);

      const newPath = typeof url === "string" ? (url.startsWith("http") ? new URL(url).pathname : url) : url.toString();
      if (newPath === locationRef.current) return original(...args);

      blockingRef.current = true;
      pendingPath.current = newPath;
      setBlockerState({
        state: "blocked",
        proceed: () => {
          setIsDirty(false);
          blockingRef.current = false;
          setBlockerState(prev => ({ ...prev, state: "idle" }));
          const path = pendingPath.current;
          pendingPath.current = null;
          if (path) {
            setTimeout(() => navigate(path), 0);
          }
        },
        reset: () => {
          blockingRef.current = false;
          pendingPath.current = null;
          setBlockerState(prev => ({ ...prev, state: "idle" }));
        },
      });
    };

    history.pushState = function (...args: Parameters<typeof history.pushState>) {
      intercept(origPushState, args);
    } as typeof history.pushState;

    history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
      if (!dirtyRef.current || blockingRef.current) {
        return origReplaceState(...args);
      }
      const url = args[2];
      if (!url) return origReplaceState(...args);
      const newPath = typeof url === "string" ? (url.startsWith("http") ? new URL(url).pathname : url) : url.toString();
      if (newPath === locationRef.current) return origReplaceState(...args);
      intercept(origPushState, args);
    } as typeof history.replaceState;

    return () => {
      history.pushState = origPushState;
      history.replaceState = origReplaceState;
    };
  }, [navigate]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!dirtyRef.current || blockingRef.current) return;

      const target = e.target as Element;
      if (!target?.closest) return;
      const anchor = target.closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("#") || anchor.target === "_blank") return;

      if (href !== locationRef.current) {
        e.preventDefault();
        e.stopPropagation();
        blockingRef.current = true;
        pendingPath.current = href;
        setBlockerState({
          state: "blocked",
          proceed: () => {
            setIsDirty(false);
            blockingRef.current = false;
            setBlockerState(prev => ({ ...prev, state: "idle" }));
            const path = pendingPath.current;
            pendingPath.current = null;
            if (path) {
              setTimeout(() => navigate(path), 0);
            }
          },
          reset: () => {
            blockingRef.current = false;
            pendingPath.current = null;
            setBlockerState(prev => ({ ...prev, state: "idle" }));
          },
        });
      }
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [navigate]);

  useEffect(() => {
    if (!isDirty) return;

    const handlePopState = () => {
      window.history.pushState(null, "", locationRef.current);
      blockingRef.current = true;
      pendingPath.current = "__back__";
      setBlockerState({
        state: "blocked",
        proceed: () => {
          setIsDirty(false);
          blockingRef.current = false;
          setBlockerState(prev => ({ ...prev, state: "idle" }));
          pendingPath.current = null;
          window.history.back();
        },
        reset: () => {
          blockingRef.current = false;
          pendingPath.current = null;
          setBlockerState(prev => ({ ...prev, state: "idle" }));
        },
      });
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isDirty]);

  return { isDirty, markDirty, markClean, blocker: blockerState };
}
