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

// Build a ring that drapes over the terrain instead of a flat ringGeometry
// slicing through crater rims. Each segment samples the height field and
// hovers a few centimeters above it, so the circle stays unbroken on any
// slope. Coordinates are WORLD-space (the mesh is positioned at the origin)
// because the terrain sample needs absolute x/z.
function makeTerrainRing(
  cx: number,
  cz: number,
  rInner: number,
  rOuter: number,
  segments = 96,
) {
  const positions = new Float32Array((segments + 1) * 2 * 3);
  const indices: number[] = [];
  const HOVER = 0.06;

  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const cos = Math.cos(a);
    const sin = Math.sin(a);

    const xo = cx + cos * rOuter;
    const zo = cz + sin * rOuter;
    const xi = cx + cos * rInner;
    const zi = cz + sin * rInner;

    // Sample at the ring midline so inner/outer share one height — keeps
    // the band from twisting on steep slopes.
    const xm = cx + cos * ((rInner + rOuter) / 2);
    const zm = cz + sin * ((rInner + rOuter) / 2);
    const y = sampleTerrainHeight(xm, zm) + HOVER;

    positions[i * 6 + 0] = xo;
    positions[i * 6 + 1] = y;
    positions[i * 6 + 2] = zo;
    positions[i * 6 + 3] = xi;
    positions[i * 6 + 4] = y;
    positions[i * 6 + 5] = zi;

    if (i < segments) {
      const o0 = i * 2;
      const i0 = i * 2 + 1;
      const o1 = (i + 1) * 2;
      const i1 = (i + 1) * 2 + 1;
      indices.push(o0, i0, o1, i0, i1, o1);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

export function WaypointFlag({ waypoint }: Props) {
  const glowRef = useRef<THREE.Mesh>(null);
  const flagRef = useRef<THREE.Mesh>(null);
  const beaconRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const near = useSceneStore.getState().nearWaypoint === waypoint.id;
    const t = performance.now() * 0.001;

    if (glowRef.current) {
      const mat = glowRef.current.material as THREE.MeshBasicMaterial;
      const target = near ? 0.55 : 0.2;
      mat.opacity += (target - mat.opacity) * 0.08;
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

  // World-space draped ring (see makeTerrainRing). Lives OUTSIDE the
  // positioned group so its vertices stay in world coordinates.
  const ringGeom = useMemo(
    () =>
      makeTerrainRing(
        x,
        z,
        waypoint.proximityRadius - 0.22,
        waypoint.proximityRadius,
      ),
    [x, z, waypoint.proximityRadius],
  );

  return (
    <>
      {/* Ground glow ring — drapes over craters and dunes */}
      <mesh ref={glowRef} geometry={ringGeom}>
        <meshBasicMaterial
          color={waypoint.flagColor}
          transparent
          opacity={0.2}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      <group position={[x, groundY, z]}>
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
    </>
  );
}
