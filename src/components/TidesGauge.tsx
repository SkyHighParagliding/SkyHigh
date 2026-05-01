import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import { Waves, ArrowUp, ArrowDown, Clock, TrendingUp, TrendingDown } from "lucide-react";

interface TidePrediction {
  time: string;
  height: number;
  type: "high" | "low";
}

interface TideData {
  stationId: string;
  stationName: string;
  currentHeight: number;
  currentState: "rising" | "falling" | "high" | "low";
  percentFull: number;
  nextHigh: TidePrediction | null;
  nextLow: TidePrediction | null;
  predictions: TidePrediction[];
  fetchedAt: string;
  source?: "bom" | "astronomical";
}

function formatTideTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  const timeStr = date.toLocaleTimeString("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (diffHours <= 0 && diffMins <= 0) return timeStr;
  if (diffHours === 0) return `${timeStr} (${diffMins}m)`;
  return `${timeStr} (${diffHours}h ${diffMins}m)`;
}

function TideGaugeVisual({ percentFull, state, currentHeight }: { percentFull: number; state: string; currentHeight: number }) {
  const clampedPercent = Math.max(5, Math.min(95, percentFull));
  const isRising = state === "rising";
  const isAtExtreme = state === "high" || state === "low";
  const waterColor = percentFull > 75 ? "from-blue-500 to-blue-600" :
                     percentFull > 40 ? "from-sky-400 to-blue-500" :
                     "from-cyan-300 to-sky-400";

  return (
    <div className="relative w-full h-28 rounded-2xl overflow-hidden bg-gradient-to-b from-sky-50 to-sky-100 border border-sky/20">
      <div className="absolute inset-0 flex items-end">
        <div
          className={`w-full bg-gradient-to-t ${waterColor} transition-all duration-1000 ease-in-out relative overflow-hidden`}
          style={{ height: `${clampedPercent}%` }}
        >
          <div className="absolute inset-0 opacity-30">
            <svg className="w-full h-full" viewBox="0 0 200 20" preserveAspectRatio="none">
              <path
                d="M0,10 C30,5 70,15 100,10 C130,5 170,15 200,10 L200,20 L0,20 Z"
                fill="white"
                className="animate-pulse"
              />
            </svg>
          </div>
        </div>
      </div>

      <div className="absolute inset-0 flex items-center justify-center z-10">
        <div className="text-center">
          <div className="text-2xl font-bold text-navy drop-shadow-sm">
            {currentHeight.toFixed(2)}m
          </div>
          <div className="flex items-center justify-center gap-1 text-xs font-medium text-navy/70">
            {isAtExtreme ? (
              state === "high" ? (
                <><ArrowUp className="w-3.5 h-3.5 text-blue-600" /><span className="text-blue-700">High Tide</span></>
              ) : (
                <><ArrowDown className="w-3.5 h-3.5 text-amber-600" /><span className="text-amber-700">Low Tide</span></>
              )
            ) : isRising ? (
              <><TrendingUp className="w-3.5 h-3.5 text-emerald-600" /><span className="text-emerald-700">Rising</span></>
            ) : (
              <><TrendingDown className="w-3.5 h-3.5 text-amber-600" /><span className="text-amber-700">Falling</span></>
            )}
          </div>
        </div>
      </div>

      <div className="absolute right-2 top-0 bottom-0 w-1 flex flex-col justify-between py-2">
        <div className="text-[8px] text-navy/40 font-medium text-right pr-2">HIGH</div>
        <div className="text-[8px] text-navy/40 font-medium text-right pr-2">LOW</div>
      </div>
      <div className="absolute right-1 top-4 bottom-4 w-0.5 bg-navy/10 rounded-full">
        <div
          className="absolute w-2 h-2 -left-[3px] bg-navy rounded-full border border-white shadow-sm transition-all duration-1000"
          style={{ top: `${100 - clampedPercent}%` }}
        />
      </div>
    </div>
  );
}

export function TidesGauge({ siteId }: { siteId: string }) {
  const { data: tideData = null, isLoading: loading, error: tideError } = useQuery({
    queryKey: ['sites', siteId, 'tides'],
    queryFn: () => api.get<TideData>(`/api/sites/${siteId}/tides`),
    enabled: !!siteId,
    refetchInterval: 10 * 60 * 1000,
    staleTime: 5 * 60 * 1000,
  });

  const error = tideError ? (tideError as Error).message : null;

  if (loading) {
    return (
      <div className="bg-card p-6 rounded-3xl shadow-sm border border-sky/5 animate-pulse">
        <div className="h-5 bg-muted rounded w-32 mb-4" />
        <div className="h-28 bg-muted rounded-2xl" />
      </div>
    );
  }

  if (error || !tideData) return null;

  return (
    <div className="bg-card p-6 rounded-3xl shadow-sm border border-sky/5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-navy flex items-center gap-2">
          <Waves className="w-5 h-5 text-sky" />
          Tides
        </h3>
        <span className="text-xs text-muted-foreground">{tideData.stationName}</span>
      </div>

      <TideGaugeVisual percentFull={tideData.percentFull} state={tideData.currentState} currentHeight={tideData.currentHeight} />

      <div className="grid grid-cols-2 gap-3 mt-4">
        {tideData.nextHigh && (
          <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-xl">
            <ArrowUp className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <div className="text-xs font-medium text-blue-700">Next High</div>
              <div className="text-sm font-semibold text-blue-900">{tideData.nextHigh.height}m</div>
              <div className="text-[10px] text-blue-600">{formatTideTime(tideData.nextHigh.time)}</div>
            </div>
          </div>
        )}
        {tideData.nextLow && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-xl">
            <ArrowDown className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <div className="text-xs font-medium text-amber-700">Next Low</div>
              <div className="text-sm font-semibold text-amber-900">{tideData.nextLow.height}m</div>
              <div className="text-[10px] text-amber-600">{formatTideTime(tideData.nextLow.time)}</div>
            </div>
          </div>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground mt-2 text-center italic">
        {tideData.source === "bom"
          ? "Data sourced from Bureau of Meteorology. Always verify with official sources before flying."
          : "Approximate predictions based on astronomical calculations. Always verify with official sources before flying."}
      </p>

      {tideData.predictions.length > 2 && (
        <div className="mt-4 pt-3 border-t border-border-faint">
          <div className="flex items-center gap-1.5 mb-2">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Upcoming Tides</span>
          </div>
          <div className="space-y-1.5">
            {tideData.predictions.slice(0, 6).map((pred, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  {pred.type === "high" ? (
                    <ArrowUp className="w-3 h-3 text-blue-500" />
                  ) : (
                    <ArrowDown className="w-3 h-3 text-amber-500" />
                  )}
                  <span className={`font-medium ${pred.type === "high" ? "text-blue-700" : "text-amber-700"}`}>
                    {pred.type === "high" ? "High" : "Low"}
                  </span>
                </div>
                <span className="text-foreground-secondary font-medium">{pred.height}m</span>
                <span className="text-muted-foreground">
                  {new Date(pred.time).toLocaleString("en-AU", {
                    weekday: "short",
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
