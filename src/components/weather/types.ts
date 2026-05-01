export interface TidePrediction {
  time: string;
  height: number;
  type: "high" | "low";
}

export interface TideData {
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
