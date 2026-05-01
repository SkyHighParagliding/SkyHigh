import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { Square, Play, RotateCcw, Monitor, FastForward, Rewind, Settings, Users, ArrowLeft } from 'lucide-react';
import { DEFAULT_DEMO_SETTINGS, type DemoSettings } from '@/lib/demoSimulation';
import { usePerPhoneDataUsage, formatBytes, formatRate } from '@/hooks/useDataUsage';

type PilotStatus = 'idle' | 'waiting' | 'climbing' | 'thermaling' | 'descending' | 'landed' | 'awaiting retrieval' | 'retrieved';

function statusColor(status: PilotStatus): string {
  switch (status) {
    case 'idle': return 'bg-gray-400';
    case 'waiting': return 'bg-amber-400';
    case 'climbing': return 'bg-green-500';
    case 'thermaling': return 'bg-cyan-500';
    case 'descending': return 'bg-red-500';
    case 'landed': return 'bg-orange-500';
    case 'awaiting retrieval': return 'bg-red-500';
    case 'retrieved': return 'bg-gray-500';
    default: return 'bg-gray-400';
  }
}

function statusLabel(status: PilotStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function RangeInput({ label, unit, min, max, valueMin, valueMax, onChangeMin, onChangeMax }: {
  label: string;
  unit: string;
  min: number;
  max: number;
  valueMin: number;
  valueMax: number;
  onChangeMin: (v: number) => void;
  onChangeMax: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-gray-400 whitespace-nowrap">{label}:</span>
      <input
        type="number"
        min={min}
        max={max}
        value={valueMin}
        onChange={e => onChangeMin(Number(e.target.value))}
        className="w-14 bg-gray-700 text-white rounded px-1.5 py-0.5 text-center border border-gray-600"
      />
      <span className="text-gray-500">–</span>
      <input
        type="number"
        min={min}
        max={max}
        value={valueMax}
        onChange={e => onChangeMax(Number(e.target.value))}
        className="w-14 bg-gray-700 text-white rounded px-1.5 py-0.5 text-center border border-gray-600"
      />
      <span className="text-gray-500">{unit}</span>
    </div>
  );
}

export function XCMapsDemo() {
  const { loading } = useAuth();
  const navigate = useNavigate();
  const { settings: appSettings, loading: settingsLoading } = useSettings();
  useEffect(() => {
    if (!settingsLoading && !appSettings.xcMapsEnabled) {
      navigate("/", { replace: true });
    }
  }, [settingsLoading, appSettings.xcMapsEnabled, navigate]);
  const [pilotCount, setPilotCount] = useState(2);
  const [driverCount, setDriverCount] = useState(2);
  const [dutyCount, setDutyCount] = useState(1);
  const [demoStarted, setDemoStarted] = useState(false);
  const [setupPilots, setSetupPilots] = useState(() => {
    try { return Number(localStorage.getItem('xc-demo-pilots')) || 2; } catch { return 2; }
  });
  const [setupDrivers, setSetupDrivers] = useState(() => {
    try { return Number(localStorage.getItem('xc-demo-drivers')) || 2; } catch { return 2; }
  });
  const [loadedIframes, setLoadedIframes] = useState(0);
  const [pilotStatuses, setPilotStatuses] = useState<Record<string, PilotStatus>>({});
  const [countdown, setCountdown] = useState<Record<string, number | null>>({});
  const [demoSessionId, setDemoSessionId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [demoSpeed, setDemoSpeed] = useState(1);
  const [settings, setSettings] = useState<DemoSettings>(() => {
    try {
      const saved = localStorage.getItem('xc-demo-settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_DEMO_SETTINGS, ...parsed };
      }
    } catch {}
    return { ...DEFAULT_DEMO_SETTINGS };
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showScaleConfig, setShowScaleConfig] = useState(false);
  const landscape = true;
  const phoneData = usePerPhoneDataUsage();
  const [pilotPct, setPilotPct] = useState(50);
  const dividerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const iframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({});
  const countdownTimersRef = useRef<Record<string, ReturnType<typeof setInterval> | null>>({});
  const sessionStartedRef = useRef(false);
  const isRestartingRef = useRef(false);
  const demoStoppedRef = useRef(false);


  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setPilotPct(Math.min(85, Math.max(15, pct)));
    };
    const onMouseUp = () => { dragging.current = false; };
    const onTouchMove = (e: TouchEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.touches[0].clientX - rect.left) / rect.width) * 100;
      setPilotPct(Math.min(85, Math.max(15, pct)));
    };
    const onTouchEnd = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  const startDemoSession = useCallback((pCount?: number, dCount?: number) => {
    if (isRestartingRef.current || demoStoppedRef.current) return;
    isRestartingRef.current = true;
    fetch('/api/demo/session/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pilotCount: pCount || pilotCount, driverCount: dCount || driverCount }),
    })
      .then(r => {
        if (!r.ok) throw new Error(`Server returned ${r.status}`);
        return r.json();
      })
      .then(data => {
        if (data.sessionId) {
          if (data.pilotCount) setPilotCount(data.pilotCount);
          if (data.driverCount) setDriverCount(data.driverCount);
          setDemoSessionId(data.sessionId);
          setSessionError(null);
        } else {
          setSessionError('Failed to start demo session — no session ID returned');
        }
      })
      .catch((err) => {
        sessionStartedRef.current = false;
        setSessionError(err.message || 'Failed to start demo session');
      })
      .finally(() => {
        isRestartingRef.current = false;
      });
  }, [pilotCount, driverCount]);

  const handleStartDemo = useCallback(() => {
    const p = Math.max(1, Math.min(10, setupPilots));
    const d = Math.max(1, Math.min(10, setupDrivers));
    setPilotCount(p);
    setDriverCount(d);
    setDemoStarted(true);
    sessionStartedRef.current = true;
    demoStoppedRef.current = false;
    try {
      localStorage.setItem('xc-demo-pilots', String(p));
      localStorage.setItem('xc-demo-drivers', String(d));
    } catch {}
    startDemoSession(p, d);
  }, [setupPilots, setupDrivers, startDemoSession]);

  const totalIframes = pilotCount + driverCount + dutyCount;

  useEffect(() => {
    if (!demoStarted || !demoSessionId) return;
    if (loadedIframes >= totalIframes) return;
    const timer = setTimeout(() => {
      setLoadedIframes(prev => prev + 1);
    }, loadedIframes === 0 ? 0 : 800);
    return () => clearTimeout(timer);
  }, [demoStarted, demoSessionId, loadedIframes, totalIframes]);

  useEffect(() => {
    return () => {
      Object.values(countdownTimersRef.current).forEach(t => t && clearInterval(t));
    };
  }, []);

  useEffect(() => {
    if (!demoSessionId) return;
    const checkSession = async () => {
      if (demoStoppedRef.current) return;
      try {
        const res = await fetch('/api/demo/session/status', {
          headers: { 'x-demo-session': demoSessionId },
        });
        if (res.status === 410 || res.status === 403) {
          startDemoSession();
        }
      } catch {}
    };
    checkSession();
    const interval = setInterval(checkSession, 10000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoSessionId]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'demo-status') {
        const { role, trackerState, simPhase } = event.data;
        if (role && role.startsWith('pilot')) {
          let status: PilotStatus = 'idle';
          if (trackerState === 'pre-recording') {
            status = simPhase === 'climbing' ? 'climbing' : simPhase === 'descending' ? 'descending' : simPhase === 'thermaling' ? 'thermaling' : 'waiting';
          } else if (trackerState === 'recording') {
            status = simPhase === 'thermaling' ? 'thermaling' : simPhase === 'climbing' ? 'climbing' : simPhase === 'descending' ? 'descending' : simPhase === 'landed' ? 'landed' : 'climbing';
          } else if (trackerState === 'stopping') {
            status = 'landed';
          } else if (trackerState === 'retrieving') {
            status = 'awaiting retrieval';
          } else if (trackerState === 'completed') {
            status = 'retrieved';
          }
          setPilotStatuses(prev => ({ ...prev, [role]: status }));
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const triggerAuto = useCallback((role: string) => {
    const iframe = iframeRefs.current[role];
    if (!iframe?.contentWindow) return;
    if (demoSpeed > 1) {
      iframe.contentWindow.postMessage({ type: 'demo-speed', multiplier: demoSpeed }, '*');
    }
    iframe.contentWindow.postMessage({ type: 'demo-auto' }, '*');

    let remaining = 20;
    setCountdown(prev => ({ ...prev, [role]: remaining }));
    if (countdownTimersRef.current[role]) clearInterval(countdownTimersRef.current[role]!);
    countdownTimersRef.current[role] = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        setCountdown(prev => ({ ...prev, [role]: null }));
        if (countdownTimersRef.current[role]) {
          clearInterval(countdownTimersRef.current[role]!);
          countdownTimersRef.current[role] = null;
        }
      } else {
        setCountdown(prev => ({ ...prev, [role]: remaining }));
      }
    }, 1000);
  }, [demoSpeed]);

  const broadcastSpeed = useCallback((multiplier: number) => {
    Object.values(iframeRefs.current).forEach(ref => {
      ref?.contentWindow?.postMessage({ type: 'demo-speed', multiplier }, '*');
    });
  }, []);

  const broadcastSettings = useCallback((s: DemoSettings) => {
    for (let i = 1; i <= pilotCount; i++) {
      iframeRefs.current[`pilot${i}`]?.contentWindow?.postMessage({ type: 'demo-settings', settings: s }, '*');
    }
  }, [pilotCount]);

  const updateSettings = useCallback((partial: Partial<DemoSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...partial };
      broadcastSettings(updated);
      try { localStorage.setItem('xc-demo-settings', JSON.stringify(updated)); } catch {}
      return updated;
    });
  }, [broadcastSettings]);

  const handleFastForward = useCallback(() => {
    const nextSpeed = demoSpeed >= 64 ? 64 : demoSpeed * 2;
    setDemoSpeed(nextSpeed);
    broadcastSpeed(nextSpeed);
  }, [demoSpeed, broadcastSpeed]);

  const handleRealTime = useCallback(() => {
    setDemoSpeed(1);
    broadcastSpeed(1);
  }, [broadcastSpeed]);

  const launchAll = useCallback(() => {
    for (let i = 1; i <= pilotCount; i++) {
      const role = `pilot${i}`;
      if (!pilotStatuses[role] || pilotStatuses[role] === 'idle') {
        setTimeout(() => triggerAuto(role), (i - 1) * 3000);
      }
    }
  }, [pilotCount, pilotStatuses, triggerAuto]);

  const stopDemo = useCallback(async () => {
    demoStoppedRef.current = true;
    for (let i = 1; i <= pilotCount; i++) {
      iframeRefs.current[`pilot${i}`]?.contentWindow?.postMessage({ type: 'demo-stop' }, '*');
    }
    try {
      await fetch('/api/demo/reset', {
        method: 'POST',
      });
    } catch {}
    setPilotStatuses({});
    setCountdown({});
    setDemoSpeed(1);
    Object.values(countdownTimersRef.current).forEach(t => t && clearInterval(t));
    countdownTimersRef.current = {};
    setTimeout(() => {
      Object.values(iframeRefs.current).forEach(ref => {
        if (ref) ref.src = ref.src;
      });
    }, 500);
  }, [pilotCount]);

  const applyScaleConfig = useCallback(() => {
    setShowScaleConfig(false);
    demoStoppedRef.current = false;
    sessionStartedRef.current = false;
    setDemoSessionId(null);
    setPilotStatuses({});
    setCountdown({});
    setTimeout(() => {
      sessionStartedRef.current = true;
      startDemoSession(pilotCount, driverCount);
    }, 100);
  }, [pilotCount, driverCount, startDemoSession]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-400" />
      </div>
    );
  }

  if (!demoStarted) {
    return (
      <div className="h-screen w-screen bg-gray-900 flex items-center justify-center">
        <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-2xl p-8 w-full max-w-sm">
          <div className="flex items-center gap-3 mb-6">
            <Monitor className="w-6 h-6 text-sky-400" />
            <h1 className="text-white font-bold text-lg">XC Maps Demo</h1>
          </div>
          <p className="text-gray-400 text-sm mb-6">Configure the number of pilot, driver, and duty pilot screens for the simulation.</p>
          <div className="flex flex-col gap-4 mb-6">
            <div>
              <label className="text-gray-300 text-sm font-medium block mb-1"># Pilots</label>
              <input
                type="number"
                min={1}
                max={10}
                value={setupPilots}
                onChange={e => setSetupPilots(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2.5 border border-gray-600 focus:border-sky-500 focus:outline-none text-center text-lg font-semibold"
              />
            </div>
            <div>
              <label className="text-gray-300 text-sm font-medium block mb-1"># Drivers</label>
              <input
                type="number"
                min={1}
                max={10}
                value={setupDrivers}
                onChange={e => setSetupDrivers(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2.5 border border-gray-600 focus:border-sky-500 focus:outline-none text-center text-lg font-semibold"
              />
            </div>
            <div>
              <label className="text-gray-300 text-sm font-medium block mb-1"># Duty Pilots</label>
              <input
                type="number"
                min={0}
                max={1}
                value={dutyCount}
                onChange={e => setDutyCount(Math.max(0, Math.min(1, Number(e.target.value) || 0)))}
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2.5 border border-gray-600 focus:border-sky-500 focus:outline-none text-center text-lg font-semibold"
              />
            </div>
          </div>
          {sessionError && (
            <p className="text-red-400 text-xs mb-4">{sessionError}</p>
          )}
          <button
            onClick={handleStartDemo}
            className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-3 rounded-lg text-sm transition-colors"
          >
            Start Demo
          </button>
          <button
            onClick={() => navigate('/xc/maps')}
            className="w-full mt-2 bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium py-2 rounded-lg text-xs transition-colors"
          >
            Back to XC Maps
          </button>
        </div>
      </div>
    );
  }

  if (!demoSessionId && !sessionError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-400" />
      </div>
    );
  }

  if (sessionError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <p className="text-red-400 text-sm mb-4">{sessionError}</p>
          <button
            onClick={() => {
              setSessionError(null);
              window.location.reload();
            }}
            className="px-4 py-2 bg-sky-500 text-white rounded text-sm hover:bg-sky-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const pilots = Array.from({ length: pilotCount }, (_, i) => i + 1);
  const drivers = Array.from({ length: driverCount }, (_, i) => i + 1);

  const renderPhone = (label: string, role: string, src: string, variant: 'portrait' | 'landscape' | 'tablet' = 'portrait', index: number = 0) => {
    const containerStyle: React.CSSProperties = variant === 'tablet'
      ? {
          height: '380px',
          aspectRatio: '4/3',
        }
      : variant === 'landscape'
      ? {
          height: '280px',
          aspectRatio: '19.5/9',
        }
      : {
          width: '280px',
          aspectRatio: '9/19.5',
        };

    const ready = index < loadedIframes;

    return (
      <div
        key={role}
        className="relative rounded-xl overflow-hidden border-2 border-gray-600 flex-shrink-0"
        style={containerStyle}
      >
        <div className="absolute top-1 left-1 z-10 px-2 py-0.5 bg-black/60 rounded text-[10px] text-white font-medium">
          {label}
        </div>
        {ready ? (
          <iframe
            key={demoSessionId}
            ref={el => { iframeRefs.current[role] = el; }}
            src={src}
            className="w-full h-full border-0"
            style={{ width: '100%', height: '100%' }}
          />
        ) : (
          <div className="w-full h-full bg-gray-800 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sky-400 mx-auto mb-2" />
              <span className="text-gray-500 text-[10px]">Loading...</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-screen w-screen bg-gray-900 flex flex-col overflow-hidden">
      <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <Monitor className="w-5 h-5 text-sky-400" />
          <h1 className="text-white font-bold text-sm">XC Maps Demo</h1>
          <span className="text-gray-400 text-xs">Mt Elliot</span>
          <span className="text-gray-500 text-xs">({pilotCount}P / {driverCount}D{dutyCount > 0 ? ` / ${dutyCount}DP` : ''})</span>
          {Object.keys(phoneData).length > 0 && (
            <div className="flex items-center gap-1">
              {[...pilots.map(i => `pilot${i}`), ...drivers.map(i => `driver${i}`)].map(role => {
                const d = phoneData[role];
                if (!d) return null;
                const isPilot = role.startsWith('pilot');
                const label = isPilot ? `P${role.replace('pilot', '')}` : `D${role.replace('driver', '')}`;
                const total = d.totalUp + d.totalDown;
                const rate = d.rateUp + d.rateDown;
                return (
                  <div
                    key={role}
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] tabular-nums font-mono ${
                      isPilot ? 'bg-orange-900/50 text-orange-300' : 'bg-blue-900/50 text-blue-300'
                    }`}
                  >
                    <span className="font-semibold">{label}</span>
                    <span>{formatBytes(total)}</span>
                    <span className="opacity-50">·</span>
                    <span>{formatRate(rate)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => { stopDemo(); navigate('/', { replace: true }); }}
            className="flex items-center gap-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs font-medium"
            title="Exit demo and return to website"
          >
            <ArrowLeft className="w-3 h-3" /> Exit
          </button>
          <div className="flex items-center gap-1 mr-2 overflow-x-auto max-w-[300px]">
            {pilots.slice(0, 6).map(i => {
              const role = `pilot${i}`;
              return (
                <div key={role} className="flex items-center gap-1">
                  <span className="text-gray-400 text-[10px]">P{i}</span>
                  <div className={`w-2 h-2 rounded-full ${statusColor(pilotStatuses[role] || 'idle')}`} />
                  {countdown[role] != null && (
                    <span className="text-gray-300 text-[10px]">{countdown[role]}s</span>
                  )}
                </div>
              );
            })}
            {pilotCount > 6 && <span className="text-gray-500 text-[10px]">+{pilotCount - 6}</span>}
          </div>

          <button
            onClick={handleFastForward}
            disabled={demoSpeed >= 64}
            className="flex items-center gap-1 px-2 py-1 bg-purple-500 hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded text-xs font-medium"
          >
            <FastForward className="w-3 h-3" /> {demoSpeed >= 64 ? '64x' : `${demoSpeed * 2}x`}
          </button>
          <button
            onClick={handleRealTime}
            disabled={demoSpeed === 1}
            className="flex items-center gap-1 px-2 py-1 bg-gray-600 hover:bg-gray-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded text-xs font-medium"
          >
            <Rewind className="w-3 h-3" /> 1x
          </button>

          {pilotCount <= 4 ? (
            pilots.map(i => (
              <button
                key={`auto-${i}`}
                onClick={() => triggerAuto(`pilot${i}`)}
                disabled={(pilotStatuses[`pilot${i}`] || 'idle') !== 'idle'}
                className="flex items-center gap-1 px-2 py-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded text-xs font-medium"
              >
                <Play className="w-3 h-3" /> P{i}
              </button>
            ))
          ) : (
            <button
              onClick={launchAll}
              className="flex items-center gap-1 px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded text-xs font-medium"
            >
              <Play className="w-3 h-3" /> Launch All
            </button>
          )}

          <button
            onClick={stopDemo}
            className="flex items-center gap-1 px-2 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-xs font-medium"
          >
            <Square className="w-3 h-3" /> Stop
          </button>
          <button
            onClick={() => {
              stopDemo();
              setTimeout(() => window.location.reload(), 600);
            }}
            className="flex items-center gap-1 px-2 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded text-xs font-medium"
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
          <button
            onClick={() => setShowScaleConfig(s => !s)}
            className={`flex items-center gap-1 px-2 py-1 ${showScaleConfig ? 'bg-green-500' : 'bg-gray-600'} hover:bg-green-500 text-white rounded text-xs font-medium`}
          >
            <Users className="w-3 h-3" /> Scale
          </button>
          <button
            onClick={() => setShowSettings(s => !s)}
            className={`flex items-center gap-1 px-2 py-1 ${showSettings ? 'bg-blue-500' : 'bg-gray-600'} hover:bg-blue-500 text-white rounded text-xs font-medium`}
          >
            <Settings className="w-3 h-3" /> Sim
          </button>
        </div>
      </div>

      {showScaleConfig && (
        <div className="bg-gray-800 border-b border-gray-700 px-4 py-3 text-xs">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-gray-300 font-semibold">Pilots:</span>
              <input
                type="number"
                min={1}
                max={30}
                value={pilotCount}
                onChange={e => setPilotCount(Math.max(1, Math.min(30, Number(e.target.value))))}
                className="w-14 bg-gray-700 text-white rounded px-1.5 py-0.5 text-center border border-gray-600"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-300 font-semibold">Drivers:</span>
              <input
                type="number"
                min={1}
                max={10}
                value={driverCount}
                onChange={e => setDriverCount(Math.max(1, Math.min(10, Number(e.target.value))))}
                className="w-14 bg-gray-700 text-white rounded px-1.5 py-0.5 text-center border border-gray-600"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-300 font-semibold">Duty:</span>
              <input
                type="number"
                min={0}
                max={1}
                value={dutyCount}
                onChange={e => setDutyCount(Math.max(0, Math.min(1, Number(e.target.value))))}
                className="w-14 bg-gray-700 text-white rounded px-1.5 py-0.5 text-center border border-gray-600"
              />
            </div>
            <button
              onClick={applyScaleConfig}
              className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white rounded text-xs font-medium"
            >
              Apply & Restart
            </button>
            <span className="text-gray-500">Warning: {pilotCount + driverCount + dutyCount} iframes will be created</span>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="bg-gray-800 border-b border-gray-700 px-4 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <span className="text-gray-300 font-semibold uppercase tracking-wider">Turns</span>
            <RangeInput label="Interval" unit="sec" min={5} max={300}
              valueMin={settings.turnIntervalMin} valueMax={settings.turnIntervalMax}
              onChangeMin={v => updateSettings({ turnIntervalMin: v })}
              onChangeMax={v => updateSettings({ turnIntervalMax: v })}
            />
            <RangeInput label="Angle" unit="deg" min={1} max={180}
              valueMin={settings.turnAngleMin} valueMax={settings.turnAngleMax}
              onChangeMin={v => updateSettings({ turnAngleMin: v })}
              onChangeMax={v => updateSettings({ turnAngleMax: v })}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-2">
            <span className="text-gray-300 font-semibold uppercase tracking-wider">Climb</span>
            <RangeInput label="Rate" unit="ft/m" min={50} max={2000}
              valueMin={settings.climbRateMin} valueMax={settings.climbRateMax}
              onChangeMin={v => updateSettings({ climbRateMin: v })}
              onChangeMax={v => updateSettings({ climbRateMax: v })}
            />
            <RangeInput label="Duration" unit="sec" min={5} max={300}
              valueMin={settings.climbDurationMin} valueMax={settings.climbDurationMax}
              onChangeMin={v => updateSettings({ climbDurationMin: v })}
              onChangeMax={v => updateSettings({ climbDurationMax: v })}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-2">
            <span className="text-gray-300 font-semibold uppercase tracking-wider">Sink</span>
            <RangeInput label="Rate" unit="ft/m" min={50} max={2000}
              valueMin={settings.descentRateMin} valueMax={settings.descentRateMax}
              onChangeMin={v => updateSettings({ descentRateMin: v })}
              onChangeMax={v => updateSettings({ descentRateMax: v })}
            />
            <RangeInput label="Duration" unit="sec" min={5} max={300}
              valueMin={settings.descentDurationMin} valueMax={settings.descentDurationMax}
              onChangeMin={v => updateSettings({ descentDurationMin: v })}
              onChangeMax={v => updateSettings({ descentDurationMax: v })}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-2">
            <span className="text-gray-300 font-semibold uppercase tracking-wider">Altitude</span>
            <div className="flex items-center gap-2">
              <span className="text-gray-400 whitespace-nowrap">Max AGL:</span>
              <input
                type="number"
                min={500}
                max={10000}
                step={100}
                value={settings.maxAltitudeAGL}
                onChange={e => updateSettings({ maxAltitudeAGL: Number(e.target.value) })}
                className="w-16 bg-gray-700 text-white rounded px-1.5 py-0.5 text-center border border-gray-600"
              />
              <span className="text-gray-500">ft</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-2">
            <span className="text-gray-300 font-semibold uppercase tracking-wider">Trim Speed</span>
            <span className="text-gray-500 text-xs">25-45 kph</span>
            <div className="flex items-center gap-2">
              <span className="text-gray-400 whitespace-nowrap">Speed</span>
              <input
                type="number"
                min={25}
                max={45}
                value={settings.trimSpeedMin}
                onChange={e => {
                  const v = Math.max(25, Math.min(45, Number(e.target.value) || 25));
                  updateSettings({ trimSpeedMin: v, trimSpeedMax: v });
                }}
                className="w-16 bg-gray-700 text-white rounded px-1.5 py-0.5 text-center border border-gray-600"
              />
              <span className="text-gray-500">kph</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-2">
            <span className="text-gray-300 font-semibold uppercase tracking-wider">Thermal Lift</span>
            <span className="text-gray-500 text-xs">1000-5000 ft/min</span>
            <div className="flex items-center gap-2">
              <span className="text-gray-400 whitespace-nowrap">Core</span>
              <input
                type="number"
                min={1000}
                max={5000}
                step={100}
                value={settings.thermalLiftMin}
                onChange={e => {
                  const v = Math.max(1000, Math.min(5000, Number(e.target.value) || 1000));
                  updateSettings({ thermalLiftMin: v, thermalLiftMax: v });
                }}
                className="w-20 bg-gray-700 text-white rounded px-1.5 py-0.5 text-center border border-gray-600"
              />
              <span className="text-gray-500">ft/min</span>
            </div>
          </div>
        </div>
      )}

      <div ref={containerRef} className="flex-1 flex min-h-0 overflow-hidden relative" style={{ userSelect: dragging.current ? 'none' : undefined }}>
        <div className="flex flex-col gap-1 p-2 min-w-0 overflow-y-auto" style={{ width: `${pilotPct}%` }}>
          <div className="px-2">
            <span className="text-gray-400 text-xs font-medium uppercase tracking-wider">Pilots ({pilotCount})</span>
          </div>
          <div className="flex flex-row flex-wrap gap-1 items-start justify-center">
            {pilots.map((i, idx) =>
              renderPhone(
                `P${i}`,
                `pilot${i}`,
                `/xc/demo/pilot?demo=pilot${i}&demoSession=${demoSessionId}`,
                landscape ? 'landscape' : 'portrait',
                idx
              )
            )}
          </div>
        </div>

        <div
          ref={dividerRef}
          onMouseDown={() => { dragging.current = true; }}
          onTouchStart={() => { dragging.current = true; }}
          className="w-2 cursor-col-resize bg-gray-700 hover:bg-sky-500 active:bg-sky-400 transition-colors flex-shrink-0 relative group"
          title="Drag to resize"
        >
          <div className="absolute inset-y-0 -left-1 -right-1" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-8 rounded bg-gray-500 group-hover:bg-white transition-colors" />
        </div>

        <div className="flex flex-col gap-1 p-2 min-w-0 overflow-y-auto" style={{ width: `${100 - pilotPct}%` }}>
          <div className="px-2">
            <span className="text-gray-400 text-xs font-medium uppercase tracking-wider">Drivers ({driverCount})</span>
          </div>
          <div className="flex flex-row flex-wrap gap-1 items-start justify-center">
            {drivers.map((i, idx) =>
              renderPhone(
                `D${i}`,
                `driver${i}`,
                `/xc/demo/driver?demo=driver${i}&demoSession=${demoSessionId}`,
                'portrait',
                pilotCount + idx
              )
            )}
          </div>
          {dutyCount > 0 && (
            <>
              <div className="px-2 mt-2">
                <span className="text-gray-400 text-xs font-medium uppercase tracking-wider">Duty Pilot</span>
              </div>
              <div className="flex flex-row flex-wrap gap-1 items-start justify-center">
                {Array.from({ length: dutyCount }, (_, i) => i + 1).map((i, idx) =>
                  renderPhone(
                    `DP${i}`,
                    `duty${i}`,
                    `/xc/demo/duty?demo=duty${i}&demoSession=${demoSessionId}`,
                    'tablet',
                    pilotCount + driverCount + idx
                  )
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
