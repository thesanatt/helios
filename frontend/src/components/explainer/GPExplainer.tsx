"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  ReferenceDot,
} from "recharts";
import type { KernelType, KernelParams, GPPoint } from "@/types";

// ════════════════════════════════════════════════════════
// GP MATH — Pure TypeScript implementation for the browser
// ════════════════════════════════════════════════════════

/** Compute kernel matrix between two sets of points. */
function computeKernel(
  x1: number[],
  x2: number[],
  params: KernelParams
): number[][] {
  const { type, lengthscale, outputscale } = params;
  const n1 = x1.length;
  const n2 = x2.length;
  const K: number[][] = Array.from({ length: n1 }, () => new Array(n2).fill(0));

  for (let i = 0; i < n1; i++) {
    for (let j = 0; j < n2; j++) {
      const r = Math.abs(x1[i] - x2[j]) / lengthscale;

      switch (type) {
        case "rbf":
          K[i][j] = outputscale * Math.exp(-0.5 * r * r);
          break;
        case "matern32":
          K[i][j] =
            outputscale * (1 + Math.sqrt(3) * r) * Math.exp(-Math.sqrt(3) * r);
          break;
        case "matern52":
          K[i][j] =
            outputscale *
            (1 + Math.sqrt(5) * r + (5 / 3) * r * r) *
            Math.exp(-Math.sqrt(5) * r);
          break;
        case "periodic":
          K[i][j] =
            outputscale *
            Math.exp(
              (-2 * Math.sin(Math.PI * r) ** 2) / (lengthscale * lengthscale)
            );
          break;
      }
    }
  }
  return K;
}

/** Cholesky decomposition of a positive-definite matrix. */
function cholesky(A: number[][]): number[][] {
  const n = A.length;
  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) {
        sum += L[i][k] * L[j][k];
      }
      if (i === j) {
        const val = A[i][i] - sum;
        L[i][j] = Math.sqrt(Math.max(val, 1e-10));
      } else {
        L[i][j] = (A[i][j] - sum) / L[j][j];
      }
    }
  }
  return L;
}

/** Solve Lx = b where L is lower triangular. */
function solveTriangular(L: number[][], b: number[]): number[] {
  const n = L.length;
  const x = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < i; j++) sum += L[i][j] * x[j];
    x[i] = (b[i] - sum) / L[i][i];
  }
  return x;
}

/** Solve L^T x = b where L is lower triangular. */
function solveTriangularT(L: number[][], b: number[]): number[] {
  const n = L.length;
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = 0;
    for (let j = i + 1; j < n; j++) sum += L[j][i] * x[j];
    x[i] = (b[i] - sum) / L[i][i];
  }
  return x;
}

/** Compute GP posterior: mean and variance at test points. */
function gpPosterior(
  xTrain: number[],
  yTrain: number[],
  xTest: number[],
  params: KernelParams
): { mean: number[]; std: number[] } {
  if (xTrain.length === 0) {
    // Prior only
    const Kss = computeKernel(xTest, xTest, params);
    return {
      mean: new Array(xTest.length).fill(0),
      std: xTest.map((_, i) => Math.sqrt(Math.max(Kss[i][i], 0))),
    };
  }

  const n = xTrain.length;
  const nTest = xTest.length;

  // K(X, X) + noise * I
  const Kxx = computeKernel(xTrain, xTrain, params);
  for (let i = 0; i < n; i++) {
    Kxx[i][i] += params.noise;
  }

  // K(X*, X)
  const Ksx = computeKernel(xTest, xTrain, params);
  // K(X*, X*)
  const Kss = computeKernel(xTest, xTest, params);

  // Cholesky factorization
  const L = cholesky(Kxx);

  // Alpha = K^{-1} y via Cholesky
  const alpha_tmp = solveTriangular(L, yTrain);
  const alpha = solveTriangularT(L, alpha_tmp);

  // Mean: K(X*, X) @ alpha
  const mean = new Array(nTest).fill(0);
  for (let i = 0; i < nTest; i++) {
    for (let j = 0; j < n; j++) {
      mean[i] += Ksx[i][j] * alpha[j];
    }
  }

  // Variance: K(X*, X*) - K(X*, X) @ K^{-1} @ K(X, X*)
  const std = new Array(nTest).fill(0);
  for (let i = 0; i < nTest; i++) {
    const v = solveTriangular(L, Ksx[i]);
    let vDot = 0;
    for (let j = 0; j < n; j++) vDot += v[j] * v[j];
    std[i] = Math.sqrt(Math.max(Kss[i][i] - vDot, 1e-10));
  }

  return { mean, std };
}

