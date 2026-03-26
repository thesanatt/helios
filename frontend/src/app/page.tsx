"use client";

import { useState } from "react";
import { KpGauge } from "@/components/dashboard/KpGauge";
import { ImpactCards } from "@/components/dashboard/ImpactCards";
import { KpChart } from "@/components/dashboard/KpChart";
import { AuroraMap } from "@/components/visualizations/AuroraMap";
import { CMETracker } from "@/components/visualizations/CMETracker";
import { GPExplainer } from "@/components/explainer/GPExplainer";
import { Navbar } from "@/components/dashboard/Navbar";
import { usePrediction, useKpHistory } from "@/lib/api";

export default function Dashboard() {
  const { data: prediction, error: predError } = usePrediction();
  const { data: history } = useKpHistory(90);
  const [activeTab, setActiveTab] = useState<
    "overview" | "aurora" | "3d" | "explainer"
  >("overview");

  return (
    <div className="min-h-screen bg-gray-950">
      <Navbar activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Status bar */}
        <div className="mb-6 flex items-center gap-3">
          <span className="flex items-center gap-2 text-sm text-gray-400">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse-live" />
            Live — DONKI data stream
          </span>
          {prediction && (
            <span className="text-sm text-gray-500">
              Last update: {new Date(prediction.timestamp).toLocaleTimeString()}
            </span>
          )}
          {predError && (
            <span className="text-sm text-red-400">
              API unavailable — showing cached data
            </span>
          )}
        </div>

        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Top row: Kp gauge + impact summary */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-1">
                <KpGauge prediction={prediction?.kp_prediction ?? null} />
              </div>
              <div className="lg:col-span-2">
                <ImpactCards impact={prediction?.earth_impact ?? null} />
              </div>
            </div>

            {/* Middle: Kp time series with GP uncertainty bands */}
            <KpChart
              history={history ?? null}
              currentPrediction={prediction?.kp_prediction ?? null}
            />

            {/* Bottom row: Aurora map + CME count */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <AuroraMap
                auroraLatitude={
                  prediction?.earth_impact?.aurora_min_latitude ?? 67
                }
              />
              <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
                <h3 className="mb-4 text-lg font-medium text-gray-200">
                  Active CMEs
                </h3>
                <div className="text-5xl font-bold text-amber-400">
                  {prediction?.active_cmes ?? "—"}
                </div>
                <p className="mt-2 text-sm text-gray-400">
                  Coronal mass ejections detected in the last 7 days
                </p>
                {prediction?.arrival && (
                  <div className="mt-4 rounded-lg bg-gray-800/50 p-3">
                    <p className="text-sm text-gray-300">
                      Next estimated arrival:{" "}
                      <span className="font-medium text-amber-300">
                        {prediction.arrival.transit_hours.toFixed(1)}h
                      </span>{" "}
                      (±{prediction.arrival.transit_uncertainty_hours.toFixed(1)}
                      h)
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "aurora" && (
          <AuroraMap
            auroraLatitude={
              prediction?.earth_impact?.aurora_min_latitude ?? 67
            }
            fullscreen
          />
        )}

        {activeTab === "3d" && <CMETracker />}

        {activeTab === "explainer" && <GPExplainer />}
      </main>
    </div>
  );
}
