"use client";

import type { KpPrediction, StormSeverity } from "@/types";
import { SEVERITY_COLORS, SEVERITY_LABELS } from "@/types";

interface KpGaugeProps {
  prediction: KpPrediction | null;
}

function getSeverityColor(kp: number): string {
  if (kp < 5) return SEVERITY_COLORS.G0;
  if (kp < 6) return SEVERITY_COLORS.G1;
  if (kp < 7) return SEVERITY_COLORS.G2;
  if (kp < 8) return SEVERITY_COLORS.G3;
  if (kp < 9) return SEVERITY_COLORS.G4;
  return SEVERITY_COLORS.G5;
}

export function KpGauge({ prediction }: KpGaugeProps) {
  const kp = prediction?.predicted_kp ?? 0;
  const std = prediction?.uncertainty_std ?? 0;
  const severity = prediction?.storm_severity ?? "G0";
  const stormProb = prediction?.storm_probability ?? 0;
  const color = getSeverityColor(kp);

  // Arc calculations for the gauge
  const radius = 80;
  const circumference = Math.PI * radius; // half circle
  const kpFraction = Math.min(kp / 9, 1);
  const dashOffset = circumference * (1 - kpFraction);

  // Uncertainty band
  const lowerFrac = Math.max(0, (prediction?.lower_95 ?? 0) / 9);
  const upperFrac = Math.min(1, (prediction?.upper_95 ?? 9) / 9);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
      <h3 className="mb-2 text-sm font-medium uppercase tracking-wider text-gray-400">
        Kp Index Prediction
      </h3>

      {/* SVG Gauge */}
      <div className="flex justify-center">
        <svg viewBox="0 0 200 120" className="w-full max-w-[280px]">
          {/* Background arc */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="12"
            strokeLinecap="round"
          />

          {/* Uncertainty band */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeLinecap="round"
            opacity="0.15"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - upperFrac)}
            style={{
              transform: `rotate(${lowerFrac * 180}deg)`,
              transformOrigin: "100px 100px",
            }}
          />

          {/* Main Kp arc */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className="transition-all duration-1000 ease-out"
          />

          {/* Kp value */}
          <text
            x="100"
            y="80"
            textAnchor="middle"
            className="fill-gray-100 text-[36px] font-bold"
          >
            {kp.toFixed(1)}
          </text>

          {/* Uncertainty */}
          <text
            x="100"
            y="100"
            textAnchor="middle"
            className="fill-gray-400 text-[12px]"
          >
            ±{std.toFixed(1)} (95% CI)
          </text>

          {/* Scale labels */}
          <text x="18" y="115" className="fill-gray-500 text-[10px]">
            0
          </text>
          <text x="95" y="18" className="fill-gray-500 text-[10px]">
            4.5
          </text>
          <text x="175" y="115" className="fill-gray-500 text-[10px]">
            9
          </text>
        </svg>
      </div>

      {/* Severity badge */}
      <div className="mt-2 flex items-center justify-center gap-2">
        <span
          className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
          style={{
            backgroundColor: `${color}20`,
            color: color,
          }}
        >
          {severity} — {SEVERITY_LABELS[severity]}
        </span>
      </div>

      {/* Storm probability */}
      <div className="mt-4 rounded-lg bg-gray-800/50 p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Storm probability</span>
          <span
            className="font-medium"
            style={{ color: stormProb > 0.5 ? "#ef4444" : "#22c55e" }}
          >
            {(stormProb * 100).toFixed(0)}%
          </span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-gray-700">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${stormProb * 100}%`,
              backgroundColor: stormProb > 0.5 ? "#ef4444" : "#22c55e",
            }}
          />
        </div>
      </div>
    </div>
  );
}