// ════════════════════════════════════════════════════════
// REACT COMPONENT
// ════════════════════════════════════════════════════════

const DEFAULT_POINTS: GPPoint[] = [
  { x: -3, y: 1.2, isTraining: true },
  { x: -1, y: -0.5, isTraining: true },
  { x: 0.5, y: 0.8, isTraining: true },
  { x: 2, y: -0.3, isTraining: true },
  { x: 3.5, y: 1.5, isTraining: true },
];

const KERNEL_DESCRIPTIONS: Record<KernelType, string> = {
  rbf: "Radial Basis Function (squared exponential) — infinitely smooth. The default choice. Assumes very smooth underlying functions.",
  matern32: "Matérn ν=3/2 — once differentiable. Good for rougher processes. Used in geostatistics.",
  matern52: "Matérn ν=5/2 — twice differentiable. The sweet spot for most real-world data. Used in Helios for Kp prediction.",
  periodic: "Periodic kernel — models repeating patterns. Useful for seasonal/cyclical data like solar cycles.",
};

export function GPExplainer() {
  const [points, setPoints] = useState<GPPoint[]>(DEFAULT_POINTS);
  const [kernelParams, setKernelParams] = useState<KernelParams>({
    type: "matern52",
    lengthscale: 1.0,
    outputscale: 1.0,
    noise: 0.1,
  });
  const [dragging, setDragging] = useState<number | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  // Generate test points
  const xTest = useMemo(
    () => Array.from({ length: 200 }, (_, i) => -5 + (i / 199) * 10),
    []
  );

  // Compute GP posterior
  const posterior = useMemo(() => {
    const xTrain = points.map((p) => p.x);
    const yTrain = points.map((p) => p.y);
    return gpPosterior(xTrain, yTrain, xTest, kernelParams);
  }, [points, xTest, kernelParams]);

  // Chart data
  const chartData = useMemo(
    () =>
      xTest.map((x, i) => ({
        x: parseFloat(x.toFixed(2)),
        mean: posterior.mean[i],
        upper: posterior.mean[i] + 1.96 * posterior.std[i],
        lower: posterior.mean[i] - 1.96 * posterior.std[i],
        upperInner: posterior.mean[i] + posterior.std[i],
        lowerInner: posterior.mean[i] - posterior.std[i],
      })),
    [xTest, posterior]
  );

  // Kernel visualization data
  const kernelData = useMemo(() => {
    const center = [0];
    const xs = Array.from({ length: 100 }, (_, i) => -5 + (i / 99) * 10);
    const K = computeKernel(xs, center, kernelParams);
    return xs.map((x, i) => ({
      x: parseFloat(x.toFixed(2)),
      k: K[i][0],
    }));
  }, [kernelParams]);

  // Handle dragging points on the chart
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (dragging === null || !chartRef.current) return;
      const rect = chartRef.current.getBoundingClientRect();
      const xRatio = (e.clientX - rect.left - 60) / (rect.width - 90); // account for margins
      const yRatio = 1 - (e.clientY - rect.top - 10) / (rect.height - 40);
      const x = -5 + xRatio * 10;
      const y = -3 + yRatio * 6;

      setPoints((prev) =>
        prev.map((p, i) =>
          i === dragging
            ? { ...p, x: Math.max(-5, Math.min(5, x)), y: Math.max(-3, Math.min(3, y)) }
            : p
        )
      );
    },
    [dragging]
  );

  const addPoint = useCallback((e: React.MouseEvent) => {
    if (!chartRef.current) return;
    const rect = chartRef.current.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left - 60) / (rect.width - 90);
    const yRatio = 1 - (e.clientY - rect.top - 10) / (rect.height - 40);
    const x = -5 + xRatio * 10;
    const y = -3 + yRatio * 6;

    if (x >= -5 && x <= 5 && y >= -3 && y <= 3) {
      setPoints((prev) => [...prev, { x, y, isTraining: true }]);
    }
  }, []);

  const removePoint = useCallback((index: number) => {
    setPoints((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
        <h2 className="text-2xl font-bold text-gray-100">
          Interactive Gaussian Process Explainer
        </h2>
        <p className="mt-2 text-gray-400">
          Drag training points to see the GP posterior update in real time.
          Adjust kernel hyperparameters to understand how they shape predictions
          and uncertainty. This is the exact same methodology powering Helios's
          Kp storm predictions — Matérn-5/2 with ARD.
        </p>
      </div>

      {/* Main GP visualization */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-200">
            GP Posterior — drag points or double-click to add
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => setPoints(DEFAULT_POINTS)}
              className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700"
            >
              Reset points
            </button>
            <button
              onClick={() => setPoints([])}
              className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700"
            >
              Clear all (see prior)
            </button>
          </div>
        </div>

        <div
          ref={chartRef}
          className="h-[380px] cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseUp={() => setDragging(null)}
          onMouseLeave={() => setDragging(null)}
          onDoubleClick={addPoint}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gpOuter" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a855f7" stopOpacity={0.12} />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gpInner" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a855f7" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity={0.05} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="x"
                domain={[-5, 5]}
                type="number"
                tick={{ fill: "#6b7280", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
              />
              <YAxis
                domain={[-3, 3]}
                tick={{ fill: "#6b7280", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
              />

              {/* 95% CI band */}
              <Area
                type="monotone"
                dataKey="upper"
                stroke="none"
                fill="url(#gpOuter)"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="lower"
                stroke="none"
                fill="#111827"
                isAnimationActive={false}
              />

              {/* 1σ band */}
              <Area
                type="monotone"
                dataKey="upperInner"
                stroke="none"
                fill="url(#gpInner)"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="lowerInner"
                stroke="none"
                fill="#111827"
                isAnimationActive={false}
              />

              {/* Posterior mean */}
              <Line
                type="monotone"
                dataKey="mean"
                stroke="#a855f7"
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
              />

              {/* Training points as reference dots */}
              {points.map((pt, i) => (
                <ReferenceDot
                  key={i}
                  x={parseFloat(pt.x.toFixed(2))}
                  y={pt.mean ?? pt.y}
                  r={6}
                  fill="#fbbf24"
                  stroke="#111827"
                  strokeWidth={2}
                />
              ))}

              <Tooltip
                contentStyle={{
                  backgroundColor: "#1f2937",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(v: number, name: string) => {
                  const labels: Record<string, string> = {
                    mean: "GP mean",
                    upper: "Upper 95%",
                    lower: "Lower 95%",
                  };
                  return [v.toFixed(3), labels[name] ?? name];
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Draggable point overlays */}
        <div className="mt-2 flex flex-wrap gap-2">
          {points.map((pt, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300 cursor-grab active:cursor-grabbing"
              onMouseDown={() => setDragging(i)}
              onDoubleClick={() => removePoint(i)}
            >
              ({pt.x.toFixed(1)}, {pt.y.toFixed(1)})
              <button
                onClick={() => removePoint(i)}
                className="ml-1 text-amber-400/50 hover:text-amber-300"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Controls row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Kernel selector + hyperparameters */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
          <h3 className="mb-4 text-lg font-medium text-gray-200">
            Kernel & Hyperparameters
          </h3>

          {/* Kernel type */}
          <div className="mb-4">
            <label className="mb-2 block text-sm text-gray-400">
              Kernel function
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(["rbf", "matern32", "matern52", "periodic"] as KernelType[]).map(
                (k) => (
                  <button
                    key={k}
                    onClick={() =>
                      setKernelParams((p) => ({ ...p, type: k }))
                    }
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      kernelParams.type === k
                        ? "bg-purple-500/20 text-purple-300 ring-1 ring-purple-500/40"
                        : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                    }`}
                  >
                    {k === "rbf"
                      ? "RBF"
                      : k === "matern32"
                        ? "Matérn 3/2"
                        : k === "matern52"
                          ? "Matérn 5/2"
                          : "Periodic"}
                  </button>
                )
              )}
            </div>
            <p className="mt-2 text-xs text-gray-500">
              {KERNEL_DESCRIPTIONS[kernelParams.type]}
            </p>
          </div>

          {/* Lengthscale */}
          <div className="mb-3">
            <div className="flex items-center justify-between">
              <label className="text-sm text-gray-400">Lengthscale (ℓ)</label>
              <span className="text-sm font-mono text-purple-300">
                {kernelParams.lengthscale.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0.1"
              max="5"
              step="0.05"
              value={kernelParams.lengthscale}
              onChange={(e) =>
                setKernelParams((p) => ({
                  ...p,
                  lengthscale: parseFloat(e.target.value),
                }))
              }
              className="mt-1 w-full accent-purple-500"
            />
            <p className="text-[11px] text-gray-600">
              Small ℓ = wiggly fit. Large ℓ = smooth fit. Controls how far
              apart inputs can be and still correlate.
            </p>
          </div>

          {/* Output scale */}
          <div className="mb-3">
            <div className="flex items-center justify-between">
              <label className="text-sm text-gray-400">
                Output scale (σ²_f)
              </label>
              <span className="text-sm font-mono text-purple-300">
                {kernelParams.outputscale.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0.1"
              max="3"
              step="0.05"
              value={kernelParams.outputscale}
              onChange={(e) =>
                setKernelParams((p) => ({
                  ...p,
                  outputscale: parseFloat(e.target.value),
                }))
              }
              className="mt-1 w-full accent-purple-500"
            />
            <p className="text-[11px] text-gray-600">
              Amplitude of the function. Higher = larger variations from zero.
            </p>
          </div>

          {/* Noise */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm text-gray-400">
                Noise (σ²_n)
              </label>
              <span className="text-sm font-mono text-purple-300">
                {kernelParams.noise.toFixed(3)}
              </span>
            </div>
            <input
              type="range"
              min="0.001"
              max="1"
              step="0.005"
              value={kernelParams.noise}
              onChange={(e) =>
                setKernelParams((p) => ({
                  ...p,
                  noise: parseFloat(e.target.value),
                }))
              }
              className="mt-1 w-full accent-purple-500"
            />
            <p className="text-[11px] text-gray-600">
              Observation noise. Low = trust data exactly. High = smooth through
              noisy observations. Watch the posterior pull away from points as
              you increase this.
            </p>
          </div>
        </div>

        {/* Kernel shape visualization */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
          <h3 className="mb-4 text-lg font-medium text-gray-200">
            Kernel shape — k(x, 0)
          </h3>
          <p className="mb-3 text-sm text-gray-500">
            How correlated are two points as a function of their distance? This
            is the fundamental building block of the GP — it encodes your
            assumptions about the function's smoothness.
          </p>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={kernelData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="x"
                  tick={{ fill: "#6b7280", fontSize: 11 }}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, "auto"]}
                  tick={{ fill: "#6b7280", fontSize: 11 }}
                  tickLine={false}
                />
                <Line
                  type="monotone"
                  dataKey="k"
                  stroke="#a855f7"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Math explanation */}
          <div className="mt-4 rounded-lg bg-gray-800/50 p-4">
            <h4 className="mb-2 text-sm font-medium text-gray-300">
              How Helios uses this
            </h4>
            <p className="text-xs text-gray-400 leading-relaxed">
              In Helios, the GP regressor uses a <strong className="text-purple-300">Matérn-5/2 kernel with
              Automatic Relevance Determination</strong>. ARD learns a separate
              lengthscale per input feature (CME speed, half-angle, flare class,
              etc.), automatically discovering which features matter most for Kp
              prediction. A short lengthscale on CME speed means the model is
              very sensitive to speed changes — exactly what the literature
              predicts.
            </p>
          </div>
        </div>
      </div>

      {/* Educational section */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
        <h3 className="mb-4 text-lg font-medium text-gray-200">
          Why Gaussian Processes for space weather?
        </h3>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div>
            <h4 className="mb-2 font-medium text-purple-300">
              Uncertainty quantification
            </h4>
            <p className="text-sm text-gray-400">
              Unlike neural networks that output a single number, GPs give you a
              full probability distribution over predictions. The 95% credible
              interval tells you how confident the model is — critical when a
              wrong forecast could mean billions in satellite damage.
            </p>
          </div>
          <div>
            <h4 className="mb-2 font-medium text-purple-300">
              Works with small data
            </h4>
            <p className="text-sm text-gray-400">
              Extreme geomagnetic storms (Kp ≥ 8) are rare — maybe a few per
              solar cycle. GPs handle small datasets gracefully by encoding prior
              knowledge through the kernel. Try removing points above and watch
              how the uncertainty grows honestly.
            </p>
          </div>
          <div>
            <h4 className="mb-2 font-medium text-purple-300">
              Interpretable features
            </h4>
            <p className="text-sm text-gray-400">
              ARD lengthscales directly tell you which CME parameters drive storm
              severity. Short lengthscale = high relevance. This isn't a black
              box — you can explain exactly why the model made each prediction.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-lg bg-purple-500/5 border border-purple-500/10 p-4">
          <p className="text-sm text-purple-200">
            <strong>Reference:</strong> Chakraborty & Morley (2020) used deep Gaussian Process
            Regression to achieve state-of-the-art probabilistic Kp forecasting.
            Helios implements a similar architecture using GPyTorch with
            Matérn-5/2 + ARD kernels, trained on 10+ years of NASA DONKI data.
          </p>
        </div>
      </div>
    </div>
  );
}
