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
  const earthMap = useTexture("/textures/earth/color.jpg", (loaded) => {
    const tex = loaded as THREE.Texture;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
  });

  useEffect(() => {
    const mat = materialRef.current;
    if (mat) {
      // Photo-real mode: the blue-marble texture drives BOTH the lit color
      // and the emissive channel. From the Moon, Earth is sunlit-brilliant;
      // relying on the scene's directional light alone left the near side in
      // shadow (the sun points away from the Earth's player-facing side), so
      // the emissive map guarantees it always reads as a bright photo.
      mat.map = earthMap;
      mat.emissiveMap = earthMap;
      mat.color = new THREE.Color("#ffffff");
      mat.emissive = new THREE.Color("#ffffff");
      mat.emissiveIntensity = 0.85;
      mat.roughness = 1;
      mat.needsUpdate = true;
    }
  }, [earthMap, materialRef]);

  return null;
}

// A big cinematic Earth hanging over the horizon — the "walking on the Moon
// looking back home" shot. Positioned on the +z side so it sits in the
// DEFAULT camera view at spawn (camera starts at z≈-6.5 looking toward +z),
// low enough that the full disc floats just above the horizon.
// `fog={false}` everywhere: scene fog would otherwise swallow it.
const EARTH_R = 34;

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
    <group position={[22, 33, 225]}>
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
        <sphereGeometry args={[EARTH_R * 1.025, 48, 48]} />
        <meshBasicMaterial
          color="#a8d4ff"
          transparent
          opacity={0.18}
          side={THREE.BackSide}
          depthWrite={false}
          fog={false}
        />
      </mesh>
      {/* Wide soft halo */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[EARTH_R * 1.1, 48, 48]} />
        <meshBasicMaterial
          color="#6fa8e8"
          transparent
          opacity={0.06}
          side={THREE.BackSide}
          depthWrite={false}
          fog={false}
        />
      </mesh>
    </group>
  );
}
