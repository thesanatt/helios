/** API client and SWR hooks for Helios backend. */

import useSWR from "swr";
import type {
  PredictionResponse,
  KpHistory,
  CMEEvent,
  ModelInfo,
} from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

/** Current Kp prediction with uncertainty bands and Earth impact. */
export function usePrediction() {
  return useSWR<PredictionResponse>(
    `${API_BASE}/predict/current`,
    fetcher,
    { refreshInterval: 60_000 } // refresh every minute
  );
}

/** Recent CME events from DONKI. */
export function useCMEs(daysBack = 30) {
  return useSWR<CMEEvent[]>(
    `${API_BASE}/cmes?days_back=${daysBack}`,
    fetcher,
    { refreshInterval: 300_000 } // refresh every 5 min
  );
}

/** Historical Kp series for charts. */
export function useKpHistory(daysBack = 90) {
  return useSWR<KpHistory>(
    `${API_BASE}/history/kp?days_back=${daysBack}`,
    fetcher
  );
}

/** GP model metadata for the explainer page. */
export function useModelInfo() {
  return useSWR<ModelInfo>(`${API_BASE}/model/info`, fetcher);
}

/** WebSocket connection for real-time prediction streaming. */
export function createPredictionSocket(
  onMessage: (data: PredictionResponse) => void,
  onError?: (error: Event) => void
): WebSocket {
  const wsBase = API_BASE.replace(/^http/, "ws").replace("/api/v1", "");
  const ws = new WebSocket(`${wsBase}/ws/predictions`);

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type !== "pong") {
        onMessage(data);
      }
    } catch {
      // ignore parse errors
    }
  };

  ws.onerror = (event) => onError?.(event);

  // Keepalive ping every 30s
  const interval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send("ping");
    }
  }, 30_000);

  const origClose = ws.close.bind(ws);
  ws.close = (...args) => {
    clearInterval(interval);
    origClose(...args);
  };

  return ws;
}
