"use client";

import {
  Satellite,
  Radio,
  Navigation,
  Zap,
  Shield,
  MapPin,
} from "lucide-react";
import type { EarthImpact } from "@/types";

interface ImpactCardsProps {
  impact: EarthImpact | null;
}

interface CardData {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  severity: "safe" | "warning" | "danger";
}

function getCards(impact: EarthImpact | null): CardData[] {
  if (!impact) {
    return [
      {
        icon: <Navigation size={20} />,
        label: "GPS",
        value: "—",
        detail: "Loading...",
        severity: "safe",
      },
      {
        icon: <Radio size={20} />,
        label: "HF Radio",
        value: "—",
        detail: "Loading...",
        severity: "safe",
      },
      {
        icon: <Satellite size={20} />,
        label: "Satellites",
        value: "—",
        detail: "Loading...",
        severity: "safe",
      },
      {
        icon: <MapPin size={20} />,
        label: "Aurora",
        value: "—",
        detail: "Loading...",
        severity: "safe",
      },
    ];
  }

  const gpsSeverity: CardData["severity"] =
    impact.gps_degradation_meters > 10
      ? "danger"
      : impact.gps_degradation_meters > 2
        ? "warning"
        : "safe";

  const satSeverity: CardData["severity"] =
    impact.satellite_risk_level === "extreme" ||
    impact.satellite_risk_level === "high"
      ? "danger"
      : impact.satellite_risk_level === "moderate"
        ? "warning"
        : "safe";

  return [
    {
      icon: <Navigation size={20} />,
      label: "GPS accuracy",
      value:
        impact.gps_degradation_meters > 0
          ? `±${impact.gps_degradation_meters.toFixed(0)}m`
          : "Normal",
      detail:
        impact.gps_degradation_meters > 0
          ? "Position error increase"
          : "No degradation expected",
      severity: gpsSeverity,
    },
    {
      icon: <Radio size={20} />,
      label: "HF Radio",
      value: impact.hf_radio_blackout ? "Degraded" : "Normal",
      detail: impact.hf_blackout_latitudes
        ? `Blackout above ${impact.hf_blackout_latitudes.toFixed(0)}°N`
        : "Clear propagation",
      severity: impact.hf_radio_blackout ? "danger" : "safe",
    },
    {
      icon: <Satellite size={20} />,
      label: "Satellite risk",
      value: impact.satellite_risk_level.charAt(0).toUpperCase() +
        impact.satellite_risk_level.slice(1),
      detail: impact.satellite_risk_level === "low"
        ? "Normal operations"
        : "Surface charging risk",
      severity: satSeverity,
    },
    {
      icon: <MapPin size={20} />,
      label: "Aurora visible",
      value: `${impact.aurora_min_latitude.toFixed(0)}°N`,
      detail:
        impact.aurora_min_latitude < 50
          ? "Visible at mid-latitudes!"
          : "High latitude only",
      severity:
        impact.aurora_min_latitude < 50
          ? "warning"
          : "safe",
    },
  ];
}

const severityStyles = {
  safe: {
    border: "border-green-500/20",
    bg: "bg-green-500/5",
    icon: "text-green-400",
    glow: "card-glow-green",
  },
  warning: {
    border: "border-amber-500/20",
    bg: "bg-amber-500/5",
    icon: "text-amber-400",
    glow: "card-glow-amber",
  },
  danger: {
    border: "border-red-500/20",
    bg: "bg-red-500/5",
    icon: "text-red-400",
    glow: "card-glow-red",
  },
};

export function ImpactCards({ impact }: ImpactCardsProps) {
  const cards = getCards(impact);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((card) => {
        const style = severityStyles[card.severity];
        return (
          <div
            key={card.label}
            className={`rounded-xl border ${style.border} ${style.bg} ${style.glow} p-4 transition-all`}
          >
            <div className={`mb-2 ${style.icon}`}>{card.icon}</div>
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
              {card.label}
            </p>
            <p className="mt-1 text-xl font-bold text-gray-100">
              {card.value}
            </p>
            <p className="mt-1 text-xs text-gray-500">{card.detail}</p>
          </div>
        );
      })}
    </div>
  );
}
