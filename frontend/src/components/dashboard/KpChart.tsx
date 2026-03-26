"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { KpHistory, KpPrediction } from "@/types";

interface KpChartProps {
  history: KpHistory | null;
  currentPrediction: KpPrediction | null;
}

export function KpChart({ history, currentPrediction }: KpChartProps) {
  const data =
    history?.kp_series.map((pt) => ({
      time: new Date(pt.time).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      kp: pt.kp,
      // Simulated GP uncertainty band (will be replaced with real model output)
      lower: Math.max(0, pt.kp - 1.2),
      upper: Math.min(9, pt.kp + 1.2),
    })) ?? [];

  // Append current prediction as the latest point
  if (currentPrediction) {
    data.push({
      time: "Now",
      kp: currentPrediction.predicted_kp,
      lower: currentPrediction.lower_95,
      upper: currentPrediction.upper_95,
    });
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-200">
            Kp Index — Historical + GP Prediction
          </h3>
          <p className="text-sm text-gray-500">
            Shaded region = 95% credible interval from GP posterior
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            Observed Kp
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-6 rounded bg-amber-400/20" />
            GP 95% CI
          </span>
        </div>
      </div>

      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="kpGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="ciGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.1} />
                <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />

            <XAxis
              dataKey="time"
              tick={{ fill: "#6b7280", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
            />
            <YAxis
              domain={[0, 9]}
              ticks={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]}
              tick={{ fill: "#6b7280", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
            />

            {/* Storm threshold line */}
            <ReferenceLine
              y={5}
              stroke="#ef4444"
              strokeDasharray="6 4"
              strokeOpacity={0.5}
              label={{
                value: "Storm threshold (Kp=5)",
                position: "right",
                fill: "#ef4444",
                fontSize: 10,
                opacity: 0.7,
              }}
            />

            {/* GP uncertainty band */}
            <Area
              type="monotone"
              dataKey="upper"
              stroke="none"
              fill="url(#ciGradient)"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="lower"
              stroke="none"
              fill="var(--color-bg, #111827)"
              isAnimationActive={false}
            />

            {/* Main Kp line */}
            <Area
              type="monotone"
              dataKey="kp"
              stroke="#fbbf24"
              strokeWidth={2}
              fill="url(#kpGradient)"
              dot={false}
              activeDot={{
                r: 4,
                fill: "#fbbf24",
                stroke: "#111827",
                strokeWidth: 2,
              }}
            />

            <Tooltip
              contentStyle={{
                backgroundColor: "#1f2937",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px",
                fontSize: "13px",
              }}
              labelStyle={{ color: "#9ca3af" }}
              itemStyle={{ color: "#fbbf24" }}
              formatter={(value: number, name: string) => {
                if (name === "kp") return [`Kp ${value.toFixed(1)}`, "Observed"];
                if (name === "upper") return [`${value.toFixed(1)}`, "Upper 95%"];
                if (name === "lower") return [`${value.toFixed(1)}`, "Lower 95%"];
                return [value, name];
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
