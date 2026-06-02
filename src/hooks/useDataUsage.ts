import { useState, useEffect, useRef, useCallback } from "react";
import { getDemoRole } from "@/lib/demoConfig";

interface DataUsageStats {
  totalUp: number;
  totalDown: number;
  rateUp: number;
  rateDown: number;
}

export interface PhoneDataUsage {
  role: string;
  totalUp: number;
  totalDown: number;
  rateUp: number;
  rateDown: number;
}

const globalTracker = {
  totalUp: 0,
  totalDown: 0,
  listeners: new Set<() => void>(),
  history: [] as { ts: number; up: number; down: number }[],
  installed: false,
  broadcasting: false,
  broadcastInterval: undefined as ReturnType<typeof setInterval> | undefined,
};

function notifyListeners() {
  globalTracker.listeners.forEach((fn) => fn());
}

function recordBytes(up: number, down: number) {
  globalTracker.totalUp += up;
  globalTracker.totalDown += down;
  globalTracker.history.push({ ts: Date.now(), up: globalTracker.totalUp, down: globalTracker.totalDown });
  if (globalTracker.history.length > 120) globalTracker.history.shift();
  notifyListeners();
}

export function trackSSEMessage(data: string) {
  recordBytes(0, new Blob([data]).size);
}

function installFetchInterceptor() {
  if (globalTracker.installed) return;
  globalTracker.installed = true;

  const originalFetch = window.fetch;
  window.fetch = async function (...args: Parameters<typeof fetch>) {
    const [input, init] = args;
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;

    if (!url.startsWith("/api/")) {
      return originalFetch.apply(this, args);
    }

    let reqSize = 0;
    if (init?.body) {
      if (typeof init.body === "string") {
        reqSize = new Blob([init.body]).size;
      } else if (init.body instanceof Blob) {
        reqSize = init.body.size;
      } else if (init.body instanceof ArrayBuffer) {
        reqSize = init.body.byteLength;
      } else {
        reqSize = 200;
      }
    }
    reqSize += url.length + 200;

    const response = await originalFetch.apply(this, args);

    const cl = response.headers.get("content-length");
    if (cl) {
      recordBytes(reqSize, parseInt(cl, 10));
    } else {
      const clone = response.clone();
      clone.text().then((text) => {
        recordBytes(reqSize, new Blob([text]).size);
      }).catch(() => {
        recordBytes(reqSize, 100);
      });
    }

    return response;
  };
}

function computeRate(history: typeof globalTracker.history, windowSec: number) {
  const now = Date.now();
  const cutoff = now - windowSec * 1000;
  const recent = history.filter((h) => h.ts >= cutoff);
  if (recent.length < 2) return { up: 0, down: 0 };
  const first = recent[0];
  const last = recent[recent.length - 1];
  const elapsed = (last.ts - first.ts) / 1000;
  if (elapsed < 1) return { up: 0, down: 0 };
  return {
    up: (last.up - first.up) / elapsed,
    down: (last.down - first.down) / elapsed,
  };
}

function startBroadcasting() {
  if (globalTracker.broadcasting) return;

  const role = getDemoRole();
  if (!role || window === window.parent) return;

  globalTracker.broadcasting = true;

  globalTracker.broadcastInterval = setInterval(() => {
    const rate = computeRate(globalTracker.history, 30);
    try {
      window.parent.postMessage({
        type: 'demo-data-usage',
        role,
        totalUp: globalTracker.totalUp,
        totalDown: globalTracker.totalDown,
        rateUp: rate.up,
        rateDown: rate.down,
      }, '*');
    } catch {}
  }, 2000);
}

export function stopBroadcasting() {
  if (globalTracker.broadcastInterval) {
    clearInterval(globalTracker.broadcastInterval);
    globalTracker.broadcastInterval = undefined;
  }
  globalTracker.broadcasting = false;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function formatRate(bytesPerSec: number): string {
  if (bytesPerSec < 100) return `${Math.round(bytesPerSec)}B/s`;
  return `${(bytesPerSec / 1024).toFixed(1)}KB/s`;
}

export function useDataUsage(): DataUsageStats {
  installFetchInterceptor();
  startBroadcasting();

  const [stats, setStats] = useState<DataUsageStats>({
    totalUp: 0,
    totalDown: 0,
    rateUp: 0,
    rateDown: 0,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const update = useCallback(() => {
    const rate = computeRate(globalTracker.history, 30);
    setStats({
      totalUp: globalTracker.totalUp,
      totalDown: globalTracker.totalDown,
      rateUp: rate.up,
      rateDown: rate.down,
    });
  }, []);

  useEffect(() => {
    globalTracker.listeners.add(update);
    intervalRef.current = setInterval(update, 10000);
    return () => {
      globalTracker.listeners.delete(update);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [update]);

  return stats;
}

export function usePerPhoneDataUsage(): Record<string, PhoneDataUsage> {
  const [phoneStats, setPhoneStats] = useState<Record<string, PhoneDataUsage>>({});

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.type === 'demo-data-usage' && msg.role) {
        setPhoneStats(prev => ({
          ...prev,
          [msg.role]: {
            role: msg.role,
            totalUp: msg.totalUp || 0,
            totalDown: msg.totalDown || 0,
            rateUp: msg.rateUp || 0,
            rateDown: msg.rateDown || 0,
          },
        }));
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return phoneStats;
}
