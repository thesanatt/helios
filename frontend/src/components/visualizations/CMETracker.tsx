"use client";

import { useRef, useMemo, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import * as THREE from "three";
import { useCMEs } from "@/lib/api";
import type { CMEEvent } from "@/types";

/** Extract speed from a CME event's analyses. */
function getCMESpeed(cme: CMEEvent): number {
  if (!cme.cme_analyses) return 400;
  for (const a of cme.cme_analyses) {
    if (a.speed) return a.speed;
  }
  return 400;
}

/** Map speed to color. */
function speedToColor(speed: number): string {
  if (speed >= 1000) return "#fbbf24"; // extreme — amber
  if (speed >= 700) return "#ef4444"; // fast — red
  if (speed >= 500) return "#f97316"; // moderate — orange
  return "#6b7280"; // slow — gray
}

/** Animated expanding CME shell propagating from Sun to Earth. */
function CMEShell({
  speed,
  ageHours,
  color,
  label,
}: {
  speed: number;
  ageHours: number;
  color: string;
  label: string;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  // Calculate initial radius based on how old the CME is
  // 1 AU = 10 units in our scene, typical transit ~60-100 hours
  const transitFraction = Math.min(ageHours / (1.496e8 / speed / 3600), 1.0);
  const baseRadius = transitFraction * 10;

  useFrame(({ clock }) => {
    if (!meshRef.current || !materialRef.current) return;

    // Slow visual expansion on top of the base radius
    const visualExpansion = Math.sin(clock.getElapsedTime() * 0.3) * 0.2;
    const radius = Math.min(baseRadius + visualExpansion, 11);

    if (radius > 0.1) {
      meshRef.current.scale.set(radius, radius, radius);
      meshRef.current.visible = true;
      materialRef.current.opacity = Math.max(0.05, 0.5 - radius * 0.04);
    } else {
      meshRef.current.visible = false;
    }
  });

  return (
    <group>
      <mesh ref={meshRef} position={[0, 0, 0]}>
        <sphereGeometry
          args={[1, 24, 12, 0, Math.PI * 0.7, 0, Math.PI * 0.5]}
        />
        <meshBasicMaterial
          ref={materialRef}
          color={color}
          transparent
          opacity={0.5}
          side={THREE.DoubleSide}
          wireframe
        />
      </mesh>
      {/* Label at the leading edge */}
      {baseRadius > 1 && baseRadius < 9 && (
        <Text
          position={[baseRadius * 0.7, baseRadius * 0.5, 0]}
          fontSize={0.25}
          color={color}
          anchorX="center"
        >
          {label}
        </Text>
      )}
    </group>
  );
}

/** The Sun at the center. */
function Sun() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const s = 1 + Math.sin(clock.getElapsedTime() * 2) * 0.02;
    meshRef.current.scale.set(s, s, s);
  });

  return (
    <mesh ref={meshRef} position={[0, 0, 0]}>
      <sphereGeometry args={[0.8, 32, 32]} />
      <meshBasicMaterial color="#fbbf24" />
      <mesh>
        <sphereGeometry args={[1.0, 32, 32]} />
        <meshBasicMaterial color="#fbbf24" transparent opacity={0.15} />
      </mesh>
    </mesh>
  );
}

/** Earth at 1 AU (10 units). */
function Earth() {
  return (
    <group position={[10, 0, 0]}>
      <mesh>
        <sphereGeometry args={[0.25, 32, 32]} />
        <meshBasicMaterial color="#3b82f6" />
      </mesh>
      <Text position={[0, 0.5, 0]} fontSize={0.3} color="#60a5fa" anchorX="center">
        Earth
      </Text>
    </group>
  );
}

/** Orbit path ring. */
function OrbitRing() {
  const points = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 64; i++) {
      const angle = (i / 64) * Math.PI * 2;
      pts.push(
        new THREE.Vector3(Math.cos(angle) * 10, 0, Math.sin(angle) * 10)
      );
    }
    return pts;
  }, []);

  return (
    <line>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={points.length}
          array={new Float32Array(points.flatMap((p) => [p.x, p.y, p.z]))}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial color="#ffffff" opacity={0.08} transparent />
    </line>
  );
}

/** Scene with real CME data. */
function Scene({ cmes }: { cmes: CMEEvent[] }) {
  const now = Date.now();

  // Process CMEs: calculate age and extract speed
  const cmeData = useMemo(() => {
    return cmes
      .filter((c) => c.start_time && c.cme_analyses?.length)
      .slice(-8) // show last 8 CMEs to avoid clutter
      .map((cme) => {
        const speed = getCMESpeed(cme);
        const startMs = new Date(cme.start_time!).getTime();
        const ageHours = (now - startMs) / (1000 * 60 * 60);
        const color = speedToColor(speed);
        const label = `${speed.toFixed(0)} km/s`;
        return { speed, ageHours, color, label, id: cme.activity_id };
      });
  }, [cmes, now]);

  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[0, 0, 0]} intensity={2} color="#fbbf24" />

      <Sun />
      <Earth />
      <OrbitRing />

      {cmeData.map((cme) => (
        <CMEShell
          key={cme.id}
          speed={cme.speed}
          ageHours={cme.ageHours}
          color={cme.color}
          label={cme.label}
        />
      ))}

      <OrbitControls
        enablePan={false}
        minDistance={5}
        maxDistance={30}
        autoRotate
        autoRotateSpeed={0.3}
      />
    </>
  );
}

export function CMETracker() {
  const { data: cmes, error } = useCMEs(14); // last 14 days

  // Fallback demo data if API isn't available
  const displayCMEs = cmes || [];

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 overflow-hidden">
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-200">
              3D CME Propagation Tracker
            </h3>
            <p className="text-sm text-gray-500">
              Real-time visualization of coronal mass ejections traveling from
              Sun to Earth. Drag to rotate, scroll to zoom.
            </p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-bold text-amber-400">
              {displayCMEs.length}
            </span>
            <p className="text-xs text-gray-500">CMEs (14 days)</p>
          </div>
        </div>
      </div>
      <div className="h-[500px] w-full">
        <Canvas camera={{ position: [0, 12, 18], fov: 45 }}>
          <Scene cmes={displayCMEs} />
        </Canvas>
      </div>
      <div className="flex gap-4 border-t border-gray-800 p-3 text-xs text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-gray-500" />
          Slow (&lt;500 km/s)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-orange-500" />
          Moderate (500-700)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          Fast (700-1000)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-400" />
          Extreme (1000+)
        </span>
        {error && (
          <span className="ml-auto text-red-400">
            API unavailable — showing cached data
          </span>
        )}
      </div>
    </div>
  );
}
