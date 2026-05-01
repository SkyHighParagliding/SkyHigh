import { useState } from "react";
import {
  Play,
  Square,
  Navigation,
  Gauge,
  Mountain,
  Route,
  Timer,
  User,
  LogOut,
  ChevronUp,
  ChevronDown,
  X,
  Zap,
  Maximize,
  Minimize,
  Car,
  Settings,
} from "lucide-react";
import { TrackerState, LiveStats, FlightStats } from "@/hooks/useFlightTracker";
import { usePilotAuth } from "@/contexts/PilotAuthContext";
import { PilotLoginModal } from "./PilotLoginModal";

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

interface FlightControlsProps {
  state: TrackerState;
  liveStats: LiveStats;
  flightStats: FlightStats | null;
  isOnline: boolean;
  error: string | null;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onStart: (autoStart: boolean) => void;
  onStop: () => void;
  onReset: () => void;
  isDemo?: boolean;
  retrievalRequested?: boolean;
  onRequestRetrieval?: () => void;
  onOpenSettings?: () => void;
  retrievalActive?: boolean;
  inline?: boolean;
  portalContainer?: HTMLElement | null;
}

export function FlightControls({
  state,
  liveStats,
  flightStats,
  isOnline,
  error,
  isFullscreen,
  onToggleFullscreen,
  onStart,
  onStop,
  onReset,
  isDemo,
  retrievalRequested,
  onRequestRetrieval,
  onOpenSettings,
  retrievalActive,
  inline,
  portalContainer,
}: FlightControlsProps) {
  const { pilot, logout } = usePilotAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showSummary, setShowSummary] = useState(true);

  return (
    <>
      {showLogin && (
        <PilotLoginModal
          onClose={() => setShowLogin(false)}
          onSuccess={() => { if (!isFullscreen && onToggleFullscreen) onToggleFullscreen(); }}
          portalContainer={portalContainer}
        />
      )}

      <div className={inline ? 'pointer-events-none' : `absolute ${isDemo ? 'bottom-1 left-1 right-1' : retrievalActive ? 'bottom-10 left-4 right-4' : 'bottom-4 left-4 right-4'} z-[1002] pointer-events-none`}>
        <div
          className={`flex flex-col items-center ${isDemo ? 'gap-1' : 'gap-2'} pointer-events-auto mx-auto`}
        >
          {error && (
            <div className={`bg-red-500 text-white rounded-full shadow ${isDemo ? 'text-[10px] px-2 py-0.5' : 'text-sm px-4 py-2'}`}>
              {error}
            </div>
          )}

          {(state === "recording" || state === "pre-recording") && showStats && (
            <div className={`bg-white/95 backdrop-blur shadow-lg mx-auto w-1/2 ${isDemo ? 'rounded-lg p-2' : 'rounded-xl p-4'}`}>
              <div className={`flex items-center justify-between ${isDemo ? 'mb-1' : 'mb-2'}`}>
                <span className={`font-semibold text-gray-500 uppercase tracking-wide ${isDemo ? 'text-[9px]' : 'text-sm'}`}>
                  {state === "pre-recording" ? (
                    <span className={`flex items-center text-amber-600 ${isDemo ? 'gap-0.5' : 'gap-1'}`}>
                      <Zap className={isDemo ? "w-2.5 h-2.5" : "w-4 h-4"} /> Waiting for takeoff...
                    </span>
                  ) : (
                    "Live Stats"
                  )}
                </span>
                <button onClick={() => setShowStats(false)} className="text-gray-400 hover:text-gray-600">
                  <ChevronDown className={isDemo ? "w-3 h-3" : "w-5 h-5"} />
                </button>
              </div>
              {state === "recording" && (
                <div className={`grid grid-cols-3 text-center ${isDemo ? 'gap-1' : 'gap-2'}`}>
                  <div>
                    <div className={`flex items-center justify-center text-gray-400 ${isDemo ? 'gap-0.5 text-[8px]' : 'gap-1 text-xs'}`}>
                      <Mountain className={isDemo ? "w-2.5 h-2.5" : "w-4 h-4"} /> ALT
                    </div>
                    <div className={`font-bold ${isDemo ? 'text-xs' : 'text-base'}`}>{Math.round(liveStats.altitude)}m</div>
                  </div>
                  <div>
                    <div className={`flex items-center justify-center text-gray-400 ${isDemo ? 'gap-0.5 text-[8px]' : 'gap-1 text-xs'}`}>
                      <Gauge className={isDemo ? "w-2.5 h-2.5" : "w-4 h-4"} /> SPD
                    </div>
                    <div className={`font-bold ${isDemo ? 'text-xs' : 'text-base'}`}>{Math.round(liveStats.speed)} km/h</div>
                  </div>
                  <div>
                    <div className={`flex items-center justify-center text-gray-400 ${isDemo ? 'gap-0.5 text-[8px]' : 'gap-1 text-xs'}`}>
                      <Timer className={isDemo ? "w-2.5 h-2.5" : "w-4 h-4"} /> TIME
                    </div>
                    <div className={`font-bold ${isDemo ? 'text-xs' : 'text-base'}`}>{formatDuration(liveStats.elapsed)}</div>
                  </div>
                  <div className="col-span-2">
                    <div className={`flex items-center justify-center text-gray-400 ${isDemo ? 'gap-0.5 text-[8px]' : 'gap-1 text-xs'}`}>
                      <Route className={isDemo ? "w-2.5 h-2.5" : "w-4 h-4"} /> DIST
                    </div>
                    <div className={`font-bold ${isDemo ? 'text-xs' : 'text-base'}`}>{formatDistance(liveStats.totalDistance)}</div>
                  </div>
                  <div>
                    <div className={`flex items-center justify-center text-gray-400 ${isDemo ? 'gap-0.5 text-[8px]' : 'gap-1 text-xs'}`}>
                      <Navigation className={isDemo ? "w-2.5 h-2.5" : "w-4 h-4"} /> PTS
                    </div>
                    <div className={`font-bold ${isDemo ? 'text-xs' : 'text-base'}`}>{liveStats.breadcrumbCount}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {(state === "recording" || state === "pre-recording") && !showStats && (
            <button
              onClick={() => setShowStats(true)}
              className={`bg-white/90 shadow rounded-full text-gray-500 flex items-center ${isDemo ? 'gap-0.5 px-2 py-0.5 text-[10px]' : 'gap-1.5 px-4 py-1.5 text-sm'}`}
            >
              <ChevronUp className={isDemo ? "w-2.5 h-2.5" : "w-4 h-4"} /> Show Stats
            </button>
          )}

          {(state === "completed" || state === "retrieving") && flightStats && showSummary && (
            <div className={`bg-white/95 backdrop-blur shadow-lg mx-auto ${isDemo ? 'rounded-lg p-2 w-full' : 'rounded-xl p-5 w-3/4'}`}>
              <div className={`flex items-center justify-between ${isDemo ? 'mb-1' : 'mb-3'}`}>
                <h4 className={`font-bold text-gray-800 ${isDemo ? 'text-xs' : 'text-base'}`}>Flight Summary</h4>
                <button onClick={() => setShowSummary(false)} className="text-gray-400 hover:text-gray-600">
                  <X className={isDemo ? "w-3 h-3" : "w-5 h-5"} />
                </button>
              </div>
              <div className={`grid grid-cols-2 ${isDemo ? 'gap-y-1 gap-x-2 text-[10px]' : 'gap-y-2.5 gap-x-4 text-base'}`}>
                <div className="flex justify-between">
                  <span className="text-gray-500">Duration</span>
                  <span className="font-medium">{formatDuration(flightStats.duration)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Distance</span>
                  <span className="font-medium">{formatDistance(flightStats.totalDistance)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Max Alt</span>
                  <span className="font-medium">{Math.round(flightStats.maxAltitude)}m</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Max Speed</span>
                  <span className="font-medium">{Math.round(flightStats.maxSpeed)} km/h</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Avg Speed</span>
                  <span className="font-medium">{Math.round(flightStats.avgSpeed)} km/h</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Points</span>
                  <span className="font-medium">{flightStats.breadcrumbCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Alt Gain</span>
                  <span className="font-medium text-green-600">+{Math.round(flightStats.altitudeGain)}m</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Alt Loss</span>
                  <span className="font-medium text-red-600">-{Math.round(flightStats.altitudeLoss)}m</span>
                </div>
              </div>
              {!pilot && (
                <div className={`bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-center ${isDemo ? 'mt-1 p-1 text-[9px]' : 'mt-3 p-2.5 text-sm'}`}>
                  Sign in to save your flights permanently
                  <button
                    onClick={() => setShowLogin(true)}
                    className="ml-2 text-sky-600 font-medium hover:underline"
                  >
                    Sign in
                  </button>
                </div>
              )}
            </div>
          )}

          <div className={`flex items-center justify-center flex-wrap ${isDemo ? 'gap-1' : 'gap-2'}`}>
            <div className={`flex items-center justify-center ${isDemo ? 'gap-1' : 'gap-2'}`}>
              {pilot ? (
                <div className={`flex items-center rounded-full font-semibold bg-sky-100 text-sky-700 shadow-lg ${isDemo ? 'gap-0.5 px-3 py-1.5 text-[11px]' : 'gap-1.5 px-4 py-2.5 text-base min-h-[44px]'}`} style={{ touchAction: 'manipulation' }}>
                  <User className={isDemo ? "w-3 h-3" : "w-4 h-4"} />
                  <span className={isDemo ? '' : 'text-sm'}>{pilot.name || pilot.email}</span>
                  {onOpenSettings && (
                    <button onClick={onOpenSettings} onTouchEnd={(e) => { e.preventDefault(); onOpenSettings!(); }} className={`ml-0.5 hover:text-sky-900 ${isDemo ? '' : 'p-1 flex items-center justify-center'}`} style={{ touchAction: 'manipulation' }} title="Pilot Settings">
                      <Settings className={isDemo ? "w-3 h-3" : "w-4 h-4"} />
                    </button>
                  )}
                  <button onClick={logout} onTouchEnd={(e) => { e.preventDefault(); logout(); }} className={`ml-0.5 hover:text-sky-900 ${isDemo ? '' : 'p-1 flex items-center justify-center'}`} style={{ touchAction: 'manipulation' }}>
                    <LogOut className={isDemo ? "w-3 h-3" : "w-4 h-4"} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowLogin(true)}
                  onTouchEnd={(e) => { e.preventDefault(); setShowLogin(true); }}
                  className={`flex items-center rounded-full font-semibold bg-white text-gray-600 shadow-lg active:bg-gray-100 ${isDemo ? 'gap-0.5 px-3 py-1.5 text-[11px]' : 'gap-1.5 px-4 py-2.5 text-base min-h-[44px]'}`}
                  style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'rgba(0,0,0,0.1)' }}
                >
                  <User className={isDemo ? "w-3 h-3" : "w-5 h-5"} /> Sign in
                </button>
              )}

              {onToggleFullscreen && (
                <button
                  onClick={onToggleFullscreen}
                  onTouchEnd={(e) => { e.preventDefault(); onToggleFullscreen!(); }}
                  className={`flex items-center rounded-full font-semibold bg-white text-gray-600 shadow-lg active:bg-gray-100 ${isDemo ? 'px-2 py-1.5 text-[11px]' : 'px-3 py-2.5 text-base min-w-[44px] min-h-[44px] justify-center'}`}
                  style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'rgba(0,0,0,0.1)' }}
                >
                  {isFullscreen ? <Minimize className={isDemo ? "w-3.5 h-3.5" : "w-5 h-5"} /> : <Maximize className={isDemo ? "w-3.5 h-3.5" : "w-5 h-5"} />}
                </button>
              )}

            </div>

            <div className={`flex items-center ${isDemo ? 'gap-1' : 'gap-2'}`}>
              {(state === "idle" || state === "completed" || state === "retrieving") && (
                <>
                  <button
                    onClick={() => { onReset(); onStart(false); }}
                    onTouchEnd={(e) => { e.preventDefault(); onReset(); onStart(false); }}
                    className={`bg-green-500 hover:bg-green-600 active:bg-green-700 text-white rounded-full font-semibold shadow-lg flex items-center ${isDemo ? 'px-3 py-1.5 text-[11px] gap-1' : 'px-5 py-2.5 text-base gap-2 min-h-[44px]'}`}
                    style={{ touchAction: 'manipulation' }}
                  >
                    <Play className={isDemo ? "w-3 h-3" : "w-5 h-5"} /> {(state === "completed" || state === "retrieving") ? "New Flight" : "Start Flight"}
                  </button>
                  <button
                    onClick={() => { onReset(); onStart(true); }}
                    onTouchEnd={(e) => { e.preventDefault(); onReset(); onStart(true); }}
                    className={`bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white rounded-full font-semibold shadow-lg flex items-center ${isDemo ? 'px-3 py-1.5 text-[11px] gap-1' : 'px-5 py-2.5 text-base gap-2 min-h-[44px]'}`}
                    style={{ touchAction: 'manipulation' }}
                    title="Auto-detect takeoff"
                  >
                    <Zap className={isDemo ? "w-3 h-3" : "w-5 h-5"} /> Auto
                  </button>
                </>
              )}

              {(state === "recording" || state === "pre-recording") && (<>
                {pilot && onRequestRetrieval && state === "recording" && (
                  <button
                    onClick={onRequestRetrieval}
                    onTouchEnd={(e) => { if (!retrievalRequested) { e.preventDefault(); onRequestRetrieval!(); } }}
                    disabled={retrievalRequested}
                    className={`rounded-full font-semibold shadow-lg flex items-center transition-colors ${
                      retrievalRequested
                        ? `bg-blue-400 text-white cursor-default ${isDemo ? 'px-3 py-1.5 text-[11px] gap-1' : 'px-5 py-2.5 text-base gap-2 min-h-[44px]'}`
                        : `bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white ${isDemo ? 'px-3 py-1.5 text-[11px] gap-1' : 'px-5 py-2.5 text-base gap-2 min-h-[44px]'}`
                    }`}
                    style={{ touchAction: 'manipulation' }}
                  >
                    <Car className={isDemo ? "w-3 h-3" : "w-5 h-5"} /> {retrievalRequested ? "Retrieval Requested" : "Request Retrieval"}
                  </button>
                )}
                <button
                  onClick={onStop}
                  onTouchEnd={(e) => { e.preventDefault(); onStop(); }}
                  className={`bg-red-500 hover:bg-red-600 active:bg-red-700 text-white rounded-full font-semibold shadow-lg flex items-center ${isDemo ? 'px-3 py-1.5 text-[11px] gap-1' : 'px-5 py-2.5 text-base gap-2 min-h-[44px]'}`}
                  style={{ touchAction: 'manipulation' }}
                >
                  <Square className={isDemo ? "w-3 h-3" : "w-5 h-5"} /> Stop
                </button>
              </>)}

              {state === "stopping" && (
                <div className={`bg-gray-500 text-white rounded-full font-semibold shadow-lg ${isDemo ? 'px-3 py-1.5 text-[11px]' : 'px-5 py-2.5 text-base'}`}>
                  Stopping...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
