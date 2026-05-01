import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function usePageView() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;
    fetch("/api/pageviews/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    }).catch(() => {});
  }, [location.pathname]);
}
