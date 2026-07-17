"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { SafeAsset } from "./SafeAsset";

// Cinematic night-side Earth: deep navy oceans, glowing city lights, a
// bright atmosphere arc on the sun side — the "looking back home" shot.
// Day + night textures come from the three.js examples repo on
// raw.githubusercontent.com (CORS: *).
const DAY_MAP_URL =
  "https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/textures/planets/earth_atmos_2048.jpg";
const LIGHTS_MAP_URL =
  "https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/textures/planets/earth_lights_2048.png";

const EARTH_R = 34;

function EarthTextureApplier({
  materialRef,
}: {
  materialRef: React.RefObject<THREE.MeshStandardMaterial | null>;
}) {
  const [dayMap, lightsMap] = useTexture(
    [DAY_MAP_URL, LIGHTS_MAP_URL],
    (loaded) => {
      for (const tex of loaded as THREE.Texture[]) {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        tex.needsUpdate = true;
      }
    },
  );

  useEffect(() => {
    const mat = materialRef.current;
    if (mat) {
      // The day map is multiplied by a dark blue tint so the sunlit
      // continents read as dim night-time ocean/land seen from space,
      // while the emissive lights map paints the warm city grid on top —
      // matching the reference frame (dark globe, glowing cities).
      mat.map = dayMap;
      mat.color = new THREE.Color("#5f7ba6");
      mat.emissiveMap = lightsMap;
      mat.emissive = new THREE.Color("#ffd9a0");
      mat.emissiveIntensity = 1.35;
      mat.roughness = 1;
      mat.needsUpdate = true;
    }
  }, [dayMap, lightsMap, materialRef]);

  return null;
}

export function EarthInSky() {
  const groupRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.006;
    }
    if (glowRef.current) {
      const s = 1 + Math.sin(performance.now() * 0.0004) * 0.01;
      glowRef.current.scale.setScalar(s);
    }
  });

  return (
    <group position={[10, 26, 225]}>
      <group ref={groupRef} rotation={[0.15, 2.6, 0]}>
        <mesh castShadow={false} receiveShadow={false}>
          <sphereGeometry args={[EARTH_R, 64, 64]} />
          <meshStandardMaterial
            ref={materialRef}
            color="#31435e"
            emissive="#0d1a2c"
            emissiveIntensity={0.5}
            roughness={1}
            metalness={0}
            fog={false}
          />
        </mesh>
      </group>
      <SafeAsset label="earth-texture">
        <EarthTextureApplier materialRef={materialRef} />
      </SafeAsset>
      {/* Even atmospheric rim */}
      <mesh>
        <sphereGeometry args={[EARTH_R * 1.02, 48, 48]} />
        <meshBasicMaterial
          color="#9ccaff"
          transparent
          opacity={0.16}
          side={THREE.BackSide}
          depthWrite={false}
          fog={false}
        />
      </mesh>
      {/* Offset rim shell — shifted toward the upper-right so its visible
          ring reads thicker/brighter on one side: a cheap sunlit-crescent
          arc like the reference. */}
      <mesh position={[2.2, 1.6, -1.4]}>
        <sphereGeometry args={[EARTH_R * 1.015, 48, 48]} />
        <meshBasicMaterial
          color="#dceeff"
          transparent
          opacity={0.22}
          side={THREE.BackSide}
          depthWrite={false}
          fog={false}
        />
      </mesh>
      {/* Wide soft halo */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[EARTH_R * 1.12, 48, 48]} />
        <meshBasicMaterial
          color="#6fa8e8"
          transparent
          opacity={0.055}
          side={THREE.BackSide}
          depthWrite={false}
          fog={false}
        />
      </mesh>
    </group>
  );
}
