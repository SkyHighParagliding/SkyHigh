import { useState, useCallback, useRef } from 'react';

const THRESHOLD_OPTIONS = [50, 100, 150, 200, 250] as const;
const ALERT_BEEP_FREQ = 880;
const ALERT_BEEP_DURATION = 0.15;
let audioCtx: AudioContext | null = null;

function playProximityBeep() {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.value = ALERT_BEEP_FREQ;
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + ALERT_BEEP_DURATION);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + ALERT_BEEP_DURATION);
  } catch {}
}

function triggerHaptic() {
  try {
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
  } catch {}
}

function getStoredThreshold(pilotId: string | null): number {
  const key = pilotId ? `airspace_threshold_${pilotId}` : 'airspace_threshold_guest';
  const stored = localStorage.getItem(key);
  if (stored) {
    const val = Number(stored);
    if (THRESHOLD_OPTIONS.includes(val as typeof THRESHOLD_OPTIONS[number])) return val;
  }
  return 250;
}

function storeThreshold(pilotId: string | null, value: number): void {
  const key = pilotId ? `airspace_threshold_${pilotId}` : 'airspace_threshold_guest';
  localStorage.setItem(key, String(value));
}

export { THRESHOLD_OPTIONS };

export function useProximityAlerts(pilotId: string | null) {
  const [proximityThresholdFt, setProximityThresholdFt] = useState(() => getStoredThreshold(pilotId));
  const proximityAlertCooldownRef = useRef(false);
  const [dismissedSectorIds, setDismissedSectorIds] = useState<Set<string>>(new Set());
  const [activeProximityIds, setActiveProximityIds] = useState<Set<string>>(new Set());
  const [alertsDismissed, setAlertsDismissed] = useState(false);

  const cycleThreshold = useCallback(() => {
    setProximityThresholdFt(prev => {
      const idx = THRESHOLD_OPTIONS.indexOf(prev as typeof THRESHOLD_OPTIONS[number]);
      const next = THRESHOLD_OPTIONS[(idx + 1) % THRESHOLD_OPTIONS.length];
      storeThreshold(pilotId, next);
      return next;
    });
  }, [pilotId]);

  const handleProximityEnter = useCallback(() => {
    if (proximityAlertCooldownRef.current || alertsDismissed) return;
    proximityAlertCooldownRef.current = true;
    playProximityBeep();
    triggerHaptic();
    setTimeout(() => { proximityAlertCooldownRef.current = false; }, 5000);
  }, [alertsDismissed]);

  const handleProximityExit = useCallback(() => {
    proximityAlertCooldownRef.current = false;
  }, []);

  const prevProxIdsRef = useRef<Set<string>>(new Set());
  const handleActiveProximityIds = useCallback((ids: Set<string>) => {
    const prev = prevProxIdsRef.current;
    if (ids.size === prev.size && [...ids].every(id => prev.has(id))) return;
    prevProxIdsRef.current = ids;
    setActiveProximityIds(ids);
    if (!alertsDismissed) return;
    if (ids.size === 0) {
      setAlertsDismissed(false);
      setDismissedSectorIds(new Set());
    } else {
      setDismissedSectorIds(prevDismissed => {
        const next = new Set<string>();
        for (const id of prevDismissed) {
          if (ids.has(id)) next.add(id);
        }
        if (next.size === 0) {
          setAlertsDismissed(false);
        }
        return next;
      });
    }
  }, [alertsDismissed]);

  const handleDismissAlerts = useCallback(() => {
    setAlertsDismissed(true);
    setDismissedSectorIds(new Set(activeProximityIds));
    proximityAlertCooldownRef.current = false;
  }, [activeProximityIds]);

  return {
    proximityThresholdFt,
    dismissedSectorIds,
    activeProximityIds,
    alertsDismissed,
    cycleThreshold,
    handleProximityEnter,
    handleProximityExit,
    handleActiveProximityIds,
    handleDismissAlerts,
    setAlertsDismissed,
    setDismissedSectorIds,
  };
}
