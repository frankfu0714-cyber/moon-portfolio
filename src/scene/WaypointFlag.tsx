"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useSceneStore } from "@/lib/store";
import type { Waypoint } from "@/lib/waypoints";
import { sampleTerrainHeight } from "@/lib/terrain";

type Props = {
  waypoint: Waypoint;
};

export function WaypointFlag({ waypoint }: Props) {
  const glowRef = useRef<THREE.Mesh>(null);
  const flagRef = useRef<THREE.Mesh>(null);
  const beaconRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const near = useSceneStore.getState().nearWaypoint === waypoint.id;
    const t = performance.now() * 0.001;

    if (glowRef.current) {
      const mat = glowRef.current.material as THREE.MeshBasicMaterial;
      const target = near ? 0.5 : 0.16;
      mat.opacity += (target - mat.opacity) * 0.08;
      const pulse = 1 + Math.sin(t * 2) * 0.05 * (near ? 1 : 0.3);
      glowRef.current.scale.set(pulse, 1, pulse);
    }

    if (beaconRef.current) {
      const mat = beaconRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.9 + Math.sin(t * 3) * 0.4;
    }

    if (flagRef.current) {
      flagRef.current.rotation.z = Math.sin(t * 1.5) * 0.06;
    }
  });

  const [x, , z] = waypoint.position;
  const groundY = useMemo(() => sampleTerrainHeight(x, z), [x, z]);

  return (
    <group position={[x, groundY, z]}>
      {/* Ground glow ring */}
      <mesh ref={glowRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[waypoint.proximityRadius - 0.2, waypoint.proximityRadius, 48]} />
        <meshBasicMaterial
          color={waypoint.flagColor}
          transparent
          opacity={0.16}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Monolith base */}
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[0.35, 1.2, 0.35]} />
        <meshStandardMaterial color="#2a2e38" roughness={0.9} />
      </mesh>

      {/* Pole */}
      <mesh position={[0, 1.8, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 1.2, 8]} />
        <meshStandardMaterial color="#e6e2d6" />
      </mesh>

      {/* Flag */}
      <mesh ref={flagRef} position={[0.28, 2.15, 0]}>
        <planeGeometry args={[0.5, 0.32]} />
        <meshStandardMaterial
          color={waypoint.flagColor}
          side={THREE.DoubleSide}
          emissive={waypoint.flagColor}
          emissiveIntensity={0.25}
        />
      </mesh>

      {/* Top beacon */}
      <mesh ref={beaconRef} position={[0, 2.42, 0]}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshStandardMaterial
          color={waypoint.flagColor}
          emissive={waypoint.flagColor}
          emissiveIntensity={1.0}
        />
      </mesh>

      {/* Point light for local warmth */}
      <pointLight
        color={waypoint.flagColor}
        intensity={0.6}
        distance={6}
        position={[0, 2.4, 0]}
      />
    </group>
  );
}
