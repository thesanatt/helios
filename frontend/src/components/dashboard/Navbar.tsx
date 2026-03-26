"use client";

import { Sun, Globe, Box, BrainCircuit } from "lucide-react";

type Tab = "overview" | "aurora" | "3d" | "explainer";

interface NavbarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Dashboard", icon: <Sun size={18} /> },
  { id: "aurora", label: "Aurora Map", icon: <Globe size={18} /> },
  { id: "3d", label: "CME Tracker", icon: <Box size={18} /> },
  { id: "explainer", label: "GP Explainer", icon: <BrainCircuit size={18} /> },
];

export function Navbar({ activeTab, onTabChange }: NavbarProps) {
  return (
    <nav className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10">
              <Sun size={20} className="text-amber-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-gray-100">
                Project Helios
              </h1>
              <p className="text-[11px] uppercase tracking-widest text-gray-500">
                Space Weather Engine
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "bg-gray-800 text-gray-100"
                    : "text-gray-400 hover:bg-gray-800/50 hover:text-gray-200"
                }`}
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
