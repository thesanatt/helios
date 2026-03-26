"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Text, Sphere } from "@react-three/drei";
import * as THREE from "three";

/** Animated expanding CME shell propagating from Sun to Earth. */
function CMEShell({
  speed,
  startTime,
  color,
}: {
  speed: number;
  startTime: number;
  color: string;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current || !materialRef.current) return;
    const elapsed = clock.getElapsedTime() - startTime;
    if (elapsed < 0) return;

    // Scale = radius expanding outward, normalized so 1 AU = 10 units
    const auPerSecond = speed / 1e4; // visual speed scaling
    const radius = Math.min(elapsed * auPerSecond, 10);
    meshRef.current.scale.set(radius, radius, radius);

    // Fade out as it expands
    materialRef.current.opacity = Math.max(0, 0.6 - radius * 0.06);
  });

  return (
    <mesh ref={meshRef} position={[0, 0, 0]}>
      <sphereGeometry args={[1, 32, 16, 0, Math.PI * 0.8, 0, Math.PI * 0.6]} />
      <meshBasicMaterial
        ref={materialRef}
        color={color}
        transparent
        opacity={0.6}
        side={THREE.DoubleSide}
        wireframe
      />
    </mesh>
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
      {/* Glow */}
      <mesh>
        <sphereGeometry args={[1.0, 32, 32]} />
        <meshBasicMaterial
          color="#fbbf24"
          transparent
          opacity={0.15}
        />
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
      <Text
        position={[0, 0.5, 0]}
        fontSize={0.3}
        color="#60a5fa"
        anchorX="center"
      >
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
      pts.push(new THREE.Vector3(Math.cos(angle) * 10, 0, Math.sin(angle) * 10));
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

/** Full 3D CME tracker scene. */
function Scene() {
  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[0, 0, 0]} intensity={2} color="#fbbf24" />

      <Sun />
      <Earth />
      <OrbitRing />

      {/* Sample CME shells at different stages */}
      <CMEShell speed={800} startTime={0} color="#ef4444" />
      <CMEShell speed={500} startTime={2} color="#f97316" />
      <CMEShell speed={1200} startTime={5} color="#fbbf24" />

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
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 overflow-hidden">
      <div className="p-4">
        <h3 className="text-lg font-medium text-gray-200">
          3D CME Propagation Tracker
        </h3>
        <p className="text-sm text-gray-500">
          Real-time visualization of coronal mass ejections traveling from Sun
          to Earth. Drag to rotate, scroll to zoom.
        </p>
      </div>
      <div className="h-[500px] w-full">
        <Canvas camera={{ position: [0, 12, 18], fov: 45 }}>
          <Scene />
        </Canvas>
      </div>
      <div className="flex gap-4 border-t border-gray-800 p-3 text-xs text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          Fast CME (800+ km/s)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-orange-500" />
          Moderate (500 km/s)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-400" />
          Extreme (1200+ km/s)
        </span>
      </div>
    </div>
  );
}
