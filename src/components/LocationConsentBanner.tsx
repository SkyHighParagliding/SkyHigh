import { useState, useEffect } from "react";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getLocationConsent, setLocationConsent, requestBrowserLocation } from "@/lib/cachedLocation";

export function LocationConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (getLocationConsent() === null) {
      const timer = setTimeout(() => setVisible(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  if (!visible) return null;

  const handleAllow = () => {
    setLocationConsent("granted");
    setVisible(false);
    requestBrowserLocation(() => {}, () => {});
  };

  const handleDecline = () => {
    setLocationConsent("declined");
    setVisible(false);
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[9999] mx-auto max-w-md animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="rounded-xl border border-border bg-card p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-sky/10 p-2 shrink-0">
            <MapPin className="w-5 h-5 text-sky" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              Allow location access?
            </p>
            <p className="text-xs text-muted mt-1">
              Used for nearby sites, emergency info, and check-ins.
              Without it, some features won't work.
            </p>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={handleAllow}>
                Allow
              </Button>
              <Button size="sm" variant="outline" onClick={handleDecline}>
                No thanks
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
