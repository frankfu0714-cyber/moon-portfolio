"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { SafeAsset } from "./SafeAsset";

function EarthTextureApplier({
  materialRef,
}: {
  materialRef: React.RefObject<THREE.MeshStandardMaterial | null>;
}) {
  const earthMap = useTexture("/textures/earth/color.jpg");

  useEffect(() => {
    const mat = materialRef.current;
    if (mat) {
      mat.map = earthMap;
      mat.needsUpdate = true;
    }
  }, [earthMap, materialRef]);

  return null;
}

// A big cinematic Earth hanging over the horizon — the "walking on the Moon
// looking back home" shot. Key details:
// - `fog={false}` on every material: the scene fog would otherwise swallow
//   an object this far away, which is why the old small Earth was nearly
//   invisible.
// - Lit by the same directional sun as the terrain, so it shows a day/night
//   terminator instead of flat shading.
// - Two-layer atmosphere: a tight bright rim plus a wide soft halo.
const EARTH_R = 30;

export function EarthInSky() {
  const groupRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.008;
    }
    if (glowRef.current) {
      const s = 1 + Math.sin(performance.now() * 0.0004) * 0.012;
      glowRef.current.scale.setScalar(s);
    }
  });

  return (
    <group position={[-18, 52, -190]}>
      <group ref={groupRef}>
        <mesh castShadow={false} receiveShadow={false}>
          <sphereGeometry args={[EARTH_R, 64, 64]} />
          <meshStandardMaterial
            ref={materialRef}
            color="#5a8dc0"
            emissive="#16283f"
            emissiveIntensity={0.55}
            roughness={0.75}
            metalness={0}
            fog={false}
          />
        </mesh>
      </group>
      <SafeAsset label="earth-texture">
        <EarthTextureApplier materialRef={materialRef} />
      </SafeAsset>
      {/* Tight atmospheric rim */}
      <mesh>
        <sphereGeometry args={[EARTH_R * 1.03, 48, 48]} />
        <meshBasicMaterial
          color="#8ec5ff"
          transparent
          opacity={0.16}
          side={THREE.BackSide}
          depthWrite={false}
          fog={false}
        />
      </mesh>
      {/* Wide soft halo */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[EARTH_R * 1.12, 48, 48]} />
        <meshBasicMaterial
          color="#5f9fe8"
          transparent
          opacity={0.07}
          side={THREE.BackSide}
          depthWrite={false}
          fog={false}
        />
      </mesh>
    </group>
  );
}
