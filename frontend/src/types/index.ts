/** Project Helios — Frontend Type Definitions */

// ── Kp Prediction ──────────────────────────────

export type StormSeverity = "G0" | "G1" | "G2" | "G3" | "G4" | "G5";

export interface KpPrediction {
  predicted_kp: number;
  uncertainty_std: number;
  lower_95: number;
  upper_95: number;
  storm_probability: number;
  storm_severity: StormSeverity;
  confidence: number;
}

// ── CME Data ───────────────────────────────────

export interface CMEAnalysis {
  time21_5: string | null;
  latitude: number | null;
  longitude: number | null;
  half_angle: number | null;
  speed: number | null;
  type: string | null;
  is_most_accurate: boolean;
}

export interface CMEEvent {
  activity_id: string;
  catalog: string | null;
  start_time: string | null;
  source_location: string | null;
  active_region_num: number | null;
  note: string | null;
  cme_analyses: CMEAnalysis[] | null;
}

// ── Arrival Prediction ─────────────────────────

export interface CMEArrivalPrediction {
  cme_id: string;
  estimated_arrival: string;
  transit_hours: number;
  transit_uncertainty_hours: number;
  speed_at_1au: number | null;
}

// ── Earth Impact ───────────────────────────────

export interface EarthImpact {
  kp_prediction: KpPrediction;
  arrival: CMEArrivalPrediction | null;
  gps_degradation_meters: number;
  hf_radio_blackout: boolean;
  hf_blackout_latitudes: number | null;
  satellite_risk_level: "low" | "moderate" | "high" | "extreme";
  aurora_min_latitude: number;
  power_grid_risk: boolean;
  description: string;
}

// ── Full Prediction Response ───────────────────

export interface PredictionResponse {
  timestamp: string;
  kp_prediction: KpPrediction;
  arrival: CMEArrivalPrediction;
  earth_impact: EarthImpact;
  active_cmes: number;
  model_status: "heuristic" | "gp_trained";
}

// ── Historical Kp ──────────────────────────────

export interface KpDataPoint {
  time: string;
  kp: number;
  source: string;
}

export interface KpHistory {
  period_start: string;
  period_end: string;
  total_storms: number;
  kp_series: KpDataPoint[];
}

// ── GP Model Info ──────────────────────────────

export interface ModelInfo {
  regressor: {
    type: string;
    kernel: string;
    features: string[];
    trained: boolean;
  };
  classifier: {
    type: string;
    kernel: string;
    threshold: string;
    trained: boolean;
  };
  data_source: string;
  reference: string;
}

// ── GP Explainer Types ─────────────────────────

export interface GPPoint {
  x: number;
  y: number;
  isTraining: boolean;
}

export interface GPPosterior {
  x: number[];
  mean: number[];
  lower: number[];
  upper: number[];
}

export type KernelType = "rbf" | "matern32" | "matern52" | "periodic";

export interface KernelParams {
  type: KernelType;
  lengthscale: number;
  outputscale: number;
  noise: number;
}

// ── Severity Color Map ─────────────────────────

export const SEVERITY_COLORS: Record<StormSeverity, string> = {
  G0: "#22c55e", // green
  G1: "#eab308", // yellow
  G2: "#f97316", // orange
  G3: "#ef4444", // red
  G4: "#dc2626", // dark red
  G5: "#7f1d1d", // extreme
};

export const SEVERITY_LABELS: Record<StormSeverity, string> = {
  G0: "Quiet",
  G1: "Minor storm",
  G2: "Moderate storm",
  G3: "Strong storm",
  G4: "Severe storm",
  G5: "Extreme storm",
};
